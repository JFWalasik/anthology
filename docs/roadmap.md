# Anthology: roadmap after the MVP

Written Oct 22, 2026, at version 0.8.1 (MVP complete). A suggested order for the enhancements in docs/plan.md, sorted the way the plan suggests: value to daily use first, then size. It's a starting point for planning each session, not a commitment; re-sort as you use the app.

Sizes: small is roughly one session or less, medium one to two, large several.

The list is split by where each item is best worked on:

- **Phone-friendly:** changes only to the app's own files (how it looks and behaves), easy to check on the live app once merged. A phone session's change goes live as soon as its pull request is merged, so these are kept small and low-risk.
- **Better at the desk:** anything needing a database script (pasted into Supabase's SQL editor), the Supabase dashboard, a new account, or careful testing across devices. Several small-sounding items need a new piece of information stored in the database (for example "pinned" or a due date), which is why they're here.

## Phone-friendly, in suggested order

1. **Dark mode** (small).
2. **Varying colors with favorites, and a distinct look for each side** (small to medium). Blues, purples and oranges for Notes; yellows and greens for Tasks; like a color to keep it. Favorites can be kept with the account, as the export dates are, so no database script is needed.
3. **Moving tasks between task lists** (small). One of the two meanings of "moving items into folders" to clarify.
4. **Dragging notes and task lists onto folders in the sidebar** (small). The other meaning; moving with the folder menu already works.
5. **"Save a copy to my Anthology"** on shared pages (small).
6. **Restore by picking and choosing** (medium). Easier to try on a computer, where backup files are handy, but the work itself is app-only.
7. **A short guide for people using the app** (small). Wording only.

## Better at the desk, in suggested order

1. **Twice-yearly scheduled check by Claude** (small). The plan's first step after the MVP: a scheduled run that checks Supabase pricing, the library version and GitHub alerts, and sends a short summary. Setting up a scheduled run is easiest at the desk.
2. **Pinned items** (small). Keep important notes and task lists at the top. Needs a database script for the "pinned" mark.
3. **Nested folders** (medium). Folders inside folders. The database already has room for it, but it touches the sidebar, moving, deleting, export and search, so it needs thorough testing.
4. **Subtasks** (medium). Needs a database script, and a decision on how they appear in exports and shared pages.
5. **Due dates and task priorities** (small each). Each needs a database script.
6. **Formatting toolbar (rich text)** (large). Bold, lists and headings with buttons. Adds a library and touches the editor, export, search and shared pages; best once the basics above feel settled.
7. **Show a folder on only one side** (small). Needs a database script.
8. **Instant updates (Supabase Realtime)** (medium). Needs Supabase settings. Also look into the known issue: an open note sometimes doesn't update while being watched (seen in 0.7.2 testing).
9. **"Invite someone" screen** (small). Needs a database script so the owner can add emails from the app. Worth doing when inviting more people.
10. **Edit sharing with specific people** (large). Shared items appear in each person's own app, with offline editing.
11. **Reminders and notifications** (large).
12. **Live co-editing** (large).

**Only if needed, at the desk:** a custom domain (and sending access codes from it); a daily keep-alive service if the database pauses too often.

## Working from the phone

The steps are in docs/plan.md, under "Working from your phone": start a Code session in the Claude app, choose anthology, use Plan mode, and create the pull request when done. Merge it (or ask the next desk session to), then check the change on the live app. If a phone session finds that a change needs a database script after all, it should stop and leave that for the desk.

## Starting the next session

- Point the new session at CLAUDE.md, docs/plan.md and this file. CLAUDE.md is read automatically.
- **Testing** happens on a test copy at `http://localhost:8765` (the "anthology" entry in `.claude/launch.json`), in Claude's Browser pane. Testing anything that needs an account means Oscar signing in there with an access code. Tests use items whose titles start with "TEST", removed afterwards.
- **Releasing:** every version updates `APP_VERSION` in app.js and `version` in storage.js together, and the cache name in sw.js; pushing to main publishes the live app within about a minute.
- **Database changes** are scripts in the supabase folder (001 to 003 have been run), pasted into Supabase's SQL editor by Oscar.
- **Known issue:** about 1 in 20 requests to Supabase gets no answer; the app retries, so it only shows up as an occasional delay.
