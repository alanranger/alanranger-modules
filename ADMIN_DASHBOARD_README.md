# Academy Admin Analytics Dashboard

## Overview

Admin analytics dashboard for the Academy, providing insights into user activity, module engagement, and exam performance. Built with Next.js and Supabase.

## Architecture

### Database
- **academy_events**: Append-only event log table for all Academy activity
- **module_results_ms**: Exam results (existing table)
- **exam_member_links**: Member linking table (existing table)

### API Routes
- `/api/academy/event` - Event ingestion endpoint (POST)
- `/api/admin/kpis` - Dashboard KPI metrics
- `/api/admin/activity` - Activity stream
- `/api/admin/modules` - Module analytics
- `/api/admin/members` - Member analytics
- `/api/admin/exams` - Exam analytics

### Pages
- `/academy/admin` - Overview dashboard
- `/academy/admin/activity` - Activity stream drilldown
- `/academy/admin/modules` - Module analytics drilldown
- `/academy/admin/members` - Member analytics drilldown
- `/academy/admin/exams` - Exam analytics drilldown

## Setup Instructions

### 1. Supabase Migration

Run the SQL migration in Supabase SQL Editor:

```bash
# File: supabase-academy-events-migration.sql
```

This creates:
- `academy_events` table with indexes
- Enables RLS on all tables
- No public policies (service role only)

### 2. Environment Variables

Add to Vercel environment variables:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
AR_ANALYTICS_KEY=your_shared_secret_key  # For event ingestion security
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Development

```bash
npm run dev
```

Visit `http://localhost:3000/academy/admin`

### 5. Event Ingestion

To send events from Squarespace scripts, use:

```javascript
fetch('https://your-domain.vercel.app/api/academy/event', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-ar-analytics-key': 'your_shared_secret_key'
  },
  body: JSON.stringify({
    event_type: 'module_open',
    member_id: 'ms_...',
    email: 'user@example.com',
    path: '/blog-on-photography/...',
    title: 'Module Title',
    category: 'camera',
    meta: {}
  })
});
```

## Security Notes

- Event ingestion requires `x-ar-analytics-key` header
- All admin API routes should add authentication (currently placeholder)
- RLS is enabled but no public policies (service role only)
- Rate limiting on event ingestion (100 req/min per IP)

## Member Management Scripts

Utility scripts for managing member records in both Memberstack and Supabase. Located in the `scripts/` directory.

### Prerequisites

All scripts require environment variables in `.env.local`:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for database operations)
- `MEMBERSTACK_SECRET_KEY` - Memberstack secret key (for Memberstack operations)

### Available Scripts

#### 1. Delete Member from Supabase (`delete-member-by-email.js`)

Deletes a member and all related records from Supabase by email address.

**Usage:**
```bash
node scripts/delete-member-by-email.js <email>
```

**Example:**
```bash
node scripts/delete-member-by-email.js user@example.com
```

**What it deletes:**
- Member record from `ms_members_cache`
- All `academy_events` records for the member
- All `module_results_ms` records (by member_id and email)
- All `academy_plan_events` records
- All `exam_member_links` records

**Features:**
- Case-insensitive email search
- Shows similar emails if exact match not found
- Displays count of related records before deletion
- Comprehensive error handling

#### 2. Delete Member from Memberstack (`delete-member-memberstack.js`)

Finds and deletes a member from Memberstack by email address.

**Usage:**
```bash
node scripts/delete-member-memberstack.js <email>
```

**Example:**
```bash
node scripts/delete-member-memberstack.js user@example.com
```

**What it does:**
- Searches through all Memberstack members to find matching email
- Displays member information (ID, email, name, status, plan connections)
- Permanently deletes the member from Memberstack

**Note:** This action cannot be undone. The member will be permanently removed from Memberstack.

#### 3. Cleanup Orphaned Records (`cleanup-orphaned-records.js`)

Cleans up orphaned records in Supabase for a specific member that has already been deleted from Memberstack.

**Usage:**
```bash
node scripts/cleanup-orphaned-records.js <member_id> [email]
```

**Example:**
```bash
node scripts/cleanup-orphaned-records.js mem_abc123xyz user@example.com
```

**What it cleans up:**
- `academy_events` records
- `module_results_ms` records (by member_id and email)
- `academy_plan_events` records
- `exam_member_links` records
- `ms_members_cache` records
- `academy_qa_questions` records

**Use case:** When a specific member has been deleted from Memberstack but orphaned records remain in Supabase.

#### 4. Find and Cleanup All Orphaned Members (`cleanup-orphaned-members.js`)

Automatically finds and cleans up ALL orphaned member records by comparing Memberstack with Supabase cache.

**Usage:**
```bash
# Identify orphaned records (read-only)
node scripts/cleanup-orphaned-members.js

# Dry run (shows what would be deleted)
node scripts/cleanup-orphaned-members.js --dry-run

# Actually delete orphaned records
node scripts/cleanup-orphaned-members.js --delete
```

**What it does:**
1. Fetches all members from Memberstack
2. Fetches all members from Supabase `ms_members_cache`
3. Identifies orphaned records (in Supabase but not in Memberstack)
4. Optionally deletes orphaned records and all related data

**What it cleans up (for each orphaned member):**
- `ms_members_cache` record
- `academy_events` records
- `module_results_ms` records (by member_id and email)
- `academy_plan_events` records
- `exam_member_links` records
- `academy_qa_questions` records

**Use case:** 
- Regular maintenance to keep Supabase cache in sync with Memberstack
- After bulk member deletions
- When member counts don't match between systems

**Example output:**
```
🔍 Finding orphaned member records...
📥 Fetching members from Memberstack...
✅ Found 47 members in Memberstack
📥 Fetching members from Supabase cache...
✅ Found 49 members in Supabase cache
🔍 Found 2 orphaned member records:
  1. user@example.com
     Member ID: mem_abc123
     Plan Type: none
     Status: CANCELED
```

### Complete Member Deletion Workflow

To completely remove a member from both systems:

1. **First, delete from Memberstack:**
   ```bash
   node scripts/delete-member-memberstack.js user@example.com
   ```
   This will show you the member ID if found.

2. **Then, clean up Supabase records:**
   ```bash
   node scripts/cleanup-orphaned-records.js <member_id> user@example.com
   ```

3. **Alternatively, if member exists in Supabase cache:**
   ```bash
   node scripts/delete-member-by-email.js user@example.com
   ```
   This handles both Supabase deletion and can be followed by Memberstack deletion if needed.

### Regular Maintenance: Cleanup All Orphaned Members

To keep Supabase cache in sync with Memberstack and fix member count discrepancies:

```bash
# First, identify orphaned records
node scripts/cleanup-orphaned-members.js

# Review the list, then delete them
node scripts/cleanup-orphaned-members.js --delete
```

This is useful when:
- Member counts don't match between Memberstack and admin dashboard
- After bulk member deletions
- Regular maintenance to keep systems in sync

### Automated Cleanup (Cron Job)

**Automatic cleanup runs every 8 hours** via Vercel Cron Jobs to:
- Find and delete members without active plans from both Memberstack and Supabase
- Clean up orphaned records (members deleted from Memberstack but still in Supabase)
- Keep member counts synchronized automatically

**Configuration:**
- **Schedule:** Every 8 hours (`0 */8 * * *`)
- **Endpoint:** `/api/admin/cleanup-cron`
- **Config file:** `vercel.json` (cron configuration)

**What it does:**
1. Fetches all members from Memberstack
2. Identifies members without active plans (no plan connections or all plans inactive/canceled)
3. Deletes them from Memberstack
4. Deletes them from Supabase (including all related records: events, module results, plan events, exam links, Q&A questions)
5. Cleans up any orphaned records (members in Supabase but not in Memberstack)

**Manual execution:**
```bash
# Run the cleanup script manually
node scripts/auto-cleanup-no-plan-members.js

# Or trigger the API endpoint
curl https://your-domain.com/api/admin/cleanup-cron
```

**Security:**
- Optional: Set `CRON_SECRET` environment variable in Vercel
- Pass secret via query parameter: `?secret=your-secret` or header: `x-cron-secret: your-secret`
- If `CRON_SECRET` is not set, endpoint is publicly accessible (Vercel cron jobs are authenticated by default)

**Monitoring:**
- Check Vercel Cron Jobs dashboard for execution logs
- API endpoint returns JSON with cleanup results
- Errors are logged to console and included in response

### Important Notes

⚠️ **Warning:** All deletion operations are permanent and cannot be undone. Always verify the member email/ID before running deletion scripts.

- Scripts will show you what will be deleted before proceeding
- Memberstack deletion requires the member to exist in Memberstack
- Supabase deletion requires the member to exist in `ms_members_cache` or you need the member_id
- Orphaned records cleanup is useful when members were deleted from Memberstack but records remain in Supabase

## Styling

Matches Academy Dashboard dark theme:
- Background: `#0b0f14`
- Cards: `#111827`
- Border: `#1f2937`
- Accent: `#E57200` (orange)
- Text: `#f9fafb`

## Recent Features (2026-01-20)

### Conversion Detection & Revenue Metrics
- **Fixed conversion detection logic** - Overview API now uses identical logic to Stripe metrics
- **Trial → Annual Conversion Rate** - Shows conversion rate based on active trials in last 30 days
- **Conversion calculation** - Uses 3-check system:
  1. Trial event exists in timeline
  2. Any trial-related event in history
  3. Member created >1 day before annual paid (timing-based)
- **Revenue breakdown** - Accurately separates revenue from conversions vs direct annual signups
- **No Stripe dependency** - Conversion rate calculation uses only Supabase data (faster, more reliable)

### Dashboard Tiles Reorganization
- **Exams tab** - Moved "AVG EXAM ATTEMPTS", "EXAM ATTEMPTS", and "PASS RATE" tiles to top
- **Activity tab** - Moved "AVG MODULES OPENED", "UNIQUE MODULES", and "BOOKMARKS ADDED" tiles to top
- **Plans Expiring** - Changed from 60 days to 7 days window
- **Version badge** - Increased size for better readability

### Sortable Tables (2026-01-16)
- **Most Active Members table** now has sortable columns with visual indicators
- All columns are sortable: Member, Login Days (30d), Login Days (All-time), Last Login, Events, Modules, Questions
- Click column headers to sort ascending/descending
- Sort icons: `↕` (unsorted), `↑` (ascending), `↓` (descending)
- Active sort column highlighted in orange
- Hover effects on sortable headers

### Inactivity Logout (2026-01-16)
- Automatic logout after 30 minutes of inactivity on Academy pages
- Tracks user activity: clicks, mouse movement, keyboard, scroll, touch, focus
- Resets timer on page visibility changes
- Redirects to login page with `?reason=timeout` parameter
- Implemented in `academy-dashboard-squarespace-snippet-v1.html`

## Next Steps

1. Add authentication to admin routes (e.g., session-based auth)
2. Add time series charts (consider Chart.js or Recharts)
3. Add CSV export functionality
4. Add date range picker for custom periods
5. Add pagination for large datasets
6. Add sortable columns to other admin tables (Modules, Activity, etc.)

## File Structure

```
alanranger-academy-assesment/
├── api/
│   ├── academy/
│   │   └── event.js          # Event ingestion
│   └── admin/
│       ├── kpis.js           # Dashboard KPIs
│       ├── activity.js       # Activity stream
│       ├── modules.js        # Module analytics
│       ├── modules/[path].js # Module details
│       ├── members.js        # Member analytics
│       ├── members/[memberId].js # Member details
│       ├── exams.js          # Exam results
│       └── exams/stats.js    # Exam statistics
├── pages/
│   ├── _app.js               # Next.js app wrapper
│   └── academy/
│       └── admin/
│           ├── index.js     # Overview dashboard
│           ├── activity.js  # Activity page
│           ├── modules.js   # Modules page
│           ├── members.js   # Members page
│           └── exams.js     # Exams page
├── scripts/
│   ├── delete-member-by-email.js      # Delete member from Supabase
│   ├── delete-member-memberstack.js  # Delete member from Memberstack
│   ├── cleanup-orphaned-records.js   # Clean up orphaned Supabase records (single member)
│   ├── cleanup-orphaned-members.js  # Find and cleanup all orphaned members
│   ├── find-member-discrepancy.js   # Compare Memberstack CSV with Supabase
│   └── populate-example-questions.js # Populate example Q&A questions
├── styles/
│   └── admin-globals.css    # Global styles
├── supabase-academy-events-migration.sql
└── package.json
```
