// Sources service: persists uploaded CSVs to the MongoDB backend
// (see backend/sources.js) so Buffi's agent can query them server-side.
import { API_BASE } from './api';

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

// All stored sources (metadata + 5-row sample), newest first.
export function listSources() {
  return fetch(`${API_BASE}/api/sources`).then(handle);
}

// Upload a CSV File object. Returns the stored source metadata.
export function uploadSource(file, { folder, tier } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (folder) form.append('folder', folder);
  if (tier) form.append('tier', tier);
  return fetch(`${API_BASE}/api/sources`, { method: 'POST', body: form }).then(handle);
}

// Rows for one source (default 200).
export function getSourceRows(id, limit = 200) {
  return fetch(`${API_BASE}/api/sources/${id}/rows?limit=${limit}`).then(handle);
}

export function deleteSource(id) {
  return fetch(`${API_BASE}/api/sources/${id}`, { method: 'DELETE' }).then(handle);
}
