-- supabase-reengagement-migration.sql
-- Adds win-back (REWIND20) tracking columns to academy_trial_history.
--
-- Purpose:
--   The lapsed-trial-reengagement-webhook (Zapier weekly) emails members whose
--   trial expired between 8 and 180 days ago and who never converted. We need to
--   track (a) that an email was sent, (b) when the per-member 7-day coupon
--   window closes, (c) how many attempts we've made, and (d) whether the
--   member opted out of this re-engagement sequence.
--
-- Safety:
--   - All columns default to NULL / 0 / false so existing rows behave as
--     "never contacted, not opted out" — same behaviour as before the migration.
--   - The unsubscribe token is GENERATED randomly once per row when populated
--     from the webhook so unsubscribe links cannot be guessed.
--
-- Run once in the Supabase SQL Editor against the project that hosts
-- academy_trial_history. Subsequent re-runs are safe (IF NOT EXISTS).

ALTER TABLE academy_trial_history
  ADD COLUMN IF NOT EXISTS reengagement_sent_at        TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reengagement_expires_at     TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reengagement_send_count     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reengagement_last_sent_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reengagement_opted_out      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reengagement_opted_out_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reengagement_unsub_token    TEXT        NULL;

-- Unique index on the unsubscribe token so the public unsubscribe endpoint can
-- look up the row in a single indexed query (token is opaque random, 32+ chars).
CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_trial_history_reengagement_unsub_token
  ON academy_trial_history (reengagement_unsub_token)
  WHERE reengagement_unsub_token IS NOT NULL;

-- Partial index to make the "who should we email this week?" query fast.
-- Matches the webhook filter: lapsed 8–180 days ago, never converted,
-- not opted out, either never contacted or last contacted 90+ days ago.
CREATE INDEX IF NOT EXISTS idx_academy_trial_history_reengagement_candidates
  ON academy_trial_history (trial_end_at, reengagement_last_sent_at, reengagement_opted_out, converted_at)
  WHERE converted_at IS NULL AND reengagement_opted_out = false;

COMMENT ON COLUMN academy_trial_history.reengagement_sent_at IS
  'When the FIRST REWIND20 re-engagement email was sent (never reset).';
COMMENT ON COLUMN academy_trial_history.reengagement_expires_at IS
  'When the current REWIND20 personal coupon window closes (reengagement_last_sent_at + 7d).';
COMMENT ON COLUMN academy_trial_history.reengagement_send_count IS
  'Number of REWIND20 emails sent. Capped at 3 by the webhook.';
COMMENT ON COLUMN academy_trial_history.reengagement_last_sent_at IS
  'Most recent REWIND20 email send timestamp. Used to gate 3-month cooldown + 7-day coupon window.';
COMMENT ON COLUMN academy_trial_history.reengagement_opted_out IS
  'True when the member used the unsubscribe link in any REWIND20 email.';
COMMENT ON COLUMN academy_trial_history.reengagement_opted_out_at IS
  'When the member clicked the unsubscribe link.';
COMMENT ON COLUMN academy_trial_history.reengagement_unsub_token IS
  'Random opaque token embedded in the unsubscribe link (unique, nullable until first send).';
