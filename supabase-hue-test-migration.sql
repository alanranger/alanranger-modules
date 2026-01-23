-- Hue Test results table
create extension if not exists pgcrypto;

create table if not exists academy_hue_test_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id text,
  total_score int not null,
  row_scores jsonb not null,
  band_errors jsonb not null,
  row_orders jsonb not null,
  source text not null default 'public',
  user_agent text
);

create index if not exists academy_hue_test_results_member_created_idx
  on academy_hue_test_results (member_id, created_at desc);
