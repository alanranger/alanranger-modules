# Changelog - Academy Assessment System

All notable changes to this project will be documented in this file.

## [2026-06-07] - Ghost admin: fast member directory load

### Fixed
- **`/api/admin/members?for_ghost=1`** — dedicated fast path (skips full event scan, Stripe, hue, bookmarks pipeline)
- Loads slim cache rows + chunked exam-pass counts + 90-day activity window only
- Server response cache enabled for ghost list (120s, same as members API)
- **Ghost UI** — sessionStorage stale-while-revalidate (2 min) for instant repeat tab visits

### Deploy
- Vercel auto-deploy from `main` — no Squarespace paste

---

## [2026-06-07] - Strip S 1.3.45: ghost mode member-id resolution

### Fixed
- **Do-next strip** honours `?ghost=` / `?ghostEmail=` and `sessionStorage` key `ar_ghost_context_v1` (same as dashboard)
- Ghost mode loads member JSON via existing `/api/admin/ghost-login` (admin `X-Memberstack-Id` guard unchanged)
- `window.__arDoNextStrip.memberId` equals ghost id; exposes `ghostMode` + `ghostMemberId`
- All writes suppressed in ghost mode: page-view, tile-open beacon, assignment persist

### Paste
- **Strip S 1.3.45** + **Header H 1.4.14** (stamp only). No Vercel deploy required.

---

## [2026-06-07] - Admin badge level on all member tables

### Added
- **Badge level column** on all admin tabs that list members: **Members**, **Ghost**, **Exams**, **Engagement** (top engaged), **Overview** (top members), plus member detail and active-now strip
- **`components/admin/BadgeLevelCell.js`** — shared read-only badge pill (gold ★ for Master, paused hint)
- **`/api/admin/members`** — badge fields on every list response (not Ghost-only); sortable via `badge_level`

### Changed
- **`/api/admin/progress`**, **`/api/admin/engagement`**, **`/api/admin/top-members`**, **`/api/admin/members-active-now`**, **`/api/admin/members/[id]`** — attach degraded table badge via `attachTableBadgeFields`

---

## [2026-06-07] - Admin Ghost badge level column + gate breakdown

### Added
- **Ghost admin (`/academy/admin/ghost` v1.1.0)** — sortable **Badge level** column (Enrolled → Master, gold ★ for Master)
- **Per-member gate breakdown** — expand any row for Foundation / Practitioner / Certified / Graduate / Master inputs (read-only)
- **`lib/admin-gate-stats.js`** — reuses `lib/academy-badge-gates.js` (single source of truth)
- **`/api/admin/member-badge-breakdown`** — full breakdown via `engagement-summary?window=all` fields + gate logic

### Performance
- Table badge: Memberstack JSON + exams only (`engagementDegraded` for Foundation active-days); full breakdown on row expand only

## [2026-06-06] - Dashboard bounce fix baseline (D 1.3.9 + D 1.3.10)

### Fixed
- **B3 login bounce** — fast return from module article to dashboard no longer lands on `/academy/login`
- **Memberstack read flood** — ~78 paired `getCurrentMember`/`getMemberJSON` calls per dashboard load reduced to ~1–2 via `globalThis.__arMsReader`
- **Article page MS hammering** — bookmark/lesson widget stopped retry/mutation loops that triggered MS Network Errors

### Added
- **D 1.3.9** session-cached access (`accessConfirmed` in `ar-dashboard-session-v1`, 4h TTL)
- **D 1.3.10** shared MS reader bundle across header, dashboard, strip, and bookmark snippets
- **Restore point** — `RESTORE_POINT_2026-06-06-D-1.3.10.md`, handoff docs in `docs/handoff/`
- **Regression tests** — `scripts/test-dashboard-bounce-scenarios.mjs`, `scripts/test-dashboard-cube-clicks.mjs`

### Live snippet versions
- Header **H 1.4.4** · Strip **S 1.3.34** · Dashboard **D 1.3.10** · Bookmark **B 1.3.4**

### Git commits
- `0387920` D 1.3.9 · `5e000d5`/`7b0fc0b` D 1.3.10 · `9f7fed1` baseline assets

## [2026-01-20] - Conversion Detection & Revenue Metrics Fixes

### Fixed
- **Conversion detection logic** - Overview API now uses identical logic to Stripe metrics
  - Fixed issue where only 1 conversion was detected instead of 2
  - Replicated exact 3-check system from `getConversionsFromSupabase`:
    1. Trial event exists in timeline
    2. Any trial-related event in history
    3. Member created >1 day before annual paid (timing-based)
  - Uses `annualPaidAt` from timeline (not `annualStartDate` from plan)
  - Uses `trialStartAt` from timeline if available
- **Trial → Annual Conversion Rate** - Fixed calculation to use active trials in 30d window
  - Changed from all-time trials to trials active during last 30 days
  - Shows: "Of trials active in the last 30 days, what % converted?"
- **Removed Stripe dependency** from conversion rate calculation
  - Conversion rate now uses only Supabase data (faster, more reliable)
  - Eliminated HTTP 500 errors from accessing `stripeMetrics` before initialization
- **Revenue breakdown** - Accurately separates revenue from conversions vs direct annual signups

### Changed
- **Dashboard tiles reorganization**
  - Moved "AVG EXAM ATTEMPTS", "EXAM ATTEMPTS", "PASS RATE" to Exams tab
  - Moved "AVG MODULES OPENED", "UNIQUE MODULES", "BOOKMARKS ADDED" to Activity tab
  - Changed "ALL PLANS EXPIRING" from 60 days to 7 days
  - Increased version badge size for better readability
- **Conversion rate tooltip** - Updated to explain new calculation method

### Documentation
- Updated `ADMIN_DASHBOARD_README.md` with conversion detection details
- Updated `CHANGELOG.md` with latest fixes
- Updated `QUICK_REFERENCE.md` with recent changes

## [2026-01-16] - Admin Dashboard Enhancements & Security

### Added
- **Sortable columns** to Most Active Members table in admin dashboard
  - All 7 columns are sortable with visual indicators
  - Sort icons: `↕` (unsorted), `↑` (ascending), `↓` (descending)
  - Active sort column highlighted in orange
  - Hover effects on sortable headers
  - Supports sorting by: email, login days (30d/all-time), last login, events, modules, questions

- **Inactivity logout** feature for Academy pages
  - Automatic logout after 30 minutes of inactivity
  - Tracks user activity: clicks, mouse movement, keyboard, scroll, touch, focus
  - Resets timer on page visibility changes
  - Redirects to login with `?reason=timeout` parameter
  - Implemented in `academy-dashboard-squarespace-snippet-v1.html`

- **Member management scripts** in `scripts/` directory
  - `delete-member-by-email.js` - Delete member from Supabase by email
  - `delete-member-memberstack.js` - Delete member from Memberstack by email
  - `cleanup-orphaned-records.js` - Clean up orphaned Supabase records
  - Comprehensive error handling and safety checks
  - See [ADMIN_DASHBOARD_README.md](./ADMIN_DASHBOARD_README.md#member-management-scripts) for full documentation

### Changed
- Updated all documentation files with latest features
- Enhanced `ADMIN_DASHBOARD_README.md` with member management scripts section
- Updated `README.md` with latest features and admin tools reference
- Updated `DEPLOYMENT_SUMMARY.md` with recent changes

### Documentation
- Added comprehensive member management workflow documentation
- Updated file structure documentation to include scripts directory
- Added inactivity logout feature documentation
- Added sortable columns feature documentation

## [2025-09] - v2.2.1 Release

### Fixed
- Master Certificate download now uses Memberstack authentication
- Module Results download now includes complete `details` field
- API endpoint `/api/exams/status` now includes `details` field in response
- Grid refresh after taking exams (full page reload on backToGrid)
- Blank page issue on initial load

### Added
- Page visibility/focus listeners for auto-refresh
- Auto-save functionality after exam submission
- Grid status tracking in debug panel
- Enhanced error handling and validation
- Dashboard auto-refresh improvements

### Changed
- Debug panel hidden by default (Ctrl+Shift+D to show)

## [2025-08] - Admin Dashboard Launch

### Added
- Admin Analytics Dashboard with Next.js
- Event ingestion API endpoint (`/api/academy/event`)
- Admin API routes (KPIs, activity, modules, members, exams)
- Database migration for `academy_events` table
- Event tracking integration guide

## [2025-07] - Memberstack Integration v2.2.0

### Added
- Memberstack authentication for exams
- `module_results_ms` table for Memberstack-linked results
- Migration scripts for legacy exam results
- Memberstack API integration

### Changed
- Migrated from Supabase Auth to Memberstack authentication
- Updated all API endpoints to support Memberstack

---

## Key Features Summary

### Admin Dashboard
- Real-time analytics and KPIs
- Member activity tracking
- Module engagement metrics
- Exam performance analytics
- Sortable data tables
- Member management tools

### Security Features
- Inactivity logout (30-minute timeout)
- Memberstack authentication
- Service role key protection
- Rate limiting on event ingestion

### Member Management
- Scripts for deleting members from Supabase
- Scripts for deleting members from Memberstack
- Orphaned record cleanup utilities
- Comprehensive error handling

### Exam System
- 15 module exams
- Auto-save functionality
- PDF certificate generation
- Progress tracking
- Memberstack integration
