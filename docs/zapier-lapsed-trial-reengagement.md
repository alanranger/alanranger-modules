# Lapsed Trial Re-engagement (REWIND20)

> **Clock (updated Oct 2026):** Vercel Cron drives this — **not Zapier**.
> Schedules in `vercel.json`: `0 8 * * *` and `0 9 * * *` UTC on
> `/api/admin/lapsed-trial-reengagement-webhook?sendEmail=true`, with an
> in-function London 09:00 gate (same pattern as other Academy lifecycle crons).
> The June “Zapier is just the clock” setup is retired; keep this file as the
> campaign-rules reference only.

Webhook: `api/admin/lapsed-trial-reengagement-webhook.js`.
It queries Supabase, sends via `sendLifecycleMail` → `lifecycleSmtpIdentity()`
(From `hello@news.alanranger.com`, SMTP login `info@`, BCC `info@`), stamps
the trial row, and enforces per-attempt pacing + max-send cap.

**Campaign rules** (hardcoded in the webhook):

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
| Vercel function timeout | 300s (`vercel.json`) |

Stages in `lib/emailStages.js`: `day-plus-20` / `day-plus-30` / `day-plus-60`
(`sentBy: lapsed-trial-reengagement-webhook`). Day +90 uses
`triggered-email-webhook` instead.

The webhook is self-pacing: it looks at `reengagement_send_count` and
`reengagement_last_sent_at` on every `academy_trial_history` row and only
emails members whose attempt is due.

---

## Prerequisites (do these ONCE)

### 1. Apply the Supabase migration

Open the Supabase SQL Editor and run:

```
supabase-reengagement-migration.sql
```

Adds `reengagement_*` columns on `academy_trial_history`. Safe to re-run.

### 2. Create the REWIND20 coupon + promotion code in Stripe

```
# What does Stripe currently have?
https://alanranger-modules.vercel.app/api/admin/diagnose-rewind20?secret=<ORPHANED_WEBHOOK_SECRET>

# Create coupon (£20 off, once) + REWIND20 promotion code if missing (idempotent)
https://alanranger-modules.vercel.app/api/admin/diagnose-rewind20?secret=<ORPHANED_WEBHOOK_SECRET>&mode=ensure
```

Expected: `readyForAutoApply: true` with an active `REWIND20` promotion code.

### 3. SMTP identity (Vercel Production)

| Env | Value |
|-----|--------|
| `ORPHANED_EMAIL_FROM` | `hello@news.alanranger.com` |
| `ORPHANED_EMAIL_SMTP_USER` | `info@alanranger.com` |
| `ORPHANED_EMAIL_PASSWORD` | info@ app password |

---

## Manual / admin test

```
/api/admin/lapsed-trial-reengagement-webhook?sendEmail=true&testEmail=info@alanranger.com&secret=<ORPHANED_WEBHOOK_SECRET>
```

Member must exist in `ms_members_cache` **and** have an `academy_trial_history` row.
Admin UI → Emails tab uses the same webhook via `lib/emailStages.js` `testSend`.

---

## Related

- Unsubscribe: `/api/academy/reengagement-unsubscribe`
- Signed upgrade links: `lib/reengage-link.js`
- Trial SAVE20 path (separate): `api/admin/trial-expiry-reminder-webhook.js`
