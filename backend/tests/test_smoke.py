"""
via-mvp backend — smoke + RBAC test suite.

Integration tests — they hit the live API and do NOT mock the database.

    # Run from inside Docker (no local Python needed):
    docker compose exec backend python -m pytest tests/test_smoke.py -v

Requires the backend running at TEST_BASE_URL (default http://localhost:5001)
and a valid ADMIN_SECRET in the environment.

─────────────────────────────────────────────────────────────────────────────
Why two test classes?

  SmokeTest  — basic auth, upload, feedback, plugins, logout.
               Uses a single test user (registers as admin by default).

  RBACTest   — the 4-role access control system added in bfi-nightwing.
               Registers 3 users, demotes editor+viewer BEFORE their first
               login (so the JWT carries the correct role), then exercises
               every permission boundary.
─────────────────────────────────────────────────────────────────────────────
"""

import os
import sys
import time
import unittest

import requests

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:5001")
ADMIN_SECRET = os.environ.get("ADMIN_SECRET")

if not ADMIN_SECRET:
    print("ERROR: ADMIN_SECRET env var is required to run tests.", file=sys.stderr)
    sys.exit(1)

TS        = int(time.time() * 1000)
TEST_USER = "testuser_{}".format(TS)
TEST_PASS = "TestPass123!"

# ─────────────────────────────────────────────────────────────────────────────
# Basic smoke tests — auth, sources, feedback, plugins, logout
# ─────────────────────────────────────────────────────────────────────────────

class SmokeTest(unittest.TestCase):
    # Tests run in alphabetical order; the numeric prefixes enforce dependency order.
    session_cookie = ""

    # ── Auth ────────────────────────────────────────────────────────────────
    def test_01_register_rejects_missing_admin_secret(self):
        res = requests.post(f"{BASE}/api/register", json={"username": "hacker", "password": "anything1"})
        self.assertEqual(res.status_code, 403)

    def test_02_register_rejects_short_password(self):
        res = requests.post(
            f"{BASE}/api/register",
            headers={"x-admin-secret": ADMIN_SECRET},
            json={"username": "shortpwuser", "password": "123"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertRegex(res.json()["error"], r"at least 8")

    def test_03_register_creates_user(self):
        res = requests.post(
            f"{BASE}/api/register",
            headers={"x-admin-secret": ADMIN_SECRET},
            json={"username": TEST_USER, "password": TEST_PASS},
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["username"], TEST_USER)

    def test_04_login_rejects_wrong_password(self):
        res = requests.post(f"{BASE}/api/login", json={"username": TEST_USER, "password": "wrongpassword"})
        self.assertEqual(res.status_code, 401)

    def test_05_login_sets_httponly_cookie(self):
        res = requests.post(f"{BASE}/api/login", json={"username": TEST_USER, "password": TEST_PASS})
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["username"], TEST_USER)
        self.assertIsNone(body.get("token"), "token must not appear in response body (HttpOnly cookie only)")

        set_cookie = res.headers.get("set-cookie", "")
        self.assertIn("via_session=", set_cookie)
        self.assertIn("httponly", set_cookie.lower())
        type(self).session_cookie = set_cookie.split(";")[0]

    # ── Authenticated route guard ───────────────────────────────────────────
    def test_06_sources_rejects_unauthenticated(self):
        res = requests.get(f"{BASE}/api/sources")
        self.assertEqual(res.status_code, 401)

    def test_07_sources_allows_authenticated(self):
        self.assertTrue(self.session_cookie, "login test must run first")
        res = requests.get(f"{BASE}/api/sources", headers={"Cookie": self.session_cookie})
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

   # ── Upload — all registered users default to admin, so upload succeeds ────
    def test_08_upload_allows_admin(self):
        """
        Registration defaults to 'admin' role. Admin can upload (requires editor+).
        Previously this test incorrectly expected 403 — fixed in bfi-nightwing.
        Upload returns 201 Created on success.
        """
        self.assertTrue(self.session_cookie, "login test must run first")
        files = {"file": ("smoke_test.csv", "col_a,col_b\n1,2\n3,4\n", "text/csv")}
        res = requests.post(f"{BASE}/api/sources", headers={"Cookie": self.session_cookie}, files=files)
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertIn("_id", body)
        self.assertIn("name", body)

    # ── Feedback ────────────────────────────────────────────────────────────
    def test_09_feedback_rejects_unauthenticated(self):
        res = requests.post(f"{BASE}/api/feedback", json={"message_text": "test"})
        self.assertEqual(res.status_code, 401)

    def test_10_feedback_saves_for_authenticated_user(self):
        self.assertTrue(self.session_cookie, "login test must run first")
        res = requests.post(
            f"{BASE}/api/feedback",
            headers={"Cookie": self.session_cookie},
            json={"message_text": "This is a test report from the smoke test suite."},
        )
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertTrue(body["ok"])
        self.assertIsInstance(body["id"], int)

    # ── Plugin registry ─────────────────────────────────────────────────────
    def test_11_plugins_rejects_unauthenticated(self):
        res = requests.get(f"{BASE}/api/plugins")
        self.assertEqual(res.status_code, 401)

    def test_12_plugins_returns_allowed_list(self):
        self.assertTrue(self.session_cookie, "login test must run first")
        res = requests.get(f"{BASE}/api/plugins", headers={"Cookie": self.session_cookie})
        self.assertEqual(res.status_code, 200)
        plugins = res.json()["plugins"]
        self.assertIsInstance(plugins, list)
        self.assertIn("via", plugins)

    # ── Logout ──────────────────────────────────────────────────────────────
    def test_13_logout_clears_cookie(self):
        self.assertTrue(self.session_cookie, "login test must run first")
        res = requests.post(f"{BASE}/api/logout", headers={"Cookie": self.session_cookie})
        self.assertEqual(res.status_code, 200)
        set_cookie = res.headers.get("set-cookie", "")
        self.assertTrue(
            "via_session=;" in set_cookie or "Max-Age=0" in set_cookie or "Expires=" in set_cookie,
            "via_session cookie should be cleared on logout",
        )

# ─────────────────────────────────────────────────────────────────────────────
# RBAC tests — 4-role access control system (added in bfi-nightwing)
# ─────────────────────────────────────────────────────────────────────────────
class RBACTest(unittest.TestCase):
    """
    Tests every permission boundary in the 4-role system.

    Cookie strategy: requests.Session silently drops cookies for 'localhost'
    during the *send* phase (Python RFC 2965 cookiejar domain validation treats
    dotless hostnames as invalid — even when the cookie is manually injected).
    Fix: use the same pattern as SmokeTest — extract the raw 'via_session=<token>'
    string from each login response and pass it as an explicit Cookie header on
    every subsequent request. No Session objects.

    Setup (setUpClass — runs ONCE before all tests):
      1. Register ADMIN_USER  → stays admin     → login → store admin_cookie
      2. Register EDITOR_USER → demoted BEFORE first login → login → editor_cookie
      3. Register VIEWER_USER → demoted BEFORE first login → login → viewer_cookie

    Demoting before first login means the JWT already carries the correct role
    — no logout/re-login loop needed.
    """

    _TS        = int(time.time() * 1000) + 1   # +1 avoids collision with SmokeTest TS
    ADMIN_USER  = "rbac_admin_{}".format(_TS)
    EDITOR_USER = "rbac_editor_{}".format(_TS)
    VIEWER_USER = "rbac_viewer_{}".format(_TS)

    admin_cookie  = ""   # raw "via_session=<token>" Cookie header string
    editor_cookie = ""
    viewer_cookie = ""

    admin_id  = None
    editor_id = None
    viewer_id = None

    @staticmethod
    def _login(username, password):
        """Login and return the raw 'via_session=<token>' Cookie header string."""
        r = requests.post(f"{BASE}/api/login", json={"username": username, "password": password})
        assert r.status_code == 200, f"Login failed for {username}: {r.status_code} {r.text}"
        set_cookie = r.headers.get("set-cookie", "")
        cookie = set_cookie.split(";")[0].strip()   # "via_session=eyJ..."
        assert "via_session=" in cookie, f"No via_session cookie for {username}: {set_cookie}"
        return cookie

    @classmethod
    def setUpClass(cls):
        """Register 3 users, demote editor + viewer, log all three in."""

        # ── 1. Admin ──────────────────────────────────────────────────────────
        r = requests.post(f"{BASE}/api/register",
            headers={"x-admin-secret": ADMIN_SECRET},
            json={"username": cls.ADMIN_USER, "password": TEST_PASS})
        assert r.status_code == 201, f"Admin register failed: {r.status_code} {r.text}"
        cls.admin_id = r.json()["id"]
        cls.admin_cookie = cls._login(cls.ADMIN_USER, TEST_PASS)

        # ── 2. Editor — demote BEFORE first login so JWT carries editor role ──
        r = requests.post(f"{BASE}/api/register",
            headers={"x-admin-secret": ADMIN_SECRET},
            json={"username": cls.EDITOR_USER, "password": TEST_PASS})
        assert r.status_code == 201, f"Editor register failed: {r.status_code} {r.text}"
        cls.editor_id = r.json()["id"]

        r = requests.patch(f"{BASE}/api/admin/users/{cls.editor_id}/role",
            headers={"Cookie": cls.admin_cookie},
            json={"role": "editor"})
        assert r.status_code == 200, f"Editor demotion failed: {r.status_code} {r.text}"
        cls.editor_cookie = cls._login(cls.EDITOR_USER, TEST_PASS)

        # ── 3. Viewer — same pattern ──────────────────────────────────────────
        r = requests.post(f"{BASE}/api/register",
            headers={"x-admin-secret": ADMIN_SECRET},
            json={"username": cls.VIEWER_USER, "password": TEST_PASS})
        assert r.status_code == 201, f"Viewer register failed: {r.status_code} {r.text}"
        cls.viewer_id = r.json()["id"]

        r = requests.patch(f"{BASE}/api/admin/users/{cls.viewer_id}/role",
            headers={"Cookie": cls.admin_cookie},
            json={"role": "viewer"})
        assert r.status_code == 200, f"Viewer demotion failed: {r.status_code} {r.text}"
        cls.viewer_cookie = cls._login(cls.VIEWER_USER, TEST_PASS)

    # ── Admin endpoint access ─────────────────────────────────────────────────
    def test_14_admin_list_users_rejects_non_admin(self):
        """Viewer and editor cannot list users — admin only."""
        res = requests.get(f"{BASE}/api/admin/users", headers={"Cookie": self.viewer_cookie})
        self.assertEqual(res.status_code, 403)
        res = requests.get(f"{BASE}/api/admin/users", headers={"Cookie": self.editor_cookie})
        self.assertEqual(res.status_code, 403)

    def test_15_admin_list_users_allows_admin(self):
        """Admin can list all users; response includes the 3 RBAC test accounts."""
        res = requests.get(f"{BASE}/api/admin/users", headers={"Cookie": self.admin_cookie})
        self.assertEqual(res.status_code, 200)
        usernames = [u["username"] for u in res.json()]
        self.assertIn(self.ADMIN_USER,  usernames)
        self.assertIn(self.EDITOR_USER, usernames)
        self.assertIn(self.VIEWER_USER, usernames)

    def test_16_admin_role_update_rejects_non_admin(self):
        """Only admin can change a user's role."""
        res = requests.patch(f"{BASE}/api/admin/users/{self.editor_id}/role",
            headers={"Cookie": self.viewer_cookie},
            json={"role": "viewer"})
        self.assertEqual(res.status_code, 403)

        res = requests.patch(f"{BASE}/api/admin/users/{self.viewer_id}/role",
            headers={"Cookie": self.editor_cookie},
            json={"role": "admin"})
        self.assertEqual(res.status_code, 403)

    def test_17_admin_cannot_demote_themselves(self):
        """Self-demotion is blocked at the backend regardless of requested role."""
        res = requests.patch(f"{BASE}/api/admin/users/{self.admin_id}/role",
            headers={"Cookie": self.admin_cookie},
            json={"role": "viewer"})
        self.assertEqual(res.status_code, 403)

    def test_18_admin_role_update_invalid_role_rejected(self):
        """Updating a role to an invalid value returns 400."""
        res = requests.patch(f"{BASE}/api/admin/users/{self.viewer_id}/role",
            headers={"Cookie": self.admin_cookie},
            json={"role": "superuser"})
        self.assertEqual(res.status_code, 400)

    # ── Upload access ─────────────────────────────────────────────────────────
    def test_19_upload_allows_editor(self):
        """Editor can upload CSV files (requires editor+). Returns 201 Created."""
        files = {"file": ("rbac_editor_test.csv", "x,y\n10,20\n30,40\n", "text/csv")}
        res = requests.post(f"{BASE}/api/sources",
            headers={"Cookie": self.editor_cookie},
            files=files)
        self.assertEqual(res.status_code, 201)
        self.assertIn("_id", res.json())

    def test_20_upload_rejects_viewer(self):
        """Viewer cannot upload (requires editor+)."""
        files = {"file": ("rbac_viewer_test.csv", "x,y\n1,2\n", "text/csv")}
        res = requests.post(f"{BASE}/api/sources",
            headers={"Cookie": self.viewer_cookie},
            files=files)
        self.assertEqual(res.status_code, 403)

    # ── Source visibility ─────────────────────────────────────────────────────
    def test_21_sources_visibility_filtered_for_editor(self):
        """
        Editor sees shared sources + their own private sources.
        They must not see private sources owned by other users.
        """
        res = requests.get(f"{BASE}/api/sources", headers={"Cookie": self.editor_cookie})
        self.assertEqual(res.status_code, 200)
        for source in res.json():
            if source.get("visibility") == "private":
                self.assertEqual(
                    source.get("user_id"), self.editor_id,
                    f"Editor should not see other users' private sources (got: {source.get('name')})"
                )

    def test_22_admin_upload_is_shared(self):
        """Files uploaded by admin are marked 'shared'. Verified via GET /api/sources."""
        files = {"file": ("admin_shared_test.csv", "a,b\n1,2\n", "text/csv")}
        upload = requests.post(f"{BASE}/api/sources",
            headers={"Cookie": self.admin_cookie},
            files=files)
        self.assertEqual(upload.status_code, 201)
        source_id = upload.json().get("_id")
        self.assertIsNotNone(source_id)

        sources = requests.get(f"{BASE}/api/sources",
            headers={"Cookie": self.admin_cookie}).json()
        match = next((s for s in sources if s.get("id") == source_id), None)
        if match:
            self.assertEqual(match.get("visibility"), "shared",
                f"Admin upload should be shared, got: {match.get('visibility')}")

    # ── Chat access ───────────────────────────────────────────────────────────
    def test_23_chat_rejects_unauthenticated(self):
        """Chat stream requires a valid session."""
        res = requests.post(f"{BASE}/api/chat/stream",
            json={"message": "hello"})
        self.assertEqual(res.status_code, 401)

    def test_24_chat_rejects_viewer(self):
        """Viewer cannot use AI chat (requires analyzer+)."""
        res = requests.post(f"{BASE}/api/chat/stream",
            headers={"Cookie": self.viewer_cookie},
            json={"message": "hello"},
            stream=True)
        self.assertEqual(res.status_code, 403)

    def test_25_chat_allows_editor(self):
        """
        Editor (>= analyzer level) can reach the chat route.
        The endpoint returns 400 if message is missing, 401 if unauthenticated,
        403 if role is insufficient. Any non-403/401 means the route is accessible.
        """
        res = requests.post(f"{BASE}/api/chat/stream",
            headers={"Cookie": self.editor_cookie},
            json={"message": "hello"},
            stream=True)
        # 200 means the AI responded; 500 means AI key missing — both mean auth passed.
        # 401/403 would mean the role check failed.
        self.assertNotIn(res.status_code, [401, 403],
            f"Editor should be able to access chat, got: {res.status_code}")

    # ── Delete ownership ──────────────────────────────────────────────────────
    def test_26_editor_cannot_delete_others_source(self):
        """Editor cannot delete a source they don't own."""
        files = {"file": ("admin_owned_delete_test.csv", "p,q\n5,6\n", "text/csv")}
        upload = requests.post(f"{BASE}/api/sources",
            headers={"Cookie": self.admin_cookie},
            files=files)
        self.assertEqual(upload.status_code, 201)
        source_id = upload.json().get("_id")
        self.assertIsNotNone(source_id)

        res = requests.delete(f"{BASE}/api/sources/{source_id}",
            headers={"Cookie": self.editor_cookie})
        self.assertEqual(res.status_code, 403)

    def test_27_admin_can_delete_any_source(self):
        """Admin can delete any source regardless of who uploaded it."""
        files = {"file": ("editor_owned_delete_test.csv", "m,n\n7,8\n", "text/csv")}
        upload = requests.post(f"{BASE}/api/sources",
            headers={"Cookie": self.editor_cookie},
            files=files)
        self.assertEqual(upload.status_code, 201)
        source_id = upload.json().get("_id")
        self.assertIsNotNone(source_id)

        res = requests.delete(f"{BASE}/api/sources/{source_id}",
            headers={"Cookie": self.admin_cookie})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get("deleted"))

if __name__ == "__main__":
    unittest.main()
