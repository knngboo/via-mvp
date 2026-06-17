# BFI Transit Analytics Platform

A secure, containerized full-stack application built for **Better Futures Institute (BFI)** to centralize, analyze, and explore VIA Metropolitan Transit data using natural language AI queries — inside a dynamic, tiling workspace.

---

## Architecture

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | `localhost:5173` — All API calls proxied through Vite dev server |
| **Backend** | Python / Flask (gunicorn) | API gateway bound to `127.0.0.1:5001`. Cookie-authenticated. |
| **Database** | PostgreSQL 16 | Dockerized, bound to `127.0.0.1:5432`. Schemas: `public` (GTFS), `bfi` (uploads + meta) |
| **AI** | OpenAI GPT-4o / GPT-4o-mini | Text-to-SQL with full schema context + tool calling (map, chart, heatmap, live buses, ridership forecast) |
| **Orchestration** | Docker Compose | Single-command startup for all three services |

---

## Getting Started

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No other local dependencies required — everything runs inside containers

### 2. Environment Configuration

```bash
cp backend/.env.example backend/.env
```

The `.env.example` file contains working dev defaults. The file is **gitignored** and must never be committed.

> For production, replace `JWT_SECRET`, `ADMIN_SECRET`, and `OPENAI_API_KEY` with strong, unique values.

### 3. Launch the Platform

From the `via-mvp/` root directory:

```bash
docker compose up --build
```

### 4. Register Your First Account

Navigate to `http://localhost:5173/register`:
- **Username** — your email or chosen username
- **Password** — minimum 8 characters
- **Admin Secret** — `dev_admin_secret_change_me` (default from `.env.example`)

Then log in at `http://localhost:5173/login`.

> Session is restored automatically on page refresh within the 24-hour window.

---

## Application Routes

| URL | Page | Access | Description |
|-----|------|--------|-------------|
| `/login` | Login | Public | Authenticate with username + password |
| `/register` | Register | Public | Create a new account (requires admin secret) |
| `/workspace` | **Tiling Workspace** | All users | Multi-pane tiling interface — the primary application |
| `/admin` | Admin Panel | Admin only | Manage users and assign roles |

> The tiling workspace replaces the old separate `/dashboard`, `/chat`, and `/sources` pages. All views (Map, Chart, Dashboard, Sources/Upload, Chat) are now tiles inside the workspace.

---

## Key Features

### 🪟 Tiling Workspace (`/workspace`)

The primary UI — an infinitely divisible canvas of panes, each independently showing any view:

- **Views per pane:** Map · Chart · Dashboard · Upload · Chat (Buffi)
- **Split horizontally or vertically** using header buttons (⊟ / ⊠) — creates a sibling pane
- **Duplicate pane** (⧉ button) — deep-clones the current pane (data, filters, view type) side-by-side for easy comparison
- **Drag to swap** — grab the dot-grid handle and drag to swap two panes
- **Drag to resize** — grab the divider between two panes to resize freely
- **Collapsible sidebar** — each pane has its own sidebar that collapses to icon-only mode with a smooth slide, controlled by an edge tab
- **Close pane** — remove any pane (minimum one pane enforced)
- All pane state (map points, chart data, conversation, sidebar state) persists when switching views

### 🤖 Buffi — AI Tile Editor

Buffi is the AI assistant embedded in every Map and Chart tile as a floating bubble:

- **Tile-aware context** — when you send a message from the bubble, Buffi automatically receives a description of the current tile (title, data count, chart type, active heatmap) as hidden context, so it can intelligently modify what's on screen
- **Tile-specific suggestions** — Map bubbles show map editing prompts ("Filter stops within 2 miles of downtown"), Chart bubbles show chart editing prompts ("Change to pie chart")
- **Dynamic placeholder** — input changes to "Modify this map..." or "Modify this chart..." to signal tile-editor mode
- **Bubble header** shows "✦ buffi — map editor" or "✦ buffi — chart editor"
- **Full chat view** — Chat tile shows the full Buffi exploration experience with general suggested questions

### 🗺️ Map View

- Interactive San Antonio map powered by Leaflet
- Buffi plots data points from any SQL query returning lat/lon
- **Census ACS heatmap** — color ZIP codes by population, median income, poverty rate, home values, etc.
- **Live buses** — real-time VIA vehicle positions from the GTFS-RT feed (auto-refreshing)
- **Service alerts** — current detours and disruptions surfaced by Buffi

### 📊 Chart View

- Bar, pie, and radar charts powered by Recharts
- Buffi generates charts from any SQL query returning a label + numeric column
- Chart type persists when switching other views; "Restore" button in chat history brings back any previous chart

### 📁 Upload (Sources) View

- Drag-and-drop CSV upload (50 MB max)
- **Categorized data sources** — built-in GTFS data, public datasets, and private uploads displayed in separate sections
- **AI Summary** (Buffi ✦) — one-click AI summary of any dataset (requires API key)
- **Preview mode** — click any dataset row to preview columns and a row sample inline
- Submission context form: data domain, project name, description, coverage dates
- `shared` visibility for admin uploads; `private` for editor uploads

### 💬 Chat View (Full Buffi)

- Natural language queries translated to PostgreSQL SELECT by the AI
- AI receives full schema context (GTFS tables + uploaded datasets with column names and row counts)
- Tool-calling loop: `run_query`, `list_data_sources`, `make_chart`, `plot_on_map`, `show_live_buses`, `show_heatmap`, `get_service_alerts`, `get_trip_updates`, `predict_route_ridership`
- Real-time SSE streaming with Stop button
- **Conversation management** — new chat, load history, star favorites, delete individual or clear all
- **Follow-up questions** — auto-generated suggested follow-ups after each response
- Per-user history persists in `localStorage` (namespaced by username)

### 🔍 Buffi Intelligence Upgrades

- **Sources in context** — `build_schema_context` now includes the `sources_meta` catalogue so Buffi always knows your uploaded file names, table names, row counts, and columns
- **`list_data_sources` tool** — Buffi can explicitly enumerate all available data (uploaded CSVs + GTFS tables) when asked
- **San Antonio ZIP centroids** — 40+ ZIP → lat/lon mappings embedded in the system prompt so "find stops near 78205" generates a correct haversine query automatically
- **Haversine example** — a ready-made distance query in the system prompt to reduce hallucination on geographic queries

### 🔐 Role-Based Access Control

Four roles enforced on both frontend (route guards) and backend (decorators):

| Role | Workspace | Upload | Admin Panel | Delete Others' Sources |
|------|-----------|--------|-------------|------------------------|
| **admin** | ✅ | ✅ | ✅ | ✅ |
| **editor** | ✅ | ✅ | ❌ | ❌ (own only) |
| **analyzer** | ✅ | ❌ | ❌ | ❌ |
| **viewer** | ✅ | ❌ | ❌ | ❌ |

### 🔒 Security

- **HttpOnly session cookie** — JWT never accessible to JavaScript. Immune to XSS token theft.
- All sensitive backend ports bound exclusively to `127.0.0.1`
- Cookie-based auth enforced on every authenticated API endpoint
- Admin secret required for new account registration (timing-safe `hmac.compare_digest`)
- Environment variables for all secrets — never hardcoded
- **Explicit Content Security Policy** + Helmet parity headers
- Rate limiting: 20 req/15min on auth, 30 req/min on chat
- **Tenant schema derived from JWT** — all DB queries scoped to the authenticated user's tenant
- **CSV column names sanitized** before SQL interpolation — strips all non-safe characters
- Message length capped (4,000 chars), chat history limited to last 20 exchanges per request
- SQL guard — `is_safe_select()` blocks all non-SELECT statements and `information_schema` access

---

## Data Setup

The platform auto-loads the VIA GTFS dataset on first login (background thread, idempotent). Uploaded CSVs appear in the Sources view immediately after upload.

To get started:
1. Log in — GTFS data loads automatically in the background
2. Go to **Workspace → Upload** tab to upload your own CSV data
3. Switch to **Map** or **Chart** tab and ask Buffi to visualize it

---

## Development Notes

- **Hot reload** is active for the frontend — Vite HMR applies most changes without restart
- **Backend** auto-reloads on `.py` file saves (Flask dev server reloader)
- Full DB reset:
  ```bash
  docker compose down -v
  docker compose up --build
  ```
  > ⚠️ `-v` wipes all data including user accounts and uploaded CSVs.
- `bfi` PostgreSQL schema is the primary tenant schema. Each CSV becomes its own dynamically-generated table.
- Backend logs: set `LOG_LEVEL=DEBUG` in `backend/.env` for verbose output.

---

## Running Tests

```bash
# Backend must be running first (docker compose up)
ADMIN_SECRET=dev_admin_secret_change_me python -m pytest backend/tests/test_smoke.py -v
```

Tests cover: registration guards, login + HttpOnly cookie, route protection, upload RBAC, feedback, logout, and the full 4-role RBAC system.

---

## Project Structure

```
via-mvp/
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions CI
├── backend/                          # Python / Flask
│   ├── app.py                        # Auth, JWT, chat SSE, feedback, admin API
│   ├── sources.py                    # CSV upload + PostgreSQL table creation + RBAC
│   ├── openai_client.py              # OpenAI tool-calling agent + schema context builder
│   │                                 #   • build_schema_context (includes sources_meta)
│   │                                 #   • list_data_sources tool
│   │                                 #   • SA ZIP centroid table in system prompt
│   │                                 #   • run_query, make_chart, plot_on_map, show_heatmap
│   │                                 #   • show_live_buses, get_trip_updates, get_service_alerts
│   │                                 #   • predict_route_ridership (linear regression)
│   ├── census.py                     # US Census ACS ZIP heatmap data
│   ├── realtime.py                   # VIA GTFS-RT vehicle positions + service alerts
│   ├── stats.py                      # DB stats API (empty-state safe)
│   ├── import_gtfs.py                # GTFS bulk loader (runs on first login)
│   ├── db.py                         # PostgreSQL connection pool + query helpers
│   ├── requirements.txt
│   ├── tests/
│   │   └── test_smoke.py             # Integration smoke test suite
│   ├── db/
│   │   └── init.sql                  # DB schema (users, feedback, bfi schema, sources_meta)
│   ├── .env                          # 🔒 Secret config (gitignored)
│   └── .env.example                  # Template for new developers
├── frontend/
│   └── src/
│       ├── App.jsx                   # Route definitions + role guards
│       ├── pages/
│       │   ├── WorkspacePage.jsx     # 🏠 Main tiling workspace (hub of the UI)
│       │   │                         #   • Multi-pane layout tree (split/pane nodes)
│       │   │                         #   • splitPane, duplicatePane, closePane
│       │   │                         #   • Drag-to-swap, drag-to-resize
│       │   │                         #   • Per-pane state (map data, chart, chat history)
│       │   │                         #   • Floating Buffi tile editor bubble
│       │   │                         #   • Collapsible sidebar with edge tab
│       │   ├── Login.jsx
│       │   ├── Register.jsx
│       │   └── AdminPage.jsx
│       ├── components/
│       │   ├── FeedbackBubble.jsx    # AI chat component (full chat + tile editor mode)
│       │   │                         #   • tileMode / tileView / tileContext props
│       │   │                         #   • Context-prefixed API calls in tile mode
│       │   │                         #   • View-specific suggestion sets
│       │   ├── CanvasSources.jsx     # Upload view inside workspace tile
│       │   │                         #   • Categorized source sections (GTFS, public, private)
│       │   │                         #   • Dataset preview + AI summary (Buffi ✦)
│       │   ├── CanvasDashboard.jsx   # Dashboard tile
│       │   ├── MapView.jsx           # Leaflet map (points, heatmap, live buses)
│       │   ├── ChartView.jsx         # Recharts bar/pie/radar
│       │   ├── FollowUpQuestions.jsx # Auto-generated follow-up suggestions
│       │   ├── AppSidebar.jsx        # Navigation sidebar (collapsible)
│       │   ├── SettingsModal.jsx     # Model selection + API key
│       │   ├── RoleGuard.jsx         # Role-based render guard
│       │   └── AdminPanel.jsx        # User management
│       └── styles/
│           ├── Workspace.css         # Tiling workspace layout + bubble + tile editor
│           └── ...
├── docker-compose.yml                # Development compose
├── docker-compose.prod.yml           # Production compose
└── docs/
    ├── README.md                     # This file
    ├── COMMIT_HISTORY.md             # Chronological development log
    ├── strategy.md                   # Product strategy and roadmap
    └── audit.md                      # Security audit
```

---

## Operations & Deployment Guide

### 1. Production Deployment

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The application will be available on port `80`.

### 2. Role Management

Go to `http://localhost:5173/admin` (admin panel UI) to promote or demote users with a dropdown. Changes take effect on the user's next login.

### 3. Database Backups

```bash
# Backup
docker exec -t via-mvp-postgres-1 pg_dump -U your-db-user -d via_mvp > via_mvp_backup_$(date +%F).sql

# Restore
cat via_mvp_backup_YYYY-MM-DD.sql | docker exec -i via-mvp-postgres-1 psql -U your-db-user -d via_mvp
```

---

## Known Limitations & Deferred Items

### 1. JWT Session Not Server-Side Revocable

**Impact:** Compromised sessions remain valid until 24h TTY.

**Mitigation:** HttpOnly + SameSite=Strict cookie. Cannot be read by JavaScript or sent cross-site.

**Future fix:** Add a `token_blocklist` table; check on every `authenticateToken` call.

---

### 2. Conversation History Is Browser-Local

Chat history is stored in `localStorage`, namespaced per user. The backend endpoints `GET/POST /api/chat/messages` exist and are wired to the `chat_messages` DB table but the full round-trip persistence is not yet complete.

**Next step:** Complete the frontend fire-and-forget save in `FeedbackBubble.jsx` and restore-on-mount flow.

---

### 3. Rate Limiter Resets on Restart

In-memory flask-limiter loses counters on restart.

**Future fix:** Switch to Redis-backed limiter.

---

### 4. TLS / HTTPS — Deferred to Deployment

Production Nginx config does not yet have TLS. Options: Certbot companion container or cloud load balancer TLS termination (AWS ALB, Cloudflare Tunnel).

---

### 5. No Automated DB Backup

`docker compose down -v` permanently deletes all data. Manual `pg_dump` is the only current mechanism.

**Future:** Automated nightly `pg_dump` + offsite storage, Sentry error monitoring.

---

*Last reviewed: 2026-06-17. Maintained by Better Futures Institute engineering team.*
