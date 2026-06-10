# Quick Reference Guide - Academy Assessment System

**Last Updated:** 2026-06-08

This guide provides quick reference for AI agents and developers working on the Academy Assessment System.

## 🎯 Key Features

### Admin Dashboard
- **Location**: `/academy/admin` (Next.js app)
- **Features**:
  - Real-time KPIs and analytics
  - **"Logged In Right Now" tile** - Real-time count of active members (Members Directory page)
    - Shows count of members with activity in last 30 minutes
    - Clickable to filter members table
    - Auto-refreshes every 1 minute
  - Sortable data tables (Most Active Members)
  - Member activity tracking
  - Module engagement metrics
  - Exam performance analytics
- **Sortable Columns**: Click any column header in Most Active Members table to sort
- **Deployment**: Vercel (auto-deploys from GitHub)

### Security Features
- **Inactivity Logout**: 30-minute timeout on Academy pages
  - Implemented in: `academy-dashboard-squarespace-snippet-v1.html`
  - Tracks: clicks, mouse, keyboard, scroll, touch, focus
  - Redirects to: `/academy/login?reason=timeout`

### Member Management
- **Scripts Location**: `scripts/` directory
- **Available Scripts**:
  1. `delete-member-by-email.js` - Delete from Supabase
  2. `delete-member-memberstack.js` - Delete from Memberstack
  3. `cleanup-orphaned-records.js` - Clean up orphaned records
- **Usage**: See [ADMIN_DASHBOARD_README.md](./ADMIN_DASHBOARD_README.md#member-management-scripts)

## 📁 Key Files & Locations

### Admin Dashboard
- **Pages**: `pages/academy/admin/`
  - `index.js` - Overview dashboard (includes sortable TopMembersList)
  - `activity.js` - Activity stream
  - `members/index.js` - Member analytics (includes "Logged In Right Now" tile)
  - `modules.js` - Module analytics
  - `exams.js` - Exam analytics
- **API Routes**: `api/admin/`
  - `overview.js` - Dashboard KPIs
  - `members.js` - Member data (supports `active_now` filter)
  - `members-active-now.js` - Count of members logged in right now
  - `top-members.js` - Most active members (used by sortable table)
- **Styles**: `styles/admin-globals.css`

### Squarespace Snippets (live baseline 2026-06-08)

| Snippet | Version | Location |
|---------|---------|----------|
| `academy-foundation-page-squarespace-snippet-v1.html` | **FP 1.0.43** | Modules Map page — build from `scripts/build-foundation-page-snippet.mjs` |
| `academy-header-elements-squarespace-snippet-v1.html` | **H 1.4.33** | Code Injection → Header |
| `academy-do-next-strip-squarespace-snippet-v1.html` | **S 1.3.56** | Dashboard code block 1 |
| `academy-dashboard-squarespace-snippet-v1.html` | **D 1.3.27** | Dashboard code block 2 |
| `academy-bookmark-buttons-squarespace-snippet-v1.html` | **B 1.3.16** | Blog/article template |
| `academy-login-squarespace-snippet-v1.html` | — | Login page |

Handover: `docs/handoff/CURSOR-AGENT-HANDOVER.md`, `docs/handoff/FOUNDATION-PAGE-HANDOVER-LATEST.md`

### Database Tables
- `ms_members_cache` - Member cache from Memberstack
- `academy_events` - Event log for analytics
- `module_results_ms` - Exam results
- `academy_plan_events` - Plan lifecycle events
- `academy_qa_questions` - Q&A questions

## 🔧 Common Tasks

### Delete a Member
```bash
# From Memberstack
node scripts/delete-member-memberstack.js user@example.com

# From Supabase
node scripts/delete-member-by-email.js user@example.com

# Clean up orphaned records
node scripts/cleanup-orphaned-records.js mem_abc123 user@example.com
```

### Environment Variables
Required in `.env.local`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MEMBERSTACK_SECRET_KEY`
- `AR_ANALYTICS_KEY` (for event ingestion)

### Deployment
- **Platform**: Vercel
- **Auto-deploy**: Yes (on push to main branch)
- **Manual deploy**: `vercel deploy`
- **Restore points**: Created as git tags (e.g., `restore-point-2026-01-16-195220`)

## 📊 Admin Dashboard Features

### Sortable Tables
- **Most Active Members** table supports sorting
- Click column headers to sort
- Icons indicate sort state: `↕` (unsorted), `↑` (ascending), `↓` (descending)
- Active sort highlighted in orange

### Member Management
- View member details at `/academy/admin/members`
- **"Logged In Right Now" tile** - Click to filter table to active members
- Filter by plan type, status, last seen, active_now
- Search by email or name
- Sort by various metrics

## 🔐 Security

### Inactivity Logout
- **Timeout**: 30 minutes
- **Implementation**: Client-side JavaScript in dashboard snippet
- **Activity tracking**: Multiple event types (click, mousemove, keydown, scroll, touchstart, focus)
- **Reset triggers**: Any user activity or page visibility change

### Authentication
- **Admin routes**: Email-based access (see `api/admin/_auth.js`)
- **Event ingestion**: Requires `x-ar-analytics-key` header
- **Database**: Service role key for server operations only

## 📚 Documentation Files

- **README.md** - Main project overview
- **ADMIN_DASHBOARD_README.md** - Admin dashboard documentation
- **DEPLOYMENT_SUMMARY.md** - Deployment guide
- **CHANGELOG.md** - Version history
- **QUICK_REFERENCE.md** - This file
- **IMPLEMENTATION_NOTES.md** - Technical implementation details
- **EVENT_TRACKING_INTEGRATION.md** - Event tracking guide
- **NEXT_STEPS.md** - Future enhancements

## 🚀 Recent Changes (2026-01-22)

1. **"Logged In Right Now" feature** - Real-time count of active members on Members Directory
   - Shows count of members with activity in last 30 minutes
   - Clickable tile filters members table
   - Auto-refreshes every 1 minute
   - API endpoint: `/api/admin/members-active-now`

## Previous Changes (2026-01-20)

1. **Conversion detection fixed** - Now correctly finds all conversions (2 instead of 1)
2. **Conversion rate calculation** - Uses active trials in 30d window (not all-time)
3. **Removed Stripe dependency** from conversion rate (uses only Supabase, faster)
4. **Dashboard tiles reorganized** - Moved tiles to appropriate tabs
5. **Revenue breakdown** - Accurately separates conversions vs direct annual

## Previous Changes (2026-01-16)

1. **Sortable columns** added to Most Active Members table
2. **Inactivity logout** implemented (30-minute timeout)
3. **Member management scripts** created
4. **Documentation** updated across all MD files

## 💡 Tips for AI Agents

- Always check `CHANGELOG.md` for recent changes
- Member management scripts are in `scripts/` directory
- Admin dashboard uses Next.js (pages in `pages/academy/admin/`)
- Squarespace snippets are in root directory
- Database operations use Supabase service role key
- Memberstack operations use Memberstack secret key
- All scripts require `.env.local` with proper credentials

## 🔗 Related Repositories

- **Academy Dashboard**: This repository
- **Modules**: `alanranger-modules` (GitHub Pages)
- **Chat AI Bot**: Separate repository for chat functionality

## 📞 Support

For issues:
1. Check relevant documentation file
2. Review `CHANGELOG.md` for recent changes
3. Check admin dashboard debug logs
4. Review Vercel function logs for API issues
