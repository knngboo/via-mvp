# VIA MVP

Road-condition mapping MVP: a React frontend (Leaflet map of pothole data), an Express API, and MongoDB.

## Project structure

```
frontend/   React app (Create React App) — map, charts, CSV hub
backend/    Express + Mongoose API (health check at /health)
```

## Run with Docker (recommended)

Requires Docker Desktop.

```sh
docker compose up --build
```

| Service  | URL                          |
|----------|------------------------------|
| Frontend | http://localhost:3000        |
| Backend  | http://localhost:5000/health |
| MongoDB  | localhost:27017 (localhost only) |

Stop with `docker compose down`. Mongo data persists in a named volume
(`docker compose down -v` wipes it).

Default dev credentials for Mongo are baked into `docker-compose.yml`.
To override them, copy `.env.example` to `.env` and edit.

## Run locally without Docker

Frontend (uses pnpm; npm works too):

```sh
cd frontend
pnpm install
pnpm start        # dev server on http://localhost:3000
```

Backend (needs a running MongoDB and a MONGO_URI env var):

```sh
cd backend
pnpm install
MONGO_URI=mongodb://localhost:27017/viadata pnpm start
```

## Notes

- The frontend currently reads static data (e.g. `public/data/tx_zips.geojson`)
  and does not call the backend yet. When wiring it up, update the CORS origin
  in `backend/server.js` to `http://localhost:3000`.
