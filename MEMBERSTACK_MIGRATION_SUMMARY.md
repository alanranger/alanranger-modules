# Memberstack-Only Authentication Migration Summary

## Overview
Removed Supabase magic-link authentication from exam UX and replaced with Memberstack session-based authentication via API.

---

## Files Changed

### 1. Frontend Files

#### `squarespace-v2.2.html`
**Changes:**
- Added `EXAMS_API_BASE` constant: `"https://api.alanranger.com"`
- Replaced all `fetch("/api/exams/...")` with `fetch(\`${EXAMS_API_BASE}/api/exams/...\`, { credentials: "include" })`
- **Hidden magic-link UI elements:**
  - Email input field (`#loginEmail`) - `display:none`
  - "Get magic link" button (`#btnMagic`) - `display:none`
  - "Sign in" button (`#btnSignIn`) - `display:none`
  - Magic-link hints and tips - `display:none`
  - Quiz view magic-link button (`#btn-magic`) - `display:none`
- **Added Memberstack authentication check on page load:**
  - Calls `whoami()` API on DOMContentLoaded
  - If logged in → shows exam UI
  - If not logged in → shows message: "Please sign in to the Academy dashboard to use exams."
- **Added migration button:**
  - Button: "Link my existing exam progress"
  - Only shown when Memberstack authenticated but no results found
  - Calls `POST /api/exams/migrate`
- **Updated functions to use Memberstack API first:**
  - `getLatestStatus()` - tries Memberstack API, falls back to Supabase
  - `saveResultToDB()` - tries Memberstack API, falls back to Supabase
- **Added Memberstack API functions:**
  - `getExamIdentity()` - calls `${EXAMS_API_BASE}/api/exams/whoami`
  - `saveResultsViaMemberstack()` - calls `${EXAMS_API_BASE}/api/exams/save`
  - `getLatestStatusViaMemberstack()` - calls `${EXAMS_API_BASE}/api/exams/status`
  - `migrateLegacyResults()` - calls `${EXAMS_API_BASE}/api/exams/migrate`
  - `checkMigrationNeeded()` - checks if migration button should be shown

**Old Supabase functions preserved (for rollback):**
- `sendMagicLink()` - still in code but unreachable (UI hidden)
- `currentUser()` - still available for fallback
- All Supabase queries - still functional as fallback

---

### 2. API Endpoints (Vercel Serverless Functions)

#### New/Updated Endpoints:

**`GET /api/exams/whoami`**
- **Path:** `api/exams/whoami.js`
- **Method:** GET
- **Auth:** Reads `_ms-mid` cookie from request
- **Verification:** Uses Memberstack Admin API to verify token
- **Returns:** 
  - `200 OK`: `{ memberstack_id, email, permissions, planConnections }`
  - `401 Unauthorized`: `{ error: "Not logged in" }`
- **CORS:** Enabled for `https://www.alanranger.com`

**`POST /api/exams/save`**
- **Path:** `api/exams/save.js`
- **Method:** POST
- **Auth:** Verifies member via `_ms-mid` cookie
- **Body:** `{ module_id, score_percent, passed, attempt, details }`
- **Action:** Writes result to Supabase `module_results_ms` table using service role
- **Returns:**
  - `200 OK`: `{ ok: true }`
  - `401 Unauthorized`: `{ error: "Not logged in" }`
  - `400 Bad Request`: `{ error: "Invalid payload" }`
- **CORS:** Enabled

**`GET /api/exams/status?moduleId=...`**
- **Path:** `api/exams/status.js`
- **Method:** GET
- **Auth:** Verifies member via `_ms-mid` cookie
- **Query:** `moduleId` (required)
- **Action:** Returns latest exam status for that memberId from `module_results_ms`
- **Returns:**
  - `200 OK`: `{ latest: { score_percent, passed, attempt, created_at } | null }`
  - `401 Unauthorized`: `{ error: "Not logged in" }`
  - `400 Bad Request`: `{ error: "Missing moduleId" }`
- **CORS:** Enabled

**`POST /api/exams/migrate`** (NEW)
- **Path:** `api/exams/migrate.js`
- **Method:** POST
- **Auth:** Verifies member via `_ms-mid` cookie
- **Body:** `{}` (empty - uses member email from token)
- **Action:** 
  1. Gets member email + memberId from Memberstack
  2. Finds existing `module_results` rows for that email
  3. Copies them to `module_results_ms` with memberId (idempotent - skips duplicates)
- **Returns:**
  - `200 OK`: `{ ok: true, count: <number>, total: <number>, message: "..." }`
  - `401 Unauthorized`: `{ error: "Not logged in" }`
  - `400 Bad Request`: `{ error: "No email found for member" }`
- **CORS:** Enabled

**`POST /api/exams/migrate-legacy`** (Existing - kept for compatibility)
- **Path:** `api/exams/migrate-legacy.js`
- **Method:** POST
- **Note:** Still exists but not used by new frontend (uses `/migrate` instead)

---

## API Endpoint Files

### New Files Created:
- `api/exams/migrate.js` - New simplified migration endpoint

### Existing Files (Updated):
- `api/exams/whoami.js` - Already had CORS, verified working
- `api/exams/save.js` - Already had CORS, verified working
- `api/exams/status.js` - Already had CORS, verified working
- `api/exams/_cors.js` - Shared CORS middleware (already created)

---

## Authentication Flow

### Before (Legacy):
1. User enters email → Supabase magic link sent
2. User clicks link → Supabase session created
3. Results saved to `module_results` table with `user_id`

### After (Memberstack):
1. User already logged into Academy (Memberstack session)
2. Page loads → calls `whoami()` API
3. If authenticated → shows exam UI
4. If not authenticated → shows "Please sign in to Academy dashboard" message
5. Results saved to `module_results_ms` table with `memberstack_id`

---

## Migration Flow

1. User logs into Academy (Memberstack)
2. Opens exam page → `whoami()` succeeds
3. System checks if user has results in `module_results_ms`
4. If no results but legacy results exist (by email) → shows "Link my existing exam progress" button
5. User clicks button → calls `POST /api/exams/migrate`
6. API finds `module_results` rows by email
7. API copies rows to `module_results_ms` with `memberstack_id`
8. Button hidden, status refreshed

---

## Confirmation Checklist

✅ **No Supabase magic-link UI accessible:**
- Email input hidden (`display:none`)
- "Get magic link" button hidden
- "Sign in" button hidden
- All magic-link hints hidden
- Quiz view magic-link button hidden

✅ **Memberstack-only authentication:**
- `whoami()` called on page load
- Exam UI only shown if `whoami()` succeeds
- Message shown if not authenticated: "Please sign in to the Academy dashboard to use exams."

✅ **All API calls use explicit domain:**
- `EXAMS_API_BASE = "https://api.alanranger.com"`
- All fetch calls use `${EXAMS_API_BASE}/api/exams/...`
- All fetch calls include `{ credentials: "include" }`

✅ **Old functions preserved for rollback:**
- `sendMagicLink()` - still in code
- `currentUser()` - still available
- Supabase queries - still functional as fallback

---

## Endpoints Summary

| Endpoint | Method | Path | Purpose |
|----------|--------|------|---------|
| whoami | GET | `/api/exams/whoami` | Get Memberstack identity |
| save | POST | `/api/exams/save` | Save exam results |
| status | GET | `/api/exams/status?moduleId=...` | Get latest exam status |
| migrate | POST | `/api/exams/migrate` | Migrate legacy results (email-based) |
| migrate-legacy | POST | `/api/exams/migrate-legacy` | Migrate legacy results (user_id-based) |

All endpoints:
- Require `_ms-mid` cookie (Memberstack session)
- Support CORS from `https://www.alanranger.com`
- Handle OPTIONS preflight requests
- Return appropriate error codes

---

## Next Steps

1. **Deploy to Vercel:**
   - Upload `/api/exams/` folder
   - Set environment variables (see `VERCEL_ENV_SETUP.md`)

2. **Update Squarespace:**
   - Replace `squarespace-v2.2.html` code block with updated version

3. **Test:**
   - Log into Academy dashboard
   - Open exam page
   - Verify `whoami()` call succeeds
   - Verify exam UI shows
   - Test migration button (if legacy results exist)
   - Verify results save to `module_results_ms`

4. **Monitor:**
   - Check Vercel logs for API errors
   - Verify CORS headers in Network tab
   - Confirm `_ms-mid` cookie is sent with requests
