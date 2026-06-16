BFI Platform — Product Strategy Notes
Living document. Last updated: 2026-06-16

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

Open Questions for VIA on Data:
☐  Do you want files stored on BFI's server or your own infrastructure?
☐  Do you have an existing database you want to connect to Buffi?
☐  Is the Better Bus plan a document (PDF/slides) or a data file (route/stop tables)?
☐  Can we use public GTFS feeds from the VIA website directly? (They publish at transitfeeds.com)
☐  What counts as "private" data vs. data you're okay storing on BFI's platform?
☐  Do you want your own OpenAI billing account, or is BFI paying for all AI usage?

──────────────────────────────────────────────────────────
3. Buffi AI Architecture — What It Is and What's Missing
──────────────────────────────────────────────────────────

What Buffi Is Right Now
Buffi = GPT-4o-mini (or GPT-4o, selectable) + VIA-specific system prompt + text-to-SQL engine.

It is not trained. It is not a custom model. It is an OpenAI API call with schema context.

The OpenAI Key Model (Current — Updated 2026-06-16)
- Each user enters their own OpenAI API key in the Settings panel
- Key is sent per-request as an X-OpenAI-Key header — never stored server-side
- Server-side OPENAI_API_KEY in .env acts as a fallback if no user key is provided
- Risk: keys travel over HTTP in dev. HTTPS is required before external deployment.
- Advantage: BFI does not pay for VIA staff AI usage. Each user controls their own spend.

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

Open Questions on AI:
☐  Does VIA want to use their own OpenAI account (for billing)?
☐  Is there interest in non-OpenAI models (Gemini, Claude, local open-source)?
☐  What is the ML team exploring specifically? (Forecasting? Classification? Something else?)
☐  Should Buffi be branded differently per agency, or is "Buffi" the universal name?

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
Status: ⏳ DEFERRED — pending VIA answer on billing/model preference
Current: OpenAI hardcoded. Target: Pluggable provider (OpenAI, Gemini, Claude, local).

Decision 4: Private file storage model
Status: ⏳ BLOCKED on VIA input
Current: Files stored in PostgreSQL-backed tables (survive restarts, lost only on `down -v`).
Target: Persistent volume mount or external object storage (S3, local disk).
Need: VIA to answer where they want files stored.

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
✅ Data Hub admin-only sidebar link

✅ Server-side chat history — GET/POST /api/chat/messages wired to chat_messages table
   Frontend fire-and-forget save is partially implemented (verify FeedbackBubble + ChatPage restore)
☐ Persistent file storage that survives docker volume wipes (S3 / mounted volume)
☐ JWT revocation on logout (blocklist table — currently TTL-only)
☐ Redis-backed rate limiting (currently in-memory, resets on restart)
☐ LLM abstraction layer (OpenAI → provider interface)
☐ Minimum test suite expansion (auth + upload + chat + edge cases)
☐ Structured error monitoring (Sentry or similar)
☐ Automated DB backup scheduling

Via Plugin
☐ Move VIA system prompt context into plugin manifest (decouple from base platform)
☐ VIA GTFS upload flow (formalized — agency uploads their own feed via Data Hub)
☐ Better Bus plan integration (needs scope clarification from VIA)
☐ Map visualization improvements

Platform Admin
☐ Agency onboarding UI (currently manual SQL for role assignment)
☐ Per-tenant plugin assignment UI
☐ Usage/cost tracking per tenant (who is spending what on OpenAI calls)

Infrastructure
☐ TLS/HTTPS in production (Certbot or cloud load balancer — MUST before public deployment)
☐ CI/CD pipeline — ci.yml exists but runs Node.js/npm on a Python backend. Needs update to pip + pytest.
☐ AWS EC2 deployment — architecture guide drafted, not yet deployed
☐ Horizontal scaling readiness (requires Redis for sessions + rate limiting)
☐ DB replica / read replica for scale

Strategic / External
☐ Get VIA answers on: storage preference, billing model, ML scope, Better Bus data format
☐ Clarify GTFS data licensing (confirm VIA-provided data replaces unofficial source)
☐ Determine ML team's model plans and integration point
☐ Define what "Buffi" brand means across agencies (or per-tenant naming)