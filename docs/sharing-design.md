# Sharing with specific people: design

Draft 1 · written Oct 31, 2026, at version 1.1.2 (plan 0.23) · owner: Oscar

A design for the roadmap item "Edit sharing with specific people": a note, task list or whole folder shared between two Anthology accounts, appearing in both people's apps, editable by both, offline included. It's a proposal to react to, not a settled spec; anything here can change once building starts or once it's in use.

The edit links from 0.7.1 stay as they are. They remain the way to share with someone who doesn't have Anthology.

## What it should do

These come from Oscar's answers on Oct 31, 2026.

- **In both apps.** A shared item appears in each person's sidebar like any other, with a small mark showing it's shared. Search finds it.
- **Offline editing.** Either person can edit while out and about with a poor connection. Changes wait on the device and sync when the connection comes back, as everything else does now.
- **Single items or whole folders.** You can share one note or task list, or a folder with everything in it. Things added to a shared folder later are shared too.
- **The sharer is the owner.** The person who shared it can rename it and move it. The other person can ask to rename or move it, and the owner approves or declines (a later step; see "Build order").
- **Moves follow along.** If the owner moves a shared item into one of their folders, the other person gets a folder of the same name holding just that item, plus a message the next time they open the app ("Oscar moved "Trip plans" into "Summer""). The rest of that folder isn't shared. When sharing a folder, the owner can choose to share the folder and all its contents instead.
- **Deletes don't vanish.** If one person deletes a shared item, the other still sees it, marked "Deleted by Oscar". Opening it brings up a window: keep it or delete it. Keeping it makes it theirs alone, no longer shared.
- **Knowing about clashes.** If the other person changed the note while you had it open, a message says so by name, such as "Oscar changed this while you had it open". Later, a "typing" indicator shows when they're in the same note right now ("Oscar is typing…"). Messages always use the person's name, or their email until they set one, never a generic "the other person".

## How it fits the app as it is

A few facts about the current app shape this design.

- Every row in the database (each folder, note, task list and task) belongs to one person, and the access rules let each person reach only their own rows (supabase/001_setup.sql).
- Syncing fetches whatever the access rules allow (storage.js, `pull`), with no filter by person. So once the rules let someone see a shared row, their device will fetch it, keep an offline copy, and send their edits back, with little change to syncing itself.
- The database already keeps an item's owner when someone else saves it (the `sync_bookkeeping` check keeps `user_id` as it was). That fits "the sharer is the owner".
- Where something sits (`folder_id`, `parent_id`) and whether it's pinned (`pinned`) are stored on the item itself, so today both people would share one placement and one pin. Pins should probably be per person (see below).
- "The later change wins" applies to whole notes, and deletes can be undone by a later change (1.1.2). Shared items need their own rule for deletes, described below.

## The pieces

**People and names.** Messages like "Deleted by Oscar" need a name. A short "Your name" setting in Settings and help, kept with the account (as the export dates are), seems simplest. Until someone sets one, their email can stand in.

**Who has access (database).** A new table, perhaps `shares`, with one row per shared item per person: what's shared (kind and ID), who owns it, who it's shared with, whether a folder's contents are included, and when it was shared. The access rules on the four main tables change from "your own rows" to "your own rows, plus rows shared with you, plus rows inside a folder shared with you". This is the most security-sensitive change in the project so far and needs the most careful testing: signed out, signed in as each person, and as a third account that should see nothing.

Checking "inside a shared folder" means looking up through the folders above an item. For two people's data this should be fast enough, but that's an estimate, not something measured. If it turns out slow, the fallback is to store the share on each row as it's saved.

**Choosing who to share with.** The Share panel gets a third choice beside "Can view" and "Can edit" links: "Share with someone in Anthology", where you type their email. A small database function checks that the email belongs to an Anthology account and adds the share, without revealing anything else about other accounts.

**Getting it onto her phone.** When something is newly shared, its rows may be older than her device's "last checked" time, so a normal sync would skip them. Adding a share should make her device fetch that item in full. One way is for the share itself to mark the item as just changed; another is for her app to notice a new share and fetch it directly. Which is simpler is easier to judge once building starts.

**Who last changed it.** A new column on each row, perhaps `changed_by`, set by the database to whoever saved it. This drives "Oscar changed this while you had it open" and could later show "last changed by" in the bar above a note.

**Pins and placement per person.** Pinning a shared item shouldn't pin it for the other person, so pins for shared items move into a small per-person table (or the `shares` row). Placement follows the owner, as decided. The folders above a shared item are visible to the other person by name only, so their app can show the same path; nothing else in those folders is visible unless the folder itself is shared.

**Deleting.**
- When the owner deletes a shared item, it goes to their Recently deleted as now. The other person's app shows it marked "Deleted by Oscar" instead of removing it. Opening it brings up the window: "Keep a copy" makes a copy in their own account (new IDs, theirs alone) and ends the share; "Delete" ends the share and it disappears for them.
- When the other person deletes it, they can't delete the owner's item, so their delete ends their share. The owner sees it marked "Removed by [name]", with the same window: keep it (it stays theirs, no longer shared) or delete it.
- The 1.1.2 rule (a later change brings a deleted item back) would still apply between one person's own devices. Between two people, a delete becomes a question to the other person instead.

**Moves.** When the owner moves a shared item, the other person's app notices the new folder and shows a message once ("Oscar moved "Trip plans" into "Summer""). This can use the same message bar as 1.1.2.

**Backups and exports.** Shared items probably belong in both people's exports, since an export is insurance. Restore needs care: "Add what's missing" shouldn't bring back a shared item as a duplicate in the other person's own account. To be settled when building restore support.

**Edits at the same moment.** Unchanged for now: the later save wins for the whole note, and task lists are safer because each task saves on its own. The "changed while you had it open" message reduces surprises without preventing a clash. Live co-editing remains a separate, larger project.

## Build order

Each step is meant to be usable on its own and could be a version of its own. Sizes are rough guesses.

1. **Share a single note or task list with someone (1.2, large).** The `shares` table and new access rules, the Share panel choice, your name setting, `changed_by`, getting newly shared items onto the other device, per-person pins, the shared mark in the sidebar, and the delete behavior above (deletes need to be safe from the first version). Plus "changed while you had it open". Needs database scripts, so best at the desk.
2. **Share a whole folder (1.3, medium).** Folder contents, things added later, and the choice between sharing just the item or its whole folder. Move messages.
3. **Ask the owner to rename or move (1.4, medium).** The other person's rename or move becomes a request, waiting until the owner sees it and says yes or no, offline included. Oscar asked whether this is too complex; it isn't, but it's a feature of its own, so it has its own step.
4. **"Typing" indicator (medium).** Uses Supabase Realtime presence, which lets each device announce "I'm in this note right now". Included in Supabase's free plan per its documentation (checked Oct 31, 2026: 200 connections at once, 100 messages a second, well above two people's needs; worth checking again before building). Fits naturally with the roadmap's "Instant updates" item, which uses the same setup. Works only when both people are online.

## Setup and accounts needed

- No new accounts or paid plans for steps 1 to 3. Step 4 uses Supabase Realtime, on the free plan.
- A second test account, so two people can be tested at once on the test copy. Gmail treats anthologyaccess+test@gmail.com as another address delivering to the same inbox, so it could be added to the allowed list without creating a new email account. Likely to work, but not yet tried with Supabase.
- Database scripts (006 onward), run by Oscar in Supabase's SQL editor as before.
- Testing on two real phones before calling step 1 done.

## Open questions

- If the other person adds a note inside a shared folder, who owns it: the person who made it, or the folder's owner? Folder owner seems simpler for rename and move rights.
- Can the owner stop sharing without deleting? Probably yes, from the Share panel, and the other person gets the same keep or delete window.
- Should the Shared links page (Settings and help) also list people you share with, so everything shared is in one place?
- More than two people: the design leaves room (one `shares` row per person), but messages and the request step assume two for now.
- Restore and shared items, as noted under "Backups and exports".
