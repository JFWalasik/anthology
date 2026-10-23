# Changelog (detailed)

## 1.1 (Oct 23, 2026)

Changed
- app.js (about 2,400 lines) is split into ten files: app.js (shared state, helpers, saving, drawing the page, syncing, start-up), sidebar.js, editor.js, tasks.js, sharing.js, search.js, backup.js, access.js, pages.js and ui.js. index.html loads them in that order, with app.js last because it starts the app; sw.js keeps all of them for offline use
- The code was moved, not rewritten: a script copied line ranges of the old file, and a check confirmed every line of the old app.js appears exactly once in the new files. The one real change is that each file now hooks up its own buttons and keys (for example wireSearchEvents in search.js), called from app.js
- Version numbering moves past 1.0 to 1.1 (plan 0.20): new features raise the second number, small fixes add a third

Added
- docs/test-checklist.md: what to test, written from the app as it behaved at 0.10
- tests/smoke-test.js: clicks and types through every feature on the test copy (about 140 checks), using only "TEST" items, and removes them afterwards. It won't run anywhere but localhost

Why
- Smaller files make later changes easier and safer, especially from the phone, where a whole 2,400-line file is hard to work with
- Testing the app before the split gave a fair before-and-after comparison

Notes for later
- Tested: the smoke test passed 141 of 141 checks before the split (on 0.10) and after it (on 1.1); dragging a task with the mouse and the phone layout (menus, Back, Settings) were checked by hand both times, with no console errors. Not tried on a real phone
- Known quirk found while testing, left as it was: closing a folder resets where new things go only if that folder itself was the target, not a folder inside it
- The files share names with each other, as the single file did. Two files can't define the same top-level name; the browser would report an error on loading

## 0.10 (Oct 23, 2026)

Added
- Pin and Unpin for folders, notes and task lists: in the ⋯ menu, as a hover button for notes and lists on a computer, and in the bar above an open note or list
- Pinned things go to the top of their own level: pinned folders, then pinned notes or task lists, then everything else as before. A small pin mark shows on each
- supabase/004_pinned.sql: a "pinned" mark on folders, notes and task lists

Why
- Quick access to the things used most, without leaving their folders

Notes for later
- Pinning doesn't change an item's "last edited" date; pinned items are ordered by it, pinned folders alphabetically
- Folders are shared by both sides, so a pinned folder is pinned on both
- Backups and restores keep pins; Markdown exports don't show them
- Tested: pinning at the top level and inside a folder, the order, the pin marks, Unpin from the bar, the dates, the database, and backups. Not tried by hand on a phone

## 0.9 (Oct 23, 2026)

Added
- Folders inside folders, with no limit. Each level indents a little less (16, 12, 8, then 4 pixels) and deeper levels don't indent further, so names still fit on a phone
- "New folder" creates the folder inside the open folder (the line under the search box says where); folders also have "New folder inside"
- "Move to…" for notes, task lists and folders: hover buttons for notes and lists on a computer, the ⋯ menu on phones and for folders. It lists every folder, indented, and marks where the item is now
- Dragging notes, task lists and folders onto a folder in the sidebar, or onto empty sidebar space for the top level (computers only); holding over a closed folder opens it
- The app's own delete window, with "Yes, delete" and "Cancel", for every delete

Changed
- Deleting a folder deletes the folders inside it too, all restorable together from Recently deleted; restoring a single note from a deleted folder brings back its folder and the folders around it
- The folder menu above an open note or list, search results ("Garden › Vegetables") and exports (folders inside folders) all show the nesting
- On a computer, a folder's hover shows a single ⋯ (four buttons didn't fit)

Why
- Nested folders and moving were first on Oscar's list after the MVP
- The browser's own "Are you sure?" can only say OK and Cancel

Notes for later
- A folder can't be moved into itself or a folder inside it, by either method
- Moving tasks between task lists was set aside: copying the text works well enough
- Tested: three levels of folders, indents, the folder menu, Move to… (including what it refuses), dragging to a folder and to the top level, the delete window (Cancel and Yes), deleting and restoring a whole folder tree and a single note from it, export paths and search paths. Dragging with a real mouse and the phone layout weren't tried by hand
- Plan updated to version 0.18

## 0.8.1 (Oct 22, 2026)

Changed
- The search clears, and the sidebar goes back to your folders, when you: open a result (its folder opens and it's highlighted), tap the new × in the search box, press Escape, switch between Notes and Tasks, or tap New note, New task list or New folder

Why
- Search results stayed until the text was deleted by hand, which phones made awkward

## 0.8 (Oct 22, 2026) · MVP complete

Added
- Export everything (Settings and help): one ZIP file with every note and task list as a Markdown file, in Notes and Tasks folders that mirror your folders; task lists are checklists ("- [ ]" and "- [x]"). It also holds the backup file and a short "About this export" note
- Restore from backup accepts the ZIP file, or the backup file inside it (including ZIP files re-made by a Mac's own tools), and asks: "Add what's missing" (only items you don't have now come back; your current versions win) or "Replace everything"
- Search, under New note and New folder: titles, note text, task list names and tasks, across both sides, with matches highlighted
- Export reminder: a banner when the last export is about six months old (or six months after the account was made, if never); "Not now" hides it for two weeks. Both dates are kept with the account, so every device agrees
- export.js, which makes and reads ZIP files without a library

Changed
- "Download backup" replaced by "Export everything", which includes the backup

Why
- Export is the plan's insurance: everything can always leave Anthology in a common format
- Restoring an old backup used to replace everything, which could lose newer work; adding only what's missing is safe with any backup

Notes for later
- File and folder names in the export replace characters some computers don't allow (such as "/"), and same-named items become "Name (2)"
- A note's first line becomes a Markdown heading in the export
- Tested: the ZIP checked with the Mac's own unzip tools (folders, emoji, duplicate names); reading back both the app's ZIP and a Mac-compressed one; "Add what's missing" bringing back a deleted note while keeping an edited one; search in notes and tasks, opening a result from the other side, and code-like text; the reminder when due, snoozed, and for a new account. The real Save window and a real export download were not tested here
- Plan updated to version 0.17

## 0.7.2 (Oct 22, 2026)

Changed
- The app checks for changes every 15 seconds while it's open and in view (was every minute); shared pages check every 15 seconds (was 30)
- An open note or task list now updates straight away when changes arrive, keeping the cursor in place, unless you typed in the last 3 seconds or are typing in a task; then it updates once you move away
- The view-only explanation in the Share panel now says "This link is view-only, so they can't make changes"

Fixed
- On phones, the Can view / Can edit choice looked broken (the link box's style was also applied to the round buttons)

Why
- Found while testing edit links on an iPhone: a change made through an edit link took about 2 minutes to appear, or only appeared after leaving the note and coming back

Notes for later
- Truly instant updates would need Supabase's live-update feature (Realtime); possible later if 15 seconds feels slow

## 0.7.1 (Oct 22, 2026)

Added
- "Can view" / "Can edit" in the Share panel; each has its own link, and Shared links shows which is which
- With an edit link, the shared page is an editor: a note's title and text, or a task list's name and tasks (add, edit, tick off, delete). Changes save automatically and reach the owner's app with the next sync
- If the connection drops, the shared page says so and saves the change when it's back; if the link is turned off, it says the change couldn't be saved
- supabase/003_edit_links.sql: functions that make changes through an edit link, each checking first that the link is on, allows editing, and points at that item

Why
- For two people over a few months, edit links are enough, and much simpler than sharing between accounts

Notes for later
- Tasks deleted through an edit link go to the owner's Recently deleted
- Editing through a link needs a connection; there's no offline editing on the shared page
- If the owner and someone with an edit link change the same note at the same moment, the later save wins for the whole note; task lists are safer, since each task saves separately
- Tested from the command line, signed out: view links and made-up codes can't change anything, a note's edit link can't add tasks, and the internal link check can't be called directly. In the browser: editing a shared note and list at phone size, changes reaching the owner's app, saving after a dropped connection, and a link turned off mid-edit. Not yet tested on a real phone

## 0.7 (Oct 22, 2026)

Added
- Share, in the bar above an open note or task list: makes a private link (43 random characters after `#share=`), with Copy link (or the phone's share menu), Make a new link, and Turn off link
- The shared page: no sign-in needed; shows the note, or the task list with locked checkboxes; says it's a read-only copy; picks up changes every 30 seconds and when brought back into view
- Settings and help page: Account (email, Sign out), Backups (Download, Restore), Shared links, and Help and About with the version number
- Shared links page: every active link, with Copy link and Turn off
- supabase/002_sharing.sql: a share_links table (only the owner can see their links) and get_shared_item, the one function a signed-out visitor can call, which returns only the item a link points to
- Search engines are asked not to list the app or shared pages

Changed
- Sign out, Download backup and Restore from backup moved from the sidebar into Settings and help; the sidebar bottom now has Recently deleted, Settings and help, and the sync status

Fixed
- (Found in testing) Sharing a task list sent the wrong item type and failed, with a message wrongly blaming the connection; the message now only mentions the connection when offline

Why
- Sharing makes Anthology minimally shareable; links are view-only for now, with edit links next (0.7.1)
- The sidebar bottom had become crowded

Notes for later
- Deleting a shared item stops its link working; restoring the item makes it work again
- A link to a deleted item stays in Shared links (as "Deleted item") until turned off
- Tested: making, replacing and turning off links; signed-out access to the right item only, wrong codes returning nothing, and the tables still refused; live updates; deleted items; the pages at desktop and phone size. Not yet tested on a real phone

## 0.6.1 (Oct 22, 2026)

Changed
- The Recently deleted link moved from the end of the folder list to the bottom section of the sidebar, above the sync status and email

Why
- At the end of the folder list it looked like one of your folders or notes

## 0.6 (Oct 22, 2026)

Added
- Recently deleted, at the bottom of the sidebar on both sides: deleted folders, notes, task lists and single tasks can be restored for 30 days, with Restore, Delete now, and Empty
- Restoring a folder brings back what was deleted with it. Restoring a note from a deleted folder brings the folder back too, and restoring a task from a deleted task list brings the list back
- Deletions and restores reach every device; after 30 days, items are erased from the database too (each device checks about once a day)
- A version check: if a browser briefly loads a mix of old and new files after an update, the app reloads once to get a matching set

Changed
- Delete warnings now say "You can restore it from Recently deleted for 30 days"
- The task Undo now restores from Recently deleted
- Blank notes and tasks are erased rather than kept
- Restoring a backup sends what it replaces to Recently deleted
- Syncing is more patient with a bad connection: each request to the database gets 8 seconds and one retry, and a whole sync attempt gives up after a minute and tries again 15 seconds later
- The offline helper now uses its saved copies only when there's no connection at all, not when the connection is slow
- The offline helper is switched off on the test copy (localhost), so testing always uses the latest files

Fixed
- "Syncing…" could get stuck indefinitely if a request to the database never got an answer

Why
- Since 0.5, a delete on one device reaches every device within a minute, so accidental deletes needed a safety net before anything else
- In testing, about 1 in 20 requests to Supabase got no answer at all, both in the browser and from the command line; the cause (network or Supabase) is unknown
- The offline helper's "use the saved copy if the network is slow" rule could serve old and new files together right after an update, which broke the app in testing

Notes for later
- "Delete now" on one device erases the item from the database, but another device may still list it in Recently deleted until its own 30 days are up; restoring it there would bring it back
- When releasing a new version, update APP_VERSION in app.js and the version in storage.js together, and the cache name in sw.js
- Tested: delete and restore of each kind of item, folders with contents, a task whose list was deleted, Undo, blank notes, deletes and restores from another device, Delete now, the 30-day clean-up (with backdated test records), and the screens at desktop and phone size. Not yet tested on a real phone

## 0.5.1 (Oct 22, 2026)

Added
- README section "Important: the database can pause": how to keep it awake, which email to look for, and step-by-step resuming
- package.json naming the Supabase library and version, so GitHub's Dependabot can send security alerts (alerts were already switched on for the repository)
- docs/access-decisions.md, "Access options and decisions": why a database, why Supabase, every access option considered, and why codes come from a dedicated Gmail account

Changed
- No keep-alive service, unlike the earlier plan; a cron-job.org check-in is now a low-priority enhancement
- Removed the twice-yearly check that access codes still arrive; the access document covers what to do if they stop

Why
- Keeping maintenance low: normal use keeps the database active, Supabase warns by email about a week before pausing, and resuming takes two clicks for up to a year
- GitHub's own scheduled checks were considered, but they switch themselves off in public repositories after 60 days without changes

Notes for later
- Plan updated to version 0.14 (0.13 removed the code check)
- When updating the Supabase library: replace the copy in vendor/, and update the version in package.json, index.html and sw.js

## 0.5 (Oct 22, 2026)

Added
- A Supabase database holding each person's folders, notes, task lists and tasks, with access rules so each person reaches only their own (supabase/001_setup.sql)
- Access by 6-digit code: enter your email, then the code emailed from anthologyaccess@gmail.com. Stays signed in on each device; Sign out clears that person's copy from the device
- An allowed list of emails; anyone else is turned away with "This email isn't on the list for Anthology"
- Offline editing: changes are saved on the device first and sent when there's a connection; the sidebar shows the sync status
- Changes from other devices appear when the app is opened, brought back into view, or every minute while open; the open note isn't redrawn while you're typing in it
- On first sign-in in a browser with notes from before 0.5, an offer to add them to the account
- The Supabase code library (version 2.117.3), kept as a copy in vendor/ so the app doesn't depend on another site being up
- config.js with the database address and its public (publishable) key

Changed
- storage.js rewritten for syncing; the rest of the app works much as before
- Restoring a backup now replaces everything in the account, on all devices
- Preferences (which item was open, and so on) are kept per person on each device

Why
- Notes were stuck in one browser on one device; this was the main goal of the MVP
- Codes rather than links, because an email link opens Safari rather than the iPhone home-screen app
- A dedicated Gmail account sends the codes, because Supabase's built-in email is for testing only and personal email was off limits

Notes for later
- If the same item is changed on two devices, the later change wins; the database enforces this
- Deleted items are marked as deleted in the database rather than erased, which the recently deleted folder in 0.6 can build on
- Tested: refusal of signed-out reading and writing, unlisted emails, syncing both ways, changes made while offline, typing while a change arrives, the pre-0.5 notes offer, and signing out. Not yet tested on a real phone
- Next, 0.5.1: the keep-alive service and Dependabot library alerts
- Plan updated to version 0.12, with access preferences and the access-code email account

## 0.4.1 (Oct 21, 2026)

Fixed
- On phones, the back gesture (and Android's back button) now goes from an open note or task list back to the list, instead of leaving the app

Changed
- The ⋯ button on touch screens is larger and darker, so it's easier to spot

Why
- Found while trying 0.4 on an iPhone; the back gesture issue would have been most noticeable on Android

Notes for later
- Tested at phone size in the built-in browser and on an iPhone; not yet tried on a real Android phone

## 0.4 (Oct 21, 2026)

Added
- Hosting on GitHub Pages at https://jfwalasik.github.io/anthology/, published from the main version
- App icon (white Georgia "A" on the Notes blue) and home screen settings, so "Add to Home Screen" opens it full-screen like an app
- Offline helper (sw.js): keeps a copy of the app's files so the app opens without a connection; when online it always fetches the latest files first
- Phone layout: two screens (list, then the open item with a "‹ Back" button), larger tap targets, 16px minimum in typing fields, space kept clear for the notch and home bar
- "⋯" menus on touch screens, replacing the hover buttons there: Rename and Delete for folders, Delete for notes and task lists, Move up, Move down and Delete for tasks
- .nojekyll file, so GitHub Pages serves the files as they are

Changed
- Dragging tasks rewritten to work the same with a mouse, trackpad or finger; the drag handle is always visible on touch screens
- Hover effects now only apply on devices with a mouse, since phones can show them after a tap

Why
- Two screens suit a narrow phone better than squeezing the sidebar above the item
- "⋯" menus are easier to discover than swipe or press-and-hold

Notes for later
- Each browser and device still keeps its own notes until sync arrives in 0.5
- Not yet tried on a real phone; expect a 0.4.1 with adjustments
- If the app seems not to update on a phone, closing and reopening it should fetch the latest version

## 0.3 (Oct 21, 2026)

Added
- Task lists, at the top level or inside folders, listed most recently changed first, each with a larger title line
- Enter in "Add a task" adds a task and stays ready for the next; Enter in a task starts a new one below it; Backspace in an empty task removes it
- Check off a task to cross it out and move it below the open tasks; hide or show completed tasks, remembered per list
- Reorder by dragging the ⋮⋮ handle, or with ↑ and ↓ buttons on hover
- Deleting a task shows "Task deleted · Undo" for 10 seconds
- Moving a task list between folders, and deleting a task list with a warning
- Backups now include task lists and tasks; backups from 0.2 still restore

Changed
- Folders are shared by Notes and Tasks; each side shows only its own items in them, and deleting a folder warns about both
- The accent color follows the side: blue for Notes, green for Tasks
- The app remembers the open item, folder and side separately for Notes and Tasks
- Backup names now include the number of task lists too

Why
- Shared folders keep a topic together; showing a folder on only one side can be added later (now on the enhancements list), while merging separate folders would be harder
- Single tasks delete without a warning so quick list editing isn't interrupted; the undo covers mistakes until the recently deleted folder arrives in 0.6

Notes for later
- Dragging works with a mouse or trackpad; touch dragging comes with the phone layout in 0.4
- Tasks move only within their own group (open or completed)
- Undo covers only the most recent deleted task, and only while the app is open
- Plan updated to version 0.10: the folder decision now says shared, a "show a folder on only one side" enhancement was added, and 0.6's recently deleted folder now includes single tasks

## 0.2.1 (Oct 21, 2026)

Added
- A separate title line above each note, in a larger size (28px); Enter moves down to the body
- Delete on hover for notes in the sidebar, with the same warning as before
- A folder menu above each note for moving it to another folder or the top level
- In Chrome and Edge, Download backup and Restore from backup open a Save or Open window, so backups can go in any folder; the window remembers the last folder used

Changed
- Notes accent changed to a brighter blue, #1B1BA6
- Backup file names now include the time and the number of notes, for example anthology-backup-2026-10-21-1435-12-notes.json
- The ignore list now keeps backups (a backups/ folder, and any anthology-backup file) out of GitHub

Why
- The title line makes notes easier to scan; it's still saved as the first line of the note, so storage, backups and the coming export are unchanged
- Several backups made on the same day had identical names and couldn't be told apart
- Backups contain every note, and the repository is public

Notes for later
- A backup is one file holding everything. Note-by-note copies arrive with Markdown export in 0.6
- Moving a note doesn't change its "last edited" date
- Look and feel decisions now live in docs/design.md

## 0.2 (Oct 21, 2026)

Added
- Notes/Tasks toggle; the Tasks side shows a "coming in 0.3" page
- Sidebar with one level of folders: create, rename, delete, open and close
- Notes at the top level or inside a folder, listed most recently edited first
- Create, edit and delete notes; the first line is the title
- Autosave about half a second after typing stops, with a "Saved" label
- "Are you sure? There is no way to retrieve this." before deleting a note or folder; deleting a folder deletes its notes
- Download backup and Restore from backup, using a single .json file
- Paper look with Georgia, ink-blue for Notes and green (#1AAB4B) for Tasks
- The app reopens to the last note, folder and side used

Why
- Notes can sit at the top level so a quick note doesn't need a folder first, and because nested folders will use the same structure
- Backup added because browser storage can be cleared, and sync doesn't arrive until 0.5
- All saving and loading is in storage.js, so it can be swapped for Supabase in 0.5

Notes for later
- Folders are listed above top-level notes, so they stay easy to find as notes pile up
- Notes left empty are discarded when you move away from them
- Notes are kept separately by each browser, and by the way the page is opened (a file on the Mac versus a web address), so the same browser and same way of opening should be used until sync arrives
- Two tabs open at once can overwrite each other's changes; worth handling when sync arrives
- Folder Rename and Delete buttons appear on hover, which won't work on phones; revisit at 0.4

## 0.1 (Oct 21, 2026)

Added
- README with a short description of Anthology
- CLAUDE.md with project principles and working preferences
- docs/plan.md, the plan and source of truth (plan version 0.7)
- .gitignore keeping out Mac system files, .env files, and Claude Code personal settings
- changelog.md and changelog-detailed.md
- upkeep-log.md for the twice-yearly checks

Why
- Sets up the working agreements and records before any app code is written

Notes for later
- Next is 0.2, Notes basics: Notes/Tasks toggle, folders, and notes saved in the browser
