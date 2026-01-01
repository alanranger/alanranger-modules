# API Endpoints Reference

## Base URL

After deployment to Vercel, your endpoints will be available at:

**Option 1: Vercel default domain**
```
https://your-project-name.vercel.app/api/exams/*
```

**Option 2: Custom domain (recommended)**
```
https://api.alanranger.com/api/exams/*
```

Replace `your-project-name` or `api.alanranger.com` with your actual deployment URL.

---

## Endpoints

### 1. GET `/api/exams/whoami`

Get the current Memberstack member identity.

**Request:**
```bash
GET /api/exams/whoami
Headers:
  Cookie: _ms-mid=<memberstack-token>
  Origin: https://www.alanranger.com
```

**Response (200 OK):**
```json
{
  "memberstack_id": "mem_abc123",
  "email": "user@example.com",
  "permissions": [],
  "planConnections": [...]
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Not logged in"
}
```

---

### 2. GET `/api/exams/status?moduleId=<module-id>`

Get the latest exam attempt for a specific module.

**Request:**
```bash
GET /api/exams/status?moduleId=module-01-exposure
Headers:
  Cookie: _ms-mid=<memberstack-token>
  Origin: https://www.alanranger.com
```

**Response (200 OK):**
```json
{
  "latest": {
    "score_percent": 100,
    "passed": true,
    "attempt": 3,
    "created_at": "2026-01-01T12:00:00Z"
  }
}
```

**Response (200 OK - No results):**
```json
{
  "latest": null
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Missing moduleId"
}
```

---

### 3. POST `/api/exams/save`

Save exam results to the database.

**Request:**
```bash
POST /api/exams/save
Headers:
  Content-Type: application/json
  Cookie: _ms-mid=<memberstack-token>
  Origin: https://www.alanranger.com
Body:
{
  "module_id": "module-01-exposure",
  "score_percent": 100,
  "passed": true,
  "attempt": 1,
  "details": { ... } // optional
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid payload"
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Not logged in"
}
```

---

### 4. POST `/api/exams/migrate-legacy`

Migrate legacy Supabase exam results to Memberstack-linked table.

**Request:**
```bash
POST /api/exams/migrate-legacy
Headers:
  Content-Type: application/json
  Cookie: _ms-mid=<memberstack-token>
  Origin: https://www.alanranger.com
Body:
{
  "supabase_user_id": "uuid-here",
  "legacy_email": "user@example.com" // optional
}
```

**Response (200 OK - Success):**
```json
{
  "ok": true,
  "copied": 15,
  "total": 15,
  "message": "Migrated 15 of 15 legacy results"
}
```

**Response (200 OK - Already migrated):**
```json
{
  "ok": true,
  "copied": 0,
  "message": "All results already migrated"
}
```

**Response (200 OK - No legacy results):**
```json
{
  "ok": true,
  "copied": 0,
  "message": "No legacy results found to migrate"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Missing supabase_user_id"
}
```

---

## CORS Preflight (OPTIONS)

All endpoints support OPTIONS preflight requests:

```bash
OPTIONS /api/exams/whoami
Headers:
  Origin: https://www.alanranger.com
  Access-Control-Request-Method: GET
  Access-Control-Request-Headers: Content-Type
```

**Response (204 No Content):**
```
Access-Control-Allow-Origin: https://www.alanranger.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Vary: Origin
```

---

## Authentication

All endpoints require Memberstack authentication via:

1. **Cookie** (same-origin or cross-origin with credentials):
   - Cookie name: `_ms-mid`
   - Automatically sent with `credentials: "include"` in fetch

2. **Authorization Header** (cross-origin token-based):
   - Header: `Authorization: Bearer <token>`
   - Extract token from `_ms-mid` cookie on frontend

---

## Testing

See `CORS_DEPLOYMENT.md` for detailed testing instructions and curl examples.
