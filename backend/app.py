"""
VIA MVP backend — Flask application (port of server.js).

Auth model (unchanged from the Express version):
  - JWT issued on login, stored in an HttpOnly `via_session` cookie (C3)
  - registration gated behind a timing-safe ADMIN_SECRET check
  - per-tenant schema isolation, validated against a safe-name pattern (C1)

GTFS auto-import was removed upstream — the platform is a blank slate and
agencies upload their own data via the Data Hub.
"""

import functools
import hmac
import json
import logging
import os
import re
import sys
import threading

import bcrypt
import jwt
from dotenv import load_dotenv
from flask import Flask, Response, g, jsonify, request, stream_with_context
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

import db
from census import create_census_blueprint
from import_gtfs import ensure_database_loaded
from openai_client import DEFAULT_MODEL, MaxToolRoundsError, prepare_chat, stream_openai
from realtime import create_realtime_blueprint
from sources import create_sources_blueprint, init_sources_meta
from stats import create_stats_blueprint

load_dotenv()

# D1: structured logger
logging.basicConfig(
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("via-backend")

IS_PROD = os.environ.get("NODE_ENV") == "production"

# ── CRITICAL: fail-fast on missing secrets ──────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET", "")
ADMIN_SECRET = os.environ.get("ADMIN_SECRET", "")
if len(JWT_SECRET) < 16:
    sys.stderr.write("FATAL: JWT_SECRET is not set or too short (min 16 chars). Exiting.\n")
    sys.exit(1)
if len(ADMIN_SECRET) < 8:
    sys.stderr.write("FATAL: ADMIN_SECRET is not set or too short (min 8 chars). Exiting.\n")
    sys.exit(1)
# ────────────────────────────────────────────────────────────────────────────

SAFE_SCHEMA = re.compile(r"^[a-z][a-z0-9_]{0,62}$")

# Mapping from registration org label to DB schema name.
# BFI (superadmin) can assign users to any of these.
ORG_TO_SCHEMA = {"bfi": "bfi", "via": "via", "areafoundation": "areafoundation"}
VALID_TENANT_SCHEMAS = set(ORG_TO_SCHEMA.values())

# A static dummy hash compared when the username doesn't exist, so login response
# time is identical whether the username is valid or not (prevents enumeration).
DUMMY_HASH = b"$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

app = Flask(__name__)

# Body size cap — covers the 50 MB Data Hub uploads. JSON routes additionally
# enforce their own length checks (e.g. 4000-char chat messages).
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

# Environment-aware CORS — set ALLOWED_ORIGINS in .env for production
allowed_origins = (
    os.environ["ALLOWED_ORIGINS"].split(",")
    if os.environ.get("ALLOWED_ORIGINS")
    else ["http://localhost:5173"]
)
CORS(app, origins=allowed_origins, supports_credentials=True)

# Rate limiters (flask-limiter). In-memory store is fine for the MVP.
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
limiter.init_app(app)
auth_limit = limiter.shared_limit("20 per 15 minutes", scope="auth")
chat_limit = limiter.shared_limit("30 per minute", scope="chat")

# Initialise the DB pool and ensure the Data Hub metadata table exists
db.init_pool()
init_sources_meta()

# Background GTFS load. Triggered when a user is logged in (login / session
# restore). The load itself is idempotent and cross-process safe; this flag just
# avoids spawning a redundant thread on every request within a worker.
_db_load_started = False
_db_load_lock = threading.Lock()


def _ensure_db_loaded_async():
    global _db_load_started
    with _db_load_lock:
        if _db_load_started:
            return
        _db_load_started = True

    def _run():
        try:
            ensure_database_loaded()
        except Exception as error:  # never let a load failure break auth
            logger.error("background GTFS load failed: %s", error)

    threading.Thread(target=_run, name="gtfs-load", daemon=True).start()


# B5: explicit Content Security Policy + standard hardening headers (helmet parity)
@app.after_request
def set_security_headers(resp):
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data: https://*.tile.openstreetmap.org; "
        "connect-src 'self' https://api.openai.com; "
        "frame-src 'none'; "
        "object-src 'none'; "
        "upgrade-insecure-requests"
    )
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({"error": "Too many requests. Please slow down and try again later."}), 429


# ── Auth helpers ────────────────────────────────────────────────────────────
def _safe_tenant(claims):
    t = (claims or {}).get("tenant")
    return t if t and SAFE_SCHEMA.match(t) else "bfi"


def _verify_request_token():
    """
    Read the JWT from the HttpOnly cookie (preferred) or Authorization header.
    On success sets g.user and returns None; on failure returns an (body, status) tuple.
    """
    cookie_token = request.cookies.get("via_session")
    header = request.headers.get("Authorization", "")
    header_token = header.split(" ", 1)[1] if header.startswith("Bearer ") else None
    token = cookie_token or header_token

    if not token:
        return jsonify({"error": "Access token required"}), 401

    try:
        g.user = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return jsonify({"error": "Invalid or expired token"}), 403
    return None


def authenticate_token(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        err = _verify_request_token()
        if err is not None:
            return err
        return fn(*args, **kwargs)
    return wrapper


def require_admin(fn):
    """Must run after authentication has populated g.user."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if (g.get("user") or {}).get("role") != "admin":
            return jsonify({"error": "Admin role required."}), 403
        return fn(*args, **kwargs)
    return wrapper


def require_editor(fn):
    """Admin or editor — can upload data and manage their own sources."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if (g.get("user") or {}).get("role") not in ["admin", "editor"]:
            return jsonify({"error": "Editor role required."}), 403
        return fn(*args, **kwargs)
    return wrapper


def require_analyzer(fn):
    """Admin, editor, or analyzer — can run queries and view data."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if (g.get("user") or {}).get("role") not in ["admin", "editor", "analyzer"]:
            return jsonify({"error": "Analyzer or Editor role required."}), 403
        return fn(*args, **kwargs)
    return wrapper


def require_viewer(fn):
    """All authenticated users — broadest role gate."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if (g.get("user") or {}).get("role") not in ["admin", "editor", "analyzer", "viewer"]:
            return jsonify({"error": "Access denied."}), 403
        return fn(*args, **kwargs)
    return wrapper


def _set_session_cookie(resp, token):
    resp.set_cookie(
        "via_session",
        token,
        httponly=True,
        secure=IS_PROD,
        samesite="Strict",
        max_age=24 * 60 * 60,
    )


# ── Health ──────────────────────────────────────────────────────────────────
@app.route("/health")
def health():
    return "OK"


# ── Register ────────────────────────────────────────────────────────────────
@app.route("/api/register", methods=["POST"])
@auth_limit
def register():
    # Block anyone without the Master Admin Secret (timing-safe comparison).
    admin_secret = request.headers.get("x-admin-secret", "")
    if not hmac.compare_digest(admin_secret, ADMIN_SECRET):
        return jsonify({"error": "Unauthorized: Hackers are blocked!"}), 403

    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    organization = str(body.get("organization", "bfi")).lower()

    if not username or not isinstance(username, str) or not (1 <= len(username) <= 50):
        return jsonify({"error": "Username must be between 1 and 50 characters."}), 400
    if not re.match(r"^[a-zA-Z0-9_@.\-]+$", username):
        return jsonify({"error": "Username contains invalid characters."}), 400
    if not password:
        return jsonify({"error": "username and password required"}), 400
    if isinstance(password, str) and len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    tenant_schema = ORG_TO_SCHEMA.get(organization)
    if not tenant_schema:
        return jsonify({"error": "Invalid organization. Must be one of: bfi, via, areafoundation"}), 400

    try:
        hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(10)).decode("utf-8")
        rows = db.query(
            """
            INSERT INTO users (username, password_hash, user_role, tenant_schema)
            VALUES (%s, %s, 'admin', %s)
            RETURNING id, username, tenant_schema
            """,
            (username, hashed, tenant_schema),
        )
        return jsonify(rows[0]), 201
    except Exception as error:
        logger.error("registration failed: %s", error)
        return jsonify({"error": "registration failed. username might already exist."}), 500


# ── Login ───────────────────────────────────────────────────────────────────
@app.route("/api/login", methods=["POST"])
@auth_limit
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400

    try:
        rows = db.query(
            "SELECT id, username, password_hash, user_role, tenant_schema FROM users WHERE username = %s",
            (username,),
        )
        user = rows[0] if rows else None

        # Always run bcrypt — even for unknown users — to prevent timing attacks.
        hash_to_compare = user["password_hash"].encode("utf-8") if user else DUMMY_HASH
        is_valid = bcrypt.checkpw(password.encode("utf-8"), hash_to_compare)

        if not user or not is_valid:
            return jsonify({"error": "invalid credentials"}), 401

        token = jwt.encode(
            {
                "id": user["id"],
                "username": user["username"],
                "role": user["user_role"],
                "tenant": user["tenant_schema"] or "bfi",
            },
            JWT_SECRET,
            algorithm="HS256",
        )
        # PyJWT >=2 returns str already; normalise just in case.
        if isinstance(token, bytes):
            token = token.decode("utf-8")

        # Ensure the transit database is loaded now that a user is logged in.
        _ensure_db_loaded_async()

        resp = jsonify({
            "username": user["username"],
            "role": user["user_role"],
            "tenant": user["tenant_schema"] or "bfi",
        })
        _set_session_cookie(resp, token)
        return resp
    except Exception as error:
        logger.error("login failed: %s", error)
        return jsonify({"error": "login failed"}), 500


# ── Logout ──────────────────────────────────────────────────────────────────
@app.route("/api/logout", methods=["POST"])
def logout():
    resp = jsonify({"ok": True})
    resp.delete_cookie("via_session", httponly=True, samesite="Strict")
    return resp


# ── Session restore ─────────────────────────────────────────────────────────
@app.route("/api/me", methods=["GET"])
@authenticate_token
def me():
    try:
        rows = db.query(
            "SELECT id, username, user_role, tenant_schema FROM users WHERE id = %s",
            (g.user["id"],),
        )
        if not rows:
            # User was deleted (e.g. DB wiped) — kill the stale cookie.
            resp = jsonify({"error": "Session expired — please log in again."})
            resp.delete_cookie("via_session", httponly=True, samesite="Strict")
            return resp, 401
        # A restored session counts as "logged in" — make sure data is loaded.
        _ensure_db_loaded_async()

        u = rows[0]
        return jsonify({
            "username": u["username"],
            "role": u["user_role"],
            "tenant": u["tenant_schema"] or "bfi",
        })
    except Exception as error:
        logger.error("/api/me db check failed: %s", error)
        return jsonify({"error": "Session verification failed."}), 500


# ── Chat (SSE streaming) ────────────────────────────────────────────────────
ALLOWED_MODELS = ["gpt-4o", "gpt-4o-mini"]


@app.route("/api/chat/stream", methods=["POST"])
@authenticate_token
@require_analyzer
@chat_limit
def chat_stream():
    body = request.get_json(silent=True) or {}
    message = body.get("message")
    history = body.get("history")
    requested_model = body.get("model")

    if not message:
        return jsonify({"error": "Message is required"}), 400
    # B6: hard limits — prevent multi-MB payloads reaching OpenAI
    if not isinstance(message, str) or len(message) > 4000:
        return jsonify({"error": "Message too long (max 4000 characters)."}), 400

    safe_history = []
    if isinstance(history, list):
        for h in history[-20:]:  # cap to last 20 exchanges
            if h and isinstance(h.get("from"), str) and isinstance(h.get("text"), str):
                safe_history.append(h)

    tenant = _safe_tenant(g.user)
    model = requested_model if requested_model in ALLOWED_MODELS else "gpt-4o-mini"

    # User-supplied OpenAI key (set in Settings) takes precedence over the server
    # env var. Sent per-request as a header so it's never persisted server-side.
    client_key = (request.headers.get("X-OpenAI-Key") or "").strip() or None
    if not client_key and not os.environ.get("OPENAI_API_KEY"):
        return jsonify({"error": "No OpenAI API key configured. Add one in Settings."}), 400

    # Run the (blocking) tool-calling loop first, then stream the final answer.
    try:
        messages, viz = prepare_chat(message, safe_history, tenant, model, api_key=client_key)
    except MaxToolRoundsError:
        return jsonify({"error": "Buffi exceeded maximum reasoning steps."}), 500
    except Exception as error:
        logger.error("AI prepare error: %s", error)
        return jsonify({"error": "AI request failed."}), 500

    def generate():
        # If a map/chart tool produced output, emit it first as custom SSE events
        # the frontend recognises (it ignores events without choices[].delta).
        map_payload = viz.get("map")
        if map_payload and (map_payload.get("points") or map_payload.get("heatmap")):
            yield ("data: " + json.dumps({"buffi_map": map_payload}) + "\n\n").encode("utf-8")
        chart_payload = viz.get("chart")
        if chart_payload and chart_payload.get("chartData"):
            yield ("data: " + json.dumps({"buffi_chart": chart_payload}) + "\n\n").encode("utf-8")
        try:
            yield from stream_openai(messages, model, api_key=client_key)
        except Exception as error:
            logger.error("AI stream error: %s", error)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",  # disable nginx buffering for SSE
    }
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers=headers,
    )

# ── Chat history persistence ─────────────────────────────────────────────────
# The chat_messages table was created in init.sql but not yet used.
# These two endpoints wire it up as a lightweight persistence layer.
# The frontend keeps localStorage as its fast cache; server is the fallback
# that survives browser clears and works across devices.

@app.route("/api/chat/messages", methods=["GET"])
@authenticate_token
def chat_messages_get():
    """Return the last N messages for the logged-in user, oldest-first."""
    user_id = g.user["id"]
    try:
        limit = min(int(request.args.get("limit", 50)), 200)
    except (ValueError, TypeError):
        limit = 50

    rows = db.query(
        """
        SELECT id, sender_role, content, created_at
        FROM chat_messages
        WHERE user_id = %s
        ORDER BY created_at ASC
        LIMIT %s
        """,
        (user_id, limit),
    )
    return jsonify([{
        "id": r["id"],
        "sender_role": r["sender_role"],
        "content": r["content"],
        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
    } for r in rows])


@app.route("/api/chat/messages", methods=["POST"])
@authenticate_token
@require_analyzer
def chat_messages_post():
    """
    Persist a chat exchange (user message + bot response) server-side.
    Accepts: {"messages": [{"sender_role": "user"|"bot", "content": "..."}]}
    Called fire-and-forget from the frontend — never blocks the UI.
    """
    user_id = g.user["id"]
    body = request.get_json(silent=True) or {}
    messages = body.get("messages", [])

    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({"error": "messages array required"}), 400

    inserted = []
    try:
        with db.transaction() as cur:
            for msg in messages[:20]:   # cap: max 20 messages per call
                sender_role = (msg.get("sender_role") or "").strip()
                content = (msg.get("content") or "").strip()
                if sender_role not in ("user", "bot") or not content:
                    continue
                cur.execute(
                    """
                    INSERT INTO chat_messages (user_id, sender_role, content)
                    VALUES (%s, %s, %s)
                    RETURNING id
                    """,
                    (user_id, sender_role, content[:10000]),
                )
                row = cur.fetchone()
                if row:
                    inserted.append(row["id"])
    except Exception as err:
        logger.error("chat_messages_post failed: %s", err)
        return jsonify({"error": "Failed to save messages"}), 500

    return jsonify({"saved": len(inserted), "ids": inserted}), 201


# ── Feedback ────────────────────────────────────────────────────────────────
@app.route("/api/feedback", methods=["POST"])
@authenticate_token
def feedback():
    body = request.get_json(silent=True) or {}
    message_text = body.get("message_text")

    if not message_text or not isinstance(message_text, str):
        return jsonify({"error": "message_text is required."}), 400
    if len(message_text) > 10000:
        return jsonify({"error": "message_text too long (max 10,000 chars)."}), 400

    try:
        rows = db.query(
            "INSERT INTO feedback (user_id, message_text) VALUES (%s, %s) RETURNING id, reported_at",
            (g.user["id"], message_text.strip()),
        )
        return jsonify({"ok": True, "id": rows[0]["id"], "reported_at": rows[0]["reported_at"]}), 201
    except Exception as error:
        logger.error("feedback save failed: %s", error)
        return jsonify({"error": "Failed to save feedback."}), 500


# ── Plugin registry ─────────────────────────────────────────────────────────
@app.route("/api/plugins", methods=["GET"])
@authenticate_token
def plugins():
    try:
        tenant = _safe_tenant(g.user)
        rows = db.query(
            "SELECT plugin_id FROM tenant_plugins WHERE tenant_schema = %s ORDER BY enabled_at ASC",
            (tenant,),
        )
        return jsonify({"plugins": [r["plugin_id"] for r in rows]})
    except Exception as error:
        logger.error("plugins fetch failed: %s", error)
        return jsonify({"error": "Failed to fetch plugins."}), 500

# ── Admin: user management ───────────────────────────────────────────────────
@app.route("/api/admin/users", methods=["GET"])
@authenticate_token
@require_admin
def list_users():
    caller_tenant = _safe_tenant(g.user)
    try:
        if caller_tenant == "bfi":
            rows = db.query(
                "SELECT id, username, user_role, tenant_schema, created_at FROM users ORDER BY created_at DESC"
            )
        else:
            rows = db.query(
                "SELECT id, username, user_role, tenant_schema, created_at FROM users WHERE tenant_schema = %s ORDER BY created_at DESC",
                (caller_tenant,),
            )
        return jsonify([
            {
                "id": r["id"],
                "username": r["username"],
                "user_role": r["user_role"],
                "tenant_schema": r["tenant_schema"] or "bfi",
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ])
    except Exception as error:
        logger.error("users fetch failed: %s", error)
        return jsonify({"error": "Failed to fetch users."}), 500


@app.route("/api/admin/users/<int:user_id>/role", methods=["PATCH"])
@authenticate_token
@require_admin
def update_user_role(user_id):
    VALID_ROLES = ["admin", "editor", "analyzer", "viewer"]
    body = request.get_json(silent=True) or {}
    role = body.get("role")
    caller_tenant = _safe_tenant(g.user)

    if not role or role not in VALID_ROLES:
        return jsonify({"error": "Invalid role. Must be one of: {}".format(", ".join(VALID_ROLES))}), 400

    # Prevent self-demotion
    if user_id == g.user["id"] and role != "admin":
        return jsonify({"error": "Cannot demote yourself from admin role."}), 403

    try:
        # Non-BFI admins can only change roles of users in their own tenant.
        if caller_tenant != "bfi":
            target = db.query("SELECT tenant_schema FROM users WHERE id = %s", (user_id,))
            if not target or target[0]["tenant_schema"] != caller_tenant:
                return jsonify({"error": "User not found or outside your tenant."}), 404

        rows = db.query(
            "UPDATE users SET user_role = %s WHERE id = %s RETURNING id, username, user_role",
            (role, user_id),
        )
        if not rows:
            return jsonify({"error": "User not found."}), 404
        logger.info("User %s role updated to %s by admin %s", user_id, role, g.user["id"])
        return jsonify(dict(rows[0]))
    except Exception as error:
        logger.error("role update failed: %s", error)
        return jsonify({"error": "Failed to update role."}), 500


@app.route("/api/admin/users/<int:user_id>/tenant", methods=["PATCH"])
@authenticate_token
@require_admin
def update_user_tenant(user_id):
    body = request.get_json(silent=True) or {}
    new_tenant = body.get("tenant_schema")
    caller_tenant = _safe_tenant(g.user)

    if not new_tenant or new_tenant not in VALID_TENANT_SCHEMAS:
        return jsonify({"error": "Invalid tenant_schema. Must be one of: {}".format(", ".join(sorted(VALID_TENANT_SCHEMAS)))}), 400

    if user_id == g.user["id"]:
        return jsonify({"error": "Cannot change your own organization."}), 403

    # Non-BFI admins can only assign users to their own tenant.
    if caller_tenant != "bfi" and new_tenant != caller_tenant:
        return jsonify({"error": "You can only assign users to your own organization."}), 403

    try:
        # Non-BFI admins can only modify users within their own tenant.
        if caller_tenant != "bfi":
            target = db.query("SELECT tenant_schema FROM users WHERE id = %s", (user_id,))
            if not target or target[0]["tenant_schema"] != caller_tenant:
                return jsonify({"error": "User not found or outside your tenant."}), 404

        rows = db.query(
            "UPDATE users SET tenant_schema = %s WHERE id = %s RETURNING id, username, tenant_schema",
            (new_tenant, user_id),
        )
        if not rows:
            return jsonify({"error": "User not found."}), 404
        logger.info("User %s tenant updated to %s by admin %s", user_id, new_tenant, g.user["id"])
        return jsonify(dict(rows[0]))
    except Exception as error:
        logger.error("tenant update failed: %s", error)
        return jsonify({"error": "Failed to update organization."}), 500


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@authenticate_token
@require_admin
def delete_user(user_id):
    caller_tenant = _safe_tenant(g.user)

    if user_id == g.user["id"]:
        return jsonify({"error": "Cannot delete your own account."}), 403

    try:
        # Non-BFI admins can only delete users in their own tenant.
        if caller_tenant != "bfi":
            target = db.query("SELECT tenant_schema FROM users WHERE id = %s", (user_id,))
            if not target or target[0]["tenant_schema"] != caller_tenant:
                return jsonify({"error": "User not found or outside your tenant."}), 404

        rows = db.query(
            "DELETE FROM users WHERE id = %s RETURNING id, username",
            (user_id,),
        )
        if not rows:
            return jsonify({"error": "User not found."}), 404
        logger.info("User %s (%s) deleted by admin %s", user_id, rows[0]["username"], g.user["id"])
        return jsonify({"deleted": True, "id": rows[0]["id"], "username": rows[0]["username"]})
    except Exception as error:
        logger.error("user delete failed: %s", error)
        return jsonify({"error": "Failed to delete user."}), 500

# ── Blueprints (authenticated) ──────────────────────────────────────────────
sources_bp = create_sources_blueprint(require_admin, require_editor, require_analyzer, require_viewer)
stats_bp = create_stats_blueprint()
realtime_bp = create_realtime_blueprint()
census_bp = create_census_blueprint()


@sources_bp.before_request
@stats_bp.before_request
@realtime_bp.before_request
@census_bp.before_request
def _require_auth_for_blueprints():
    return _verify_request_token()


app.register_blueprint(sources_bp, url_prefix="/api/sources")
app.register_blueprint(stats_bp, url_prefix="/api/stats")
app.register_blueprint(realtime_bp, url_prefix="/api/realtime")
app.register_blueprint(census_bp, url_prefix="/api/census")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    # Threaded so SSE streaming doesn't block other requests under the dev server.
    app.run(host="0.0.0.0", port=port, threaded=True)
