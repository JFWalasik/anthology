-- Anthology: Delete now reaches every device (1.1.1)
-- Run once in the Supabase SQL editor, after 004_pinned.sql, and before the
-- 1.1.1 app files go live. It contains no keys, passwords or email addresses.
--
-- Until 1.1.1, "Delete now" and "Empty" removed an item from the database
-- completely, so other devices that already had a copy never found out, and
-- kept it. From 1.1.1 the app keeps a blank row for the item instead (its
-- text removed), with a new yes/no column, "erased", set to yes. Other devices
-- see that and remove the item too. The blank row goes away after 30 days,
-- like other deleted items.
--
-- This script only adds the "erased" column to the four tables, set to "no"
-- for everything already there. It doesn't change or remove any data.

alter table public.folders    add column if not exists erased boolean not null default false;
alter table public.notes      add column if not exists erased boolean not null default false;
alter table public.task_lists add column if not exists erased boolean not null default false;
alter table public.tasks      add column if not exists erased boolean not null default false;
