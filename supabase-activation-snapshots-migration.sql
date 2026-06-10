-- supabase-activation-snapshots-migration.sql
-- Frozen activation metric snapshots + change log for pre/post intervention tracking.
-- Run once in Supabase SQL Editor (project dqrtcsvqsfgbqmnonkpt). Safe to re-run.

create table if not exists public.activation_metric_snapshots (
  id uuid default gen_random_uuid() primary key,
  snapshot_date date not null,
  snapshot_at timestamptz not null default now(),
  period text not null check (period in ('7d', '30d', '90d', 'all')),
  metric_key text not null check (
    metric_key in (
      'week1_modules_ge3',
      'week1_logins_ge5',
      'week2_active',
      'cohort_conversion'
    )
  ),
  numerator integer not null default 0,
  denominator integer not null default 0,
  pct numeric(6, 1) not null default 0,
  target_pct numeric(6, 1) not null default 0,
  cohort_definition jsonb not null default '{}'::jsonb,
  notes text null,
  created_at timestamptz not null default now()
);

create unique index if not exists activation_metric_snapshots_unique_key
  on public.activation_metric_snapshots (snapshot_date, period, metric_key);

create index if not exists activation_metric_snapshots_date_idx
  on public.activation_metric_snapshots (snapshot_date desc);

create index if not exists activation_metric_snapshots_period_metric_idx
  on public.activation_metric_snapshots (period, metric_key, snapshot_date desc);

comment on table public.activation_metric_snapshots is
  'Dated activation metric snapshots (one row per metric per period per snapshot date).';

create table if not exists public.activation_change_log (
  id uuid default gen_random_uuid() primary key,
  change_date date not null,
  title text not null,
  description text not null,
  commit_ref text null,
  category text not null check (category in ('on-site', 'email', 'config', 'other')),
  created_at timestamptz not null default now()
);

create index if not exists activation_change_log_change_date_idx
  on public.activation_change_log (change_date desc);

comment on table public.activation_change_log is
  'Timeline of shipped activation interventions for attribution against metric snapshots.';

-- Admin-only tables: accessed via service role from Vercel cron/API only.
-- RLS intentionally disabled (consistent with academy_trial_history and other admin tables).
