# Anthology: roadmap after the MVP

Written Oct 22, 2026, at version 0.8.1 (MVP complete). A suggested order for the enhancements in docs/plan.md, sorted the way the plan suggests: value to daily use first, then size. It's a starting point for planning each session, not a commitment; re-sort as you use the app.

Sizes: small is roughly one session or less, medium one to two, large several.

## Suggested order

1. **Twice-yearly scheduled check by Claude** (small). The plan's first step after the MVP: a scheduled run that checks Supabase pricing, the library version and GitHub alerts, and sends a short summary.
2. **Pinned items** (small). Keep important notes and task lists at the top.
3. **Moving items into folders** (small). Needs clarifying first: dragging items onto folders in the sidebar, or moving tasks between lists? (Moving with the folder menu already works.)
4. **Nested folders** (medium). Folders inside folders; the data was designed for it.
5. **Subtasks** (medium). Needs a decision on how they appear in exports and shared pages.
6. **Varying colors with favorites, and a distinct look for each side** (small to medium). Blues, purples and oranges for Notes; yellows and greens for Tasks; like a color to keep it.
7. **Dark mode** (small).
8. **Due dates and task priorities** (small each).
9. **Formatting toolbar (rich text)** (large). Bold, lists and headings with buttons. Touches the editor, export, search and shared pages, so best done once the basics above feel settled.
10. **Show a folder on only one side** (small).
11. **"Save a copy to my Anthology"** on shared pages (small).
12. **Instant updates (Supabase Realtime)** (medium). Also look into the known issue: an open note sometimes doesn't update while being watched (seen in 0.7.2 testing).
13. **Restore by picking and choosing** (medium).
14. **"Invite someone" screen and a short guide for people using the app** (small each). Worth doing when inviting more people.
15. **Edit sharing with specific people** (large). Shared items appear in each person's own app, with offline editing.
16. **Reminders and notifications** (large).
17. **Live co-editing** (large).

**Only if needed:** a custom domain (and sending access codes from it); a daily keep-alive service if the database pauses too often.

## Starting the next session

- Point the new session at CLAUDE.md, docs/plan.md and this file. CLAUDE.md is read automatically.
- **Testing** happens on a test copy at `http://localhost:8765` (the "anthology" entry in `.claude/launch.json`), in Claude's Browser pane. Testing anything that needs an account means Oscar signing in there with an access code. Tests use items whose titles start with "TEST", removed afterwards.
- **Releasing:** every version updates `APP_VERSION` in app.js and `version` in storage.js together, and the cache name in sw.js; pushing to main publishes the live app within about a minute.
- **Database changes** are scripts in the supabase folder (001 to 003 have been run), pasted into Supabase's SQL editor by Oscar.
- **Known issue:** about 1 in 20 requests to Supabase gets no answer; the app retries, so it only shows up as an occasional delay.
