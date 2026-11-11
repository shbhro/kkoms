-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.orders (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);

create index if not exists orders_owner_id_idx on public.orders (owner_id);

alter table public.orders enable row level security;
revoke all on table public.orders from anon, public;
grant select, insert, update, delete on table public.orders to authenticated;

drop policy if exists "Owner can read orders" on public.orders;
create policy "Owner can read orders" on public.orders
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "Owner can add orders" on public.orders;
create policy "Owner can add orders" on public.orders
  for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "Owner can update orders" on public.orders;
create policy "Owner can update orders" on public.orders
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "Owner can delete orders" on public.orders;
create policy "Owner can delete orders" on public.orders
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Optional: instant sync across devices (Supabase Realtime). Safe to re-run; without it the app falls back to polling.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- Closes public sign-ups (applied to the live project). To add a user: drop this trigger, create the user, re-run this block.
create or replace function public.block_new_signups() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Sign-ups are closed.';
end $$;
revoke all on function public.block_new_signups() from public, anon, authenticated;
drop trigger if exists block_new_signups on auth.users;
create trigger block_new_signups before insert on auth.users for each row execute function public.block_new_signups();
