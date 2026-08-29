-- Forward-only marketing attribution for Academy trials (?src= on landing).
-- Applied live 2026-08-29 via Supabase MCP; kept here for repo history.

ALTER TABLE public.academy_trial_history
  ADD COLUMN IF NOT EXISTS signup_source text;

COMMENT ON COLUMN public.academy_trial_history.signup_source IS
  'Marketing acquisition tag from ?src= on landing (youtube, google, newsletter, …). Null = not captured. Separate from source (stripe_webhook vs backfill). Tracking from 2026-08-29 onward.';

CREATE TABLE IF NOT EXISTS public.academy_signup_attribution (
  member_id text PRIMARY KEY,
  signup_source text NOT NULL,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_path text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS academy_trial_history_signup_source_idx
  ON public.academy_trial_history (signup_source)
  WHERE signup_source IS NOT NULL;
