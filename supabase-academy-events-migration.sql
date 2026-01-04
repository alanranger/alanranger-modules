-- Supabase Migration: Academy Events Table for Admin Analytics
-- Run this in Supabase SQL Editor
-- Date: 2026-01-02

-- Create academy_events table (append-only event log)
create table if not exists public.academy_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  member_id text,
  email text,
  path text,
  title text,
  category text,
  session_id text,
  meta jsonb not null default '{}'::jsonb
);

-- Indexes for efficient querying
create index if not exists academy_events_created_at_idx
  on public.academy_events (created_at desc);

create index if not exists academy_events_type_created_idx
  on public.academy_events (event_type, created_at desc);

create index if not exists academy_events_member_created_idx
  on public.academy_events (member_id, created_at desc);

create index if not exists academy_events_path_created_idx
  on public.academy_events (path, created_at desc);

create index if not exists academy_events_category_created_idx
  on public.academy_events (category, created_at desc) where category is not null;

-- Enable RLS (Row Level Security)
alter table public.academy_events enable row level security;

-- Enable RLS on existing tables (if not already enabled)
alter table public.exam_member_links enable row level security;
alter table public.module_results_ms enable row level security;

-- Notes:
-- - No public SELECT policies (admin dashboard uses service role)
-- - Events are append-only (no UPDATE/DELETE needed)
-- - Service role key is used server-side for all reads/writes
-- - If member-level reads are needed later, add narrow policies then
