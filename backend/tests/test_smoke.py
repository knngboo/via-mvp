"""
via-mvp backend — minimum smoke test suite (port of smoke.test.js).

Integration tests — they hit the live API and do NOT mock the database.

    python -m unittest backend/tests/test_smoke.py

Requires the backend running at TEST_BASE_URL (default http://localhost:5001)
and a valid ADMIN_SECRET in the environment.
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

TEST_USER = "testuser_{}".format(int(time.time() * 1000))
TEST_PASS = "TestPass123!"


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
        self.assertIsNone(body.get("token"), "token must not appear in response body after C3")

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

    # ── Upload smoke test ───────────────────────────────────────────────────
    def test_08_upload_rejects_non_admin(self):
        self.assertTrue(self.session_cookie, "login test must run first")
        files = {"file": ("test.csv", "col_a,col_b\n1,2\n3,4\n", "text/csv")}
        res = requests.post(f"{BASE}/api/sources", headers={"Cookie": self.session_cookie}, files=files)
        self.assertEqual(res.status_code, 403)

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


if __name__ == "__main__":
    unittest.main()
