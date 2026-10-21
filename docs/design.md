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

**Planned: colors that vary on opening.** Each time the app opens, Notes picks an accent from blues, purples and oranges, and Tasks from yellows and greens. Each candidate color needs enough contrast to read on the paper background; yellows especially need care. On the enhancements list in docs/plan.md.

## Type

- Georgia throughout, falling back to Times New Roman.
- Note title: 28px. Note body: 18px with generous line spacing (1.65). Sidebar and buttons: 16px. Dates, hints and small labels: 12 to 13px.
- The note text column is at most about 680px wide, so lines stay comfortable to read on a large screen.

## Layout

- Top bar: app name on the left, the Notes/Tasks toggle on the right.
- Notes side: sidebar on the left (280px) with New note and New folder, then folders (alphabetical), then top-level notes (most recently edited first); the backup links sit at the bottom. The note fills the rest, with a small bar above it for the folder menu, the "Saved" label and Delete note.
- Narrow screens currently stack the sidebar above the note; the real phone layout comes in 0.4.

## Interaction

- Each note has a title line and a body, saved as one piece of text with the title as the first line. Enter in the title moves to the body.
- Rename and Delete appear when hovering over a folder; Delete appears when hovering over a note. Hover doesn't exist on phones, so 0.4 needs another way.
- Deleting asks "Are you sure? … There is no way to retrieve this." Empty notes are discarded without asking.
- Saving is automatic; a small "Saved" label confirms it.

## Decision log

Newest first.

- **Oct 21, 2026.** Notes accent changed from muted ink-blue (#3B5B7A) to a brighter blue (#1B1BA6). A separate, larger title line added above the note body. Delete added on hover for notes; renaming a note is done by editing its title. Folder menu added above each note for moving it.
- **Oct 21, 2026.** Paper palette chosen over Slate and Field notebook. Georgia for all text. Green #1AAB4B for the Tasks side. Folders listed above top-level notes so they stay easy to find.
