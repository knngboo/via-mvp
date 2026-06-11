// Thin wrapper around the backend GTFS API.
// The backend runs on localhost:5000 (see docker-compose.yml).

export const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// All VIA bus routes, sorted by route number.
export function getRoutes() {
  return get('/api/routes');
}

// Stops nearest to a coordinate. Returns up to `limit` stops (max 50).
export function getNearbyStops(lat, lon, limit = 10) {
  return get(`/api/stops/near?lat=${lat}&lon=${lon}&limit=${limit}`);
}

// Scheduled departures at a stop, with route name and headsign attached.
export function getStopDepartures(stopId, limit = 20) {
  return get(`/api/stops/${encodeURIComponent(stopId)}/departures?limit=${limit}`);
}
