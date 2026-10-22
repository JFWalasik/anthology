-- Anthology: sharing by link (0.7)
-- Run once in the Supabase SQL editor, after 001_setup.sql. It contains no
-- keys, passwords or email addresses.
--
-- What it creates:
-- 1. A table of share links. Each link has a long random code and points at
--    one note or task list. Only the owner can see or change their links.
-- 2. One function that anyone with a link's code can call, signed in or not.
--    It returns only that one note or task list, and only while the link is
--    turned on and the item isn't deleted. It can't reach anything else.
--
-- can_edit is for edit links (0.7.1); until then every link is view-only.

-- ---- 1. Share links ----

create table public.share_links (
  token       text primary key check (length(token) >= 32),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_kind   text not null check (item_kind in ('note', 'task_list')),
  item_id     text not null,
  can_edit    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index share_links_user_item on public.share_links (user_id, item_id);

alter table public.share_links enable row level security;
revoke all on public.share_links from anon;

create policy "Own share links" on public.share_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---- 2. Reading a shared item ----
-- "security definer" lets this function read the owner's item on behalf of a
-- visitor who isn't signed in. It is deliberately narrow: it looks up one link
-- by its exact code, and returns only the item that link points to.

create or replace function public.get_shared_item(share_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.share_links%rowtype;
  result jsonb;
begin
  select * into link from public.share_links s where s.token = share_token and s.active;
  if not found then
    return null;
  end if;

  if link.item_kind = 'note' then
    select jsonb_build_object(
      'kind', 'note',
      'body', n.body,
      'updated_at', n.updated_at,
      'can_edit', link.can_edit
    ) into result
    from public.notes n
    where n.id = link.item_id and n.user_id = link.user_id and not n.deleted;
  else
    select jsonb_build_object(
      'kind', 'task_list',
      'title', l.title,
      'updated_at', l.updated_at,
      'can_edit', link.can_edit,
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object('id', t.id, 'text', t.text, 'done', t.done) order by t.position)
        from public.tasks t
        where t.list_id = l.id and t.user_id = link.user_id and not t.deleted
      ), '[]'::jsonb)
    ) into result
    from public.task_lists l
    where l.id = link.item_id and l.user_id = link.user_id and not l.deleted;
  end if;

  return result; -- empty if the item has been deleted
end;
$$;

revoke execute on function public.get_shared_item(text) from public;
grant execute on function public.get_shared_item(text) to anon, authenticated;
