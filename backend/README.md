# VIA MVP — Backend (Python / Flask)

The API gateway for the VIA MVP platform. Ported from the original Node/Express
backend (now archived in [`Depricated/`](./Depricated)) to **Python 3.12 + Flask**,
served by **gunicorn** and backed by **PostgreSQL 16**. The HTTP contract is
unchanged, so the React frontend needs no modifications.

---

## Stack

| Piece | Choice | Notes |
|-------|--------|-------|
| Web framework | Flask 3 | App factory in `app.py` |
| WSGI server | gunicorn (`gthread`) | Threaded workers so SSE chat streaming isn't blocked |
| DB driver | psycopg2 | Bounded `ThreadedConnectionPool` (max 20) in `db.py` |
| Auth | PyJWT + bcrypt | JWT in an HttpOnly `via_session` cookie |
| CORS / limits / headers | flask-cors, Flask-Limiter, manual CSP | Parity with the old helmet/cors/express-rate-limit setup |
| AI | OpenAI GPT-4o / 4o-mini | Text-to-SQL agent, streamed over SSE |

---

## Module map

| File | Responsibility | Replaces (JS) |
|------|----------------|---------------|
| `app.py` | Flask app: auth, chat, feedback, plugins; security headers, CORS, rate limits | `Depricated/server.js` |
| `openai_client.py` | "Buffi" agent — schema context, `run_query` / `predict_route_ridership` tools, SSE streaming | `Depricated/openai.js` |
| `sources.py` | Data Hub CSV upload blueprint (`/api/sources`) | `Depricated/sources.js` |
| `stats.py` | Dashboard stats blueprint (`/api/stats`) | `Depricated/stats.js` |
| `import_gtfs.py` | One-off GTFS loader (`python import_gtfs.py`) | `Depricated/import-gtfs.js` |
| `db.py` | Connection pool + `query()` / `transaction()` helpers | (was inline `pg.Pool`) |
| `db/init.sql` | Schema bootstrap (users, feedback, `bfi` schema, plugin seed) | unchanged |
| `tests/test_smoke.py` | Integration smoke suite | `Depricated/smoke.test.js` |

---

## Run with Docker (recommended)

Everything runs in containers — no local Python or Node needed.

### 1. Create `backend/.env`

This file is **gitignored** — never commit it. Start from `.env.example`:

```env
PORT=5001

POSTGRES_USER=admin
POSTGRES_PASSWORD=admin
POSTGRES_DB=via_mvp
POSTGRES_HOST=postgres

# Min 16 chars / 8 chars — the server refuses to boot otherwise.
JWT_SECRET=replace_with_a_secure_random_string
ADMIN_SECRET=replace_with_a_strong_admin_secret

# Required for AI chat
OPENAI_API_KEY=sk-...
```

> The backend **fails fast** if `JWT_SECRET` (< 16 chars) or `ADMIN_SECRET`
> (< 8 chars) is missing — by design.

### 2. Launch (from the repo root)

```bash
docker compose up --build            # all services
docker compose up --build backend postgres   # backend + db only
```

Startup order is handled for you: the backend waits for Postgres to report
healthy, then gunicorn boots. `db/init.sql` runs automatically the first time
the `pg_data` volume is created.

### 3. Verify

```bash
curl localhost:5001/health           # -> OK
```

### Reset the database

```bash
docker compose down -v && docker compose up --build
```

> ⚠️ `-v` wipes the `pg_data` volume — all users and uploaded CSVs are lost.

---

## Container details

- **Image:** `python:3.12-slim`; dependencies installed from `requirements.txt`
  (layer-cached unless that file changes). Runs as a non-root `appuser`.
- **Command:** `gunicorn --bind 0.0.0.0:5001 --worker-class gthread
  --workers 2 --threads 4 --timeout 360 app:app`.
- **Port:** published to `127.0.0.1:5001` only (not exposed to the LAN).
- **Dev volume:** `docker-compose.yml` mounts `./backend:/app`. Because Python
  deps live in the image's site-packages (not `/app`), the mount does **not**
  shadow them — unlike the old Node `node_modules` trick, which is why that
  anonymous volume was removed.

> Note: gunicorn does not hot-reload on file changes. After editing backend
> code, restart with `docker compose restart backend` (or add `--reload` to the
> Dockerfile `CMD` for local iteration).

---

## API surface

All `/api/*` routes except `register`/`login`/`logout` require the
`via_session` cookie (or `Authorization: Bearer <jwt>`).

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET  | `/health` | — | Liveness probe |
| POST | `/api/register` | admin secret | Create an account (timing-safe secret check) |
| POST | `/api/login` | — | Authenticate, sets HttpOnly cookie |
| POST | `/api/logout` | — | Clear the session cookie |
| GET  | `/api/me` | cookie | Restore session on page load |
| POST | `/api/chat/stream` | cookie | Buffi chat — SSE stream |
| POST | `/api/feedback` | cookie | Flag a bad AI response |
| GET  | `/api/plugins` | cookie | Plugin IDs enabled for the tenant |
| GET/POST | `/api/sources` | cookie / admin | List / upload CSV sources |
| DELETE | `/api/sources/<id>` | admin | Delete a source + its table |
| PATCH | `/api/sources/<id>/context` | admin | Update submission metadata |
| GET | `/api/stats` | cookie | Dashboard summary counts |
| GET | `/api/stats/trips-per-route` | cookie | Busiest routes |
| GET | `/api/stats/departures-by-hour` | cookie | Departure histogram |

---

## Tests

Integration smoke tests hit the **live** API (no DB mocking). Start the stack
first, then:

```bash
docker compose up -d backend postgres
ADMIN_SECRET=<your-admin-secret> python -m unittest backend/tests/test_smoke.py
```

Covers: registration guards, login + HttpOnly cookie, route protection, upload
RBAC, feedback, plugin registry, and logout.

---

## Optional: GTFS bulk import

The platform boots as a blank slate. To load the bundled VIA GTFS feed
(`google_transit/`) into the `public.stops/routes/trips/stop_times` tables:

```bash
docker compose exec backend python import_gtfs.py
```

Idempotent — it skips the import if `stops` already has rows.

---

## Running without Docker (advanced)

```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows Git Bash
pip install -r requirements.txt
# point at a reachable Postgres:
export POSTGRES_HOST=localhost JWT_SECRET=... ADMIN_SECRET=... OPENAI_API_KEY=...
python app.py            # Flask dev server on :5001
```

> `psycopg2-binary` ships wheels for CPython 3.12; very new interpreters
> (e.g. 3.14) may have no wheel yet and try to build from source. The Docker
> image pins 3.12 to avoid this.
