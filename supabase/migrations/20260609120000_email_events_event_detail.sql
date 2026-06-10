-- Per-badge and per-renewal-cycle dedup for paid lifecycle emails.
ALTER TABLE public.academy_email_events ADD COLUMN IF NOT EXISTS event_detail text;

COMMENT ON COLUMN public.academy_email_events.event_detail IS
  'Badge key or renewal period-end ISO for per-event dedup on paid lifecycle emails';

CREATE INDEX IF NOT EXISTS idx_academy_email_events_event_detail
  ON public.academy_email_events (member_id, stage_key, event_detail)
  WHERE event_detail IS NOT NULL;
