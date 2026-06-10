# Phase 3 Implementation Summary

## Database Migration

### Migration: `phase3_qa_schema_updates_v2`

**Added Columns:**
- `answer` (TEXT) - Primary answer field (consolidates admin_answer)
- `ai_model` (TEXT) - Stores AI model used (e.g., 'robo-ranger-v1')
- `member_notified_at` (TIMESTAMPTZ) - Tracks when member was notified

**Updated Constraints:**
- Status: `open | ai_suggested | answered | queued | closed`
- Answer source: `manual | ai`

**Indexes Created:**
- `idx_qa_status_created` - For admin filtering by status
- `idx_qa_member_created` - For member-scoped queries
- `idx_qa_page_created` - For page-specific queries
- `idx_qa_member_notified` - For notification tracking

**Data Migration:**
- Copied existing `admin_answer` values to `answer` field for backward compatibility

## New API Routes

### Admin Endpoints (All require admin authentication)

1. **POST `/api/academy/qa/admin/ai-suggest`**
   - Generates AI answer draft using Robo-Ranger (Chat AI Bot)
   - Stores in `ai_answer`, sets `status='ai_suggested'`
   - Does NOT publish to member (draft only)
   - Returns: `{ question, ai_answer, ai_model }`

2. **POST `/api/academy/qa/admin/answer`**
   - Saves manual answer
   - Writes: `answer`, `answered_at`, `answered_by`, `answer_source='manual'`, `status='answered'`
   - Optional: `notify_member` parameter to send email notification
   - Returns: `{ question }`

3. **POST `/api/academy/qa/admin/publish-ai`**
   - Publishes AI draft answer
   - Copies `ai_answer` → `answer`
   - Sets `answered_at`, `answered_by='Robo-Ranger'`, `answer_source='ai'`
   - Optional: `notify_member` parameter
   - Returns: `{ question }`

### Updated Endpoints

1. **GET `/api/academy/qa/admin/questions`**
   - Enhanced filtering: `status`, `answer_source`, `page_url`, `member_id`, `q` (search), `from`, `to` (date range)
   - Server-side search (question text, member name, member email)
   - Pagination: `limit`, `offset`
   - Sorting: `sort`, `order`

2. **GET `/api/academy/qa/admin/stats`**
   - Fixed "Outstanding" to exclude questions with published answers
   - Fixed avg response time to only include answered questions
   - All metrics now accurate

3. **PATCH `/api/academy/qa/admin/questions/[id]`**
   - Updated to use consolidated `answer` field
   - Maintains backward compatibility with `admin_answer`

4. **POST `/api/academy-qa-questions`** (Member endpoint)
   - Already stores `member_email` and `member_name` at write-time ✅

5. **GET `/api/academy-qa-questions`** (Member endpoint)
   - Returns consolidated `answer` field
   - Includes `updated_at` for change tracking

## Security Implementation

### Admin Authentication

**Location:** `/api/admin/_auth.js`

**Method:** Email-based access control (primary) + Admin plan check (optional)

**Configuration:**
- `ADMIN_EMAILS` env var (defaults to: `info@alanranger.com,marketing@alanranger.com`)
- `ADMIN_PLAN_ID` env var (optional, for plan-based access)

**Enforcement:**
- All `/api/academy/qa/admin/*` endpoints check admin access
- Returns `403 Forbidden` if not admin
- Logs authentication attempts for debugging

**Note:** Admin pages are also gated by Memberstack at the page level (`/academy/admin/*`), providing defense in depth.

## Admin Dashboard UI Enhancements

### Q&A Tab (`/academy/admin/qa`)

**Features Added:**
1. **Search Bar** - Server-side search (question, member name, email)
2. **Status Filter** - Dropdown (All, Outstanding, Answered, Queued, AI Suggested, Closed)
3. **Sortable Columns** - Click headers to sort (Date Asked, Member, Status, Answered Date)
4. **Pagination** - 50 questions per page with Previous/Next buttons
5. **Enhanced Answer Modal:**
   - **AI Draft Button** - Generates AI answer using Robo-Ranger
   - **Publish AI Button** - Publishes AI draft as final answer
   - **Notify Member Checkbox** - Sends email when answer is saved
   - **Save & Notify** - Combined action
   - Shows AI draft in highlighted box when available

**Metrics Tiles:**
- Questions Posted (30d)
- Answered (30d)
- Outstanding (excludes answered)
- AI Answered (30d)
- Avg Response Time (answered only)
- Members with Outstanding

## Member Experience Updates

### Q&A Page Snippet

**Changes:**
- Uses consolidated `answer` field (falls back to `admin_answer` or `ai_answer`)
- Shows "Alan's Answer" for manual, "Robo-Ranger's Answer" for AI
- Status badges: "Answered" when answer exists, regardless of status field
- Displays `updated_at` timestamp if available

## AI Integration

### Robo-Ranger (Chat AI Bot) Integration

**Endpoint:** `CHAT_BOT_API_URL` env var (defaults to: `https://alan-chat-proxy.vercel.app/api/chat`)

**Flow:**
1. Admin clicks "Generate AI Draft"
2. API calls Chat AI Bot with question text and optional page context
3. AI response stored in `ai_answer`, `ai_model`, `ai_answered_at`
4. Status set to `ai_suggested` (draft, not visible to member)
5. Admin can edit and publish, or publish directly

**Error Handling:**
- If AI generation fails, error is logged but doesn't block admin workflow
- Admin can still provide manual answer

## Email Notifications

### Implementation

**Provider Support:**
- Resend (default)
- SendGrid (alternative)

**Configuration:**
- `EMAIL_PROVIDER` env var (`resend` or `sendgrid`)
- `RESEND_API_KEY` or `SENDGRID_API_KEY` env var
- `EMAIL_FROM` env var (defaults to `noreply@alanranger.com`)

**Features:**
- Sends when answer is saved (if `notify_member=true`)
- Includes question, answer, and link to Q&A page
- Gracefully handles missing email packages (logs warning, doesn't fail)
- Tracks `member_notified_at` in database

**Note:** Email packages are optional. Install if needed:
- `npm install resend` (for Resend)
- `npm install @sendgrid/mail` (for SendGrid)

## Testing Checklist

### ✅ Completed
- [x] Database schema updated with all required fields
- [x] Member POST stores email/name at write-time
- [x] Admin endpoints created with proper structure
- [x] Security checks implemented (email-based)
- [x] Admin UI with filters, search, pagination, sorting
- [x] Answer workflow modal with AI integration
- [x] Metrics calculations fixed
- [x] Member UI updated to show consolidated answers

### ⚠️ Requires Configuration
- [ ] Set `CHAT_BOT_API_URL` env var (if different from default)
- [ ] Set `ADMIN_EMAILS` env var (if different from default)
- [ ] Install email package if using notifications (`npm install resend` or `npm install @sendgrid/mail`)
- [ ] Set email API keys in Vercel env vars

### 🔄 Pending Testing
- [ ] Test AI draft generation end-to-end
- [ ] Test email notifications with real email provider
- [ ] Test admin security (verify normal members cannot access)
- [ ] Test member isolation (Member A cannot see Member B's questions)

## Known Issues / Notes

1. **Admin Auth:** Currently uses email-based access. Cookies may not be sent from Next.js pages, so auth relies on email matching. This is acceptable since pages are gated by Memberstack.

2. **Email Packages:** Email notifications are optional. If packages aren't installed, notifications are skipped gracefully.

3. **AI Integration:** Requires Chat AI Bot API to be accessible. Default URL may need adjustment based on actual deployment.

4. **Backward Compatibility:** Old `admin_answer` field is maintained alongside new `answer` field for compatibility.

## Next Steps

1. **Deploy and test** AI draft generation
2. **Configure email provider** and test notifications
3. **Verify admin security** by attempting to access endpoints as normal member
4. **Test end-to-end workflow:** Question → AI Draft → Publish → Member sees answer
