# Anthology: roadmap after the MVP

Written Oct 22, 2026, at version 0.8.1 (MVP complete). A suggested order for the enhancements in docs/plan.md, sorted the way the plan suggests: value to daily use first, then size. It's a starting point for planning each session, not a commitment; re-sort as you use the app.

Sizes: small is roughly one session or less, medium one to two, large several.

The list is split by where each item is best worked on:

- **Phone-friendly:** changes only to the app's own files (how it looks and behaves), easy to check on the live app once merged. A phone session's change goes live as soon as its pull request is merged, so these are kept small and low-risk.
- **Better at the desk:** anything needing a database script (pasted into Supabase's SQL editor), the Supabase dashboard, a new account, or careful testing across devices. Several small-sounding items need a new piece of information stored in the database (for example "pinned" or a due date), which is why they're here.

Done since this was written: folders inside folders, and moving and dragging (0.9); pinned items (0.10); app.js split into smaller files (1.1); Delete now reaching every device (1.1.1). Moving tasks between lists was set aside: copying the text works well enough.

## Phone-friendly, in suggested order

1. **Dark mode** (small).
2. **Varying colors with favorites, and a distinct look for each side** (small to medium). Blues, purples and oranges for Notes; yellows and greens for Tasks; like a color to keep it. Favorites can be kept with the account, as the export dates are, so no database script is needed.
3. **"Save a copy to my Anthology"** on shared pages (small).
4. **Restore by picking and choosing** (medium). Easier to try on a computer, where backup files are handy, but the work itself is app-only.
5. **A short guide for people using the app** (small). Wording only.

## Better at the desk, in suggested order

0. **A message when something you deleted comes back** (small; no database script). If an item you deleted, or deleted for good, is changed afterwards on another device, the change wins and it comes back. A short message bar would say so, for example: A note you deleted, "Shopping", came back because it was changed on another device. Each device remembers what it deleted for 30 days. Planned as 1.1.2, a follow-up to the 1.1.1 fix (decided Oct 24, 2026).
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
9. **Edit sharing with specific people** (large). Shared items appear in each person's own app, with offline editing.
10. **Reminders and notifications** (large).
11. **Live co-editing** (large).

**Only if needed, at the desk:** a custom domain (and sending access codes from it); a daily keep-alive service if the database pauses too often.

## Working from the phone

The steps are in docs/plan.md, under "Working from your phone": start a Code session in the Claude app, choose anthology, use Plan mode, and create the pull request when done. Merge it (or ask the next desk session to), then check the change on the live app. If a phone session finds that a change needs a database script after all, it should stop and leave that for the desk.

## Starting the next session

- Point the new session at CLAUDE.md, docs/plan.md and this file. CLAUDE.md is read automatically.
- **Testing** happens on a test copy at `http://localhost:8765` (the "anthology" entry in `.claude/launch.json`), in Claude's Browser pane. Testing anything that needs an account means Oscar signing in there with an access code. Tests use items whose titles start with "TEST", removed afterwards.
- **Releasing:** every version updates `APP_VERSION` in app.js and `version` in storage.js together, and the cache name in sw.js; pushing to main publishes the live app within about a minute. Versions are now 1.1, 1.2 and so on.
- **Checking:** docs/test-checklist.md and tests/smoke-test.js cover every feature; run the smoke test before releasing anything that touches several features.
- **Small fix to consider:** closing a folder doesn't reset where new things go when a folder inside it was the target (see the checklist's known quirks).
- **Database changes** are scripts in the supabase folder (001 to 005 have been run), pasted into Supabase's SQL editor by Oscar.
- **Known issue:** about 1 in 20 requests to Supabase gets no answer; the app retries, so it only shows up as an occasional delay.
