# VIA MVP — Transit Data Platform

A secure, containerized full-stack application built for **Better Futures Institute (BFI)** to centralize, analyze, and explore VIA Metropolitan Transit data.

---

## Architecture

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | `localhost:5173` — All API calls proxied through Vite dev server |
| **Backend** | Node.js / Express | API gateway bound to `127.0.0.1:5001`. Cookie-authenticated. |
| **Database** | PostgreSQL 16 | Dockerized, bound to `127.0.0.1:5432`. Schemas: `public`, `bfi` |
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
- **Password** — minimum 8 characters
- **Admin Secret** — the value of `ADMIN_SECRET` from your `.env`

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
- Flag any AI response via the "Report" button — saves to the `feedback` DB table

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
- **HttpOnly session cookie** — JWT is never accessible to JavaScript. Immune to XSS token theft.
- All sensitive backend ports bound exclusively to `127.0.0.1`
- Cookie-based auth enforced on every authenticated API endpoint via `authenticateToken` middleware
- Admin secret required for new account registration (timing-safe comparison)
- Environment variables for all secrets — never hardcoded
- Explicit Content Security Policy via Helmet
- Rate limiting on all auth endpoints
- Tenant schema derived from JWT — all DB queries scoped to the user's tenant
- CSV column names sanitized before SQL interpolation
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
  > ⚠️ `-v` wipes all data including user accounts. You'll need to register again.
- The `bfi` PostgreSQL schema is the primary tenant schema. Each uploaded CSV becomes its own dynamically-generated table within it.
- Backend logs use **Pino** structured logging. In dev, logs are pretty-printed with colors. In prod (`NODE_ENV=production`), logs are JSON for shipping to a log aggregator.

---

## Running Tests

The backend includes an integration smoke test suite using Node's built-in test runner (no extra dependencies):

```bash
# Backend must be running first (docker compose up)
cd backend
ADMIN_SECRET=your-admin-secret npm test
```

Tests cover: registration guards, login + HttpOnly cookie, route protection, upload RBAC, feedback endpoint, and logout.

---

## Project Structure

```
via-mvp/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions: runs tests + build check on every push
├── backend/
│   ├── server.js               # Express app — auth, JWT middleware, chat routes, feedback
│   ├── sources.js              # CSV upload + PostgreSQL table creation + submission context
│   ├── import-gtfs.js          # GTFS static data pipeline (auto-runs on first boot)
│   ├── openai.js               # OpenAI SSE streaming + AI tool definitions
│   ├── stats.js                # GTFS stats API (stop/route/trip counts)
│   ├── tests/
│   │   └── smoke.test.js       # Integration smoke test suite
│   ├── db/
│   │   └── init.sql            # Database schema (users, feedback, bfi schema, GTFS tables)
│   ├── .env                    # 🔒 Secret config (gitignored)
│   └── .env.example            # Template for new developers
├── frontend/
│   ├── src/
│   │   ├── App.jsx                        # Route definitions + ProtectedRoute / AdminRoute
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── ChatPage.jsx               # AI chat interface
│   │   │   └── hub/
│   │   │       └── UploadPage.jsx         # Sources / data hub
│   │   ├── components/
│   │   │   ├── AppSidebar.jsx             # Global navigation sidebar (desktop)
│   │   │   ├── Sidebar.jsx                # Mobile sidebar
│   │   │   ├── FeedbackBubble.jsx         # AI chat + SSE streaming
│   │   │   ├── MapView.jsx                # Raw Leaflet map component
│   │   │   └── PluginDashboardPage.jsx    # Dashboard shell
│   │   ├── Plugins/
│   │   │   └── Via/                       # VIA-specific plugin (map + stats)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx            # Cookie-based auth state
│   │   │   └── CsvContext.jsx             # Shared CSV/upload state
│   │   └── services/
│   │       └── api.js                     # All backend API calls (credentials: include)
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
# Access the running postgres container
docker exec -it via-mvp-postgres-1 psql -U your-db-user -d via_mvp

# Update the user's role
UPDATE users SET user_role = 'admin' WHERE username = 'target_user';
```
*(The user must log out and log back in to receive an updated session.)*

### 3. Database Backups
To securely back up the PostgreSQL database (including all users, uploaded CSV sources, and GTFS data):

```bash
docker exec -t via-mvp-postgres-1 pg_dump -U your-db-user -d via_mvp > via_mvp_backup_$(date +%F).sql
```
To restore a backup:
```bash
cat via_mvp_backup_YYYY-MM-DD.sql | docker exec -i via-mvp-postgres-1 psql -U your-db-user -d via_mvp
```

---

## Known Limitations & Deferred Items

### 1. JWT Session Is Not Server-Side Revocable

**Impact:** If an admin is removed, their session cookie remains valid until it expires (24-hour TTL). Logging out clears the cookie client-side and the backend clears it via `POST /api/logout`, but the server holds no blocklist.

**Mitigation:** 24-hour TTL limits exposure. Cookie is `HttpOnly` + `SameSite=Strict` — cannot be read by JavaScript or sent cross-site.

**Future fix:** Add a `token_blocklist` table. On logout, insert the JWT `jti` claim. Check it in `authenticateToken`.

---

### 2. Conversation History Is Browser-Local Only

**Impact:** All AI chat history is stored in `localStorage`. Clearing browser data or switching devices loses all history.

**Scope:** By design for MVP. The `chat_messages` table in `init.sql` is scaffolded but not yet wired to any endpoint.

**Future fix:** Wire `POST /api/chat` to persist each exchange in `chat_messages` per authenticated user.

---

### 3. Concurrent CSV Upload Race Condition — FIXED

The `DROP TABLE IF EXISTS` → `CREATE TABLE` sequence in `sources.js` now acquires a PostgreSQL advisory lock keyed on the table name before any DDL:

```sql
SELECT pg_advisory_xact_lock(hashtext('bfi.' || $1))
```

This serialises concurrent uploads of the same filename. Lock releases automatically on commit or rollback.

---

### 4. TLS / HTTPS — Deferred to Deployment

The production Nginx config does not yet have TLS. Options:
- **Certbot companion container** in `docker-compose.prod.yml`
- **Cloud load balancer TLS termination** (AWS ALB, Cloudflare)

This must be resolved before any public-facing deployment.

---

*Last reviewed: 2026-06-14. Maintained by Better Futures Institute engineering team.*
