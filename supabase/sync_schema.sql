-- MHN Sales — sync production schema to match the app
--
-- IMPORTANT:
--   Pushing to GitHub only deploys the website (HTML/JS/CSS).
--   It does NOT change your Supabase database.
--   Run this file manually in: Supabase Dashboard → SQL Editor → Run
--
-- Safe to re-run (uses IF NOT EXISTS / idempotent policies).

create extension if not exists "pgcrypto";

-- Base table (no-op if it already exists)
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

-- Columns added after the original launch (safe if already present)
alter table public.deals
  add column if not exists contact text default '';

alter table public.deals
  add column if not exists phone text default '';

alter table public.deals
  add column if not exists email text default '';

alter table public.deals
  add column if not exists industry text default '';

alter table public.deals
  add column if not exists tool text default '';

alter table public.deals
  add column if not exists owner text default '';

alter table public.deals
  add column if not exists implementation_days integer;

alter table public.deals
  add column if not exists committed_at timestamptz;

alter table public.deals
  add column if not exists dismissed_at timestamptz;

alter table public.deals
  add column if not exists notes jsonb not null default '[]'::jsonb;

alter table public.deals
  add column if not exists board_order double precision;

alter table public.deals
  add column if not exists tasks jsonb not null default '[]'::jsonb;

-- Optimistic concurrency: each successful write increments version
alter table public.deals
  add column if not exists version bigint not null default 1;

-- Indexes
create index if not exists deals_stage_idx on public.deals (stage);
create index if not exists deals_owner_idx on public.deals (owner);
create index if not exists deals_board_order_idx on public.deals (stage, board_order);

-- RLS
alter table public.deals enable row level security;

drop policy if exists "Allow all access for personal use" on public.deals;
drop policy if exists "Authenticated users full access" on public.deals;
create policy "Authenticated users full access"
  on public.deals
  for all
  to authenticated
  using (true)
  with check (true);

-- Realtime
do $$
begin
  alter publication supabase_realtime add table public.deals;
exception
  when duplicate_object then null;
end $$;

-- Optional: inspect what columns production actually has after running this.
-- Uncomment and run separately if you want a checklist:
--
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'deals'
-- order by ordinal_position;
