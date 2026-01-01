# CORS Configuration & Deployment Guide

## Overview

All `/api/exams/*` endpoints now support CORS for cross-origin requests from `https://www.alanranger.com`.

## CORS Headers

All endpoints automatically set:
- `Access-Control-Allow-Origin: https://www.alanranger.com` (or `EXAMS_API_ORIGIN` env var)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Vary: Origin`

## Preflight Handling

OPTIONS requests are automatically handled and return `204 No Content` with CORS headers.

## Authentication

Endpoints accept Memberstack tokens via:
1. **Cookie** (same-origin or cross-origin with credentials): `_ms-mid` cookie
2. **Authorization header** (cross-origin token-based): `Authorization: Bearer <token>`

The `getMemberstackToken()` helper checks both sources automatically.

## Deployment Steps

1. **Set Environment Variables** (see `VERCEL_ENV_SETUP.md`):
   - `MEMBERSTACK_SECRET_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `EXAMS_API_ORIGIN` (optional, defaults to `https://www.alanranger.com`)

2. **Deploy to Vercel**:
   - Upload `/api/exams/` folder to your Vercel project
   - Vercel will auto-detect serverless functions
   - Functions will be available at: `https://your-project.vercel.app/api/exams/*`

3. **Configure Custom Domain** (Recommended):
   - In Vercel project settings → Domains
   - Add `api.alanranger.com` (or your preferred subdomain)
   - Configure DNS CNAME record pointing to Vercel
   - This enables cookie sharing if Memberstack cookies are set on `.alanranger.com`

## Testing Endpoints

After deployment, test these endpoints:

### 1. Preflight (OPTIONS)
```bash
curl -X OPTIONS https://your-api-domain.com/api/exams/whoami \
  -H "Origin: https://www.alanranger.com" \
  -v
```

Expected: `204 No Content` with CORS headers

### 2. Whoami (GET)
```bash
curl https://your-api-domain.com/api/exams/whoami \
  -H "Origin: https://www.alanranger.com" \
  -H "Cookie: _ms-mid=your-token-here" \
  -v
```

### 3. Status (GET)
```bash
curl "https://your-api-domain.com/api/exams/status?moduleId=module-01-exposure" \
  -H "Origin: https://www.alanranger.com" \
  -H "Cookie: _ms-mid=your-token-here" \
  -v
```

### 4. Save (POST)
```bash
curl -X POST https://your-api-domain.com/api/exams/save \
  -H "Origin: https://www.alanranger.com" \
  -H "Content-Type: application/json" \
  -H "Cookie: _ms-mid=your-token-here" \
  -d '{"module_id":"module-01-exposure","score_percent":100,"passed":true,"attempt":1}' \
  -v
```

## Frontend Integration

### Same-Origin (Recommended)
If API is on `api.alanranger.com` and cookies are set on `.alanranger.com`:
```javascript
fetch("/api/exams/whoami", { credentials: "include" })
```

### Cross-Origin (Token-Based)
If API is on `*.vercel.app` or different domain:
```javascript
// Extract token from cookie
const token = document.cookie
  .split('; ')
  .find(row => row.startsWith('_ms-mid='))
  ?.split('=')[1];

// Send in Authorization header
fetch("https://your-api-domain.com/api/exams/whoami", {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

## Endpoint List

After deployment, your endpoints will be:

- `GET https://your-api-domain.com/api/exams/whoami`
- `GET https://your-api-domain.com/api/exams/status?moduleId=<module-id>`
- `POST https://your-api-domain.com/api/exams/save`
- `POST https://your-api-domain.com/api/exams/migrate-legacy`

Replace `your-api-domain.com` with your actual Vercel deployment URL or custom domain.
