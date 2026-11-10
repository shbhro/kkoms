-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.orders (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.orders enable row level security;
revoke all on table public.orders from anon, public;
grant select, insert, update, delete on table public.orders to authenticated;

drop policy if exists "Owner can read orders" on public.orders;
create policy "Owner can read orders" on public.orders
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists "Owner can add orders" on public.orders;
create policy "Owner can add orders" on public.orders
  for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists "Owner can update orders" on public.orders;
create policy "Owner can update orders" on public.orders
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Owner can delete orders" on public.orders;
create policy "Owner can delete orders" on public.orders
  for delete to authenticated using (auth.uid() = owner_id);
