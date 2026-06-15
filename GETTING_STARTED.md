# Getting Started: Running VIA MVP

## Option 1: Docker (Recommended) ⚡ — Single Command

### Prerequisites
- **[Download Docker Desktop](https://www.docker.com/products/docker-desktop/)** for macOS
- Unzip and drag to Applications folder
- Open Applications → Docker.app and wait for it to start (~1-2 min)

### Once Docker is Running

1. **Verify Docker is accessible:**
```bash
docker --version  # Should show: Docker version XX.X.X
```

2. **From `via-mvp/` root directory, start everything:**
```bash
docker compose up --build
```

Wait ~30-60 seconds for all services to be healthy:
```
✅ backend    | Server running on http://0.0.0.0:5001
✅ frontend   | VITE v5.x.x  ready in XXX ms
✅ postgres   | database system is ready to accept connections
```

3. **Navigate to http://localhost:5173**

---

## Option 2: Local Development (No Docker) 🛠️

If you don't want to install Docker yet, you can run services locally.

### Prerequisites

Install on macOS:
```bash
# Node.js (if not already installed)
brew install node

# PostgreSQL
brew install postgresql@16

# Start PostgreSQL
brew services start postgresql@16

# Verify it's running
psql postgres -U postgres -c "SELECT 1"
```

### Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Create and initialize database
createdb -U postgres via_mvp
psql -U postgres -d via_mvp -f db/init.sql

# Start the backend server
npm start
# Server will run on http://localhost:5001
```

### Setup Frontend (in a NEW terminal)

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
# Frontend will run on http://localhost:5173
```

### Access the Application

Navigate to **http://localhost:5173** and register/login

---

## Quick Demo Flow

Once the app is running (either via Docker or local):

### 1. Register Test Users

Go to **http://localhost:5173/register** and create these 4 accounts using:
- **Admin Secret:** `TestAdminSecret123!`

| Username | Password | Role Assignment |
|----------|----------|-----------------|
| `admin_user` | `AdminPass123!` | (keep as admin) |
| `editor_user` | `EditorPass123!` | Change to editor in `/admin` |
| `analyzer_user` | `AnalyzerPass123!` | Change to analyzer in `/admin` |
| `viewer_user` | `ViewerPass123!` | Keep as viewer |

### 2. Test Role-Based Access

**As `admin_user`:**
- ✅ Can access `/admin` — manage all users
- ✅ Can access `/sources` — upload data
- ✅ Can access `/chat` — run queries

**As `editor_user`:**
- ❌ Cannot access `/admin`
- ✅ Can access `/sources` — upload their own data
- ✅ Can access `/chat`

**As `analyzer_user`:**
- ❌ Cannot access `/admin`
- ❌ Cannot access `/sources`
- ✅ Can access `/chat` — run queries on shared data

**As `viewer_user`:**
- ❌ Cannot access `/admin`
- ❌ Cannot access `/sources`
- ❌ Cannot access `/chat`

### 3. See It In Action

1. **Login as admin** → Go to `/admin`
2. **Change `editor_user`'s role to `editor`**
3. **Login as editor** → Go to `/sources`
4. **Upload a CSV file** (sample below)
5. **Login as analyzer** → Go to `/chat`
6. **Try to go to `/sources`** → Gets redirected (role protection working!)

---

## Sample CSV to Upload

Save as `test_transit.csv`:

```csv
route_id,route_name,operator
1,Downtown Express,VIA
2,North Line,VIA
3,South Express,VIA
```

---

## Troubleshooting

### Docker Issues
- "Docker daemon not running" → Open Docker Desktop app
- "Port already in use" → `docker compose down` then try again
- Containers keep crashing → Check logs: `docker compose logs backend`

### Local Development Issues
- "Cannot find PostgreSQL" → Make sure `brew services list` shows postgres running
- "npm install fails" → Delete `node_modules/` and `pnpm-lock.yaml`, then run again
- "Port 5173 already in use" → Kill the process: `lsof -i :5173` then `kill -9 <PID>`

---

## Next Steps

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for:
- Detailed API testing with curl
- Browser DevTools testing
- Complete test scenarios
- Expected results matrix

---

## Branch Info

**All changes are on the `superman` branch** — safe from the main GitHub branch.

```bash
git branch -a  # Shows: superman (current), main, etc.
git log --oneline -5  # Shows commit history on superman
```
