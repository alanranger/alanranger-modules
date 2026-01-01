# Alan Ranger Photography Academy — Assessments

## Overview
Exam and certification system for the Alan Ranger Photography Academy. Students can take module exams, track progress, and download certificates.

## Features
- **15 Module Exams**: Covering core camera settings (Exposure, Aperture, Shutter Speed, ISO, etc.)
- **Progress Tracking**: Real-time progress tracking with pass/fail status
- **Auto-save**: Exam results automatically saved to Memberstack-linked accounts
- **Certificates**: Download PDF certificates for passed modules and master certification
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

### API Endpoints
Located in `api/exams/`:
- **`whoami.js`** - Get Memberstack member identity
- **`status.js`** - Get latest exam status for a module
- **`save.js`** - Save exam results
- **`migrate.js`** - Migrate legacy exam results to Memberstack-linked table
- **`_cors.js`** - CORS configuration

## Database
- **`module_results_ms`** - Memberstack-linked exam results table
  - Fields: `memberstack_id`, `email`, `module_id`, `score_percent`, `passed`, `attempt`, `details`, `created_at`

## Deployment

### Vercel
API endpoints are deployed to Vercel at: `https://alanranger-modules.vercel.app`

### Squarespace
1. Copy contents of `squarespace-v2.2.html` to Exams & Certification page code block
2. Copy contents of `academy-dashboard-squarespace-snippet-v1.html` to Dashboard page code block

## Recent Updates (v2.2)
- Fixed grid refresh after taking exams
- Added page visibility/focus listeners for auto-refresh
- Improved error handling and logging
- Added grid status to debug panel
- Fixed blank page issue on initial load
- Auto-save functionality after exam submission
- Debug panel hidden by default (Ctrl+Shift+D to show)

## Debug Panel
The debug panel is hidden by default. Press **Ctrl+Shift+D** (or Cmd+Shift+D on Mac) to toggle visibility. The panel shows:
- Memberstack authentication status
- API calls and responses
- Grid rendering status
- Error messages
- Cookie information

## Support
For issues or questions, check the debug panel for diagnostic information.