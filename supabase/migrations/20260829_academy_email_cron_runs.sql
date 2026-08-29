-- Cron heartbeat so a zero-send stage is visible (auth fail / no run ≠ nobody eligible).
create table if not exists public.academy_email_cron_runs (
  id uuid primary key default gen_random_uuid(),
  stage_key text not null,
  run_at timestamptz not null default now(),
  webhook text not null,
  trigger_source text not null,
  auth_ok boolean not null,
  members_evaluated integer,
  sent integer default 0,
  skipped_not_eligible integer default 0,
  failed integer default 0,
  error text
);
create index if not exists academy_email_cron_runs_stage_run_idx
  on public.academy_email_cron_runs (stage_key, run_at desc);
alter table public.academy_email_cron_runs enable row level security;

alter table public.academy_email_events
  add column if not exists delivery_status text default 'accepted_by_smtp';
