-- Phase 1a: editable email templates + schedules
-- Applied to Supabase via MCP apply_migration on 2026-04-20.
-- Recorded here for version control and rollback reference.
--
-- Templates store the editable markdown-lite body and subject; webhooks fall
-- back to inline code when body_md is NULL so this migration is safe to apply
-- before Phase 1b (read path) lands. Schedules drive the hourly dispatcher
-- cron in Phase 1c: which stage fires, on which day-of-week, at which London
-- hour, with which days_offset relative to trial_end_at.

CREATE TABLE IF NOT EXISTS public.academy_email_templates (
  stage_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  subject TEXT,
  preheader TEXT,
  body_md TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

COMMENT ON TABLE public.academy_email_templates IS
  'Editable email template store for academy trial/rewind campaigns. NULL body_md means fall back to inline code defaults in the webhook.';
COMMENT ON COLUMN public.academy_email_templates.body_md IS
  'Markdown-lite body with {{merge_tag}} placeholders. See docs for supported tags.';

CREATE TABLE IF NOT EXISTS public.academy_email_schedules (
  stage_key TEXT PRIMARY KEY REFERENCES public.academy_email_templates(stage_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  days_offset INT NOT NULL,
  send_hour_london INT NOT NULL DEFAULT 9 CHECK (send_hour_london BETWEEN 0 AND 23),
  send_days TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri','sat','sun'],
  stage_type TEXT NOT NULL CHECK (stage_type IN ('trial_reminder','rewind')),
  webhook_path TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

COMMENT ON TABLE public.academy_email_schedules IS
  'Schedule configuration for each email stage, read by the hourly dispatcher cron (Phase 1c).';
COMMENT ON COLUMN public.academy_email_schedules.days_offset IS
  'Days from trial_end_at. +7 = seven days before expiry (Day -7 reminder), -7 = seven days after expiry (Day +7 SAVE20), etc. Sign matches the original cron labels.';

-- Seed rows. Subject/body_md stays NULL - Phase 1b fallback keeps current behavior.
INSERT INTO public.academy_email_templates (stage_key, label, notes) VALUES
  ('day-minus-7',  'Day -7 - Mid-trial check-in',    'Fires 7 days before trial_end_at. Activity summary + 7-day plan.'),
  ('day-minus-1',  'Day -1 - Final-day reminder',    'Fires the day before trial_end_at. Quick wins + members-only list.'),
  ('day-plus-7',   'Day +7 - SAVE20 recovery',       'Fires 7 days after trial_end_at. SAVE20 coupon, 7-day window.'),
  ('day-plus-20',  'Day +20 - REWIND20 attempt 1',   'First REWIND20 win-back - 20+ days lapsed.'),
  ('day-plus-30',  'Day +30 - REWIND20 attempt 2',   'Second REWIND20, 10+ days after attempt 1.'),
  ('day-plus-60',  'Day +60 - REWIND20 attempt 3',   'Final REWIND20, 30+ days after attempt 2.')
ON CONFLICT (stage_key) DO NOTHING;

INSERT INTO public.academy_email_schedules
  (stage_key, enabled, days_offset, send_hour_london, stage_type, webhook_path)
VALUES
  ('day-minus-7',  TRUE,   7, 9, 'trial_reminder', '/api/admin/trial-expiry-reminder-webhook'),
  ('day-minus-1',  TRUE,   1, 9, 'trial_reminder', '/api/admin/trial-expiry-reminder-webhook'),
  ('day-plus-7',   TRUE,  -7, 9, 'trial_reminder', '/api/admin/trial-expiry-reminder-webhook'),
  ('day-plus-20',  TRUE, -20, 9, 'rewind',         '/api/admin/lapsed-trial-reengagement-webhook'),
  ('day-plus-30',  TRUE, -30, 9, 'rewind',         '/api/admin/lapsed-trial-reengagement-webhook'),
  ('day-plus-60',  TRUE, -60, 9, 'rewind',         '/api/admin/lapsed-trial-reengagement-webhook')
ON CONFLICT (stage_key) DO NOTHING;
