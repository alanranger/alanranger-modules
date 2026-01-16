# Next Steps - Academy Admin Dashboard

## ✅ Completed

- [x] Database migration applied (`academy_events` table created)
- [x] Event ingestion API endpoint created (`/api/academy/event`)
- [x] Admin dashboard pages created (Next.js)
- [x] Admin API routes created (KPIs, activity, modules, members, exams)
- [x] Environment variables set in Vercel (`AR_ANALYTICS_KEY`)
- [x] **Sortable columns** added to Most Active Members table (2026-01-16)
- [x] **Inactivity logout** implemented for Academy pages (2026-01-16)
- [x] **Member management scripts** created for Supabase and Memberstack (2026-01-16)
- [x] **Documentation** updated across all MD files (2026-01-16)

## 🚀 Deployment Steps

### 1. Deploy to Vercel

If not already deployed:

```bash
cd "G:\Dropbox\alan ranger photography\Website Code\Academy\alanranger-academy-assesment"
vercel deploy
```

Or push to GitHub and let Vercel auto-deploy.

### 2. Verify Environment Variables

Check in Vercel Dashboard → Settings → Environment Variables:
- ✅ `SUPABASE_URL` (already set)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (already set)
- ✅ `MEMBERSTACK_SECRET_KEY` (already set)
- ✅ `AR_ANALYTICS_KEY` (just added)

### 3. Test the Admin Dashboard

1. Visit: `https://your-domain.vercel.app/academy/admin`
2. You should see the dashboard with KPI tiles
3. Click through to drilldown pages (Activity, Modules, Members, Exams)

### 4. Test Event Ingestion

Test the event endpoint (replace with your domain and key):

```bash
curl -X POST https://your-domain.vercel.app/api/academy/event \
  -H "Content-Type: application/json" \
  -H "x-ar-analytics-key: your_ar_analytics_key" \
  -d '{
    "event_type": "module_open",
    "member_id": "ms_test_123",
    "email": "test@example.com",
    "path": "/blog-on-photography/what-is-exposure-in-photography",
    "title": "What is Exposure in Photography",
    "category": "camera"
  }'
```

Then check `/academy/admin/activity` to see the event.

### 5. Integrate Event Tracking

Add event tracking to your Squarespace scripts:

1. Copy `academy-event-tracker-snippet.js` helper functions
2. Add to your module tracking script (see `EVENT_TRACKING_INTEGRATION.md`)
3. Call `trackModuleOpen()` when modules are opened
4. Call `trackBookmarkAdd()` / `trackBookmarkRemove()` for bookmarks
5. Call `trackExamStart()` / `trackExamSubmit()` for exams

**Important**: Update `ACADEMY_EVENT_API_URL` in the snippet with your Vercel domain.

### 6. Security Note

For client-side tracking, you have two options:

**Option A: Server-side proxy (Recommended)**
- Create a proxy endpoint that adds the `x-ar-analytics-key` header server-side
- Client calls your proxy, proxy calls the event API
- Keeps the analytics key secret

**Option B: Public key (Less secure)**
- Use a separate public key for client-side
- Add validation in the API endpoint
- Still rate-limited, but key is exposed

## 📊 Using the Dashboard

### Overview Page
- `/academy/admin` - KPI tiles, top modules, top members

### Drilldown Pages
- `/academy/admin/activity` - All events with filters
- `/academy/admin/modules` - Module analytics by path
- `/academy/admin/members` - Member activity and engagement
- `/academy/admin/exams` - Exam results and pass rates

### Features
- Filter by time period (24h, 7d, 30d, 90d)
- Filter by category, event type, member, path
- CSV export for activity data
- Click rows for detailed views

## 🔍 Monitoring

Check Vercel logs for:
- Event ingestion errors
- API endpoint performance
- Rate limiting triggers

Check Supabase for:
- Event count growth
- Query performance
- Index usage

## 🎯 Next Enhancements (Optional)

1. **Charts**: Add time series charts using Chart.js or Recharts
2. **Authentication**: Add admin authentication to dashboard routes
3. **Real-time**: Add real-time event streaming
4. **Alerts**: Set up alerts for unusual activity
5. **Export**: Add more export formats (JSON, Excel)

## 📝 Files Created

- `supabase-academy-events-migration.sql` - Database migration
- `api/academy/event.js` - Event ingestion endpoint
- `api/admin/*` - Admin API routes
- `pages/academy/admin/*` - Admin dashboard pages
- `styles/admin-globals.css` - Dashboard styles
- `academy-event-tracker-snippet.js` - Client-side tracking helper
- `EVENT_TRACKING_INTEGRATION.md` - Integration guide
- `ADMIN_DASHBOARD_README.md` - Full documentation

## 🆘 Troubleshooting

**Dashboard shows no data:**
- Check if events are being sent
- Verify Supabase connection in Vercel logs
- Check database has events: `SELECT COUNT(*) FROM academy_events;`

**Event ingestion fails:**
- Verify `AR_ANALYTICS_KEY` matches in Vercel
- Check CORS headers if calling from browser
- Verify event_type is in allowed list

**API routes return 500:**
- Check Vercel function logs
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Check Supabase project is active
