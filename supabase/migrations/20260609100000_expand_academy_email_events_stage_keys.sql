-- Expand academy_email_events stage_key check for lifecycle ladder stages.
ALTER TABLE public.academy_email_events DROP CONSTRAINT IF EXISTS academy_email_events_stage_chk;

ALTER TABLE public.academy_email_events ADD CONSTRAINT academy_email_events_stage_chk CHECK (
  stage_key = ANY (ARRAY[
    'trial-welcome-nudge',
    'trial-progress-nudge',
    'trial-stalled',
    'day-minus-7',
    'day-minus-1',
    'day-plus-7',
    'day-plus-20',
    'day-plus-30',
    'day-plus-60',
    'day-plus-90',
    'paid-quiet',
    'paid-quiet-45',
    'paid-quiet-60',
    'paid-quiet-90',
    'paid-badge-earned',
    'paid-milestone',
    'paid-renewal-soon'
  ]::text[])
);
