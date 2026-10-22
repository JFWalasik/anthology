-- Anthology database setup (0.5)
-- Run once in the Supabase SQL editor. Safe to read; it contains no keys,
-- passwords or email addresses. Emails for the allowed list are added
-- separately in the dashboard, so they never end up in this public repository.
--
-- What it creates:
-- 1. Four tables for each person's data: folders, notes, task lists and tasks.
-- 2. Access rules (row level security), so each person can only read and
--    change their own records.
-- 3. Automatic bookkeeping for sync: when the database received each change,
--    and keeping the later change if two devices edit the same record.
-- 4. An allowed list of emails, and a check that turns away sign-ups from
--    anyone not on it.
--
-- Times written by the app (created_at, updated_at, completed_at) are in
-- milliseconds, the way the app keeps them. synced_at is the database's own
-- clock, used to find what changed since a device last checked.

-- ---- 1. Tables ----

create table public.folders (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null default '',
  parent_id   text,                                -- for nested folders later
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted     boolean not null default false,
  synced_at   timestamptz not null default now()
);

create table public.notes (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id   text,
  body        text not null default '',
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted     boolean not null default false,
  synced_at   timestamptz not null default now()
);

create table public.task_lists (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id       text,
  title           text not null default '',
  show_completed  boolean not null default true,
  created_at      bigint not null,
  updated_at      bigint not null,
  deleted         boolean not null default false,
  synced_at       timestamptz not null default now()
);

create table public.tasks (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id       text not null,
  text          text not null default '',
  done          boolean not null default false,
  position      double precision not null default 0,
  created_at    bigint not null,
  completed_at  bigint,
  updated_at    bigint not null,
  deleted       boolean not null default false,
  synced_at     timestamptz not null default now()
);

-- Makes "what changed since I last checked?" quick.
create index folders_user_synced    on public.folders    (user_id, synced_at);
create index notes_user_synced      on public.notes      (user_id, synced_at);
create index task_lists_user_synced on public.task_lists (user_id, synced_at);
create index tasks_user_synced      on public.tasks      (user_id, synced_at);

-- ---- 2. Access rules ----
-- Signed-in people can read and change only rows with their own user_id.
-- People who aren't signed in get nothing at all.

alter table public.folders    enable row level security;
alter table public.notes      enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks      enable row level security;

revoke all on public.folders, public.notes, public.task_lists, public.tasks from anon;

create policy "Own folders"    on public.folders    for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own notes"      on public.notes      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own task lists" on public.task_lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own tasks"      on public.tasks      for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---- 3. Sync bookkeeping ----
-- On every save: stamp synced_at with the database's clock, never let a
-- record change owner, and if the saved version is older than the one
-- already stored (another device saved a later change), keep the stored one.

create or replace function public.sync_bookkeeping()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;  -- older change: skip it, keep what's stored
    end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create trigger folders_sync    before insert or update on public.folders    for each row execute function public.sync_bookkeeping();
create trigger notes_sync      before insert or update on public.notes      for each row execute function public.sync_bookkeeping();
create trigger task_lists_sync before insert or update on public.task_lists for each row execute function public.sync_bookkeeping();
create trigger tasks_sync      before insert or update on public.tasks      for each row execute function public.sync_bookkeeping();

-- ---- 4. Allowed list of emails and the sign-up check ----
-- Only Supabase's sign-in system can read this list; the app cannot.

create table public.allowed_emails (
  email     text primary key check (email = lower(email)),
  added_at  timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;
revoke all on public.allowed_emails from anon, authenticated;

grant usage on schema public to supabase_auth_admin;
grant select on public.allowed_emails to supabase_auth_admin;
create policy "Sign-up check can read" on public.allowed_emails
  for select to supabase_auth_admin using (true);

-- Runs before Supabase creates a new account. Turned on in the dashboard under
-- Authentication, Hooks ("Before User Created").
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  new_email text := lower(event -> 'user' ->> 'email');
begin
  if exists (select 1 from public.allowed_emails a where a.email = new_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This email isn''t on the list for Anthology.'
  ));
end;
$$;

grant execute on function public.hook_before_user_created to supabase_auth_admin;
revoke execute on function public.hook_before_user_created from authenticated, anon, public;
