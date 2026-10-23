# Test checklist

Written Oct 23, 2026, at version 0.10, from the app as it actually behaves, before app.js was split into smaller files (1.1). Use it for any change that touches many features at once, and add to it as features are added.

Testing happens on the test copy (`http://localhost:8765`, the "anthology" entry in `.claude/launch.json`), signed in, in Claude's Browser pane. Only items titled "TEST…" are created, changed or deleted.

## 1. The smoke test (automatic)

`tests/smoke-test.js` clicks and types through the app the way a person would and reports each check as "ok" or "FAIL". It removes everything it made at the end. It runs only on localhost. To run it, ask Claude, or type this in the browser's console on the test copy:

```
await import('./tests/smoke-test.js?' + Date.now()); await smokeTest();
```

What it covers:

- **Notes:** new note, title and body, "Saved", Enter from title to body, Up arrow and Backspace back to the title, empty notes discarded, "#" heading marks left out of titles
- **Folders:** new folder (opens, becomes where new things go), the "New … go into" line, "No notes yet", folder count, new folder inside, rename (Enter keeps, Escape cancels), open and close
- **Moving:** the Move to… window (heading, "(here now)", indented nesting), moving into a nested folder, the date unchanged, a folder can't go inside itself, the folder menu above an open note, dragging onto a folder and onto empty sidebar space
- **Pinning:** hover Pin, ⋯ menu Pin for folders, the bar's Pin/Unpin, the order (pinned folders, pinned items, folders, items), the date unchanged
- **Search:** note text, titles, tasks on the other side, highlighting, folder paths in results, "No matches.", Escape, ×, opening a result
- **Tasks:** new list, Enter to "Add a task", adding several, Enter in a task adds one below, Backspace in an empty task removes it, up and down arrows, ⋯ menu, ticking off, Completed (count, Hide and Show), delete and Undo, an emptied task removed on leaving it, delete list window (Cancel), each side remembering its open item
- **Recently deleted:** delete window wording, the count, details ("Note · deleted … · 30 days left"), Restore, "Delete now", Empty (opened and cancelled only), deleting and restoring a folder with a folder and note inside
- **Settings and Shared links:** open, back, the version number
- **Sharing:** view link, edit link, the explanations, Make a new link (the old one stops working), Turn off link (in the panel and on the Shared links page), the shared page itself (view: read-only with its footer; edit: editable, saves, and the change reaches the owner)
- **Export and restore:** the file name, Markdown files in folder paths, the task list, the backup file; erasing a note for good and getting it back with "Add what's missing"; the restore window cancelled. No file is saved and the real "last export" date isn't changed
- **Export reminder:** shows when due (with made-up dates), Not now hides it
- **Access screen:** shown, starts with the email form, plain error messages. Nothing is sent

## 2. By hand

- **Dragging a task** by its ⋮⋮ handle with the mouse, to a new place in the list
- **Phone layout** (Browser pane set to Mobile, then reload): opens on the open item with ‹ Back; ⋯ on tasks opens a menu under it (Move up, Move down, Delete); the list screen shows ⋯ on folders and items (Pin, Move to…, Delete); Settings and help opens full screen and ‹ Back returns; opening an item and both the app's ‹ Back and the browser's back return to the list
- **Console:** no errors after all of the above
- **Look:** a quick screenshot of the computer and phone layouts, compared with the previous version

## 3. Not tested here

- Signing out and signing in (needs an access code), and sending codes
- "Replace everything" in a restore (it would replace real data)
- Emptying Recently deleted for real
- A real phone, a real trackpad, and Chrome's own Save window for exports
- Two separate devices; the edit-link test above covers changes arriving from elsewhere

## Known quirks (as of 0.10)

- Closing a folder resets where new things go only if that folder itself was the target. If a folder inside it was the target, new things still go into that now-hidden inner folder; the line under the search box says so.

## Results

- **0.10, before the split (Oct 23, 2026):** smoke test 141 ok, 0 failed. By hand: all fine, no console errors.
