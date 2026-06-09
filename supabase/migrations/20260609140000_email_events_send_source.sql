-- Track automated vs manual batch vs corrected resend for admin email dashboard truth.
ALTER TABLE public.academy_email_events
  ADD COLUMN IF NOT EXISTS send_source text NOT NULL DEFAULT 'automated';

COMMENT ON COLUMN public.academy_email_events.send_source IS
  'automated | manual_batch | corrected_resend | test — how the send was triggered';

ALTER TABLE public.academy_email_events DROP CONSTRAINT IF EXISTS academy_email_events_send_source_chk;

ALTER TABLE public.academy_email_events ADD CONSTRAINT academy_email_events_send_source_chk CHECK (
  send_source = ANY (ARRAY['automated', 'manual_batch', 'corrected_resend', 'test']::text[])
);

CREATE INDEX IF NOT EXISTS idx_academy_email_events_send_source
  ON public.academy_email_events (send_source, sent_at DESC)
  WHERE dry_run = false AND status = 'sent';

-- Tag the 2026-06-09 stale-runner day-plus-30 batch (manual batch, broken links).
UPDATE public.academy_email_events
SET send_source = 'manual_batch'
WHERE send_source = 'automated'
  AND stage_key = 'day-plus-30'
  AND status = 'sent'
  AND dry_run = false
  AND sent_at >= '2026-06-09T12:00:00+00'
  AND sent_at < '2026-06-09T13:30:00+00';

UPDATE public.academy_email_events
SET send_source = 'corrected_resend'
WHERE send_source = 'automated'
  AND event_detail = 'corrected_resend_2026-06-09';
