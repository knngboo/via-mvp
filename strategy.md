BFI Platform — Product Strategy Notes
Living document. Last updated: 2026-06-15

────────────────────────────────────────────────────────────
Meeting Notes — Team Sync (2026-06-15, SOW Presentation)
────────────────────────────────────────────────────────────

Decisions made in this meeting:

1. PostgreSQL is confirmed. Stop calling it a question.
   We present it as decided: "We're using Postgres. Here's why it's better than Mongo
   for structured transit data, schema isolation per client, and long-term auth."
   VIA does not need to weigh in on this.

2. Python is now confirmed for the backend.
   The scorpion branch is the Python port of superman and is the direction going forward.
   Python was chosen for better ML library support and native data tooling (pandas, scikit-learn).
   Node.js (superman) served as the design prototype — all features now ported to scorpion.

3. The SOW phases are being renamed "components"
   because phase implies sequential and we're working on them concurrently.

4. Andrew is a coding and data expert.
   He will want an expert-level data access/export option — not just a pretty chart.
   We need to make sure he can get raw data out of Buffi in whatever format he needs.

5. VIA has very loose expectations (3 goals: ridership model, forecast, Better Bus analysis).
   This is our opportunity to push our own recommendation, not just do what they say.
   Present confidently. Sell the solution.

6. The plugin system was validated by the supervisor.
   The fact that different clients get their own schema and their own plugin is correct architecture.

7. New question to ask VIA: "When Buffi has processed your data, what is your preferred
   format for exporting it?" (CSV? API? Their existing DB? Dashboard PDF?)
   This is the most useful technical question for them to answer.

8. Need recurring meetings with Andrew.
   Tech team + Andrew should be meeting consistently, not just at milestones.

9. Christine (VIA) has different ideas than what the tech team was thinking.
   Need to understand her vision vs. Andrew's before the next build sprint.

────────────────────────────────────────────────────────────────────
────────────────────────────────────────────
1. What We Know About the Platform Direction
────────────────────────────────────────────

The Core Vision
BFI is building a multi-agency analytics platform. VIA is the first agency (tenant). Each agency:
- Brings their own data (uploaded files, connected databases, or public feeds)
- Gets a branded dashboard (plugin)
- Uses Buffi as their AI assistant

VIA's Confirmed Objectives
- Ridership forecasting — predict future ridership using historical data
- Better Bus plan analysis — analyze the proposed service changes (scope TBD)
- General transit data querying — "ask Buffi" about routes, stops, schedules

──────────────────────────────────────────────────
2. Data Architecture — Requirements & Open Questions
──────────────────────────────────────────────────

What VIA/agencies want (as expressed):
- Private file uploads — upload docs/CSVs stored on the host's server, not a cloud bucket
- 3rd-party database connections — plug in an existing database (Postgres, API) instead of uploading files
- Public dataset integration — use published open datasets (GTFS feeds, census data) as input
- Flexibility on storage — some agencies may not have a database at all yet and that's fine

Recommended architecture (to design, not build yet):

  Data Sources (per tenant)
  ├── Uploaded files     → stored on server filesystem (partially built)
  ├── External DB API    → connect string / API key → query at runtime
  ├── Public feeds       → GTFS static, GTFS-RT, open data portals
  └── No data yet        → start with public datasets only

GTFS Data Provenance (VIA-specific)
Dataset                          Source               Status
GTFS static (shared by VIA)      Provided by VIA      Official — use freely
GTFS static (online)             Google/unofficial    Unofficial — do NOT use in production without VIA sign-off
Better Bus plan data             Unknown              TBD — needs clarification

⚠️  CAUTION: The Google-sourced GTFS data was previously loaded in dev. Platform now starts blank.
    Any GTFS data used in demos must be the VIA-provided set or uploaded fresh via the Data Hub.

Open Questions FOR VIA (things only they can answer)

  DATA
  ☐ Can VIA provide sample APC/UTA CSV files, GTFS files, and Andrew's cleaned historical ridership data?
  ☐ Can we use public GTFS feeds from the VIA website / transitfeeds.com, or must we only use files VIA provides?
  ☐ Will we have access to the UTA portal to automate APC data pulls?
  ☐ Is the Better Bus plan a document (PDF/slides) or a structured data file (routes/stop tables)?
  ☐ When Buffi has processed and analyzed your data — what is your preferred format for exporting it?
      (CSV download? API endpoint? Direct DB connection? Dashboard report?)

  PRODUCT & USERS
  ☐ What is the expected number of users, and what roles will they serve? (analyst, manager, IT admin?)

  NOTE: These are BFI's decisions — DO NOT ask VIA:
  ✗ Which database? → PostgreSQL. We decided. We tell them.
  ✗ JavaScript vs Python? → Our stack, our call. Present as decided.
  ✗ Where to store files? → BFI server for now. We own this decision.
  ✗ Which AI model? → OpenAI GPT-4o. Present as decided.



──────────────────────────────────────────────────────────
3. Buffi AI Architecture — What It Is and What's Missing
──────────────────────────────────────────────────────────

What Buffi Is Right Now
Buffi = GPT-4o-mini (or GPT-4o, selectable) + VIA-specific system prompt + text-to-SQL engine.

It is not trained. It is not a custom model. It is an OpenAI API call with schema context.

The OpenAI Key Model (Current)
- BFI hosts the key in backend/.env (OPENAI_API_KEY)
- VIA employees never need a key — they log in and use Buffi
- Risk: All usage bills to BFI. VIA's usage = BFI's cost.
- Mitigation options: Per-tenant key (VIA provides their own stored as a secret), or usage-based billing by BFI

Text-to-SQL (Implemented)
Instead of hardcoded tools per question type:
- AI receives the database schema (table names + columns) as context at query time
- AI writes SQL for any question the data can answer
- Backend validates query is SELECT-only (no mutations)
- Results returned and formatted by AI into a response

Current Remaining AI Limitations
Problem                                    Impact                         Solution Direction
System prompt still VIA-specific           Can't reuse Buffi as-is        Move VIA context into Via plugin manifest
Only OpenAI supported                      Vendor lock-in                 LLM abstraction layer
Forecasting uses linear regression only   Inaccurate for real decisions  Integrate proper time-series (Python/ML service)

ML Exploration Track
- Part of the BFI team is exploring machine learning models
- Purpose/scope unknown — needs clarification
- Could be: custom ridership forecasting model, anomaly detection, NLP classification
- Real ML models would live as a separate service (Python/scikit-learn or similar)
- Integration point: a tool call to a /api/predict endpoint backed by a real model



────────────────────────────────────────────────────────────────────
4. What "Plugin" Means vs. What "Base Platform" Means
────────────────────────────────────────────────────────────────────

Current state: VIA-specific logic is still partially embedded:
- System prompt references VIA GTFS
- VIA schema still named 'bfi' (single tenant)
- Plugin manifest not yet formalized

What it should look like:

  Base Platform (Buffi)         Via Plugin
  ─────────────────────         ──────────────────────
  Auth / RBAC                   VIA dashboard component
  File upload                   VIA system prompt additions
  Text-to-SQL engine            VIA schema documentation
  Chat interface                VIA data (uploaded by VIA)
  Tenant management             VIA-specific AI tools (if any)

Feature mapping:
  Feature                   Belongs in
  GTFS table queries         Via plugin (VIA uploads their GTFS)
  Ridership forecasting      Platform (generic ML tool)
  Dashboard charts           Via plugin
  File upload UI             Platform
  Buffi chat                 Platform

──────────────────────────────────────────────────────────────────────
5. Immediate Technical Decisions Before Building More
──────────────────────────────────────────────────────────────────────

Decision 1: Remove GTFS auto-seed
Status: ✅ DONE
Fresh startup = blank database. Agencies upload their own data via Data Hub.

Decision 2: Text-to-SQL
Status: ✅ DONE
AI receives schema context and writes its own queries. Replaces hardcoded tool list.

Decision 3: LLM abstraction layer
Status: ⏳ DEFERRED — BFI's decision, not VIA's. Not blocking anything right now.
Current: OpenAI GPT-4o hardcoded. This is our stack choice. Present as decided.

Decision 4: Private file storage model
Status: ✅ DECIDED — BFI owns this call.
Current: PostgreSQL-backed tables on BFI server. This is our recommendation.
Tell VIA: "Data lives on our server during the program. Export options TBD with you."

──────────────────────────────────────────────────────
6. Backlog (Known Work, Not Yet Started)
──────────────────────────────────────────────────────

Platform
✅ Remove GTFS auto-seed — blank slate on startup
✅ Text-to-SQL engine replacing fixed tool list
✅ Multer 2.x upgrade (CVE resolved)
✅ HttpOnly cookie session (JWT never in localStorage)
✅ Content Security Policy via Helmet
✅ Tenant schema from JWT (not hardcoded)
✅ CSV column name sanitization
✅ Message length + history capping on chat endpoint
✅ Real /api/feedback endpoint (DB-backed)
✅ Session restore from cookie (/api/me with retry)
✅ Per-user namespaced chat history (no cross-account leaking)
✅ Submission context tooltips + Data Domain dropdown
✅ Data Hub editor+admin gated (was admin-only)
✅ RBAC — 4 roles (admin/editor/analyzer/viewer), route guards, admin panel
✅ Ownership tracking on sources (user_id, visibility columns)
✅ Source visibility filtering (shared vs. private)
✅ Self-demotion prevention in admin panel (backend + frontend)
✅ .env untracked from git
✅ RBAC ported to scorpion Python (app.py, sources.py, frontend)

☐ Server-side chat history (chat_messages table exists, not wired to any endpoint)
☐ Persistent file storage that survives docker volume wipes (S3 / mounted volume)
☐ JWT revocation on logout (blocklist table — currently TTL-only)
☐ Redis-backed rate limiting (currently in-memory, resets on restart)
☐ LLM abstraction layer (OpenAI → provider interface)
☐ Minimum test suite expansion (auth + upload + chat + edge cases)
☐ Structured error monitoring (Sentry or similar)
☐ Automated DB backup scheduling

Via Plugin
☐ Data export feature — user can download query results as CSV or get a raw data endpoint
    (Andrew specifically needs this — he's a data expert, not just a dashboard user)
☐ APC data pipeline — automated pull from UTA portal (blocked on portal access from VIA)
☐ Move VIA system prompt context into plugin manifest (decouple from base platform)
☐ VIA GTFS upload flow (formalized — agency uploads their own feed via Data Hub)
☐ Better Bus plan integration (needs scope clarification from VIA — doc or data file?)
☐ Map visualization improvements

Platform Admin
☐ Agency onboarding UI (currently manual SQL for role assignment)
☐ Per-tenant plugin assignment UI
☐ Usage/cost tracking per tenant (who is spending what on OpenAI calls)

Infrastructure
☐ TLS/HTTPS in production (Certbot or cloud load balancer — MUST before public deployment)
☐ CI/CD pipeline (GitHub Actions exists but needs test gate enforcement)
☐ Horizontal scaling readiness (requires Redis for sessions + rate limiting)
☐ DB replica / read replica for scale

Strategic / External
☐ Get data from VIA ASAP — we are blocked on APC CSV, GTFS files, ridership data
☐ Confirm GTFS data licensing (VIA-provided set replaces unofficial Google-sourced data)
☐ Schedule recurring meetings with Andrew (tech team lead) — weekly or bi-weekly
☐ Align with Christine (VIA) on her vision vs. what the tech team is building
☐ Send updated SOW with "components" instead of "phases"

────────────────────────────────────────────────────────────
Next: scorpion is the active branch
────────────────────────────────────────────────────────────

The superman branch is now a reference implementation (Node.js/JS).
All future development happens on scorpion (Python/Flask/PostgreSQL).

Immediate next priorities for scorpion:
1. ☐ Smoke test the RBAC port — run scorpion via docker compose and verify the 6 test scenarios
2. ☐ Wire chat_messages table to the chat endpoint (server-side history persistence)
3. ☐ Implement structured AI response format (chart_data + highlight_data JSON) for ChartView and FeedbackBubble
4. ☐ Prepare VIA demo with real or seeded data
5. ☐ Schedule Andrew technical meeting to align on data export format