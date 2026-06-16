# VIA MVP — Testing Guide (scorpion / Python build)

## Step 1 — Start the app

Open Terminal, navigate to this folder:

```bash
cd /Users/knngboo/OG/bfi-scorpion/via-mvp
docker compose up --build
```

Wait until you see all three services healthy (30–60 seconds):
```
backend    | Running on http://0.0.0.0:5001
frontend   | VITE ready in ... ms → http://localhost:5173/
postgres   | database system is ready to accept connections
```

Open your browser to **http://localhost:5173**

> You should see the login page. That means everything is running.

---

## Step 2 — Create 4 test accounts

You need your **Admin Secret** from `backend/.env`:
```
ADMIN_SECRET=replace_with_a_strong_admin_secret
```

Go to **http://localhost:5173/register** and create each account below.
All 4 accounts start as `admin` — you'll demote 3 of them in Step 3.

### Account 1: admin_user
| Field | Value |
|-------|-------|
| Username | `admin_user` |
| Password | `AdminPass123!` |
| Admin Secret | `replace_with_a_strong_admin_secret` |

Click Register → then **Login** with those credentials.

### Account 2: editor_user
Open an **Incognito window** (so sessions don't interfere).
| Field | Value |
|-------|-------|
| Username | `editor_user` |
| Password | `EditorPass123!` |
| Admin Secret | `replace_with_a_strong_admin_secret` |

Register only — don't login yet.

### Account 3: analyzer_user
| Field | Value |
|-------|-------|
| Username | `analyzer_user` |
| Password | `AnalyzerPass123!` |
| Admin Secret | `replace_with_a_strong_admin_secret` |

Register only — don't login yet.

### Account 4: viewer_user
| Field | Value |
|-------|-------|
| Username | `viewer_user` |
| Password | `ViewerPass123!` |
| Admin Secret | `replace_with_a_strong_admin_secret` |

Register only — don't login yet.

---

## Step 3 — Assign roles

Log in as **admin_user** (your first account from Step 2).

Go to **http://localhost:5173/admin**

You should see a user table with all 4 accounts. Use the dropdowns to change:
- `editor_user` → **editor**
- `analyzer_user` → **analyzer**
- `viewer_user` → **viewer**
- `admin_user` → (disabled — you can't change your own role)

> ⚠️ **Important:** Role changes take effect on the user's **next login**.
> That's why you registered editor/analyzer/viewer without logging in — their
> first login will pick up the demoted role.

---

## Step 4 — Test each role

### ✅ Admin (admin_user)
Log in as `admin_user`.

| Test | URL | Expected |
|------|-----|----------|
| Dashboard | `/dashboard` | ✅ Map + stats visible |
| Chat | `/chat` | ✅ Can type and get AI responses |
| Data Hub | `/sources` | ✅ Upload panel visible |
| Admin Panel | `/admin` | ✅ User table visible, own row disabled |

Upload a CSV: Go to `/sources`, drag and drop any CSV file.
After upload, fill in the context modal (data domain, project name, etc.) and submit.

---

### ✅ Editor (editor_user)
Log in as `editor_user`.

| Test | URL | Expected |
|------|-----|----------|
| Dashboard | `/dashboard` | ✅ Visible |
| Chat | `/chat` | ✅ Can use AI |
| Data Hub | `/sources` | ✅ Can upload |
| Admin Panel | `/admin` | ❌ Redirects to `/chat` |

Upload a CSV as editor. Note: editor uploads are marked **private** — only you and admins can see them.

---

### ✅ Analyzer (analyzer_user)
Log in as `analyzer_user`.

| Test | URL | Expected |
|------|-----|----------|
| Dashboard | `/dashboard` | ✅ Visible |
| Chat | `/chat` | ✅ Can use AI |
| Data Hub | `/sources` | ❌ Redirects to `/chat` |
| Admin Panel | `/admin` | ❌ Redirects to `/chat` |

---

### ✅ Viewer (viewer_user)
Log in as `viewer_user`.

| Test | URL | Expected |
|------|-----|----------|
| Dashboard | `/dashboard` | ✅ Visible |
| Chat | `/chat` | ❌ Redirects to `/dashboard` |
| Data Hub | `/sources` | ❌ Redirects to `/chat` |
| Admin Panel | `/admin` | ❌ Redirects to `/chat` |

---

## Step 5 — Test data visibility

Log in as `admin_user`, upload a CSV → it becomes **shared** (visible to everyone).

Log in as `editor_user`, upload a CSV → it becomes **private** (only editor + admin can see it).

Log in as `analyzer_user` and go to `/sources` — they're blocked from the UI.
But as admin, go back to `/sources` and confirm you can see both the shared and private files.

---

## Step 6 — Test self-demotion guard

Log in as `admin_user`, go to `/admin`.

Try to change your own role dropdown — it should be **disabled** and show "(you)".
This prevents admins from accidentally locking themselves out.

---

## Step 7 — Run automated tests (optional)

Make sure Docker is still running, then open a second Terminal window:

```bash
cd /Users/knngboo/OG/bfi-scorpion/via-mvp
ADMIN_SECRET=sk%6hE2qRw! python -m pytest backend/tests/test_smoke.py -v

or

cd /Users/knngboo/OG/bfi-scorpion/via-mvp
docker compose exec backend python -m pytest tests/test_smoke.py -v
```

You should see 27 tests pass. Any failures will show the exact assertion that failed.

---

## Useful commands

```bash
# Start fresh (wipes all data — you'll need to re-register accounts)
docker compose down -v && docker compose up --build

# View live backend logs
docker compose logs -f backend

# View database contents directly
docker exec -it via-mvp-postgres-1 psql -U admin -d via_mvp

# Check who is in the users table
docker exec -it via-mvp-postgres-1 psql -U admin -d via_mvp -c "SELECT id, username, user_role FROM users;"
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Page won't load at all | Make sure Docker Desktop is running first |
| "Cannot connect to backend" | Wait 30 more seconds, backend might still be initializing |
| Login fails | Make sure you typed the password exactly (case sensitive) |
| Wrong role after demotion | Log out and log back in — JWT refreshes on login |
| `docker compose up` fails | Try `docker compose down -v` first, then `up --build` |
| Can't find Admin Secret | Check `backend/.env` line with `ADMIN_SECRET=` |
