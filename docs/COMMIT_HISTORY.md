# VIA MVP — Commit History Summary

A chronological summary of the project's development history. Three original contributors (**HudsonIsOnline**, **therocketter5**, **adam-daoud**) bootstrapped the platform; ongoing development is maintained by the BFI engineering team.

---

## Phase 1 — Original Bootstrap (2026-06-11)

### `f9a383e` — Update *(HudsonIsOnline)*
**Initial project scaffold.** ~250 files, ~39k insertions. React frontend, design system (Figma assets, icon set, color swatches), core components (`AppSidebar`, `ChartView`, `MapView`, `FeedbackBubble`, `SettingsModal`), and services (`openai.js`, `csvParser.js`).

### `d35c961` — Update *(HudsonIsOnline)*
Minor: adds an entry to `.gitignore`.

### `f181e6d` — Add files via upload *(adam-daoud)*
Adds a `via-mvp-main.zip` archive (binary upload).

### `56686b9` — Update *(HudsonIsOnline)*
**Feedback flow refactor.** Reworks `FeedbackBubble.jsx`, slims down `CsvContext` and `UploadPage`, and expands `openai.js`. Adds README documentation.

### `ac9f47d` — Added Plugin support *(HudsonIsOnline)*
**Plugin architecture.** Adds `Plugins/` directory with registry (`Plugins/index.js`), first **VIA plugin** (Dashboard + ParseLogic), `PluginDashboardPage`, sidebar entries, `SettingsModal` hooks, `craco.config.js`.

### `9615420` — Added plugin support, fixed readme *(HudsonIsOnline)*
Documentation follow-up to the plugin work.

### `7df57d8` — New MongoDB Logic and VIA Public Transit Data Import *(therocketter5)*
**Largest commit.** Stands up the backend: `backend/server.js`, `agent.js`, `sources.js`, `import-gtfs.js`, Docker + pnpm workspace, full VIA GTFS data files, frontend services (`agent.js`, `api.js`, `sources.js`), `docker-compose.yml`.

### `852e89b` — Merge branch 'main' *(therocketter5)*
### `910235c` — Merge branch 'DBWIP' *(therocketter5)*

### `788eadb` — Created Dummy Via Dash + Dockerfile *(therocketter5)*
**VIA dashboard + containerization.** `ViaDashboard.jsx`/`.css`, backend `stats.js`, improved Docker setup.

### `c2a5297` — Added followup support *(HudsonIsOnline)*
**Conversational follow-ups.** Adds `FollowUpQuestions` component + CSS, extends `FeedbackBubble`, grows `openai.js` to support follow-up question generation.

### `12c52e2` — Buffi is buffering *(HudsonIsOnline)*
One-line tweak to `FeedbackBubble.jsx` (loading/buffering state for the "Buffi" agent).

---

## Phase 2 — Platform Rewrite (2026-06-15 → 2026-06-16)

> Complete architectural overhaul: Python/Flask backend replacing Node/Express, PostgreSQL replacing MongoDB, full security hardening, tiling workspace replacing single-page chat.

### Backend rewrite
- **Flask + PostgreSQL** replacing the original Node.js + MongoDB stack
- `app.py` — JWT auth, HttpOnly cookie, RBAC decorators (admin/editor/analyzer/viewer), chat SSE streaming, rate limiting, CSP headers
- `openai_client.py` — Full tool-calling agent with `run_query`, `make_chart`, `plot_on_map`, `show_live_buses`, `show_heatmap`, `get_service_alerts`, `get_trip_updates`, `predict_route_ridership`
- `sources.py` — CSV upload, `bfi.sources_meta` table, tenant schema isolation, visibility RBAC
- `census.py` — US Census ACS ZIP code heatmap data for San Antonio
- `realtime.py` — GTFS-RT vehicle positions + service alerts
- `import_gtfs.py` — Idempotent GTFS loader (runs on first login, background thread)
- `db.py` — PostgreSQL connection pool + helpers
- `tests/test_smoke.py` — Integration smoke test suite (registration, auth, RBAC, upload, feedback)
- Security: timing-safe admin secret, SQL injection guard (`is_safe_select`), column sanitization, rate limiters

### Frontend architecture
- **WorkspacePage** introduced — multi-pane tiling interface with split/close/drag-swap/drag-resize
- **MapView** — Leaflet with point plotting, census heatmap, live buses
- **ChartView** — Recharts bar/pie/radar with chart type persistence
- **AppSidebar** — collapsible navigation sidebar
- **SettingsModal** — model selector (GPT-4o / GPT-4o-mini) + API key input
- **CanvasDashboard** — stats tile (routes, stops, trips, datasets)
- **CanvasSources** — data source browser with preview

### UX session highlights
- Sidebar collapse → icon-only mode with smooth CSS transition
- Sidebar collapse controlled by edge tab (not full button)
- Split/Close/Duplicate buttons moved to pane header drag bar
- Pane title shows the active view name
- Drop-target highlight when dragging panes

---

## Phase 3 — Buffi Tile Editor & Workspace Polish (2026-06-17)

> This session transforms Buffi from a standalone chatbot into a live tile editor and completes the workspace UX.

### Backend: Buffi Intelligence Upgrades

**`openai_client.py`**
- `build_schema_context` now queries `sources_meta` and appends an **UPLOADED DATASETS** block to the system prompt — Buffi always knows your uploaded file names, table names, row counts, and column lists
- New **`list_data_sources` tool** — Buffi can explicitly enumerate all available data (uploads + GTFS tables) when the user asks what's available
- **San Antonio ZIP centroid table** embedded in the system prompt (40+ ZIP → lat/lon pairs) so haversine queries for "find stops near 78205" generate correct SQL automatically
- **Haversine example query** included in the prompt to reduce geographic query hallucinations
- System prompt updated: `list_data_sources` rule, ZIP usage instructions, "never say no data without trying a query" reinforcement

### Frontend: Tiling Workspace

**`WorkspacePage.jsx`**
- **`duplicatePane` useCallback** — deep-clones the current pane state (map points, chart data, active view, sidebar state, chat history) via JSON round-trip and opens it side-by-side at 50/50 in the same view. Bubble starts closed; conv ref is cleared.
- **Duplicate button** (⧉ copy icon) added to every pane header between Split-V and the view title
- **`tileContext` computed per pane** in `renderTree` — describes the current tile state:
  - Map: `"User is viewing a MAP tile titled 'Transit Stops' showing 42 geographic points."`
  - Chart: `"User is viewing a CHART tile titled 'Ridership by Route' (bar chart, 15 data points)."`
- `tileContext`, `tileMode`, `tileView` wired from WorkspacePane → floating bubble → FeedbackBubble

**`FeedbackBubble.jsx`**
- Accepts `tileMode`, `tileView`, `tileContext` props
- When `tileMode=true`:
  - **Context injection** — API message is prefixed with `[VIEW CONTEXT: ...]` before sending; chat history stores only the clean user text
  - **Tile-specific suggestions** — Map shows ["Filter stops within 2 miles of downtown", "Show live buses", "Overlay income heatmap", "Map stops for route 100"]; Chart shows ["Change to pie chart", "Show top 10", "Sort by value", "Chart ridership by route"]
  - **View-specific placeholder** — "Modify this map..." / "Modify this chart..."
  - **Tile editor badge** in landing state — shows 🗺️ "Map Editor" or 📊 "Chart Editor" with subtitle label
- `ChatInput` accepts dynamic `placeholder` prop

**Bubble header redesign**
- Header now shows `✦ buffi` + a small pill badge: `[map editor]` or `[chart editor]`
- `ws-bubble-title-group`, `ws-bubble-subtitle`, `tile-editor-badge`, `tile-editor-icon` CSS classes added

**`Workspace.css`**
- `.ws-bubble-title-group` — flex container for title + subtitle pill
- `.ws-bubble-subtitle` — uppercase pill badge (10px, grey background)
- `.tile-editor-badge` — landing state badge with BFI brand color tint
- `.tile-editor-icon` — emoji icon sizing in landing badge

### Chat Duplication Fixes (from prior session)
- `newChat` and `loadConv` accept `curState` from render tree to bypass React Strict Mode double-invoke
- `setSavedConvs` called at top-level event handler (not nested inside `setPaneStates` updater)
- `uid()` uses `Date.now() + Math.random()` to prevent key collisions across hot-reloads

---

## Pending / Roadmap

- [ ] Complete conversation history persistence to `chat_messages` DB table
- [ ] JWT token blocklist (server-side revocation on logout)
- [ ] CI/CD: update `ci.yml` from legacy npm to `pip`/`pytest`
- [ ] AWS EC2 deployment walkthrough
- [ ] TLS/HTTPS for production Nginx
- [ ] Automated nightly `pg_dump`
- [ ] Map filter bar — "Active filters" strip showing what Buffi last applied (Buffi tile editor Phase 2)
- [ ] Intent pills above chat input (🗺️ Map it / 📊 Chart it / 📋 Table / 💬 Ask)
- [ ] Context card (dataset selector) persisted above chat input for Buffi dataset focus
