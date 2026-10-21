# Changelog (detailed)

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
