# VIA MVP — Transit Data Platform

A secure, containerized full-stack application built for **Better Futures Institute (BFI)** to centralize, analyze, and explore VIA Metropolitan Transit data. This branch (`bfi-superman`) is the **unified production-ready architecture**, combining all legacy features into a single, hardened, and performant application.

---

## Architecture

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | `localhost:5173` — All API calls proxied securely through Vite |
| **Backend** | Node.js / Express | API gateway bound to `127.0.0.1:5001`. JWT-secured. |
| **Database** | PostgreSQL 16 | Dockerized, bound to `127.0.0.1:5432`. Schemas: `public`, `bfi`, `tenant` |
| **Orchestration** | Docker Compose | Single-command startup for all three services |

---

## Getting Started

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No other local dependencies required — everything runs inside containers

### 2. Environment Configuration

Create the file `backend/.env` before your first launch. This file is **gitignored** — never commit it.

```env
# OpenAI (required for AI chat features)
OPENAI_API_KEY=sk-proj-your-openai-key-here

# Admin registration secret — users need this to create accounts
ADMIN_SECRET=MySuperSecretKey99!

# JWT signing secret — change this to a long random string in production
JWT_SECRET=your-secure-jwt-secret

# PostgreSQL connection (matches docker-compose.yml and docker-compose.prod.yml)
POSTGRES_HOST=postgres
POSTGRES_USER=your-db-user
POSTGRES_PASSWORD=your-db-password
POSTGRES_DB=via_mvp
```

> See `backend/.env.example` for a blank template.

### 3. Launch the Platform

From the `via-mvp/` root directory:

```bash
docker compose up --build
```

All three services start automatically. The backend waits for Postgres to be healthy before booting.

### 4. Register Your First Account

Navigate to `http://localhost:5173/register` and fill in:
- **Username** — your chosen username
- **Password** — a secure password
- **Admin Secret** — the value of `ADMIN_SECRET` from your `.env` (e.g. `MySuperSecretKey99!`)

Then log in at `http://localhost:5173/login`.

---

## Application Routes

| URL | Page | Description |
|-----|------|-------------|
| `/login` | Login | Authenticate with username + password |
| `/register` | Register | Create a new account (requires admin secret) |
| `/chat` | AI Chat | Natural language interface to the GTFS transit database |
| `/dashboard` | VIA Dashboard | Interactive San Antonio transit map + live DB stats |
| `/sources` | My Sources | Upload CSVs, browse all ingested data, manage sources |
| `/queue` | → redirects to `/sources` | Legacy alias |
| `/upload` | → redirects to `/sources` | Legacy alias |

---

## Key Features

### 🤖 AI Agent Chat (`/chat`)
- Natural language queries over the live PostgreSQL GTFS dataset
- **`find_nearby_stops`** — Haversine SQL spatial search (lat/lon → closest bus stops)
- **`get_stop_departures`** — Relational query (stop ID → scheduled departure times)
- Real-time SSE streaming with live interruption ("Stop" button)
- Conversation history with save, rename, favorite, and delete

### 🗺️ VIA Dashboard (`/dashboard`)
- Full-page interactive San Antonio ZIP code map (raw Leaflet — no React wrapper)
- Live GTFS stats in the header: Datasets, Routes, Stops, Trips
- Choropleth district view + circle marker view

### 📁 My Sources (`/sources`)
- Drag-and-drop CSV upload (or click the button in the top bar)
- After upload: Submission Context Modal to assign a data domain and project name
- Live file table synced from PostgreSQL — persists across sessions and restarts
- Filter by folder, sort by name

### 🔐 Security
- All sensitive backend ports bound exclusively to `127.0.0.1`
- JWT middleware enforced on every authenticated API endpoint
- Admin secret required for new account registration
- Environment variables for all secrets — never hardcoded
- Vite proxy used for all frontend API calls (no CORS, no exposed ports)

---

## Data Initialization

The backend automatically handles data setup on startup:

1. **GTFS Pipeline** — On first boot, parses and inserts all static GTFS transit files:
   - `stops.txt` → 6,097 VIA bus stops
   - `routes.txt` → 89 routes
   - `trips.txt` → 14,589 trips
   - `stop_times.txt` → 690,475 stop-time records
   
   On subsequent boots, if data already exists, the import is skipped automatically.

2. **Sources Metadata Table** — `bfi.sources_meta` is created on boot to track all uploaded CSVs.

---

## Development Notes

- **Hot reload** is active in development — Vite HMR means most frontend changes apply without restarting Docker
- **Backend restarts** are handled by `nodemon` — saving any backend `.js` file auto-restarts the Node server
- To fully reset the database and start fresh:
  ```bash
  docker compose down -v
  docker compose up --build
  ```
- The `bfi` PostgreSQL schema is the primary tenant schema. Each uploaded CSV becomes its own dynamically-generated table within it.

---

## Project Structure

```
via-mvp/
├── backend/
│   ├── server.js          # Express app entry point — auth, login, JWT middleware, chat routes
│   ├── sources.js         # CSV upload + PostgreSQL table creation + submission context
│   ├── import-gtfs.js     # GTFS static data pipeline (auto-runs on first boot)
│   ├── openai.js          # OpenAI SSE streaming + AI tool definitions
│   ├── stats.js           # GTFS stats API (stop/route/trip counts)
│   ├── .env               # 🔒 Secret config (gitignored)
│   └── .env.example       # Template for new developers
├── frontend/
│   ├── src/
│   │   ├── App.jsx                        # Route definitions
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── ChatPage.jsx               # AI chat interface
│   │   │   └── hub/
│   │   │       └── UploadPage.jsx         # Sources / data hub
│   │   ├── components/
│   │   │   ├── AppSidebar.jsx             # Global navigation sidebar
│   │   │   ├── AppLayout.jsx              # Sidebar + main content wrapper
│   │   │   ├── MapView.jsx                # Raw Leaflet map component
│   │   │   └── PluginDashboardPage.jsx    # Dashboard shell
│   │   ├── Plugins/
│   │   │   └── Via/                       # VIA-specific plugin (map + stats)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx            # JWT auth state
│   │   │   └── CsvContext.jsx             # Shared CSV/upload state
│   │   └── services/
│   │       └── api.js                     # All backend API calls
│   └── vite.config.js                     # Vite + proxy config
├── docker-compose.yml                     # Development compose file
├── docker-compose.prod.yml                # Production compose file
└── README.md
```

---

## Operations & Deployment Guide (VIA IT Team)

### 1. Production Deployment

The development environment (`docker-compose.yml`) uses Nodemon for hot reload and the Vite dev server. **Do not use this in production.** Use the production compose file instead, which:
- Builds the frontend with Vite and serves it via Nginx (`frontend/Dockerfile.prod`)
- Runs the backend with `node server.js` — no Nodemon (`backend/Dockerfile`)
- Does **not** expose Postgres or the backend port to the host machine
- Enables gzip compression and SSE streaming headers for the AI chat endpoint

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The application will be available on port `80`.

> **First deployment?** Run `docker compose -f docker-compose.prod.yml up --build` (without `-d`) the first time so you can watch the GTFS import logs. The initial boot imports ~700k stop-time records — this takes 30–60 seconds. Subsequent starts are instant.

### 2. Role-Based Access Control (RBAC) Management
By default, newly registered users are given the `viewer` role, which hides the administrative "Sources" tab. 

To grant a user access to the "Sources" data upload pipeline, a database administrator must manually elevate their role to `admin` via PostgreSQL:

```bash
# Access the running postgres container (replace your-db-user with your POSTGRES_USER)
docker exec -it via-mvp-postgres-1 psql -U your-db-user -d via_mvp

# Update the user's role
UPDATE users SET user_role = 'admin' WHERE username = 'target_user';
```
*(The user must log out and log back in to receive their new JWT token).*

### 3. Database Backups
To securely back up the PostgreSQL database (including all users, uploaded CSV sources, and GTFS data):

```bash
# Replace your-db-user with your POSTGRES_USER
docker exec -t via-mvp-postgres-1 pg_dump -U your-db-user -d via_mvp > via_mvp_backup_$(date +%F).sql
```
To restore a backup:
```bash
cat via_mvp_backup_YYYY-MM-DD.sql | docker exec -i via-mvp-postgres-1 psql -U your-db-user -d via_mvp
```

---

## Known Limitations & Security Notices

This section documents deliberate MVP trade-offs and known architectural gaps. Each item is tracked for a future sprint. None of these are blocking issues for the internal VIA deployment, but all should be reviewed before any public-facing rollout.

---

### 1. JWT Tokens Are Not Revocable After Logout

**Impact:** If a user's session token is stolen or if an admin is removed, their existing JWT remains valid until it expires (24-hour TTL). Logging out only removes the token from `localStorage` client-side — the server has no blocklist.

**Current Mitigation:** The 24-hour TTL limits the exposure window. The token is never exposed in URLs or cookies — it is stored in `localStorage` and sent as a `Bearer` header only.

**Recommended Fix (Phase 12):** Implement a server-side token revocation table (`token_blocklist`) in PostgreSQL. On logout, insert the `jti` (JWT ID) claim. Add a middleware check against this table on every authenticated request. Alternatively, shorten the TTL to 1 hour and implement a sliding refresh token mechanism.

---

### 2. Conversation History Is Browser-Local Only

**Impact:** All AI chat conversation history is stored exclusively in `localStorage`. Clearing browser data, switching browsers, or using a different device results in total loss of all conversation history. There is no server-side persistence for chat messages.

**Scope:** This is by design for the MVP. The `chat_messages` table in `init.sql` is scaffolded but not yet wired to any backend endpoint.

**Recommended Fix (Phase 12):** Wire `POST /api/chat` to persist each message exchange in `chat_messages` with the authenticated user's ID. Add `GET /api/chat/history` to restore conversations on login. Remove `localStorage` fallback once server sync is live.

---

### 3. Concurrent CSV Upload Race Condition

**Impact:** If two admin users upload a CSV with the **same filename** at the exact same moment, the `DROP TABLE IF EXISTS` → `CREATE TABLE` sequence could interleave.

**Status: FIXED.** `sources.js` now acquires a PostgreSQL transaction-level advisory lock keyed on the table name before any `DROP / CREATE` sequence:

```sql
SELECT pg_advisory_xact_lock(hashtext('bfi.' || $1))
```

This serialises concurrent uploads of the same filename. The lock is automatically released on `COMMIT` or `ROLLBACK`.

---

### 4. Multi-Tenancy Is Scaffolded But Inactive

**Impact:** The `users` table has a `tenant_schema` column and a `via_transit` schema exists in the database, but neither is actively used. All application logic — queries, CSV uploads, GTFS data — is hardcoded to the `'bfi'` schema in `openai.js` and `sources.js`. The `tenant_schema` column is always ignored.

**Scope:** This is correct and intentional for the VIA MVP. The platform is a **single-tenant internal tool** for VIA staff only. The multi-tenant scaffolding is preserved for potential future expansion to other public/private agencies.

**Recommended Fix (if expanding):** Replace the hardcoded `'bfi'` schema references in `openai.js` (`pool.query('SET search_path TO bfi')`) and `sources.js` with a value derived from `req.user.tenant_schema` (already decoded from the JWT at login time).

---

*Last reviewed: 2026-06-13. Maintained by Better Futures Institute engineering team.*
