via-mvp Pre-Production Audit Report
Original Date: 2026-06-14 | Auditor: Antigravity (Principal Engineer / Red Team)
Last Updated:  2026-06-14 | Reflects changes through Phase A, B, C, D

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXECUTIVE SUMMARY (UPDATED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Original finding: 2 Critical, 6 High, 11 Medium, 8 Low. Verdict: NOT PRODUCTION READY.

After Phases A–D:
  - 2 Critical:  FIXED
  - 4 of 6 High: FIXED
  - 5 of 11 Medium: FIXED
  - 1 of 8 Low: FIXED

Remaining blockers to production: HTTPS/TLS (no domain yet), server-side token
revocation, Redis-backed rate limiting, modal accessibility.

Current verdict: SIGNIFICANT IMPROVEMENT — approaching "READY WITH MAJOR RISKS"
once TLS is configured for the production domain.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — SECURITY AUDIT (STATUS UPDATED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔴 CRITICAL-1: Live OpenAI API Key Committed to .env
Status: ✅ FIXED (Phase B)
The key was rotated. SettingsModal and x-openai-key header mechanism were
removed entirely. The backend now uses only the server-side OPENAI_API_KEY from
.env. No user-supplied key is accepted or transmitted in any request header.
The API key is now server-side only and never sent to or stored by the frontend.

────────────────────────────────────────────────────────────────────────────────

🔴 CRITICAL-2: User-Supplied OpenAI API Key via x-openai-key Header
Status: ✅ FIXED (Phase B / C-2)
SettingsModal.jsx deleted. FeedbackBubble.jsx no longer reads buffi_api_key
from localStorage or sends x-openai-key in any request header. The custom key
passthrough in server.js is removed. All AI requests use the server-side key.

────────────────────────────────────────────────────────────────────────────────

🟠 HIGH-1: JWT Stored in localStorage — XSS → Full Account Takeover
Status: ✅ FIXED (Phase C-3)
JWT is now stored exclusively in an HttpOnly, SameSite=Strict cookie (via_session).
The backend sets it on login via res.cookie(). JavaScript on the page cannot
read it via document.cookie. AuthContext no longer holds or reads a token —
only username and role from the login response JSON body. ProtectedRoute and
AdminRoute now gate on context.user (not context.token). Legacy via_token is
cleaned from localStorage on app mount.

────────────────────────────────────────────────────────────────────────────────

🟠 HIGH-2: Tenant Isolation Broken — Hardcoded 'bfi' Schema
Status: ✅ FIXED (Phase C-1)
tenant is now included in the JWT payload at login (tenant: user.tenant_schema || 'bfi').
All routes extract req.user.tenant and pass it through. openai.js accepts tenant
as a parameter and validates it against SAFE_SCHEMA regex. sources.js does the
same. The hardcoded const tenant = 'bfi' is gone from all three files.

────────────────────────────────────────────────────────────────────────────────

🟠 HIGH-3: Chat Endpoint No Per-Message Input Size Limit
Status: ✅ FIXED (Phase B)
The /api/chat/stream route now validates:
  - message: required, string, max 4,000 characters
  - history: capped to last 20 entries, each entry validated for shape
  - safeHistory: only entries with { from: 'user'|'bot', text: string } pass

────────────────────────────────────────────────────────────────────────────────

🟠 HIGH-4: CSV Column Names Used as SQL Identifiers Without Validation
Status: ✅ FIXED (Phase B)
sources.js now runs all CSV column names through sanitizeColumnName():
  col.replace(/[^a-zA-Z0-9_ ]/g, '').trim().slice(0, 63)
Any column that sanitizes to empty gets a random col_xxxxx fallback.
Tenant schema is validated against SAFE_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/.

────────────────────────────────────────────────────────────────────────────────

🟠 HIGH-5: No HTTPS in Production
Status: ⏳ DEFERRED — Requires a production domain
The prod Nginx config still listens on port 80 only. This must be resolved
before any real users connect. Options: Certbot companion container or cloud
load balancer TLS termination. Nothing to implement until a domain is assigned.

────────────────────────────────────────────────────────────────────────────────

🟠 HIGH-6: No Content Security Policy
Status: ✅ FIXED (Phase B)
server.js now passes an explicit contentSecurityPolicy config to helmet():
  defaultSrc: self, scriptSrc: self, styleSrc: self + Google Fonts,
  fontSrc: self + gstatic, imgSrc: self + data: + OSM tiles,
  connectSrc: self + api.openai.com, frameSrc: none, objectSrc: none.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEDIUM FINDINGS (STATUS UPDATED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🟡 MEDIUM-1: In-Memory Rate Limiter Resets on Restart
Status: 🔴 OPEN
express-rate-limit still uses in-memory storage. Container restarts reset counters.
Fix: Add rate-limit-redis with a shared Redis instance. Deferred — Redis requires
an additional service in docker-compose. Add when deploying at scale.

────────────────────────────────────────────────────────────────────────────────

🟡 MEDIUM-2: SELECT * in Login Query
Status: ✅ FIXED (Phase B)
Login query now explicitly selects only: id, username, password_hash, user_role,
tenant_schema. No wildcard columns.

────────────────────────────────────────────────────────────────────────────────

🟡 MEDIUM-3: chatLimiter Missing from Non-Streaming Chat Route
Status: ✅ FIXED (Phase B)
The dead /api/chat non-streaming route was removed. Only /api/chat/stream
remains and it has chatLimiter applied.

────────────────────────────────────────────────────────────────────────────────

🟡 MEDIUM-4: handleReport — Fake User Feedback (localStorage Only)
Status: ✅ FIXED (Phase C-5)
handleReport now POSTs to /api/feedback with credentials:'include'. The backend
stores the flagged message text in a new feedback table (user_id FK, message_text,
reported_at). A toast confirms success or failure to the user within 2 seconds.
The localStorage write is gone.

────────────────────────────────────────────────────────────────────────────────

🟡 MEDIUM-5: Hardcoded Default DB Credentials
Status: ✅ FIXED (Phase B)
server.js fail-fast checks added for POSTGRES_PASSWORD and POSTGRES_USER.
The || 'admin' fallbacks are removed. Container exits on startup if credentials
are missing. Dev docker-compose.yml still has hardcoded admin/admin — acceptable
for local dev only, never deployed to production.

────────────────────────────────────────────────────────────────────────────────

🟡 MEDIUM-6: Public /register Route Reveals Admin Registration Mechanism
Status: 🟡 OPEN (accepted risk for MVP)
/register remains a public route. The backend guards it with timingSafeEqual
on ADMIN_SECRET. The authLimiter (20 req/15min) applies. For an internal tool
this is acceptable. For public deployment: remove the route and provision users
via a private admin CLI or database command.

────────────────────────────────────────────────────────────────────────────────

🟡 MEDIUM-7: multer 1.x (CVE-2022-24434)
Status: 🟡 OPEN
multer@^1.4.5-lts.1 is still in use. The LTS fork patches the CVE but is
unmaintained. multer@2.x is available. Low urgency for an internal tool but
should be upgraded before public deployment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 7 — TESTING (STATUS UPDATED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Original finding: 0 test files. Score: 0/10.

Status: ✅ PARTIAL FIX (Phase D)
backend/tests/smoke.test.js added. Uses Node's built-in test runner (no deps).
Covers:
  - Register: missing admin secret (403), short password (400), success (201)
  - Login: wrong password (401), success (200), HttpOnly cookie set, token NOT in body
  - Route guard: unauthenticated /api/sources (401)
  - Authenticated /api/sources: returns array (200)
  - Upload RBAC: viewer role cannot upload (403)
  - Feedback: unauthenticated (401), authenticated (201)
  - Logout: cookie cleared in Set-Cookie header

Still missing: unit tests, E2E tests, malicious column name upload test,
OpenAI mock tests, SSE mid-stream drop test.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 9 — DEVOPS & DEPLOYMENT (STATUS UPDATED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No CI/CD pipeline: ✅ FIXED
  .github/workflows/ci.yml added. On every push to main/develop and PRs to main:
  (1) Spins up postgres:16-alpine, applies init.sql, starts backend, runs smoke tests.
  (2) Installs frontend deps and runs Vite production build.

No structured logging: ✅ FIXED
  pino + pino-http added to backend. Pretty-print in dev, JSON in prod.
  All console.error calls replaced with logger.error. Request-level logging
  (method, url, status, response time) on every request via pino-http middleware.

No log aggregation: 🔴 OPEN — Deferred to production deployment.

No database backup automation: 🔴 OPEN
  Manual pg_dump command documented in README. Automated backup deferred —
  requires a deployment target (cron job or managed backup on cloud host).

No monitoring/alerting (Sentry, Prometheus): 🔴 OPEN — Deferred.

Dev/Prod Postgres image mismatch: ✅ FIXED (Phase C-6)
  docker-compose.prod.yml was using postgis/postgis:15-3.3 (PG15 + PostGIS).
  Dev used postgres:16-alpine. PostGIS is unused in this codebase.
  Both standardized to postgres:16-alpine.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 6 — DEAD CODE (STATUS UPDATED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase A deleted 30+ dead files. Summary of remaining known dead items:

  chat_messages table (init.sql): scaffolded, no backend endpoint reads/writes it.
  datasets table (init.sql): unused. Created in schema, never populated.
  axios (frontend/package.json): not imported anywhere. Dead dependency.
  md5 (frontend/package.json): not imported anywhere. Dead dependency.

To remove dead frontend deps:
  cd frontend && npm uninstall axios md5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATED RELEASE READINESS SCORECARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Category          Original   Now    Change
Architecture        5/10    5/10    No regression. Hardcoded tenant fixed. God components remain.
Security            2/10    6/10    +4 — Both Criticals fixed. 4 Highs fixed. 1 High (TLS) deferred.
Scalability         3/10    4/10    +1 — Pool max=20 added. Rate limiter still in-memory.
Performance         4/10    4/10    No change. Fake streaming, no code splitting — out of scope.
Maintainability     4/10    5/10    +1 — 30+ dead files removed. Core god components remain.
Reliability         3/10    5/10    +2 — Smoke tests added. CI/CD added. Monitoring still missing.
Testing             0/10    3/10    +3 — 11 integration assertions covering core auth + RBAC paths.
UX                  5/10    5/10    No change. Modal a11y still needs work.
DevOps              2/10    5/10    +3 — Pino logging, GitHub Actions CI, postgres image fixed.
Production Readiness 1/10   5/10   +4 — Criticals resolved. TLS remains the last hard blocker.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATED VERDICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

╔═══════════════════════════════════════════════════════╗
║   READY WITH KNOWN RISKS — once TLS is configured     ║
╚═══════════════════════════════════════════════════════╝

The two Critical blockers are resolved. The application no longer leaks API
keys, passes raw tokens to the browser, or silently cross-contaminates tenant
data. Feedback reaches the database. Deploys run tests automatically.

The remaining gap before a real public deployment:

  1. TLS/HTTPS (domain required — deferred by choice, not oversight)
  2. Server-side JWT revocation table (blocklist on logout)
  3. Redis-backed rate limiting (in-memory limiter resets on restart)
  4. multer@2.x upgrade
  5. Modal accessibility (WCAG 2.1 AA violations in dialogs)
  6. Remove axios + md5 dead dependencies

Items 2–6 are acceptable for an internal-only VIA staff deployment. Item 1 is
required before any network exposure beyond localhost.

Findings not addressed because they are architectural (out of MVP scope):
  - God component decomposition (ChatPage.jsx, FeedbackBubble.jsx)
  - Fake setInterval streaming (real OpenAI native streaming)
  - Conversation history server persistence (chat_messages table is wired)
  - Redis queue for AI requests at scale
  - Linear regression forecasting accuracy disclaimer

Last reviewed: 2026-06-14. Maintained by Better Futures Institute engineering team.
