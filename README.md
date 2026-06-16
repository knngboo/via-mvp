# VIA MVP — Transit Data Platform

A secure, containerized full-stack application built for **Better Futures Institute (BFI)** to centralize, analyze, and explore VIA Metropolitan Transit data using natural language AI queries.

---

## Architecture

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | `localhost:5173` — All API calls proxied through Vite dev server |
| **Backend** | Python 3.12 / Flask | API gateway bound to `127.0.0.1:5001`. Cookie-authenticated. |
| **Database** | PostgreSQL 16 | Dockerized, bound to `127.0.0.1:5432`. Schemas: `public`, `bfi` |
| **AI** | OpenAI GPT-4o / GPT-4o-mini | Text-to-SQL: AI receives schema context and writes its own queries |
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

# PostgreSQL connection (matches docker-compose.yml)
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
- **Username** — your email or chosen username
- **Password** — minimum 8 characters
- **Admin Secret** — the value of `ADMIN_SECRET` from your `.env`

Then log in at `http://localhost:5173/login`.

> Session is restored automatically on page refresh — no need to log in again within the 24-hour window.

---

## Application Routes

| URL | Page | Access | Description |
|-----|------|--------|-------------|
| `/login` | Login | Public | Authenticate with username + password |
| `/register` | Register | Public | Create a new account (requires admin secret) |
| `/dashboard` | VIA Dashboard | All users | Interactive San Antonio transit map + live DB stats |
| `/chat` | AI Chat | Analyzer, Editor, Admin | Natural language interface to the transit database |
| `/sources` | Data Hub | Editor, Admin | Upload CSVs, browse ingested data, manage sources |
| `/admin` | Admin Panel | Admin only | Manage users and assign roles |

---

## Key Features

### 🤖 AI Agent Chat (`/chat`)
- Natural language queries translated to SQL by the AI — no hardcoded question types
- AI receives the full database schema as context and writes its own `SELECT` queries
- Supports any question the uploaded data can answer: routes, stops, ridership, schedules
- Real-time SSE streaming with live interruption ("Stop" button)
- **Per-user conversation history** — each account has isolated, private chat history that persists across sessions and page refreshes (namespaced in `localStorage` by username)
- Conversation management: save, switch, rename, favorite, delete
- Flag any AI response via the "Report" button — persisted to the `feedback` DB table

### 🗺️ VIA Dashboard (`/dashboard`)
- Full-page interactive San Antonio ZIP code map (raw Leaflet)
- Live stats in the header: Datasets, Routes, Stops, Trips
- Gracefully handles an empty database — no errors if no data has been uploaded yet

### 📁 Data Hub (`/sources`) — Editor + Admin
- Drag-and-drop CSV upload with file type and size validation (50 MB max)
- **Editor** uploads are marked `private` (visible only to uploader + admins)
- **Admin** uploads are marked `shared` (visible to all authenticated users)
- **Submission Context Modal** after upload:
  - **Data Domain** — dropdown with VIA-specific categories (Ridership, Routes, Operations, etc.)
  - **Project Name**, **Description**, **Coverage Dates**
  - Help tooltips (?) on every field so users know what to enter
- Live file table synced from PostgreSQL — persists across sessions and restarts
- Model switcher — toggle between GPT-4o and GPT-4o-mini in the chat settings panel

### 🔐 Role-Based Access Control

Four roles enforced on both frontend (route guards) and backend (decorators):

| Role | `/chat` | `/sources` | `/admin` | Can Delete Others' Sources |
|------|---------|-----------|----------|---------------------------|
| **admin** | ✅ | ✅ | ✅ | ✅ |
| **editor** | ✅ | ✅ | ❌ | ❌ (own only) |
| **analyzer** | ✅ | ❌ | ❌ | ❌ |
| **viewer** | ❌ | ❌ | ❌ | ❌ |

- All new registrations default to `admin` role
- An admin demotes users from the `/admin` panel — no SQL required
- Role changes take effect on the user's **next login**

### 🔒 Security
- **HttpOnly session cookie** — JWT never accessible to JavaScript. Immune to XSS token theft.
- All sensitive backend ports bound exclusively to `127.0.0.1`
- Cookie-based auth enforced on every authenticated API endpoint (`authenticateToken` middleware)
- Admin secret required for new account registration (timing-safe comparison via `crypto.timingSafeEqual`)
- Environment variables for all secrets — never hardcoded
- **Explicit Content Security Policy** via Helmet — allowlists only known origins
- Rate limiting on all auth and chat endpoints
- **Tenant schema derived from JWT** — all DB queries scoped to the authenticated user's tenant
- **CSV column names sanitized** before SQL interpolation — strips all non-safe characters
- Message length capped (4,000 chars) and chat history limited to last 20 exchanges per request
- Vite proxy used for all frontend API calls (no CORS exposure, no backend port visible to browser)
- **Multer 2.x** — up-to-date file upload handler with resolved CVE-2022-24434

---

## Data Setup

The platform starts with a **blank database** — no data is auto-imported on boot.

To use the AI chat:
1. Log in as an admin and go to **Data Hub** (`/sources`)
2. Upload a CSV file (your agency data, GTFS export, ridership report, etc.)
3. Fill in the Submission Context (data domain, project name, dates)
4. Navigate to `/chat` and ask questions in plain English

The AI automatically discovers all uploaded tables and their columns at query time — no configuration needed.

> **Note for VIA-specific dev/demo:** If you have GTFS data CSVs, upload them via the Data Hub. The AI can then answer route, stop, trip, and schedule questions immediately.

---

## Development Notes

- **Hot reload** is active in development — Vite HMR means most frontend changes apply without restarting Docker
- **Backend restarts** are handled automatically when you save any backend `.py` file (Flask dev server with reloader)
- To fully reset the database and start fresh:
  ```bash
  docker compose down -v
  docker compose up --build
  ```
  > ⚠️ `-v` wipes all data including user accounts and uploaded CSVs. You'll need to register again.
- The `bfi` PostgreSQL schema is the primary tenant schema. Each uploaded CSV becomes its own dynamically-generated table within it.
- Backend logs are structured Python logging. Set `LOG_LEVEL=DEBUG` in `backend/.env` for verbose output.

---

## Running Tests

The backend includes an integration smoke test suite (pytest):

```bash
# Backend must be running first (docker compose up)
# Run from via-mvp/ root:
ADMIN_SECRET=your-admin-secret python -m pytest backend/tests/test_smoke.py -v
```

Tests cover: registration guards, login + HttpOnly cookie, route protection, upload RBAC,
feedback endpoint, logout, and the full 4-role RBAC system (admin endpoints, visibility filtering,
chat access, delete ownership).

---

## Project Structure

```
via-mvp/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions: runs tests + build check on every push
├── backend/
│   ├── app.py               # Flask app — auth, JWT middleware, admin endpoints, chat, feedback
│   ├── sources.py           # CSV upload + PostgreSQL table creation + submission context
│   ├── openai_client.py     # OpenAI SSE streaming + text-to-SQL agent
│   ├── stats.py             # DB stats API (empty-state safe)
│   ├── db.py                # PostgreSQL connection pool + query helpers
│   ├── tests/
│   │   └── test_smoke.py    # Integration smoke test suite (pytest)
│   ├── db/
│   │   └── init.sql         # Database schema (users, feedback, bfi schema, sources_meta)
│   ├── requirements.txt     # Python dependencies
│   ├── .env                 # 🔒 Secret config (gitignored)
│   └── .env.example         # Template for new developers
├── frontend/
│   ├── src/
│   │   ├── App.jsx                        # Route definitions + all 5 role guards
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── ChatPage.jsx               # AI chat interface + per-user history
│   │   │   ├── AdminPage.jsx              # User management UI (admin only)
│   │   │   └── hub/
│   │   │       └── UploadPage.jsx         # Data Hub — upload + submission context
│   │   ├── components/
│   │   │   ├── AdminPanel.jsx             # User table with role dropdowns
│   │   │   ├── AppSidebar.jsx             # Navigation sidebar + per-user chat history
│   │   │   ├── FeedbackBubble.jsx         # AI chat + SSE streaming
│   │   │   ├── MapView.jsx                # Raw Leaflet map component
│   │   │   ├── RoleGuard.jsx              # Conditional render by role
│   │   │   └── SettingsModal.jsx          # Model selection + app settings
│   │   ├── hooks/
│   │   │   └── useRole.js                 # Role-checking hooks (useIsAdmin, useCanEdit, etc.)
│   │   ├── Plugins/
│   │   │   └── Via/                       # VIA-specific plugin (map + stats)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx            # Cookie-based auth + userKey() for namespaced storage
│   │   │   └── SubmissionContext.jsx      # Upload submission form state + tooltips
│   │   └── services/
│   │       └── api.js                     # All backend API calls (credentials: include)
│   └── vite.config.js                     # Vite + proxy config
├── docker-compose.yml                     # Development compose file
├── TESTING_GUIDE.md                       # Step-by-step testing walkthrough
└── README.md
```

---

## Operations & Deployment Guide (VIA IT Team)

### 1. Production Deployment

The development environment (`docker-compose.yml`) uses Nodemon for hot reload and the Vite dev server. **Do not use this in production.** Use the production compose file instead:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The application will be available on port `80`.

### 2. Role-Based Access Control (RBAC)

Users registered with the Admin Secret receive the `admin` role automatically.
To change a user's role, go to **http://localhost:5173/admin** (admin panel UI).

The admin panel lets you promote or demote any other user with a dropdown. Changes take effect on the user's next login.

### 3. Database Backups

```bash
# Backup
docker exec -t via-mvp-postgres-1 pg_dump -U your-db-user -d via_mvp > via_mvp_backup_$(date +%F).sql

# Restore
cat via_mvp_backup_YYYY-MM-DD.sql | docker exec -i via-mvp-postgres-1 psql -U your-db-user -d via_mvp
```

> ⚠️ Currently manual — automated backup scheduling is on the roadmap.

---

## Known Limitations & Deferred Items

### 1. JWT Session Is Not Server-Side Revocable

**Impact:** If an admin account is compromised or removed, the session cookie remains valid until expiry (24h TTL).

**Mitigation:** HttpOnly + SameSite=Strict cookie. Cannot be read by JavaScript or sent cross-site.

**Future fix:** Add a `token_blocklist` table. On logout, insert the JWT `jti`. Check blocklist in `authenticateToken`.

---

### 2. Conversation History Is Browser-Local Only

**Current state:** Chat history is stored in `localStorage`, namespaced per user — different accounts cannot see each other's conversations. History persists across page refreshes within the same browser.

**Limitation:** Clearing browser data or switching devices loses all history.

**Future fix:** Wire the existing `chat_messages` DB table to a `POST /api/chat/history` endpoint.

---

### 3. Rate Limiter Resets on Container Restart

**Impact:** In-memory rate limiter (express-rate-limit) loses all counters on every backend restart/deploy. A targeted brute-force attack can trigger restarts to drain the counter.

**Future fix:** Switch to `rate-limit-redis` with a shared Redis instance.

---

### 4. TLS / HTTPS — Deferred to Deployment

The production Nginx config does not yet have TLS configured. Options:
- **Certbot companion container** in `docker-compose.prod.yml`
- **Cloud load balancer TLS termination** (AWS ALB, Cloudflare Tunnel)

Must be resolved before any public-facing deployment.

---

### 5. No Automated DB Backup or Monitoring

A `docker compose down -v` permanently deletes all uploaded data. Manual `pg_dump` is the only current backup mechanism. No alerting exists if the backend crashes.

**Future:** Automated nightly `pg_dump` + offsite storage, error monitoring via Sentry or similar.

---

*Last reviewed: 2026-06-15. Maintained by Better Futures Institute engineering team.*
