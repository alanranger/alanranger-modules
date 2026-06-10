-- Migration: academy_plan_events table
-- Purpose: Track trial → annual conversions and churn events
-- Keyed by Memberstack member ID for reliable conversion tracking

create table if not exists public.academy_plan_events (
  id uuid default gen_random_uuid() primary key,
  ms_member_id text not null,
  email text,
  event_type text not null, -- Stripe webhook event type (e.g., checkout.session.completed, customer.subscription.created)
  stripe_event_id text, -- Stripe webhook event ID (for idempotency)
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  ms_app_id text, -- Memberstack app ID from metadata
  ms_plan_id text, -- Memberstack plan ID from metadata
  ms_price_id text, -- Memberstack price ID from metadata
  payload jsonb, -- Full Stripe webhook event payload (for debugging)
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

-- Unique constraint on stripe_event_id for idempotency
create unique index if not exists academy_plan_events_stripe_event_id_idx 
  on public.academy_plan_events(stripe_event_id)
  where stripe_event_id is not null;

-- Index for ms_app_id lookups
create index if not exists academy_plan_events_ms_app_id_idx 
  on public.academy_plan_events(ms_app_id)
  where ms_app_id is not null;

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
comment on column public.academy_plan_events.event_type is 'Stripe webhook event type (e.g., checkout.session.completed, customer.subscription.created). Can be mapped to trial_started/annual_started/annual_canceled in queries.';
comment on column public.academy_plan_events.stripe_event_id is 'Stripe webhook event ID (for idempotency)';
comment on column public.academy_plan_events.ms_app_id is 'Memberstack app ID from metadata';
comment on column public.academy_plan_events.ms_plan_id is 'Memberstack plan ID from metadata';
comment on column public.academy_plan_events.ms_price_id is 'Memberstack price ID from metadata';
comment on column public.academy_plan_events.payload is 'Full Stripe webhook event payload (JSONB for debugging)';
comment on column public.academy_plan_events.stripe_customer_id is 'Stripe customer ID (for linking to Stripe data)';
comment on column public.academy_plan_events.stripe_subscription_id is 'Stripe subscription ID (for annual events)';
comment on column public.academy_plan_events.stripe_invoice_id is 'Stripe invoice ID (for revenue reconciliation)';
