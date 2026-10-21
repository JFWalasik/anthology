# Changelog (detailed)

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
