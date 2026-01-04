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

## Styling

Matches Academy Dashboard dark theme:
- Background: `#0b0f14`
- Cards: `#111827`
- Border: `#1f2937`
- Accent: `#E57200` (orange)
- Text: `#f9fafb`

## Next Steps

1. Add authentication to admin routes (e.g., session-based auth)
2. Add time series charts (consider Chart.js or Recharts)
3. Add CSV export functionality
4. Add date range picker for custom periods
5. Add pagination for large datasets

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
├── styles/
│   └── admin-globals.css    # Global styles
├── supabase-academy-events-migration.sql
└── package.json
```
