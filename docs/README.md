# VIA MVP — Transit Data Platform

A secure, containerized full-stack application built for **Better Futures Institute (BFI)** to centralize, analyze, and explore VIA Metropolitan Transit data using natural language AI queries.

---

## Architecture

| Layer | Technology | Details |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite | `localhost:5173` — All API calls proxied through Vite dev server |
| **Backend** | Python / Flask (gunicorn) | API gateway bound to `127.0.0.1:5001`. Cookie-authenticated. See [`backend/README.md`](backend/README.md). |
| **Database** | PostgreSQL 16 | Dockerized, bound to `127.0.0.1:5432`. Schemas: `public`, `bfi` |
| **AI** | OpenAI GPT-4o / GPT-4o-mini | Text-to-SQL: AI receives schema context and writes its own queries |
| **Orchestration** | Docker Compose | Single-command startup for all three services |

---

## PostgreSQL Database Schema

The platform runs on **PostgreSQL 16** with two schemas: `public` (GTFS transit data) and `bfi` (platform data). The full DDL lives in [`backend/db/init.sql`](backend/db/init.sql).

### Core Platform Tables (`public` schema)

#### `users`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing user ID |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Login username |
| `password_hash` | VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| `user_role` | VARCHAR(20) | DEFAULT `'viewer'` | RBAC role: `admin`, `editor`, `analyzer`, `viewer` |
| `tenant_schema` | VARCHAR(50) | DEFAULT `'bfi'` | Schema this user belongs to (multi-tenancy) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |

#### `chat_messages`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing message ID |
| `user_id` | INTEGER | REFERENCES users(id) | The owning user |
| `sender_role` | VARCHAR(10) | NOT NULL | `user` or `bot` |
| `content` | TEXT | NOT NULL | Message text |
| `structured_data` | JSONB | | Structured payload (query results, etc.) |
| `citations` | JSONB | | Sources cited by the bot |
| `map_tag` | VARCHAR(100) | | Reference tag for map rendering |
| `chart_tag` | VARCHAR(100) | | Reference tag for chart rendering |
| `saved_chart_data` | JSONB | | Snapshot of chart data at message time |
| `saved_highlight_data` | JSONB | | Snapshot of map highlight data at message time |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Message timestamp |

#### `feedback`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing feedback ID |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE CASCADE | The reporting user |
| `message_text` | TEXT | | Text of the flagged bot message |
| `reported_at` | TIMESTAMP | DEFAULT NOW() | When feedback was submitted |

#### `tenant_plugins`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `tenant_schema` | VARCHAR(63) | PRIMARY KEY | The tenant's schema (e.g., `bfi`) |
| `plugin_id` | VARCHAR(63) | PRIMARY KEY | Plugin identifier (e.g., `via`) |
| `enabled_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When the plugin was enabled for this tenant |

---

### Data Hub Tables (`bfi` schema)

#### `bfi.sources_meta`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | SERIAL | PRIMARY KEY | Auto-incrementing source ID |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Uploader |
| `name` | VARCHAR(255) | NOT NULL | Display name of the dataset |
| `table_name` | VARCHAR(255) | UNIQUE, NOT NULL | Physical table name in the `bfi` schema |
| `status` | VARCHAR(50) | DEFAULT `'Ready'` | Processing status |
| `size` | BIGINT | | File size in bytes |
| `num_rows` | INT | | Number of rows in the dataset |
| `columns` | JSONB | | Column schema of the uploaded dataset |
| `visibility` | VARCHAR(20) | DEFAULT `'Private'` | `Private` or `Shared` |
| `uploaded_at` | TIMESTAMP | DEFAULT NOW() | Upload timestamp |

---

### GTFS Transit Tables (`public` schema)

These tables are populated from the bundled VIA GTFS feed on startup via `import_gtfs.py`.

#### `stops`
| Column | Type | Description |
| :--- | :--- | :--- |
| `stop_id` | TEXT (PK) | Unique stop identifier |
| `stop_name` | TEXT | Human-readable stop name |
| `stop_lat` | DOUBLE PRECISION | GPS latitude |
| `stop_lon` | DOUBLE PRECISION | GPS longitude |
| `location_type` | INTEGER | GTFS location type (0 = stop, 1 = station) |
| `wheelchair_boarding` | INTEGER | Accessibility indicator |

#### `routes`
| Column | Type | Description |
| :--- | :--- | :--- |
| `route_id` | TEXT (PK) | Unique route identifier |
| `route_short_name` | TEXT | Short name (e.g., `"100"`) |
| `route_long_name` | TEXT | Full route name (e.g., `"Primo"`) |
| `route_type` | INTEGER | GTFS type (3 = bus) |

#### `trips`
| Column | Type | Description |
| :--- | :--- | :--- |
| `trip_id` | TEXT (PK) | Unique trip identifier |
| `route_id` | TEXT | References `routes.route_id` |
| `service_id` | TEXT | Service schedule identifier |
| `trip_headsign` | TEXT | Destination sign shown to passengers |
| `direction_id` | INTEGER | Direction of travel (0 or 1) |
| `wheelchair_accessible` | INTEGER | Accessibility indicator |
| `bikes_allowed` | INTEGER | Bike allowance indicator |

#### `stop_times`
| Column | Type | Description |
| :--- | :--- | :--- |
| `trip_id` | TEXT (PK) | References `trips.trip_id` |
| `stop_sequence` | INTEGER (PK) | Order of this stop within the trip |
| `arrival_time` | TEXT | Scheduled arrival time |
| `departure_time` | TEXT | Scheduled departure time |
| `stop_id` | TEXT | References `stops.stop_id` |
| `pickup_type` | INTEGER | Pickup availability indicator |
| `drop_off_type` | INTEGER | Drop-off availability indicator |
| `timepoint` | INTEGER | Whether this is a strict timepoint (1) or approximate (0) |



### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- No other local dependencies required — everything runs inside containers

### 2. Environment Configuration

Copy the template file and you are ready to go:

```bash
cp backend/.env.example backend/.env
```

The `.env.example` file contains working dev defaults for all required variables — no editing needed to run locally. The file is **gitignored** and must never be committed.

> For production, replace `JWT_SECRET`, `ADMIN_SECRET`, and `OPENAI_API_KEY` with strong, unique values before deploying.

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
- **Admin Secret** — `dev_admin_secret_change_me` (the default from `.env.example`; change this in production)

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

### 📁 Data Hub (`/sources`) —  Editor + Admin
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

- **Hot reload** is active for the frontend — Vite HMR means most frontend changes apply without restarting Docker
- **Backend restarts** are handled automatically when you save any backend `.py` file (Flask dev server with reloader). See [`backend/README.md`](backend/README.md).
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
# Run from toyr via-mvp/ root:
ADMIN_SECRET=dev_admin_secret_change_me python -m pytest backend/tests/test_smoke.py -v
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
├── backend/                    # Python / Flask — see backend/README.md
│   ├── app.py                  # Flask app — auth, JWT, chat, feedback, /api/me
│   ├── sources.py              # CSV upload + PostgreSQL table creation + submission context
│   ├── openai_client.py        # OpenAI SSE streaming + text-to-SQL agent
│   ├── stats.py                # DB stats API (empty-state safe)
│   ├── import_gtfs.py          # Optional GTFS bulk loader
│   ├── db.py                   # PostgreSQL connection pool + query helpers
│   ├── requirements.txt        # Python dependencies
│   ├── Depricated/             # Archived original Node/Express backend
│   ├── tests/
│   │   └── test_smoke.py       # Integration smoke test suite
│   ├── db/
│   │   └── init.sql            # Database schema (users, feedback, bfi schema, sources_meta)
│   ├── .env                    # 🔒 Secret config (gitignored)
│   └── .env.example            # Template for new developers
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
│   │   │   ├── SettingsModal.jsx          # Model selection + app settings
│   │   │   └── PluginDashboardPage.jsx    # Dashboard shell
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
├── docker-compose.prod.yml                # Production compose file
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

**Current state:** Chat history is stored in `localStorage`, namespaced per user. The backend endpoints `GET/POST /api/chat/messages` exist and are wired to the `chat_messages` DB table.

**Limitation:** Frontend fire-and-forget save to the backend is partially implemented. Clearing browser data or switching devices may still lose history depending on the branch.

**Next step:** Verify and complete the frontend save call in `FeedbackBubble.jsx` and the restore-on-mount in `ChatPage.jsx`.

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

*Last reviewed: 2026-06-16. Maintained by Better Futures Institute engineering team.*
