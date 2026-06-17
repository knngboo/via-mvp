BFI Platform — Product Strategy Notes
Living document. Last updated: 2026-06-17

────────────────────────────────────────────
1. What We Know About the Platform Direction
────────────────────────────────────────────

The Core Vision
BFI is building a multi-agency analytics platform. VIA is the first agency (tenant). Each agency:
- Brings their own data (uploaded files, connected databases, or public feeds)
- Gets a branded workspace with their data pre-loaded
- Uses Buffi as their AI tile editor — not just a chatbot, but a live manipulation tool

VIA's Confirmed Objectives
- Ridership forecasting — predict future ridership using historical data
- Better Bus plan analysis — analyze the proposed service changes (scope TBD)
- General transit data querying — "ask Buffi" about routes, stops, schedules
- Map and chart manipulation — users describe what they want to see, Buffi updates the tile

────────────────────────────────────────────────────────
2. Buffi Philosophy — From Chatbot to Tile Editor (2026-06-17)
────────────────────────────────────────────────────────

Key Pivot
Buffi is no longer just a chatbot. Buffi IS the tool.

Previous model: User goes to /chat, types a question, Buffi answers in text (with optional map/chart side effects).

New model: The primary interface is a tiling workspace. Each tile (Map, Chart, Dashboard, Sources) is a live visualization. Buffi sits as a floating bubble inside Map and Chart tiles. When you ask Buffi something from that bubble, it has context about what's currently on screen and modifies the visualization directly.

What This Means in Practice
- Chat tile (full Buffi): exploration mode — ask anything, browse history, ask follow-ups
- Map tile bubble: "filter stops within 2 miles of downtown" → map updates
- Chart tile bubble: "change this to a pie chart" → chart type updates
- Duplicate tile: clone any pane for side-by-side comparison before/after

Context Injection (implemented)
Every message sent from the tile bubble is prefixed with a hidden context string describing the current tile state before it reaches the API. The user's chat history stays clean — they see only their message. Buffi gets:
  [VIEW CONTEXT: User is viewing a MAP tile titled "Transit Stops" showing 42 geographic points.]
  User instruction: filter to stops within 1 mile of downtown

This allows Buffi to intelligently modify what's on screen without the user having to explain the context every time.

──────────────────────────────────────────────────
3. Data Architecture — Requirements & Open Questions
──────────────────────────────────────────────────

What VIA/agencies want:
- Private file uploads — stored on the host's server, not a cloud bucket
- 3rd-party database connections — plug in an existing database (Postgres, API) instead of uploading
- Public dataset integration — GTFS feeds, census data
- Flexibility on storage — some agencies may not have a database at all yet

Current Architecture
  Data Sources (per tenant)
  ├── Uploaded CSVs     → bfi.sources_meta registry + dynamic bfi.<table> tables
  ├── Public GTFS       → VIA GTFS-RT (live buses, alerts, trip updates) via HTTP
  ├── GTFS Static       → public.stops, routes, trips, stop_times, etc. (pre-loaded)
  └── Census ACS        → in-memory ZIP-level heatmap (no DB needed)

Buffi's awareness of data (implemented 2026-06-17)
- System prompt always contains: GTFS table names + all uploaded dataset names/tables/columns
- list_data_sources tool: Buffi can enumerate all sources on request
- SA ZIP centroids in system prompt: haversine queries work correctly for any ZIP

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
☐  Can we use public GTFS feeds from the VIA website directly?
☐  What counts as "private" data vs. data you're okay storing on BFI's platform?
☐  Do you want your own OpenAI billing account, or is BFI paying for all AI usage?

──────────────────────────────────────────────────────────
4. Buffi AI Architecture — What It Is and What's Missing
──────────────────────────────────────────────────────────

What Buffi Is Right Now
Buffi = GPT-4o (or GPT-4o-mini, selectable) + tool-calling agent + text-to-SQL + tile context.

Tool suite (fully implemented):
  run_query               → write and run any SELECT, display results as table
  list_data_sources       → enumerate all available data (uploads + GTFS tables)
  make_chart              → bar / pie / radar chart from SQL
  plot_on_map             → plot lat/lon points on the San Antonio map
  show_live_buses         → GTFS-RT real-time vehicle positions
  show_heatmap            → Census ACS demographic heatmap (income, poverty, population, etc.)
  get_service_alerts      → VIA current service alerts and detours
  get_trip_updates        → VIA per-trip arrival/departure delays
  predict_route_ridership → linear regression ridership forecast

API Key Model (current)
- Each user enters their own OpenAI API key in Settings
- Key sent per-request as X-OpenAI-Key header — never stored server-side
- Server-side OPENAI_API_KEY in .env acts as fallback
- Risk: keys travel over HTTP in dev. HTTPS required before external deployment.
- Advantage: BFI does not pay for VIA staff AI usage. Each user controls their own spend.

Remaining AI Limitations
  Problem                                    Solution Direction
  System prompt still VIA-specific           Move VIA context into Via plugin manifest
  Only OpenAI supported                      LLM abstraction layer (pending VIA billing answer)
  Forecasting uses linear regression         Integrate proper time-series (Python/ML service)
  Tile editor commands are suggestions only  Need "command history" to restore/undo tile state

ML Exploration Track
- Part of the BFI team is exploring machine learning models
- Could be: custom ridership forecasting model, anomaly detection, NLP classification
- Real ML models would live as a separate service (Python/scikit-learn or similar)
- Integration point: a tool call to a /api/predict endpoint backed by a real model

Open Questions on AI:
☐  Does VIA want to use their own OpenAI account (for billing)?
☐  Is there interest in non-OpenAI models (Gemini, Claude, local open-source)?
☐  What is the ML team exploring specifically? (Forecasting? Classification? Something else?)
☐  Should Buffi be branded differently per agency, or is "Buffi" the universal name?

────────────────────────────────────────────────────────────────────
5. What "Plugin" Means vs. What "Base Platform" Means
────────────────────────────────────────────────────────────────────

Target separation (not yet implemented):

  Base Platform (Buffi)         VIA Plugin
  ─────────────────────         ──────────────────────
  Auth / RBAC                   VIA dashboard component
  File upload + sources         VIA system prompt additions
  Text-to-SQL engine            VIA schema documentation
  Tiling workspace              VIA tile configurations / layouts
  Buffi tile editor             VIA-specific AI tile suggestions
  Tenant management             VIA data (uploaded by VIA)

Feature mapping:
  Feature                   Belongs in
  GTFS table queries        Via plugin (VIA uploads their GTFS)
  Ridership forecasting     Platform (generic ML tool)
  Dashboard charts          Via plugin
  File upload UI            Platform
  Buffi tile editor         Platform (with plugin-customizable suggestions)

──────────────────────────────────────────────────────
6. Backlog (Known Work, Status)
──────────────────────────────────────────────────────

Workspace / UI
✅ Multi-pane tiling workspace with split / close / drag-swap / drag-resize
✅ Collapsible sidebar (per pane, edge tab control)
✅ Buffi floating bubble in Map + Chart tiles
✅ Buffi as tile editor (tile context injection, view-specific suggestions)
✅ Duplicate pane (deep clone with same view + data)
✅ Source categories (GTFS, public, private) in Upload view
✅ Dataset preview + AI summary in Upload view
✅ Chat history management (new/load/star/delete/clear)
☐ Intent pills above chat input (🗺️ Map it / 📊 Chart it / 📋 Table / 💬 Ask)
☐ Context card (dataset selector) persisted above input for Buffi dataset focus
☐ Map filter bar — active filters strip showing what Buffi last applied
☐ "Undo" tile edit — restore previous tile state from bubble history

Platform / Backend
✅ sources_meta in Buffi schema context
✅ list_data_sources tool
✅ SA ZIP centroids in system prompt
✅ HTTP-only cookie session (JWT never in localStorage)
✅ Tenant schema from JWT (not hardcoded)
✅ CSV column name sanitization
✅ Rate limiting (auth + chat)
✅ Content Security Policy
✅ SQL injection guard (SELECT-only, blocklist)
✅ RBAC decorators (admin / editor / analyzer / viewer)
☐ JWT revocation on logout (blocklist table — currently TTL-only)
☐ Redis-backed rate limiting (currently in-memory, resets on restart)
☐ LLM abstraction layer (OpenAI → provider interface)
☐ Persistent file storage that survives docker volume wipes (S3 / mounted volume)
☐ Automated DB backup scheduling

Infrastructure
✅ Docker Compose (dev + prod)
✅ Integration smoke test suite (pytest)
☐ CI/CD: ci.yml needs update from legacy npm → pip/pytest
☐ TLS/HTTPS in production (MUST before public deployment)
☐ AWS EC2 deployment (architecture drafted, not yet deployed)
☐ Redis for sessions + rate limiting (horizontal scale prerequisite)

Strategic / External
☐ Get VIA answers on: storage, billing, ML scope, Better Bus data format
☐ Clarify GTFS data licensing (confirm VIA-provided data replaces unofficial source)
☐ Determine ML team's model plans and integration point
☐ Define "Buffi" brand per agency vs. universal