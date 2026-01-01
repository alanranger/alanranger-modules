-- Supabase Migration: Add Memberstack-based exam results tables
-- Run this in Supabase SQL Editor
-- Date: 2026-01-01

-- 1) New Memberstack-based results table
create table if not exists module_results_ms (
  id bigserial primary key,
  memberstack_id text not null,
  email text,
  module_id text not null,
  score_percent int not null,
  passed boolean not null,
  attempt int not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_module_results_ms_member_module
  on module_results_ms (memberstack_id, module_id, attempt desc);

-- 2) Link table (Memberstack member -> legacy Supabase user)
create table if not exists exam_member_links (
  memberstack_id text primary key,
  supabase_user_id uuid not null,
  legacy_email text,
  linked_at timestamptz not null default now()
);

create index if not exists idx_exam_member_links_supabase_user
  on exam_member_links (supabase_user_id);

-- Notes:
-- - Keep existing module_results table untouched (legacy continues to work)
-- - New code will read/write module_results_ms for seamless Memberstack users
-- - exam_member_links tracks which Memberstack members have linked legacy Supabase accounts
