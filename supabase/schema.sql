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

alter table public.deals
  add column if not exists board_order double precision;

create index if not exists deals_stage_idx on public.deals (stage);
create index if not exists deals_owner_idx on public.deals (owner);
create index if not exists deals_board_order_idx on public.deals (stage, board_order);

alter table public.deals enable row level security;

-- Require a signed-in user (email/password Auth). Replace the old open policy.
drop policy if exists "Allow all access for personal use" on public.deals;
drop policy if exists "Authenticated users full access" on public.deals;
create policy "Authenticated users full access"
  on public.deals
  for all
  to authenticated
  using (true)
  with check (true);

-- Auth setup (Dashboard, not SQL):
-- 1) Authentication → Providers → Email → Enable
-- 2) For a small team: disable "Confirm email" so signup can sign in immediately
-- 3) Authentication → URL Configuration → add your GitHub Pages URL to Redirect URLs

-- Realtime so other devices refresh automatically
do $$
begin
  alter publication supabase_realtime add table public.deals;
exception
  when duplicate_object then null;
end $$;
