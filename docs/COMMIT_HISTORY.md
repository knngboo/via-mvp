# VIA MVP — Commit History Summary

A chronological summary of the project's development history, derived from the git
log. All work to date landed on **2026-06-11**, with the final commits on
**2026-06-11** as well. Three contributors are involved: **HudsonIsOnline**,
**therocketter5**, and **adam-daoud**.

## Overview

The project is **VIA MVP**, a web application combining a React frontend with a
Node.js backend, focused on data feedback/visualization and VIA public-transit
data. Development progressed through four broad phases:

1. **Initial scaffold & Figma assets** — project bootstrap, design assets, and the
   core frontend.
2. **Plugin architecture** — a pluggable system with VIA as the first plugin.
3. **Backend + database** — MongoDB logic and import of VIA GTFS transit data.
4. **Dashboard & conversational features** — a VIA dashboard, Dockerization, and
   follow-up question support in the feedback experience.

---

## Timeline (oldest → newest)

### 1. `f9a383e` — Update *(HudsonIsOnline)*
**Initial project scaffold.** ~250 files, ~39k insertions. Establishes the React
frontend (`frontend/src` with `App.js`, components, contexts, pages, services) and
brings in the full design system:
- **Figma assets** — icon set, color swatches, typography, and exported design PNGs/ZIPs.
- **Core components** — `AppSidebar`, `ChartView`, `MapView`, `FeedbackBubble`,
  `SettingsModal`, plus a `hub/` flow (Upload, Clarification, Resolve, Submission
  context, Success pages).
- **Services** — `openai.js`, `csvParser.js`.
- **Fonts, logos, favicons, and a `tx_zips.geojson`** dataset.

### 2. `d35c961` — Update *(HudsonIsOnline)*
Minor: adds an entry to `.gitignore`.

### 3. `f181e6d` — Add files via upload *(adam-daoud)*
Adds a `via-mvp-main.zip` archive (binary upload).

### 4. `56686b9` — Update *(HudsonIsOnline)*
**Feedback flow refactor.** Reworks `FeedbackBubble.jsx`, slims down `CsvContext`
and `UploadPage` (removing ~213 lines of older logic), and expands `openai.js`
(+81 lines). Adds README documentation.

### 5. `ac9f47d` — Added Plugin support *(HudsonIsOnline)*
**Introduces the plugin architecture.** Adds a `Plugins/` directory with a registry
(`Plugins/index.js`), the first **VIA plugin** (`Plugins/Via` with Dashboard and
ParseLogic), and frontend wiring: `PluginDashboardPage`, sidebar entries,
`SettingsModal` hooks, and a `craco.config.js` build override.

### 6. `9615420` — Added plugin support, fixed readme *(HudsonIsOnline)*
Documentation follow-up to the plugin work; updates `README.md`.

### 7. `7df57d8` — New MongoDB Logic and VIA Public Transit Data Import *(therocketter5)*
**Largest commit by data volume** (~942k insertions, dominated by GTFS data files).
Stands up the backend and database layer:
- **Backend service** — `backend/server.js`, `agent.js`, `sources.js`,
  `import-gtfs.js`, with Docker and pnpm workspace config.
- **VIA GTFS data** — `backend/google_transit/` (stops, routes, trips, shapes,
  stop_times, transfers, calendar).
- **Frontend services** — `agent.js`, `api.js`, `sources.js` to talk to the new backend.
- **Infra** — `docker-compose.yml`, Dockerfiles, nginx config, `.env.example`, README.
- Note: also pulls in a nested `via-mvp-main/...` copy of the project.

### 8. `852e89b` — Merge branch 'main' *(therocketter5)*
Merge of upstream `main` from the GitHub remote.

### 9. `910235c` — Merge branch 'DBWIP' *(therocketter5)*
Merge of the database work-in-progress branch into the mainline.

### 10. `788eadb` — Created Dummy Via Dash + Dockerfile *(therocketter5)*
**VIA dashboard + containerization.** Fleshes out `Plugins/Via/Dashboard`
(`ViaDashboard.jsx`/`.css`), adds backend `stats.js` and a stats endpoint in
`server.js`, and improves the Docker setup (`.dockerignore`, `frontend/Dockerfile`,
`docker-compose.yml`).

### 11. `c2a5297` — Added followup support *(HudsonIsOnline)*
**Conversational follow-ups.** Adds a `FollowUpQuestions` component (+CSS),
extends `FeedbackBubble`, and grows `openai.js` (+75 lines) to support follow-up
question generation in the feedback experience.

### 12. `12c52e2` — Buffi is buffering *(HudsonIsOnline)*  *(current HEAD)*
One-line tweak to `FeedbackBubble.jsx` (loading/buffering state for the "Buffi"
agent).

---

## Contributor breakdown

| Contributor      | Commits | Focus |
|------------------|---------|-------|
| HudsonIsOnline   | 7       | Frontend, plugin system, feedback/follow-up UX |
| therocketter5    | 4       | Backend, MongoDB, GTFS import, Docker, merges |
| adam-daoud       | 1       | Asset upload |

## Notable artifacts in the tree
- **Plugin system** under `Plugins/`, with VIA as the reference plugin.
- **GTFS transit dataset** under `backend/google_transit/` (very large text files).
- **Design assets** under `Figma/`, `FigmaDesigns/`, `newFigmaDesigns/`.
- **Dockerized** frontend + backend via `docker-compose.yml`.
- A nested duplicate project tree (`via-mvp-main/via-mvp-main/via-mvp/`) introduced
  in `7df57d8` — likely a candidate for cleanup.
