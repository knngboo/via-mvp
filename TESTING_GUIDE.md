# VIA MVP — Role-Based Access Control Testing Guide

## 🚀 Quick Start

### 1. Start the Application

From the root `via-mvp/` directory:

```bash
docker compose up --build
```

Wait for all services to be healthy (~ 30-60 seconds):
- ✅ Frontend: http://localhost:5173
- ✅ Backend: http://localhost:5001 (internal only)
- ✅ Database: PostgreSQL on 5432

You'll see:
```
backend    | Server running on http://0.0.0.0:5001
frontend   | VITE v5.x.x  ready in ... ms
postgres   | database system is ready to accept connections
```

---

## 👥 Test Accounts to Create

Use **Admin Secret: `TestAdminSecret123!`** (from `.env`)

### Account 1: Admin User
Navigate to **http://localhost:5173/register**

| Field | Value |
|-------|-------|
| Username | `admin_user` |
| Password | `AdminPass123!` |
| Admin Secret | `TestAdminSecret123!` |

**Then login** with these credentials.

---

### Account 2: Editor User
Register another account:

| Field | Value |
|-------|-------|
| Username | `editor_user` |
| Password | `EditorPass123!` |
| Admin Secret | `TestAdminSecret123!` |

---

### Account 3: Analyzer User
Register a third account:

| Field | Value |
|-------|-------|
| Username | `analyzer_user` |
| Password | `AnalyzerPass123!` |
| Admin Secret | `TestAdminSecret123!` |

---

### Account 4: Viewer User
Register a fourth account:

| Field | Value |
|-------|-------|
| Username | `viewer_user` |
| Password | `ViewerPass123!` |
| Admin Secret | `TestAdminSecret123!` |

---

## 🧪 Test Scenarios

### Test 1: Role Assignment (Admin Changes Roles)

1. **Login as `admin_user`**
2. **Navigate to `/admin`** (should work ✅)
3. You should see a table with all 4 users:
   - `admin_user` — role: `admin`
   - `editor_user` — role: `admin` (all registrations default to admin)
   - `analyzer_user` — role: `admin`
   - `viewer_user` — role: `admin`

4. **Change roles** (use the admin panel dropdowns):
   - Your own row shows **(you)** and its dropdown is disabled — you cannot demote yourself
   - Click the dropdown for `editor_user` → select `editor` → changes apply immediately in the DB
   - Click the dropdown for `analyzer_user` → select `analyzer`
   - Click the dropdown for `viewer_user` → select `viewer`

   > ⚠️ **JWT note:** Role changes update the database immediately but the target user's
   > active session still carries their old role until they **log out and back in**.

---

### Test 2: Editor Can Upload (Analyzer & Viewer Cannot)

1. **Login as `editor_user`**
2. **Navigate to `/sources`** (should work ✅)
   - See "Upload Data" section
3. **Logout and login as `analyzer_user`**
4. **Try to navigate to `/sources`** → should redirect to `/chat` ❌
5. **Login as `viewer_user`**
6. **Try to navigate to `/sources`** → should redirect to `/chat` ❌

---

### Test 3: Analyzer Can Chat (Viewer Cannot)

1. **Login as `analyzer_user`**
2. **Navigate to `/chat`** (should work ✅)
3. **Logout and login as `viewer_user`**
4. **Navigate to `/chat`** → should redirect to `/dashboard` (viewers cannot use Buffi AI) ❌

---

### Test 4: Data Visibility & Ownership

#### 4a. Upload as Editor with Private Visibility

1. **Login as `editor_user`**
2. **Go to `/sources`**
3. **Upload a test CSV** (create a simple test file: `test.csv`)
   ```csv
   name,value
   Item1,100
   Item2,200
   ```
4. **Submit the upload**
5. The upload should succeed and show in the list
6. **Verify in admin panel** that the source is marked as `private`

#### 4b. Upload as Admin with Shared Visibility

1. **Login as `admin_user`**
2. **Go to `/sources`**
3. **Upload another CSV** as admin
4. **Verify in admin panel** that admin's source is marked as `shared`

#### 4c. Cross-User Visibility

1. **Login as `editor_user`**
2. **Go to `/sources`**
   - Should see: own sources (private) + admin's sources (shared)
3. **Logout and login as `analyzer_user`**
4. **Go to `/sources`**
   - Should see: only admin's sources (shared) ❌ if role is still viewer
   - Wait... viewers can't access `/sources` at all!
   - But let me check if they should be able to list sources through another API...

---

### Test 5: Delete Permissions

1. **Login as `editor_user`**
2. **Upload a source**
3. **In the sources list, try to delete it** → should work ✅
4. **Login as `admin_user`**
5. **Go to `/sources`**
6. **Try to delete editor's source** → should work ✅ (admin can delete any)

---

### Test 6: Self-Demotion Prevention (Admin Only)

1. **Login as `admin_user`**
2. **Go to `/admin`**
3. **Try to change your own role from `admin` to `editor`** 
   - Should get error: "Cannot demote yourself from admin" ❌

---

## 🔍 Browser DevTools Testing

### Check User Role in Console

Open DevTools (`F12` or `Cmd+Opt+I`) and paste:

```javascript
// Get current user cookie name: via_session (HttpOnly — not readable by JS directly)
// But you can verify your session via:
fetch('/api/me', { credentials: 'include' }).then(r => r.json()).then(data => console.log('Current user:', data))
```

Expected output:
```json
{
  "username": "editor_user",
  "role": "editor"
}
```

### Check Role in JWT Token

```javascript
// Get the JWT from cookies
document.cookie.split(';').find(c => c.trim().startsWith('token='))
```

Copy the token value and decode it at [jwt.io](https://jwt.io):
- Paste the token
- You'll see the role embedded in the payload

---

## 🌐 API Testing (curl)

### Register User via API

```bash
curl -X POST http://localhost:5001/api/register \
  -H "x-admin-secret: TestAdminSecret123!" \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

Expected response:
```json
{"message":"Registration successful"}
```

### Login via API

```bash
curl -X POST http://localhost:5001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' \
  -c cookies.txt
```

Cookies are now saved in `cookies.txt`

### Get Current User

```bash
curl http://localhost:5001/api/me -b cookies.txt
```

Expected response:
```json
{
  "id": 1,
  "username": "testuser",
  "role": "viewer"
}
```

### List All Users (Admin Only)

```bash
curl http://localhost:5001/api/admin/users -b cookies.txt
```

### Change User Role (Admin Only)

```bash
curl -X PATCH http://localhost:5001/api/admin/users/2/role \
  -H "Content-Type: application/json" \
  -d '{"role":"editor"}' \
  -b cookies.txt
```

### Upload a Source (Editor+ Only)

```bash
# Create test CSV
echo "name,value
Item1,100
Item2,200" > test.csv

# Upload
curl -X POST http://localhost:5001/api/sources \
  -F "file=@test.csv" \
  -b cookies.txt
```

### List Sources

```bash
curl http://localhost:5001/api/sources -b cookies.txt
```

Should return sources filtered by visibility and user ownership.

---

## 📊 Expected Test Results Summary

| Test | Admin | Editor | Analyzer | Viewer |
|------|-------|--------|----------|--------|
| **Access `/admin`** | ✅ | ❌ | ❌ | ❌ |
| **Access `/sources`** | ✅ | ✅ | ❌ | ❌ |
| **Access `/chat`** | ✅ | ✅ | ✅ | ❌ |
| **Upload data** | ✅ | ✅ | ❌ | ❌ |
| **Delete own data** | ✅ | ✅ | ❌ | ❌ |
| **Delete others' data** | ✅ | ❌ | ❌ | ❌ |
| **See shared sources** | ✅ | ✅ | ✅* | ❌ |
| **See own sources** | ✅ | ✅ | ❌ | ❌ |
| **Manage user roles** | ✅ | ❌ | ❌ | ❌ |

*Analyzer would need explicit route access to see sources

---

## 🐛 Troubleshooting

### "Admin Secret Required" Error
- Make sure you're using `TestAdminSecret123!` exactly
- Check that `ADMIN_SECRET` in `backend/.env` matches

### "Cannot Connect to Backend"
- Verify all Docker containers are running: `docker ps`
- Check logs: `docker compose logs backend`
- Make sure PostgreSQL is healthy

### Role Changes Not Appearing
- Refresh the page (`Cmd+R`)
- Log out and back in
- Clear browser cache (`Cmd+Shift+Delete`)

### "Unauthorized" on API Calls
- Make sure you're sending cookies with `-b cookies.txt`
- Verify you're logged in: check `/api/me` first

---

## 🎬 Demo Flow (5 minutes)

1. **Register 4 users** → Show creation screen
2. **Login as admin** → Show admin panel with all users
3. **Change roles** → Show role assignment working
4. **Test access control** → Try accessing `/sources` as viewer (should fail)
5. **Upload as editor** → Show upload page, upload CSV
6. **Show visibility** → Show that only editor & admin can see the source
7. **Test chat** → Login as analyzer, access `/chat`
8. **Show hooks** → Open DevTools, run `fetch('/api/me')` to show role in JWT

---

## 📝 Notes

- Role changes update the database **immediately** but the user's active JWT still carries
  the old role — they must **log out and back in** for the new role to take effect on the backend
- Sessions persist across browser refreshes (JWT in HttpOnly cookie)
- Roles are validated on **both frontend and backend** for security
- Data visibility is enforced at the **query level** in the database
