# Anthology: design

Started Oct 21, 2026 · owner: Oscar

How the app looks and feels, and why. docs/plan.md stays the source of truth for features and phases; this file covers colors, type, layout and interaction. Everything here is open to change. When a design decision changes, update this file and add a line to the decision log at the bottom.

## Feel

Quiet and readable, like a well-made notebook. Warm paper tones, a serif font, plenty of space around the text, and color used sparingly so it means something.

## Colors

All colors are defined once at the top of styles.css, so they can be changed in one place.

**Shared (Paper palette)**

| Use | Color |
| --- | --- |
| Main background | #FBF8F3 |
| Sidebar background | #F2ECE2 |
| Lines and borders | #E4DCCD |
| Main text | #2B2926 |
| Softer text | #5C564D |
| Muted text (dates, hints) | #7A7266 |
| Warnings (delete on hover) | #A3402F |

**Notes side**

| Use | Color |
| --- | --- |
| Accent (buttons, links, selected items) | #1B1BA6, a deep, vivid blue; open to change |
| Selected note background | #E6E6F6 |

**Tasks side**

| Use | Color |
| --- | --- |
| Accent | #1AAB4B, a clear green |
| Text on the green | #062612, very dark green, because white on this green is hard to read |

**Planned: colors that vary on opening.** Each time the app opens, Notes picks an accent from blues, purples and oranges, and Tasks from yellows and greens. When a new color appears, it can be liked and saved as a favorite; favorites come up again in the rotation and can be picked from a list. Each candidate color needs enough contrast to read on the paper background; yellows especially need care. On the enhancements list in docs/plan.md.

## Type

- Georgia throughout, falling back to Times New Roman.
- Note title: 28px. Note body: 18px with generous line spacing (1.65). Sidebar and buttons: 16px. Dates, hints and small labels: 12 to 13px.
- The note text column is at most about 680px wide, so lines stay comfortable to read on a large screen.

## Layout

- Top bar: app name on the left, the Notes/Tasks toggle on the right.
- Notes side: sidebar on the left (280px) with New note and New folder, then folders (alphabetical), then top-level notes (most recently edited first); the backup links sit at the bottom. The note fills the rest, with a small bar above it for the folder menu, the "Saved" label and Delete note.
- Tasks side: the same layout, with New task list in place of New note. Folders are shared, so each folder appears on both sides; its count and contents show only that side's items. A task list shows open tasks, then an "Add a task" line, then a "Completed (n) · Hide/Show" line and the completed tasks.
- The accent color follows the side you're on: blue on Notes, green on Tasks.
- Phones (screens narrower than 700px) use two screens: the list of folders and items, or the open item with a "‹ Back" button. The phone's own back gesture does the same. The Notes/Tasks toggle stays at the top. Tap targets are larger, typing fields are at least 16px (iPhones zoom in on smaller ones), and space is kept clear for the notch and home bar.

- Access screen: when no one is signed in, the app shows a single centered box: "Enter your email to get an access code", then "A code is on its way to … Enter it here", with "Send a new code" and "Use a different email". The Notes/Tasks toggle is hidden until someone is in.
- The bottom section of the sidebar has three lines, apart from the folders so they don't look like them: Recently deleted (with a count), Settings and help, and the sync status.
- Recently deleted: on both sides. It opens a page listing everything deleted in the last 30 days, newest first. Each entry shows its title and a line such as "Folder · with 2 notes · deleted Oct 22 · 30 days left", with Restore and Delete now. Things deleted as part of a folder or list are counted under it rather than listed separately. On phones it opens as its own screen with "‹ Back".
- The sync status reads "All changes synced", "Syncing…", or the offline message.
- Search: a box under New note and New folder. While there's text in it, results replace the folder list: title, a line of matching text, and "Note" or "Task list" with the folder, with matches highlighted. Searches both sides; tapping a result switches sides if needed. Escape clears it.
- Export reminder: a banner under the top bar, in the side's light accent color, with Export and Not now.
- Restore asks "Add what's missing" (the default, highlighted) or "Replace everything".
- Settings and help: one page with sections for Account (email, Sign out), Export and backups (Export everything and Restore), Shared links (a link to its own page), and Help and About (short help topics and the version number). On phones it opens as its own screen with "‹ Back".
- Shared links: its own page, reached from Settings and help, listing each active link with Copy link and Turn off.
- Sharing: "Share" in the bar above an open note or task list opens a small panel with a "Can view" / "Can edit" choice (view is the default, and each has its own link), the link, "Copy link" (on phones, "Share link…" opens the phone's share menu), "Make a new link" and "Turn off link".
- The shared page (what someone with a link sees): just the app name at the top, the title, and the note text or the task list with locked checkboxes, in the same Paper style. It ends with "Shared from Anthology. This is a read-only copy; only its owner can change it." It checks for changes every 15 seconds and when brought back into view.
- With an edit link, the same page becomes an editor: the note's title and text, or the list's name, tasks (checkbox, text, × to delete) and "Add a task". Changes save automatically with a small "Saved" line, and the footer reads "Shared from Anthology. Anyone with this link can make changes." Without a connection it says the change will be saved when back online. While someone is typing, incoming changes wait so their typing isn't interrupted.

## App icon

A white Georgia "A" on the Notes blue (#1B1BA6), filling the square; phones round the corners themselves. The images are in icons/ and were made from Georgia with a small script; to change the icon, replace those images.

## Interaction

- Each note has a title line and a body, saved as one piece of text with the title as the first line. Enter in the title moves to the body.
- With a mouse, Rename and Delete appear when hovering over a folder, and Delete when hovering over a note or task list. Touch screens have no hover, so each row shows a "⋯" button instead, which opens a short menu with the same choices.
- Deleting a note, task list or folder asks "Are you sure? … You can restore it from Recently deleted for 30 days." Single tasks delete without asking, with a 10-second Undo. Blank notes and tasks are discarded without asking and don't go to Recently deleted. "Delete now" and "Empty" in Recently deleted still warn "There is no way to retrieve this."
- Restoring a note from a deleted folder brings the folder back too, so the note has somewhere to go. Likewise, restoring a task from a deleted task list brings the list back. The folder's or list's other contents stay in Recently deleted, each listed on its own.
- Saving is automatic; a small "Saved" label confirms it.
- Tasks: Enter in "Add a task" adds the task and stays ready for the next. Enter in a task starts a new one right below it. Backspace in an empty task removes it. Blank tasks are cleared when you leave them. Checking a task crosses it out and moves it below the open ones.
- Reordering tasks: drag by the handle (⋮⋮) on the left, with a mouse or a finger, or use ↑ and ↓ (on hover with a mouse, in the "⋯" menu on touch screens). The handle is always visible on touch screens. Tasks move within their own group, open or completed.
- Deleting a single task doesn't ask first; instead a "Task deleted · Undo" message shows for 10 seconds. Deleting a task list asks first.

## Decision log

Newest first.

- **Oct 22, 2026.** Export, search, restore choices and the export reminder (0.8, MVP complete). Export ZIP has separate Notes and Tasks folders. "Download backup" became "Export everything", which includes the backup.

- **Oct 22, 2026.** Edit links (0.7.1): Can view / Can edit in the Share panel; the shared page becomes an editor for edit links.

- **Oct 22, 2026.** Settings and help page, and sharing (0.7). Account and backup links moved off the crowded sidebar bottom into the new page. Shared links get their own page. Shared pages update live and say plainly that they're read-only.

- **Oct 22, 2026.** Recently deleted link moved to the bottom section of the sidebar (0.6.1), so it reads as separate from your folders and notes.
- **Oct 22, 2026.** Recently deleted (0.6): one combined list for both sides, kept for 30 days.

- **Oct 22, 2026.** Access screen and sync status added (0.5). Wording uses "access" rather than "sign in" where people see it, except for "Sign out".

- **Oct 21, 2026.** Phone layout (0.4): two screens with a Back button, rather than stacking the sidebar above the item. "⋯" menus on touch screens, rather than swipe or press-and-hold, because they're easier to discover. App icon: white Georgia "A" on the Notes blue.

- **Oct 21, 2026.** Tasks side added (0.3). Folders shared by both sides. Accent switches to green on the Tasks side. Single tasks delete without asking, with a 10-second undo. Reordering by drag and by ↑ ↓ buttons.

- **Oct 21, 2026.** Notes accent changed from muted ink-blue (#3B5B7A) to a brighter blue (#1B1BA6). A separate, larger title line added above the note body. Delete added on hover for notes; renaming a note is done by editing its title. Folder menu added above each note for moving it.
- **Oct 21, 2026.** Paper palette chosen over Slate and Field notebook. Georgia for all text. Green #1AAB4B for the Tasks side. Folders listed above top-level notes so they stay easy to find.
