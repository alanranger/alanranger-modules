-- Migration: academy_plan_events table
-- Purpose: Track trial → annual conversions and churn events
-- Keyed by Memberstack member ID for reliable conversion tracking

create table if not exists public.academy_plan_events (
  id uuid default gen_random_uuid() primary key,
  ms_member_id text not null,
  email text,
  event_type text not null check (event_type in ('trial_started', 'annual_started', 'annual_canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  created_at timestamptz default now() not null
);

-- Index for fast lookups by member ID
create index if not exists academy_plan_events_ms_member_id_idx 
  on public.academy_plan_events(ms_member_id);

-- Index for event type queries
create index if not exists academy_plan_events_event_type_idx 
  on public.academy_plan_events(event_type);

-- Index for date range queries
create index if not exists academy_plan_events_created_at_idx 
  on public.academy_plan_events(created_at);

-- Enable RLS
alter table public.academy_plan_events enable row level security;

-- Policy: Allow service role to manage all events
create policy "Service role can manage all plan events"
  on public.academy_plan_events
  for all
  using (auth.role() = 'service_role');

-- Policy: Allow authenticated users to read their own events (if needed)
create policy "Users can read their own plan events"
  on public.academy_plan_events
  for select
  using (
    auth.uid()::text = ms_member_id 
    or exists (
      select 1 from public.exam_member_links 
      where exam_member_links.memberstack_id = academy_plan_events.ms_member_id
      and exam_member_links.supabase_user_id = auth.uid()
    )
  );

comment on table public.academy_plan_events is 'Tracks Academy plan lifecycle events (trial starts, annual starts, cancellations) for conversion and churn analytics';
comment on column public.academy_plan_events.ms_member_id is 'Memberstack member ID (primary key for linking events)';
comment on column public.academy_plan_events.event_type is 'Type of event: trial_started, annual_started, or annual_canceled';
comment on column public.academy_plan_events.stripe_customer_id is 'Stripe customer ID (for linking to Stripe data)';
comment on column public.academy_plan_events.stripe_subscription_id is 'Stripe subscription ID (for annual events)';
comment on column public.academy_plan_events.stripe_invoice_id is 'Stripe invoice ID (for revenue reconciliation)';
