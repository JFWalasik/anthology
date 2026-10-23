# Anthology

Anthology (working title) is a browser-based notes and tasks app for personal use, built to be used for years. One app with a toggle between a Notes side and a Tasks side. The full plan, including decisions and the phase plan, is in docs/plan.md, which is the source of truth for the project.

This file gives guidance for working on the project. It's meant to be applied with judgment rather than as fixed rules; exceptions are fine when there's a good reason, and it's worth saying so when one comes up.

## Working with Oscar

- Oscar is the owner of this project: a leader and builder who is comfortable with some technical topics and new to others. Please don't assume developer knowledge. Explain technical terms briefly in plain language the first time they come up, and favor plain words over jargon.
- Propose before acting. At the start of a task, describe what you plan to change and why, and wait for an okay before starting. Small, obvious steps within an approved task don't need separate approval.
- Check current documentation before recommending outside services, and list the required accounts and setup at the start of each phase.
- When you don't know why something is happening, say so. When there's more than one plausible explanation or approach, lay out the options with a rough confidence level for each.
- Writing style: light formatting, with bold mainly for headings. No all caps in titles or headings. Use em dashes sparingly. Avoid words like landscape, realm, delve, meticulous and intricacies, and avoid the "it's not x, it's y" phrasing.
- At the end of a session, give a short summary of what changed and a suggested next step.

## How the app is built

- Plain HTML, CSS and JavaScript, with no build step and as few dependencies as practical. The app should run by opening its files in a browser.
- Files: app.js (shared state, helpers, saving, drawing the page, syncing, start-up; loaded last), sidebar.js (folders, pinning, moving, dragging), editor.js (typing in notes), tasks.js (tasks, reordering, Undo), sharing.js (Share panel, Shared links, the shared page), search.js, backup.js (export, restore, reminder), access.js (access screen, sign out), pages.js (Recently deleted, Settings), ui.js (⋯ menu, Move and confirmation windows), storage.js (all saving and loading), export.js (Markdown and ZIP). A new file goes in index.html's script list and sw.js's file list.
- Testing: docs/test-checklist.md, and tests/smoke-test.js for a quick check of every feature on the test copy. Add to both when adding features.
- Look and feel decisions (colors, fonts, layout) are in docs/design.md. Check it before changing how the app looks, and record new decisions there.
- Keep the code that saves and loads data in one place, so the storage can change (browser storage now, Supabase from version 0.5) without rewriting the rest of the app.
- Notes are plain text with light Markdown-style formatting for now. Rich text (a formatting toolbar) is planned soon, likely using a well-established editor library that needs no build step, so it helps to keep the note-editing code easy to swap out.
- Data should always be exportable in common formats: Markdown for both notes and tasks (tasks as checklists), with a spreadsheet-style file for tasks as a possible later addition.
- Folders are one level deep for now; nested folders are planned, so the data structure should leave room for them.
- Notes can contain anything a person types, so text from notes should never be inserted into the page in a way that lets it run as code.

## Version tracking

- Save versions (commits) after each meaningful step, with short, plain-language messages.
- Send work to GitHub (push) at the end of each session, so phone sessions and the laptop stay in step.
- Please avoid anything that rewrites or discards history, such as force pushes or hard resets, and don't delete files without asking first.
- Keep the main version in working order, since the live app is published from it.

## At the start of each session

- Check GitHub for open pull requests or unmerged branches, which may come from phone sessions. If there are any, mention them and offer to review and merge them before starting new work.
- Bring in the latest changes from GitHub before making new ones.

## Versions and changelogs

- Versions follow the phase plan in docs/plan.md. New features raise the second number (1.1, 1.2, 1.3); small fixes add a third (1.1.1). Numbering skipped 1.0, since the app was already dependable for daily use.
- At each version, update both changelogs:
  - changelog.md: one or two plain-language lines per version, newest first.
  - changelog-detailed.md: what was added, changed and fixed, why, and notes for later.
- If a decision in docs/plan.md changes, propose an update to the plan, with an incremented plan version number, rather than editing it silently.

## Security

- Never put the Supabase secret key (also called the service role key) anywhere in the repository or the app. The public key (anon or publishable) is designed to be in the app, but only when the database's access rules are turned on.
- Never commit passwords, tokens, or files such as .env. Check before committing if anything looks like a credential.
- GitHub secret scanning and push protection are on as a backstop, not a substitute for care.

## Upkeep

- upkeep-log.md holds dated notes from the twice-yearly checks described in docs/plan.md.
