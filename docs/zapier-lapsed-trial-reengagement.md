# Zapier — Lapsed Trial Re-engagement (REWIND20)

This Zap fires the `lapsed-trial-reengagement-webhook` every Friday morning. The
webhook does all the work itself — queries Supabase, sends the email, stamps
the trial row, enforces the per-attempt pacing and max-send cap. Zapier is
just the clock.

**Campaign rules** (hardcoded in the webhook for safety — not Zapier-tunable):

| Rule | Value |
|------|-------|
| Reach back | 180 days (trials that expired in the last 6 months) |
| Attempt 1 | day 20 post-expiry (SAVE20 grace ends at day 7, so no overlap) |
| Attempt 2 | day 30 post-expiry (AND >=10 days after attempt 1) |
| Attempt 3 | day 60 post-expiry (AND >=30 days after attempt 2) |
| Personal coupon window (REWIND20) | 7 days from send |
| Max sends per member | 3 |
| Annual price | £79 |
| Discount | £20 off first year → £59 |
| Unsubscribe link | Included in every email, one-click opt-out |
| Vercel function timeout | 60s (configured in `vercel.json`) |
| In-function time budget | 55s — defers overflow to the next Zap run |

The webhook is self-pacing: it looks at `reengagement_send_count` and
`reengagement_last_sent_at` on every `academy_trial_history` row and only
emails members whose attempt is due. If Zapier fires more often than weekly
nothing bad happens — members just won't match the next gate until the day
threshold is reached.

---

## Prerequisites (do these ONCE before creating the Zap)

### 1. Apply the Supabase migration

Open the Supabase SQL Editor for the project that hosts `academy_trial_history`
and run the contents of:

```
supabase-reengagement-migration.sql
```

This adds the `reengagement_*` tracking columns to `academy_trial_history`.
Safe to re-run — everything uses `IF NOT EXISTS`.

### 2. Create the REWIND20 coupon + promotion code in Stripe

Hit the diagnose endpoint to see the current state, then hit it again with
`mode=ensure` to create the coupon and promotion code if they're missing:

```
# What does Stripe currently have?
https://alanranger-modules.vercel.app/api/admin/diagnose-rewind20?secret=<CRON_SECRET>

# Create coupon (£20 off, once) + REWIND20 promotion code if missing (idempotent)
https://alanranger-modules.vercel.app/api/admin/diagnose-rewind20?secret=<CRON_SECRET>&mode=ensure
```

Expected final state: `readyForAutoApply: true` with an active `REWIND20`
promotion code pointing at the `rewind20-lapsed-trial-winback` coupon.

### 3. (Optional) Dry-run the webhook before wiring the Zap

```
# Preview candidates without sending emails:
https://alanranger-modules.vercel.app/api/admin/lapsed-trial-reengagement-webhook?secret=<ORPHANED_WEBHOOK_SECRET>&sendEmail=false

# Preview a single test member (respects sendEmail=false for dry-run):
https://alanranger-modules.vercel.app/api/admin/lapsed-trial-reengagement-webhook?secret=<ORPHANED_WEBHOOK_SECRET>&testEmail=marketing@alanranger.com&sendEmail=false
```

Response includes `candidates_found`, `candidates_eligible` and (when
`sendEmail=false`) a dry-run preview of each email that would have been sent.

---

## Creating the Zap

Open Zapier → Create Zap. Two steps only.

### Step 1 — Trigger: Schedule by Zapier

- **Trigger event:** Every Week
- **Day of Week:** Friday
- **Time of Day:** 09:00 (Europe/London — check the Zap timezone)
- **Skip weekends:** N/A (Friday is picked explicitly)

### Step 2 — Action: Webhooks by Zapier → Custom Request

- **Method:** `GET`
- **URL:**

  ```
  https://alanranger-modules.vercel.app/api/admin/lapsed-trial-reengagement-webhook
  ```

- **Query String Params:**

  | Key | Value | Notes |
  |-----|-------|-------|
  | `secret` | *(paste ORPHANED_WEBHOOK_SECRET)* | Same secret used by trial-expiry-reminder-webhook |
  | `sendEmail` | `true` | Set to `false` for dry-run weeks |
  | `limit` | `500` | Hard cap on emails per run (safety) |

- **Headers:** *(none required)*
- **Data Pass-Through?:** No
- **Unflatten:** Yes (default)
- **Basic Auth:** *(leave blank)*

### Step 3 — (Optional but recommended) Email Alert

Add a **third** Zap step to email yourself (`info@alanranger.com`) a summary of
what just went out so you can spot anomalies:

- **Action:** Email by Zapier → Send Outbound Email
- **To:** `info@alanranger.com`
- **Subject:** `[Academy] Lapsed-trial weekly run — {{step2.candidates_eligible}} emails sent`
- **Body:**

  ```
  Candidates found:    {{step2.candidates_found}}
  Eligible to email:   {{step2.candidates_eligible}}
  Emails sent:         {{step2.emails_sent}}
  Emails failed:       {{step2.emails_failed}}
  Timestamp:           {{step2.timestamp}}

  Window:
    Reach back:         {{step2.window__reach_back_days}} days
    Attempt 1 at:       {{step2.window__first_attempt_min_days_since_expiry}} days post-expiry
    Attempt gaps (days): {{step2.window__attempt_gap_days}}
    Max sends/member:   {{step2.window__max_sends_per_member}}
    Deferred to next run: {{step2.emails_deferred}}
    Timed out mid-run?:  {{step2.time_budget_exhausted}}
  ```

---

## What members actually experience

1. **Monday morning:** Webhook runs, sends email(s).
2. **Member opens email:** Sees the "£20 off for 7 days" offer with the
   updated feature list (Applied Learning, RPS pathway, Pro toolkit, etc.) and
   the "what Academy members have gone on to do" social-proof paragraph.
3. **Member clicks "log in":** Lands on `/academy/dashboard`.
4. **Dashboard loads:** `trial-status` endpoint returns `couponCode: "REWIND20"`
   and the dashboard enters locked-expired mode. The upgrade modal pops up
   **non-dismissibly** (same lock as SAVE20 expired members) showing £79 → £59.
5. **Member clicks "Upgrade to Academy Annual":** `create-upgrade-checkout`
   looks at the trial row again, sees `reengagement_expires_at > now()`, and
   auto-applies the `REWIND20` promotion code at Stripe Checkout.
6. **Stripe completes payment:** Subscription metadata carries the Memberstack
   plan ids; Memberstack auto-attaches the annual plan; Supabase writes
   `converted_at`; all three systems stay in sync (same flow as SAVE20).
7. **Member doesn't click email:** Nothing happens until the next attempt is
   due (attempt 2 at day 30 post-expiry / >=10 days after attempt 1; attempt 3
   at day 60 post-expiry / >=30 days after attempt 2), capped at 3 sends total
   and always within the 180-day reach-back window.
8. **Member clicks unsubscribe in footer:** `reengagement_opted_out = true`
   in Supabase; they never receive another re-engagement email. Their trial
   history and account are otherwise untouched.

---

## Troubleshooting

### "candidates_found is 0" every week

Likely causes, in order of likelihood:

1. No one has lapsed 8+ days ago and <180 days ago — that's fine, it means
   the system is caught up.
2. The Supabase migration wasn't applied — run
   `supabase-reengagement-migration.sql` in the SQL Editor.
3. `SUPABASE_SERVICE_ROLE_KEY` is wrong in the Vercel env — check the logs.

### "candidates_found > 0 but emails_sent is 0"

Check `emails_failed` and look at the Vercel function logs. Most common cause:
`ORPHANED_EMAIL_FROM` / `ORPHANED_EMAIL_PASSWORD` not configured in the
`alanranger-modules` Vercel project. Same creds the trial-expiry-reminder
webhook uses.

### A member is complaining they received an email they shouldn't have

1. Verify they match the rules: `trial_end_at` within the last 180 days,
   `converted_at IS NULL`, `reengagement_opted_out = false`, and they haven't
   already had 3 emails from this campaign.
2. If all true — that's expected behaviour. Use their unsubscribe link to opt
   them out, or set `reengagement_opted_out = true` manually in Supabase.

### I need to pause the whole campaign

Disable the Zap in Zapier (toggle off). The webhook stays deployed and can be
resumed at any time without data loss.

### I need to re-send to someone who already got all 3 emails

This is intentionally hard to do by accident. To re-open the campaign for a
single member, in Supabase:

```sql
UPDATE academy_trial_history
SET reengagement_send_count = 0,
    reengagement_last_sent_at = NULL,
    reengagement_opted_out = false
WHERE member_id = '<mem_...>';
```

Next Monday's run will pick them up again (assuming they still match the
time-window rules).

---

## Related endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/lapsed-trial-reengagement-webhook` | The main webhook — this is what Zapier calls |
| `GET /api/academy/reengagement-unsubscribe?token=…` | One-click unsubscribe link in every email |
| `GET /api/admin/diagnose-rewind20?mode=ensure` | Create / verify the Stripe REWIND20 coupon |
| `GET /api/academy/trial-status?memberId=…` | Tells the dashboard which coupon (if any) applies — powers the modal copy |
| `POST /api/stripe/create-upgrade-checkout` | Applies REWIND20 (or SAVE20) at Stripe Checkout |

---

## Environment variables used

These are already configured in the `alanranger-modules` Vercel project for
the trial-expiry-reminder-webhook — nothing new needs setting up.

| Var | Purpose |
|-----|---------|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key for server-side queries |
| `ORPHANED_WEBHOOK_SECRET` | Shared secret for Zapier → webhook auth |
| `ORPHANED_EMAIL_FROM` / `EMAIL_FROM` | Nodemailer sender address |
| `ORPHANED_EMAIL_PASSWORD` / `EMAIL_PASSWORD` | Nodemailer sender password |
| `EMAIL_SMTP_HOST` / `EMAIL_SMTP_PORT` | SMTP settings (default: Gmail:587) |
| `STRIPE_SECRET_KEY` | Used by `diagnose-rewind20` and `create-upgrade-checkout` |
| `CRON_SECRET` | Used by `diagnose-rewind20` |
| `ACADEMY_UPGRADE_URL` | Defaults to `https://www.alanranger.com/academy/dashboard` |
| `ACADEMY_API_BASE_URL` | Defaults to `https://alanranger-modules.vercel.app` — used to build unsubscribe links |
