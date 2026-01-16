# Changelog - Academy Assessment System

All notable changes to this project will be documented in this file.

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
