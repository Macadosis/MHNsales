-- MHN Sales — Supabase schema
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  company text not null default '',
  contact text default '',
  phone text default '',
  email text default '',
  industry text default '',
  tool text default '',
  value numeric not null default 10000,
  owner text default '',
  stage text not null default 'prospects',
  implementation_days integer,
  committed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notes jsonb not null default '[]'::jsonb
);

create index if not exists deals_stage_idx on public.deals (stage);
create index if not exists deals_owner_idx on public.deals (owner);

alter table public.deals enable row level security;

-- Personal multi-device tool: allow anon key full access.
-- Keep the GitHub repo private if you use this policy.
drop policy if exists "Allow all access for personal use" on public.deals;
create policy "Allow all access for personal use"
  on public.deals
  for all
  using (true)
  with check (true);

-- Realtime so other devices refresh automatically
do $$
begin
  alter publication supabase_realtime add table public.deals;
exception
  when duplicate_object then null;
end $$;
