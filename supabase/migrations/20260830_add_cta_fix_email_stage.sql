-- Allow one-off corrected upgrade-link emails in academy_email_events.
alter table public.academy_email_events
  drop constraint if exists academy_email_events_stage_chk;

alter table public.academy_email_events
  add constraint academy_email_events_stage_chk
  check (stage_key = any (array[
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
    'paid-renewal-soon',
    'cta-fix'
  ]));
