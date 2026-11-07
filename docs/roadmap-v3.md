# Anthology: roadmap after the MVP

Written Oct 22, 2026, at version 0.8.1 (MVP complete). A suggested order for the enhancements in docs/plan.md, sorted the way the plan suggests: value to daily use first, then size. It's a starting point for planning each session, not a commitment; re-sort as you use the app.

Sizes: small is roughly one session or less, medium one to two, large several.

The list is split by where each item is best worked on:

- **Phone-friendly:** changes only to the app's own files (how it looks and behaves), easy to check on the live app once merged. A phone session's change goes live as soon as its pull request is merged, so these are kept small and low-risk.
- **Better at the desk:** anything needing a database script (pasted into Supabase's SQL editor), the Supabase dashboard, a new account, or careful testing across devices. Several small-sounding items need a new piece of information stored in the database (for example "pinned" or a due date), which is why they're here.

Done since this was written: folders inside folders, and moving and dragging (0.9); pinned items (0.10); app.js split into smaller files (1.1); Delete now reaching every device (1.1.1); a message when something deleted comes back (1.1.2). Moving tasks between lists was set aside: copying the text works well enough.

## Phone-friendly, in suggested order

1. **Dark mode** (small).
2. **Varying colors with favorites, and a distinct look for each side** (small to medium). Blues, purples and oranges for Notes; yellows and greens for Tasks; like a color to keep it. Favorites can be kept with the account, as the export dates are, so no database script is needed.
3. **"Save a copy to my Anthology"** on shared pages (small).
4. **Restore by picking and choosing** (medium). Easier to try on a computer, where backup files are handy, but the work itself is app-only.
5. **A short guide for people using the app** (small). Wording only.

## Better at the desk, in suggested order

1. **Twice-yearly scheduled check by Claude** (small). The plan's first step after the MVP: a scheduled run that checks Supabase pricing, the library version and GitHub alerts, and sends a short summary. Setting up a scheduled run is easiest at the desk.
2. **Pinned items** (small). Needs a database script for the "pinned" mark on folders, notes and task lists. Decided Oct 23, 2026 (planned as 0.10):
   - Folders, notes and task lists can all be pinned. Folders are shared by both sides, so a pinned folder is pinned on both.
   - Pinned things go to the top of their own level: at the top level, pinned folders first, then pinned notes or task lists, then everything else as now (folders, then items). Inside a folder, the same order for its subfolders and items.
   - Pinned notes and task lists are ordered by most recently edited; pinned folders stay alphabetical. A small pin mark shows on each.
   - Pin and Unpin: in the ⋯ menu (phones, and folders on a computer), as a hover button for notes and lists on a computer, and in the bar above an open note or task list.
   - Backups and restores keep pins; Markdown exports don't show them.
3. **Subtasks, headings and clickable links in task lists** (medium). Needs a database script, and a decision on how they appear in exports and shared pages. Headings: a task marked as a heading (no checkbox, a little larger), so one list can have sections, such as "Phone" and "Desk". Links: web addresses in a task become tappable (raised Oct 23, 2026).
4. **Due dates and task priorities** (small each). Each needs a database script.
5. **Formatting toolbar (rich text)** (large). Bold, lists and headings with buttons. Adds a library and touches the editor, export, search and shared pages; best once the basics above feel settled. Notes first; then, as part of the same project, formatting within a task's line (bold, italic) for tasks. Block formatting (headings, lists) stays with notes, since task lists get their structure from headings and subtasks.
6. **Show a folder on only one side** (small). Needs a database script.
7. **Instant updates (Supabase Realtime)** (medium). Needs Supabase settings. Also look into the known issue: an open note sometimes doesn't update while being watched (seen in 0.7.2 testing).
8. **"Invite someone" screen** (small). Needs a database script so the owner can add emails from the app. Worth doing when inviting more people.
9. **Edit sharing with specific people** (large, in steps). Moved up by Oscar on Oct 31, 2026, to come next. Decided Oct 31, 2026 (plan 0.23):
   - Share a note, task list or whole folder with a specific Anthology account. It appears in both people's apps with a shared mark, works offline, and syncs when the connection returns. Things added later to a shared folder are shared too. Two people for now; more is a later enhancement. Edit links stay, for people without Anthology.
   - The sharer owns what they share and can rename or move it. Something the other person adds inside a shared folder is theirs. The other person can ask to rename or move the owner's item; the owner approves or declines.
   - When the owner moves a shared item into one of their folders, the other person gets a folder of that name holding just that item, and a message next time they open the app. The owner can choose to share the whole folder instead.
   - If one person deletes a shared item, the other sees it marked "Deleted by [name]" and chooses to keep it (it becomes theirs alone) or delete it. Stopping sharing works the same way for the other person.
   - Messages always name the person (their name, or email until they set one): "Oscar changed this while you had it open". Pins are per person.
   - Restoring a backup must not create duplicates of shared items.
   - How: a new database table of who each item is shared with, and access rules changed so each person reaches their own items plus those shared with them (the most security-sensitive change so far; test with a third account that should see nothing). Syncing already fetches whatever the rules allow, so offline editing mostly follows. A "changed by" record on each item.
   - Build order: 1.2 single notes and task lists, Your name, delete handling, the "changed while open" message (large, desk); 1.3 whole folders and move messages (medium); 1.4 asking the owner to rename or move (medium); later, a "typing" indicator with Supabase Realtime presence (free plan), alongside Instant updates (item 7).
   - Testing needs a second account: anthologyaccess+test@gmail.com, added to allowed_emails when building starts (Gmail delivers it to the anthologyaccess inbox; not yet tried with Supabase). Then two real phones.
   - **Step 1 done in 1.2 (Nov 7, 2026).** Calls made while building it, open to change: a note's title is its first line, so either person can change it until the ask-the-owner step (1.4); a kept copy goes to the top level, unpinned; backups (the restore file) hold only your own things, while the Markdown files in an export include shared ones; "Not now" closes the keep-or-delete window and it asks again next time the item is opened; sharing actions need a connection (agreed, see docs/plan.md).
   - **Possible later:** sharing actions that wait offline and go through when back online (small to medium).
   - **Possible later:** the Share panel offers the emails of people you've already shared with, in a drop-down, so they don't need retyping (raised by Oscar, Nov 7, 2026; small, and no database change needed, since the app already keeps a list of the people you share with).
10. **Reminders and notifications** (large).
11. **Live co-editing** (large).

**Only if needed, at the desk:** a custom domain (and sending access codes from it); a daily keep-alive service if the database pauses too often.

## Working from the phone

The steps are in docs/plan.md, under "Working from your phone": start a Code session in the Claude app, choose anthology, use Plan mode, and create the pull request when done. Merge it (or ask the next desk session to), then check the change on the live app. If a phone session finds that a change needs a database script after all, it should stop and leave that for the desk.

## Starting the next session

- Point the new session at CLAUDE.md, docs/plan.md and this file. CLAUDE.md is read automatically.
- **Testing sharing** uses two test accounts, anthologyaccess+test and anthologyaccess+test2, with tests/share-test.js (see docs/test-checklist.md).
- **Testing** happens on a test copy at `http://localhost:8765` (the "anthology" entry in `.claude/launch.json`), in Claude's Browser pane. Testing anything that needs an account means Oscar signing in there with an access code. Tests use items whose titles start with "TEST", removed afterwards.
- **Releasing:** every version updates `APP_VERSION` in app.js and `version` in storage.js together, and the cache name in sw.js; pushing to main publishes the live app within about a minute. Versions are now 1.1, 1.2 and so on.
- **Checking:** docs/test-checklist.md and tests/smoke-test.js cover every feature; run the smoke test before releasing anything that touches several features.
- **Small fix to consider:** closing a folder doesn't reset where new things go when a folder inside it was the target (see the checklist's known quirks).
- **Database changes** are scripts in the supabase folder (001 to 006 have been run), pasted into Supabase's SQL editor by Oscar.
- **Known issue:** about 1 in 20 requests to Supabase gets no answer; the app retries, so it only shows up as an occasional delay.
