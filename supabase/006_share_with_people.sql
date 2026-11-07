-- Anthology: sharing with specific people (1.2)
-- Run once in the Supabase SQL editor, after 005_delete_everywhere.sql. It
-- contains no keys, passwords or email addresses.
--
-- What it does, in plain terms:
-- 1. A "people" table: each person's email and, once they set one, their
--    name, so messages can say "Deleted by Oscar". People can see only
--    themselves and the people they share with.
-- 2. A "shares" table: which note or task list is shared with which person.
--    For now each item can be shared with one other person.
-- 3. A "changed_by" column on folders, notes, task lists and tasks, filled in
--    by the database with whoever made the latest change.
-- 4. New access rules: each person reaches their own things, plus notes and
--    task lists shared with them (and the tasks in those lists).
-- 5. Protections kept by the database itself: only an item's owner can move
--    it, pin it, delete it or erase it for good. The other person can change
--    its text and tasks. Only owners can remove rows from the database.
-- 6. Functions the app calls to share, stop sharing, set your name, and so on.
--
-- Safe for the app as it is (1.1.2): until something is shared, everyone
-- reaches exactly what they reach now, and the app ignores the new column.
-- Anything already stored is left as it is.

-- ---- 1. People ----

create table public.people (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  name        text not null default '' check (length(name) <= 60),
  updated_at  timestamptz not null default now()
);

alter table public.people enable row level security;
revoke all on public.people from anon;
revoke insert, update, delete on public.people from authenticated;

-- Everyone already signed up gets a row, with their email and no name yet.
insert into public.people (id, email)
select u.id, lower(u.email) from auth.users u where u.email is not null
on conflict (id) do nothing;

-- ---- 2. Shares ----
-- One row per item per person it's shared with. Ending a share keeps the row,
-- marked ended, so the other person's app can tell them and offer to keep a
-- copy. owner_seen and person_seen record whether each side has seen that.

create table public.shares (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  person_id      uuid not null references auth.users (id) on delete cascade,
  item_kind      text not null check (item_kind in ('note', 'task_list')),
  item_id        text not null,
  active         boolean not null default true,
  ended_by       uuid references auth.users (id) on delete set null,
  ended_reason   text check (ended_reason in ('stopped', 'left', 'closed')),
  ended_at       timestamptz,
  owner_seen     boolean not null default true,
  person_seen    boolean not null default true,
  person_pinned  boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (person_id, item_kind, item_id),
  check (owner_id <> person_id)
);

create index shares_item on public.shares (item_kind, item_id);
create index shares_owner on public.shares (owner_id);

alter table public.shares enable row level security;
revoke all on public.shares from anon;
revoke insert, update, delete on public.shares from authenticated;

create policy "Shares you're part of" on public.shares for select to authenticated
  using (owner_id = (select auth.uid()) or person_id = (select auth.uid()));

-- You can see the people you share with, either way round, and yourself.
create policy "You and people you share with" on public.people for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.shares s
      where (s.owner_id = (select auth.uid()) and s.person_id = people.id)
         or (s.person_id = (select auth.uid()) and s.owner_id = people.id)
    )
  );

-- ---- 3. Who changed it last ----

alter table public.folders    add column if not exists changed_by uuid;
alter table public.notes      add column if not exists changed_by uuid;
alter table public.task_lists add column if not exists changed_by uuid;
alter table public.tasks      add column if not exists changed_by uuid;

-- ---- 4. Access rules ----
-- Helpers used by the rules below. "security definer" lets them look at
-- shares and task lists directly; each answers only a yes or no about the
-- person asking.

-- Is this note or task list shared with me right now?
create or replace function public.shared_with_me(kind text, item text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.shares s
    where s.item_kind = kind and s.item_id = item and s.active
      and s.person_id = (select auth.uid())
  )
$$;

-- Can I reach this task list: is it mine, or shared with me?
create or replace function public.list_reachable(list text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_lists l
    where l.id = list
      and (l.user_id = (select auth.uid()) or public.shared_with_me('task_list', l.id))
  )
$$;

-- Does this task list belong to someone else? (False if it doesn't exist, so
-- a task saved before its list has arrived isn't refused.)
create or replace function public.list_is_others(list text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.task_lists l
    where l.id = list and l.user_id <> (select auth.uid())
  )
$$;

revoke execute on function public.shared_with_me(text, text) from public, anon;
revoke execute on function public.list_reachable(text) from public, anon;
revoke execute on function public.list_is_others(text) from public, anon;
grant execute on function public.shared_with_me(text, text) to authenticated;
grant execute on function public.list_reachable(text) to authenticated;
grant execute on function public.list_is_others(text) to authenticated;

-- The old rules ("your own rows, for everything") are replaced with one rule
-- per action, so removing rows can stay owner-only. Folders don't change yet
-- (sharing folders comes in 1.3).

drop policy "Own notes"      on public.notes;
drop policy "Own task lists" on public.task_lists;
drop policy "Own tasks"      on public.tasks;

create policy "Notes: read own and shared"   on public.notes for select to authenticated
  using (user_id = (select auth.uid()) or public.shared_with_me('note', id));
create policy "Notes: add own"               on public.notes for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Notes: change own and shared" on public.notes for update to authenticated
  using (user_id = (select auth.uid()) or public.shared_with_me('note', id))
  with check (user_id = (select auth.uid()) or public.shared_with_me('note', id));
create policy "Notes: remove own"            on public.notes for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Task lists: read own and shared"   on public.task_lists for select to authenticated
  using (user_id = (select auth.uid()) or public.shared_with_me('task_list', id));
create policy "Task lists: add own"               on public.task_lists for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Task lists: change own and shared" on public.task_lists for update to authenticated
  using (user_id = (select auth.uid()) or public.shared_with_me('task_list', id))
  with check (user_id = (select auth.uid()) or public.shared_with_me('task_list', id));
create policy "Task lists: remove own"            on public.task_lists for delete to authenticated
  using (user_id = (select auth.uid()));

-- Tasks follow their list. A task someone adds to a shared list is theirs,
-- and both people can see and change it.
create policy "Tasks: read own and in reachable lists"   on public.tasks for select to authenticated
  using (user_id = (select auth.uid()) or public.list_reachable(list_id));
create policy "Tasks: add to own or shared lists"        on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid())
              and (not public.list_is_others(list_id) or public.shared_with_me('task_list', list_id)));
create policy "Tasks: change own and in reachable lists" on public.tasks for update to authenticated
  using (user_id = (select auth.uid()) or public.list_reachable(list_id))
  with check (user_id = (select auth.uid()) or public.list_reachable(list_id));
create policy "Tasks: remove own, or in own lists"       on public.tasks for delete to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.task_lists l where l.id = list_id and l.user_id = (select auth.uid())));

-- ---- 5. Bookkeeping on every save ----
-- Replaces the version from 001_setup.sql. As before: an older change never
-- replaces a newer one, the owner stays the owner, and synced_at records when
-- the row reached the database. New: changed_by records who made a real
-- change, and someone who isn't the owner can't move, pin, delete or erase a
-- note or task list (those parts of their save are quietly ignored; the
-- app sends whole rows, so refusing the save would stop their syncing).
-- Edit links (which aren't signed in) work as before.

create or replace function public.sync_bookkeeping()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;  -- older change: skip it, keep what's stored
    end if;
    new.user_id := old.user_id;
    if new.updated_at > old.updated_at then
      new.changed_by := me;
    else
      new.changed_by := old.changed_by;
    end if;
    if tg_table_name in ('notes', 'task_lists') and me is not null and me <> old.user_id then
      new.folder_id := old.folder_id;
      new.pinned := old.pinned;
      new.deleted := old.deleted;
      new.erased := old.erased;
    end if;
  else
    new.changed_by := me;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

-- ---- 6. Functions the app calls ----

-- Save my name (shown to people I share with). An empty name means "use my
-- email". Also makes sure I have a row in people.
create or replace function public.save_my_name(new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.people (id, email, name)
  select u.id, lower(u.email), left(trim(coalesce(new_name, '')), 60)
  from auth.users u where u.id = me
  on conflict (id) do update
    set name = excluded.name, email = excluded.email, updated_at = now();
end;
$$;

-- Share one of my notes or task lists with the Anthology account that uses
-- this email. Returns the share's ID and the person's email and name.
create or replace function public.share_with_person(person_email text, kind text, item text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  target_email text;
  share_id uuid;
begin
  if me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if kind = 'note' then
    perform 1 from public.notes n where n.id = item and n.user_id = me and not n.deleted;
  elsif kind = 'task_list' then
    perform 1 from public.task_lists l where l.id = item and l.user_id = me and not l.deleted;
  else
    raise exception 'Only notes and task lists can be shared for now.';
  end if;
  if not found then
    raise exception 'Only the owner can share this, and it has to be saved first.' using errcode = '42501';
  end if;

  select u.id, lower(u.email) into target, target_email
  from auth.users u where lower(u.email) = lower(trim(person_email));
  if target is null then
    raise exception 'No one with that email uses Anthology.' using errcode = 'P0002';
  end if;
  if target = me then
    raise exception 'That''s your own email.' using errcode = '22023';
  end if;
  if exists (select 1 from public.shares s
             where s.item_kind = kind and s.item_id = item and s.active and s.person_id <> target) then
    raise exception 'This is already shared with someone else. For now, each note or task list can be shared with one person.'
      using errcode = '23505';
  end if;

  insert into public.people (id, email)
  select u.id, lower(u.email) from auth.users u where u.id in (me, target)
  on conflict (id) do nothing;

  insert into public.shares (owner_id, person_id, item_kind, item_id)
  values (me, target, kind, item)
  on conflict (person_id, item_kind, item_id) do update
    set owner_id = excluded.owner_id, active = true, ended_by = null, ended_reason = null,
        ended_at = null, owner_seen = true, person_seen = true, person_pinned = false, created_at = now()
  returning id into share_id;

  -- Mark the item (and a list's tasks) as just saved, so the other person's
  -- devices fetch it on their next sync even though it's older than what
  -- they've already fetched. Nothing in them changes.
  if kind = 'note' then
    update public.notes set synced_at = clock_timestamp() where id = item;
  else
    update public.task_lists set synced_at = clock_timestamp() where id = item;
    update public.tasks set synced_at = clock_timestamp() where list_id = item;
  end if;

  return jsonb_build_object('share_id', share_id, 'email', target_email,
    'name', (select p.name from public.people p where p.id = target));
end;
$$;

-- End a share. The owner ending it is "stopped" (the other person is asked
-- whether to keep a copy). The other person ending it is "left" when they
-- remove something still shared (the owner is told), or "closed" when they've
-- answered the keep-or-delete question after the owner deleted it or stopped
-- sharing (nobody needs telling). Ending an ended share changes nothing.
create or replace function public.end_share(share uuid, reason text default 'left')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  s public.shares%rowtype;
begin
  select * into s from public.shares where id = share and (owner_id = me or person_id = me) for update;
  if not found then
    raise exception 'That share couldn''t be found.' using errcode = 'P0002';
  end if;
  if not s.active then
    if me = s.person_id then
      update public.shares set person_seen = true where id = share;
    end if;
    return;
  end if;
  if me = s.owner_id then
    update public.shares
    set active = false, ended_by = me, ended_reason = 'stopped', ended_at = now(),
        owner_seen = true, person_seen = false
    where id = share;
  else
    if reason not in ('left', 'closed') then
      raise exception 'Unknown reason for ending a share.';
    end if;
    update public.shares
    set active = false, ended_by = me, ended_reason = reason, ended_at = now(),
        person_seen = true, owner_seen = (reason = 'closed')
    where id = share;
  end if;
end;
$$;

-- Note that I've seen a share ending, so the app stops telling me.
create or replace function public.mark_share_seen(share uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  update public.shares set owner_seen = true where id = share and owner_id = me;
  update public.shares set person_seen = true where id = share and person_id = me;
end;
$$;

-- Pin or unpin something shared with me, for me only.
create or replace function public.pin_shared(share uuid, pin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.shares set person_pinned = pin
  where id = share and person_id = (select auth.uid()) and active;
end;
$$;

revoke execute on function public.save_my_name(text) from public, anon;
revoke execute on function public.share_with_person(text, text, text) from public, anon;
revoke execute on function public.end_share(uuid, text) from public, anon;
revoke execute on function public.mark_share_seen(uuid) from public, anon;
revoke execute on function public.pin_shared(uuid, boolean) from public, anon;
grant execute on function public.save_my_name(text) to authenticated;
grant execute on function public.share_with_person(text, text, text) to authenticated;
grant execute on function public.end_share(uuid, text) to authenticated;
grant execute on function public.mark_share_seen(uuid) to authenticated;
grant execute on function public.pin_shared(uuid, boolean) to authenticated;
