-- Anthology: pinned items (0.10)
-- Run once in the Supabase SQL editor, after 003_edit_links.sql. It contains
-- no keys, passwords or email addresses.
--
-- Adds a "pinned" mark to folders, notes and task lists. Everything starts
-- unpinned. The existing access rules and sync bookkeeping cover the new
-- column automatically.

alter table public.folders    add column if not exists pinned boolean not null default false;
alter table public.notes      add column if not exists pinned boolean not null default false;
alter table public.task_lists add column if not exists pinned boolean not null default false;
