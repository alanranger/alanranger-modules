-- Supabase Migration: Memberstack Members Cache Table
-- Run this in Supabase SQL Editor
-- Date: 2026-01-02

-- Create ms_members_cache table (stores Memberstack member snapshots)
create table if not exists public.ms_members_cache (
  member_id text primary key,
  email text,
  name text,
  plan_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb
);

-- Indexes for efficient querying
create index if not exists ms_members_cache_email_idx 
  on public.ms_members_cache(email);

create index if not exists ms_members_cache_updated_at_idx 
  on public.ms_members_cache(updated_at desc);

-- Enable RLS (Row Level Security)
alter table public.ms_members_cache enable row level security;

-- Ensure RLS is enabled on existing tables (if not already enabled)
alter table public.exam_member_links enable row level security;
alter table public.module_results_ms enable row level security;
alter table public.academy_events enable row level security;

-- Notes:
-- - No public SELECT policies (admin dashboard uses service role)
-- - Service role key is used server-side for all reads/writes
-- - This table is updated by /api/admin/sync-members endpoint
-- - plan_summary stores: { plan_id, plan_name, status, trial_end, etc. }
-- - raw stores the full Memberstack member object for future-proofing
