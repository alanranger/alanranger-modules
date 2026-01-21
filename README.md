# Alan Ranger Photography Academy — Assessments

## Overview
Exam and certification system for the Alan Ranger Photography Academy. Students can take module exams, track progress, and download certificates.

## Features
- **15 Module Exams**: Covering core camera settings (Exposure, Aperture, Shutter Speed, ISO, etc.)
- **Progress Tracking**: Real-time progress tracking with pass/fail status
- **Auto-save**: Exam results automatically saved to Memberstack-linked accounts
- **Certificates**: Download PDF certificates for passed modules and master certification
  - Master Certificate: Complete certification for all passed modules
  - Module Results: Detailed transcript with all exam attempts and scores
- **Dashboard Integration**: Progress displayed on academy dashboard
- **Memberstack Authentication**: Secure authentication via Memberstack

## Files

### Squarespace Code Blocks
- **`squarespace-v2.2.html`** - Exams & Certification page code block
  - Main exam interface with grid view and quiz functionality
  - Includes debug panel (hidden by default, press Ctrl+Shift+D to show)
  - Auto-refreshes grid when navigating back to page
  - Auto-saves exam results after submission

- **`academy-dashboard-squarespace-snippet-v1.html`** - Dashboard page code block
  - Displays exam progress summary on academy dashboard
  - Auto-refreshes every 30 seconds and on page visibility change
  - **Inactivity logout** - Automatically logs out users after 30 minutes of inactivity
  - Tracks user activity (clicks, mouse, keyboard, scroll, touch, focus) to reset timer

- **`academy-bookmark-buttons-squarespace-snippet-v1.html`** - Bookmark buttons for blog/article pages
  - Adds "Bookmark this page", "Back to Modules", and "Back to Dashboard" buttons
  - Appears on blog posts with the "Sign up to free online photography course" snippet
  - Auto-positions after first H1 or at top of main content
  - Saves bookmarks to Memberstack (max 20 per account)
  - See [docs/bookmark-buttons-integration.md](./docs/bookmark-buttons-integration.md) for details

### API Endpoints
Located in `api/exams/`:
- **`whoami.js`** - Get Memberstack member identity
- **`status.js`** - Get latest exam status for a module (includes `details` field)
- **`save.js`** - Save exam results
- **`migrate.js`** - Migrate legacy exam results to Memberstack-linked table
- **`_cors.js`** - CORS configuration

All endpoints support:
- Memberstack authentication (cookie-based or `X-Memberstack-Id` header)
- CORS from `https://www.alanranger.com`
- Enhanced error logging

## Database
- **`module_results_ms`** - Memberstack-linked exam results table
  - Fields: `memberstack_id`, `email`, `module_id`, `score_percent`, `passed`, `attempt`, `details`, `created_at`

## Deployment

### Vercel
API endpoints are deployed to Vercel at: `https://alanranger-modules.vercel.app`

### Squarespace
1. Copy contents of `squarespace-v2.2.html` to Exams & Certification page code block
2. Copy contents of `academy-dashboard-squarespace-snippet-v1.html` to Dashboard page code block

## Recent Updates

### v2.2.1 (2025-09)
- ✅ Fixed Master Certificate download (now uses Memberstack authentication)
- ✅ Fixed Module Results download (now includes complete details field)
- ✅ Updated API endpoint `/api/exams/status` to include `details` field in response
- ✅ Fixed grid refresh after taking exams (full page reload on backToGrid)
- ✅ Added page visibility/focus listeners for auto-refresh
- ✅ Improved error handling and logging
- ✅ Added grid status to debug panel
- ✅ Fixed blank page issue on initial load
- ✅ Auto-save functionality after exam submission
- ✅ Debug panel hidden by default (Ctrl+Shift+D to show)

### Latest Updates (2026-01-20)
- ✅ **Conversion detection fixed** - Overview API now uses identical logic to Stripe metrics, correctly finding all 2 conversions
- ✅ **Conversion rate calculation** - Fixed to use active trials in 30d window instead of all-time trials
- ✅ **Removed Stripe dependency** - Conversion rate now uses only Supabase data (faster, more reliable)
- ✅ **Dashboard tiles reorganized** - Moved exam/activity tiles to appropriate tabs
- ✅ **Revenue breakdown** - Accurately separates revenue from conversions vs direct annual signups

### Previous Updates (2026-01-16)
- ✅ **Sortable columns** added to Most Active Members table in admin dashboard
- ✅ **Inactivity logout** - Automatic logout after 30 minutes of inactivity on Academy pages
- ✅ **Member management scripts** - Utilities for deleting members from Supabase and Memberstack
- ✅ **Enhanced documentation** - Updated all MD files with latest features and workflows

## Debug Panel
The debug panel is hidden by default. Press **Ctrl+Shift+D** (or Cmd+Shift+D on Mac) to toggle visibility. The panel shows:
- Memberstack authentication status
- API calls and responses
- Grid rendering status
- Error messages
- Cookie information

## Admin Tools

### Member Management Scripts

Utility scripts for managing member records are available in the `scripts/` directory. See [ADMIN_DASHBOARD_README.md](./ADMIN_DASHBOARD_README.md#member-management-scripts) for detailed documentation.

**Quick reference:**
- `scripts/delete-member-by-email.js` - Delete member from Supabase by email
- `scripts/delete-member-memberstack.js` - Delete member from Memberstack by email
- `scripts/cleanup-orphaned-records.js` - Clean up orphaned Supabase records

## Quick Reference

For AI agents and developers, see [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for:
- Key features and locations
- Common tasks and commands
- Recent changes summary
- Documentation file guide

## Support
For issues or questions, check the debug panel for diagnostic information.