# Depricated — original Node/Express backend

These files are the **original JavaScript backend**, kept here for reference only.
They have been replaced by the Python/Flask implementation in the parent
`backend/` directory and are **no longer wired into Docker or run anywhere**.

| Deprecated (JS)     | Replacement (Python)   |
|---------------------|------------------------|
| `server.js`         | `../app.py`            |
| `openai.js`         | `../openai_client.py`  |
| `sources.js`        | `../sources.py`        |
| `stats.js`          | `../stats.py`          |
| `import-gtfs.js`    | `../import_gtfs.py`    |
| `package.json`      | `../requirements.txt`  |
| `smoke.test.js`     | `../tests/test_smoke.py` |

The HTTP API (routes, request/response shapes, auth cookie, status codes) is
preserved by the Python port, so the frontend needs no changes.

Safe to delete once the Flask backend is confirmed in production.
