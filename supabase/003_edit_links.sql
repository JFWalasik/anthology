-- Anthology: edit links (0.7.1)
-- Run once in the Supabase SQL editor, after 002_sharing.sql. It contains no
-- keys, passwords or email addresses.
--
-- Adds a few functions that anyone with an *edit* link can call, signed in or
-- not. Each one first checks that the link exists, is turned on, allows
-- editing, and points at the right kind of item, and then changes only that
-- item: a note's text, or a task list's name and tasks. Nothing else can be
-- reached. Deleting a task through a link marks it deleted, so it shows up in
-- the owner's Recently deleted.

-- ---- Checking a link ----
-- Used only by the functions below; nobody can call it directly.

create or replace function public.editable_share_link(share_token text, kind text)
returns public.share_links
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.share_links%rowtype;
begin
  select * into link from public.share_links s
  where s.token = share_token and s.active and s.can_edit and s.item_kind = kind;
  if not found then
    raise exception 'This link can''t be used to make changes.' using errcode = '42501';
  end if;
  return link;
end;
$$;

revoke execute on function public.editable_share_link(text, text) from public, anon, authenticated;

-- The current time in milliseconds, the way the app keeps times.
create or replace function public.now_ms()
returns bigint
language sql
volatile
set search_path = ''
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

-- ---- Notes ----

create or replace function public.save_shared_note(share_token text, new_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.share_links := public.editable_share_link(share_token, 'note');
begin
  if length(new_body) > 1000000 then
    raise exception 'This note is too long to save.';
  end if;
  update public.notes
  set body = new_body, updated_at = public.now_ms()
  where id = link.item_id and user_id = link.user_id and not deleted;
end;
$$;

-- ---- Task lists ----

-- Marks the list as just changed, so it moves to the top of the owner's list.
create or replace function public.touch_shared_list(link public.share_links)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.task_lists set updated_at = public.now_ms()
  where id = link.item_id and user_id = link.user_id and not deleted;
$$;

revoke execute on function public.touch_shared_list(public.share_links) from public, anon, authenticated;

create or replace function public.save_shared_list_title(share_token text, new_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.share_links := public.editable_share_link(share_token, 'task_list');
begin
  update public.task_lists
  set title = left(new_title, 1000), updated_at = public.now_ms()
  where id = link.item_id and user_id = link.user_id and not deleted;
end;
$$;

create or replace function public.add_shared_task(share_token text, task_id text, task_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.share_links := public.editable_share_link(share_token, 'task_list');
  next_position double precision;
begin
  if not exists (select 1 from public.task_lists l where l.id = link.item_id and l.user_id = link.user_id and not l.deleted) then
    return;
  end if;
  select coalesce(max(t.position), -1) + 1 into next_position
  from public.tasks t where t.list_id = link.item_id and t.user_id = link.user_id;
  insert into public.tasks (id, user_id, list_id, text, done, position, created_at, updated_at)
  values (task_id, link.user_id, link.item_id, left(task_text, 10000), false, next_position, public.now_ms(), public.now_ms());
  perform public.touch_shared_list(link);
end;
$$;

create or replace function public.save_shared_task(share_token text, task_id text, task_text text, task_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.share_links := public.editable_share_link(share_token, 'task_list');
begin
  update public.tasks t
  set text = left(task_text, 10000),
      done = task_done,
      completed_at = case when task_done and not t.done then public.now_ms()
                          when task_done then t.completed_at
                          else null end,
      updated_at = public.now_ms()
  where t.id = task_id and t.list_id = link.item_id and t.user_id = link.user_id and not t.deleted;
  perform public.touch_shared_list(link);
end;
$$;

create or replace function public.delete_shared_task(share_token text, task_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link public.share_links := public.editable_share_link(share_token, 'task_list');
begin
  update public.tasks t
  set deleted = true, updated_at = public.now_ms()
  where t.id = task_id and t.list_id = link.item_id and t.user_id = link.user_id and not t.deleted;
  perform public.touch_shared_list(link);
end;
$$;

-- ---- Who can call what ----

revoke execute on function public.save_shared_note(text, text) from public;
revoke execute on function public.save_shared_list_title(text, text) from public;
revoke execute on function public.add_shared_task(text, text, text) from public;
revoke execute on function public.save_shared_task(text, text, text, boolean) from public;
revoke execute on function public.delete_shared_task(text, text) from public;

grant execute on function public.save_shared_note(text, text) to anon, authenticated;
grant execute on function public.save_shared_list_title(text, text) to anon, authenticated;
grant execute on function public.add_shared_task(text, text, text) to anon, authenticated;
grant execute on function public.save_shared_task(text, text, text, boolean) to anon, authenticated;
grant execute on function public.delete_shared_task(text, text) to anon, authenticated;
