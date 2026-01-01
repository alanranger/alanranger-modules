# Memberstack Exam Integration - Implementation Notes

## Overview

This implementation migrates exam authentication from Supabase Auth (magic link) to Memberstack, providing seamless access for Academy members while preserving legacy exam results.

## File Structure

```
alanranger-academy-assesment/
├── api/
│   └── exams/
│       ├── whoami.js          # Get Memberstack identity
│       ├── save.js             # Save exam results
│       ├── status.js           # Get latest exam status
│       └── migrate-legacy.js   # Migrate legacy results
├── src/
│   ├── engine.js              # Original (legacy)
│   └── engine-memberstack.js  # New (Memberstack-integrated)
├── supabase-migration.sql      # Database schema changes
├── VERCEL_ENV_SETUP.md         # Environment variables guide
└── package.json                # API dependencies
```

## Database Changes

Run `supabase-migration.sql` in Supabase SQL Editor to create:
- `module_results_ms` - New Memberstack-based results table
- `exam_member_links` - Links Memberstack members to legacy Supabase users

**Important**: The legacy `module_results` table remains untouched.

## API Endpoints

All endpoints require the `_ms-mid` cookie (set by Memberstack) and use `credentials: "include"` in fetch calls.

### GET /api/exams/whoami
Returns current Memberstack member identity or 401.

### POST /api/exams/save
Saves exam results to `module_results_ms`.

**Body:**
```json
{
  "module_id": "module-01",
  "score_percent": 85,
  "passed": true,
  "attempt": 1,
  "details": { "misses": [3, 7] }
}
```

### GET /api/exams/status?moduleId=module-01
Returns latest exam status for the authenticated member.

### POST /api/exams/migrate-legacy
Copies legacy results from `module_results` to `module_results_ms`.

**Body:**
```json
{
  "supabase_user_id": "uuid-here",
  "legacy_email": "user@example.com"
}
```

## Frontend Integration

### Primary Flow (Memberstack)
1. On page load, call `getExamIdentity()` → `/api/exams/whoami`
2. If authenticated, user can take exams immediately
3. Results saved via `saveResultsViaMemberstack()` → `/api/exams/save`
4. Status retrieved via `getLatestStatusViaMemberstack()` → `/api/exams/status`

### Migration Flow (Legacy Users)
1. User clicks "Import previous exam progress"
2. Enters legacy email → Supabase magic link sent
3. User clicks magic link → Supabase session established
4. User clicks "Import Results" → `/api/exams/migrate-legacy` copies data
5. Legacy session cleared, future access uses Memberstack

## Testing Checklist

- [ ] Logged into Memberstack → exam page shows "Signed in as [email]"
- [ ] No Supabase sign-in form shown (unless in migration flow)
- [ ] Complete exam → result saved to `module_results_ms`
- [ ] Refresh page → status shows latest attempt
- [ ] Click "Import previous exam progress"
- [ ] Enter legacy email → magic link sent
- [ ] Click magic link → Supabase session established
- [ ] Click "Import Results" → legacy results copied
- [ ] Verify results appear in new system
- [ ] Future exams use Memberstack (no Supabase UI)

## Deployment Steps

1. **Supabase**: Run `supabase-migration.sql` in SQL Editor
2. **Vercel**: Add environment variables (see `VERCEL_ENV_SETUP.md`)
3. **Vercel**: Deploy API routes from `/api/exams/` folder
4. **Frontend**: Replace `engine.js` with `engine-memberstack.js` (or update existing)
5. **Frontend**: Update `squarespace-v2.2.html` to use new engine
6. **Test**: Follow testing checklist above

## Rollback Plan

If issues occur:
1. Legacy `module_results` table still works
2. Can revert to `engine.js` (original)
3. Migration is idempotent (safe to re-run)
4. No data loss - both tables coexist

## Notes

- Memberstack cookie `_ms-mid` is automatically set when user is logged into Academy
- API routes verify token server-side using `@memberstack/admin`
- Service role key bypasses RLS (Row Level Security) for server operations
- Migration is one-time per user (tracked in `exam_member_links`)
