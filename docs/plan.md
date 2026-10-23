# Anthology: plan

Plan version 0.19 · started Oct 20, 2026 · updated Oct 23, 2026 · owner: Oscar

This plan is the source of truth for the project. Changes are proposed first and recorded with an incremented plan version number.

## Purpose and principles

One browser-based app for notes and tasks, usable on phone and computer, built to be used for years. A toggle switches between the Notes side and the Tasks side.

These principles are guidance rather than fixed rules, and exceptions are fine when there's a good reason:

- Data stays exportable in common formats (Markdown for both notes and tasks, with tasks as checklists), so moving to another app is always possible.
- Few dependencies. Plain HTML, CSS and JavaScript where practical.
- Small, usable versions. Each release should be something worth using, even if minimal.
- Simple first, with room left for planned growth such as nested folders, sharing, and possibly live co-editing.
- Low friction. Sign-in for the owner should be rare and easy; people viewing a shared item shouldn't need to sign in at all.

## Decisions so far

Ten decisions are settled for now; any can be revisited as we learn.

**Access preferences** (preferences, not fixed rules): the simplest, most elegant way in. Passwords don't suit a simple notes app and are a reluctant last resort. Firm: no access to Oscar's personal email.

| Decision | Choice | Confidence | Why |
| --- | --- | --- | --- |
| App structure | One app, with a Notes/Tasks toggle | Moderate-high | Less duplicated work; each side can get its own look later |
| Code approach | Plain HTML, CSS and JavaScript, no build step | Moderate-high | Fewer dependencies, easier to read, ages well. Rich text can likely be added later with a library that needs no build step; live co-editing is the more likely point to revisit |
| Sync and database | Supabase | Moderate-high | Built on Postgres (open source), exportable, can be self-hosted; includes sign-in and access rules |
| Access and accounts | A 6-digit access code emailed from a dedicated Gmail account (anthologyaccess@gmail.com), with a link in the same email as a fallback; no password; stays signed in for months. Separate accounts per person. No open sign-up: people are added to an allowed list of emails | High | Needed so only each person can read and change their data. A code works in a home-screen app on iPhone, where a link would open Safari instead. Supabase's built-in email is for testing only, and the owner's personal email is off limits, so a dedicated account sends the codes. Reasons and alternatives are in docs/access-decisions.md |
| Note format | Plain text with light Markdown-style formatting | Moderate | Exports cleanly; a formatting toolbar is planned soon after the MVP |
| Folders | Folders inside folders (from 0.9), with no limit; shared by Notes and Tasks | High | Data designed from the start so nesting can be added. Shared folders keep a topic together, and hiding a folder on one side is easy to add later, while merging separate folders would not be |
| Sharing | Links, no sign-in for viewers: view-only at 0.7, editable at 0.7.1. Shared items update live for viewers | Moderate-high | Lowest friction for viewers. Edit links are enough for two people for now; sharing with specific accounts and co-editing remain on the enhancements list |
| Code home | Personal GitHub repository, public | Moderate | Simplest; can move to an organization later |
| Hosting | GitHub Pages | Moderate | Free and simple; easy to move later (see shared links note) |
| Export | Included in the MVP | High | Insurance against every other decision |

One Supabase limit to know about: [free projects pause after a week of low database activity](https://supabase.com/docs/guides/platform/free-project-pausing). Data is kept, and a paused project can be resumed from the dashboard in a couple of clicks for up to a year. Normal use keeps it active, and Supabase emails a warning about a week before pausing. The README explains what to look for and how to resume. A daily automatic keep-alive is on the enhancements list if pausing becomes a problem.

## Phase plan

The MVP is complete at version 0.8, when the app syncs between phone and computer, protects against accidental deletes, can share, and can export everything. Recently deleted comes first (0.6), because since sync a delete on one device reaches every device.

1. **0.1, Setup.** Claude Code opened in the desktop app, a project folder on the laptop, and the GitHub repository created and linked to it, with secret scanning and CodeQL code checking turned on, and GitHub connected for phone sessions (see Working from your phone). Starter files added: README, CLAUDE.md with the project principles and working preferences, an ignore list, the two changelogs, an upkeep log, and this plan.
2. **0.2, Notes basics.** Notes/Tasks toggle, sidebar with one level of folders, create, edit, delete, autosave, first line as title. Saved in the browser only, as a short stepping stone to settle the look and feel. The saving code is kept in one place so it can be swapped for sync.
3. **0.3, Tasks basics.** Task lists inside folders; add, check off with strikethrough, hide or show completed, delete, reorder.
4. **0.4, Hosting and phone layout.** Hosted on GitHub Pages, so the app can be tried on a phone and added to the home screen. Each device still keeps its own notes; nothing syncs yet.
5. **0.5, Sync, offline editing, and sign-in.** Supabase database with access rules and sign-in by email code, so notes and tasks follow you between phone and computer. Changes are saved on the device first and sent when there's a connection, so the app works fully offline; if the same item changes on two devices, the later change wins. Separate accounts per person, with each person's copy on a shared device kept apart and cleared on sign-out. Sign-up limited to an allowed list of emails. Existing notes on a device can be uploaded at first sign-in.
   **0.5.1, Pause notes and library alerts.** No keep-alive service for now: normal use keeps the database active, and Supabase emails a warning before pausing. The README explains what can happen and what to do. Dependabot library alerts watch the Supabase library, listed in package.json.
6. **0.6, Recently deleted.** Deleted folders, notes, task lists and single tasks can be restored for 30 days, on every device; after that they're erased, from the database too.
7. **0.7, Read-only sharing and Settings and help (minimally shareable version).** Share a single note or task list by unguessable link (whole folders later); viewers see live updates without signing in; turn a link off or replace it. A Settings and help page (account, backups, a link to a separate Shared links page, and Help and About) takes over the crowded bottom of the sidebar.
   **0.7.1, Edit links.** The Share panel offers "Can view" or "Can edit". Anyone with an edit link can change the note or task list in their browser, without signing in; editing through a link needs a connection.
8. **0.8, Export, search, restore choices, and export reminder (MVP complete).** One "Export everything" ZIP file with every note and task list as Markdown (tasks as checklists), in separate Notes and Tasks folders, plus the backup file. Restore accepts the ZIP or the backup file, and offers "Add what's missing" (the default: only items you don't currently have come back, so an old backup can't overwrite newer work) or "Replace everything". Search across notes and tasks. A reminder banner when the last export is about six months old; "Not now" hides it for two weeks.
9. **0.9, Folders inside folders, and moving.** Folders can hold folders, with indents that shrink at each level and stop after four. "Move to…" for notes, task lists and folders everywhere, and dragging onto folders on a computer. Deleting uses the app's own window, with "Yes, delete" and "Cancel".
10. **0.10, Pinned items.** Folders, notes and task lists can be pinned to the top of their own level.
11. **Later.** First, set up the twice-yearly scheduled check by Claude. After that, work from the prioritized enhancements list below.

Versions stay below 1.0 until the app feels solid enough for daily use without surprises.

## Enhancements, prioritized

Read-only sharing is version 0.7 in the phase plan. After the MVP, the next candidates in Oscar's order are nested folders, moving items into folders (to be clarified: dragging onto folders in the sidebar, or moving tasks between lists), pinned items, and subtasks. All priorities and sizes here are tentative and speculative for now, meant to be re-sorted at each version; items Claude suggested are marked so they can be weighed accordingly.

| Enhancement | Side | Raised by | Priority | Size |
| --- | --- | --- | --- | --- |
| Show a folder on only one side (folders are shared by Notes and Tasks from 0.3) | Both | Oscar | Soon | Small |
| Custom domain, before sharing links widely | Setup | Claude | Next | Small |
| "Invite someone" screen for the owner, adding an email to the allowed list without the Supabase dashboard | Setup | Oscar | Later | Small |
| Email sending from a custom domain instead of the dedicated Gmail account, if a domain is ever added | Setup | Claude | Later | Small |
| Daily keep-alive (cron-job.org), only if database pausing becomes a problem | Setup | Oscar | Low | Small |
| Instant updates between devices and shared pages (Supabase Realtime); also look into why an open note sometimes doesn't update while watched (known issue from 0.7.2 testing) | Both | Oscar | Later | Medium |
| Restore by picking and choosing: see what's in a backup (missing, changed, same) and tick what to bring back | Both | Claude | Later | Medium |
| Short guide for people using the app, once others use it | Both | Oscar | Low | Small |
| Distinct look for each side | Both | Oscar | Soon | Small |
| Colors that vary each time the app opens: blues, purples and oranges for Notes; yellows and greens for Tasks. A new color can be liked and saved as a favorite, so it comes up again and can be picked from a list of favorites (see docs/design.md) | Both | Oscar | Soon | Small to medium |
| Due dates | Tasks | Claude | Soon | Small |
| Task priorities | Tasks | Claude | Soon | Small |
| Dark mode | Both | Claude | Soon | Small |
| Edit sharing with specific people (shared items appear in each person's own app, with offline editing) | Both | Oscar | Later | Large |
| "Save a copy to my Anthology" on a shared page | Both | Claude | Later | Small |
| Formatting toolbar (rich text) | Notes | Oscar | Soon | Large |
| Live co-editing | Both | Oscar | Later | Large |
| Subtasks | Tasks | Claude | Later | Medium |
| Reminders and notifications | Tasks | Claude | Later | Large |

A suggested way to sort: value to daily use first, then size. Small items with high value move up; large items wait until the basics feel settled.

## Secrets and security

One key must never appear in the repository or the website: Supabase's secret key. Everything else here is either safe to be public or a setting to get right. New items get added as they come up.

| Item | What it is | How to handle it | Comes up at |
| --- | --- | --- | --- |
| GitHub and Supabase accounts | The keys to everything else | Strong password and two-factor sign-in on both | Setup |
| Ignore list (.gitignore) | A file telling GitHub which local files never to upload | Created with the repository; local settings files go on it | Setup |
| Supabase project address | The address the app uses to reach the database | Safe to be public | 0.5 |
| Supabase public key (called anon or publishable) | Identifies the app to Supabase | Designed to sit in the website code; safe only when access rules are on | 0.5 |
| Supabase secret key (called service role or secret) | Full access that bypasses access rules | Never in the repository or website; stays in the Supabase dashboard | 0.5 |
| Access rules (row level security) | Database rules for who can read or change what | On for every table; tested by trying to read data while signed out | 0.5, and each new table |
| Sign-in redirect setting | Where the email sign-in link is allowed to send you | Limited to the app's own address | 0.5 |
| Sign-up check | Turns away new accounts for emails not on the allowed list | Supabase's "allow new users to sign up" stays on; the check (a "Before User Created" hook) does the limiting. Tested by trying to sign in with an email not on the list | 0.5 |
| Share links | The unguessable part of a shared link | Long and random; treated like a password; can be turned off or replaced | 0.7 |
| Allowed list of emails | Who may create an account | Kept in the database, readable only by the sign-up check; changed by the owner | 0.5 |
| Access-code email account | anthologyaccess@gmail.com, which sends access codes | Strong password and 2-Step Verification; nothing else uses it | 0.5 |
| Gmail app password | Lets Supabase send email from anthologyaccess (a Google feature for outside programs) | Entered only in Supabase's email (SMTP) settings, never in the repository; can be deleted and replaced in the Google account | 0.5 |
| Keep-alive service (only if added) | Outside service (cron-job.org) that checks in with the database daily | Uses only the public key, never the secret key; its account gets a strong password | If added from the enhancements list |

## Hosting and public code notes

GitHub Pages from a public repository is the starting point. Three things are worth knowing about that choice.

**Shared links and moving hosts.** Without a custom domain, the app's address is something like yourusername.github.io/app-name. Links shared with that address break if the app later moves to another host. A custom domain (roughly $10 to $15 a year) keeps the same address no matter where the app is hosted, so it's worth adding before links spread widely. Waiting is fine for now. A good time to revisit is just before 0.7, or at the latest before sharing links people are likely to keep or bookmark. Links shared before the switch would need to be re-sent.

**Email in the project history.** Each saved change in the repository records an email address, and public repositories can be scanned for addresses. The likely worst case is extra spam. GitHub offers a private no-reply address; switching later doesn't change older entries. Low concern for now.

**Others reading or copying the code.** Normal for public repositories. Without a license, others can read the code but don't have permission to reuse it; adding an open license grants that permission. Your notes and tasks are never in the repository, only in the database. Low concern for now.

## Working from your phone

Small changes can be made from the Claude app on your phone using cloud sessions. These run on Anthropic's servers, so the laptop can be off or asleep. Remote Control, which drives a laptop session from the phone, was considered and set aside because it needs the laptop kept awake.

**One-time setup (done at 0.1)**

1. On the laptop, open claude.ai/code in a browser and sign in to Claude.
2. Follow the prompt to connect GitHub. On GitHub's page, sign in with the security key and approve.
3. If offered, install the Claude GitHub App, choosing only the anthology repository.
4. On the phone, open the Claude app, tap Code, start a new session, and confirm anthology appears in the repository list.

**Each time (after 0.4)**

1. In the Claude app, tap Code, start a new session, and choose anthology.
2. Choose Plan mode, so Claude proposes an approach before changing anything, then describe the change.
3. When Claude finishes, create the pull request with the button in the session.
4. To keep going before it's merged, stay in the same session; later changes join the same pull request. A new session starts from the main version and won't see unmerged work.
5. To merge, ask the phone session to merge the pull request. If it can't, the next laptop session offers to merge it, since CLAUDE.md asks Claude Code to check for open pull requests at the start of each session.

Changes made from the phone appear in the live app only after they're merged.

## Open questions

- [x] App name: Anthology, as a working title. No conflicting notes or task apps found.
- [x] Email in project history: usual address for now.
- [x] License: none for now.
- [ ] Custom domain: optional, not planned. Shared links will use the github.io address and would break only if the app moved to another host (see hosting notes). Roughly $10 to $20 a year and about an hour of setup if ever wanted.
- [x] Recently deleted folder: first, as 0.6, ahead of sharing (0.7) and export and search (0.8).
- [x] Sharing at 0.7: single notes and task lists first; whole folders later.
- [x] Where this plan lives: in the repository as docs/plan.md, the single source of truth.
- [x] Keep-alive for Supabase pausing: none for now (decided at 0.5.1). Normal use keeps the database active, Supabase emails a warning before pausing, and the README explains what to do. A cron-job.org check-in is on the enhancements list if needed.
- [x] Sign-in: email code rather than link, so it works in a home-screen app on iPhone.
- [x] Other people: separate accounts, added through an allowed list of emails; sharing items between people stays on the enhancements list.
- [x] Whether Supabase's free plan includes the check that runs before an account is created (needed for the allowed list): yes, per Supabase's documentation.
- [x] Email for access codes: a dedicated Gmail account. Supabase's built-in email only reaches the project's dashboard team, sends 2 emails an hour, can't be customized to include a code, and is meant for testing only.
- [x] Write docs/access-decisions.md ("Access options and decisions"): why a database, Supabase versus Firebase, every access option considered, and why the dedicated Gmail account was chosen.
- [x] Connecting the Supabase project to GitHub: not for now. Database scripts are kept in the supabase folder and run by hand in the SQL editor.

## Upkeep: automated checks and a twice-yearly review

Most checks run automatically and only get in touch when something needs attention. What's left is a short review twice a year, about 15 minutes. Screen and menu names may shift over time, so look for the closest match.

### Automated

- **Supabase pause emails** (built in). Supabase emails the owner about a week before pausing the database, and again once paused. The README explains what to do.
- **GitHub secret scanning** (turned on when the repository is created). Blocks saving changes that contain recognized keys. CodeQL, turned on at the same time, checks the code for common security problems once there is code to check. Whether it recognizes Supabase keys is to be confirmed at setup.
- **Library security alerts** (set up at 0.5.1). GitHub's Dependabot emails if the Supabase library has a known security problem, using package.json, a small file that names the library and its version. When updating the library, replace the copy in vendor/ and update the version in package.json and index.html.
- **Export reminder** (built into the app at 0.8). A banner appears when the last export is about six months old.
- **Scheduled check by Claude, twice a year** (set up after 0.8). Reads Supabase's pricing page for changes, compares the app's library version with the latest release, checks GitHub security alerts, adds a dated line to the upkeep log, and sends you a short summary. To be tested to confirm a scheduled run can reach the repository and the web.

### Twice a year

- [ ] **Read the summary.** Open the latest summary from the scheduled check. If anything is flagged, bring it to a chat.
- [ ] **Export and back up.** When the export banner appears, choose Export everything (Settings and help, Backups).
  - Open two or three notes and task lists in a plain text app, to confirm the contents look complete.
  - Store the export somewhere safe, such as a cloud drive folder.
- [ ] **Review shared links (after 0.7).** In the app, open Settings and help, then Shared links, and turn off any no longer needed.

### Once a year, only after a custom domain is added

- [ ] **Domain renewal.** Sign in to the domain provider and confirm auto-renew is on and the payment card on file hasn't expired.

## Changelog formats

Two changelogs, both newest version first: a summary for a quick look, and a detailed log for revisiting decisions months later.

Version numbers: new features raise the middle number (0.1, 0.2, 0.3). Small fixes can add a third number (0.2.1) if that turns out to be useful. Version 1.0 is reserved for when the app feels dependable for daily use.

Summary changelog, one or two plain-language lines per version:

```markdown
# Changelog (summary)

## 0.3 (date)
Tasks side added: lists, check off with strikethrough, hide completed.

## 0.2 (date)
Notes with folders, saved in the browser.

## 0.1 (date)
Project set up: repository, starter files, and plan.
```

Detailed changelog, with what changed, why, and anything to know later:

```markdown
# Changelog (detailed)

## 0.3 (date)

Added
- Task lists inside folders
- Checking a task applies strikethrough and moves it below open tasks

Changed
- Sidebar toggle now remembers the last side used

Fixed
- Note titles not updating after editing the first line

Why
- Moved completed tasks to the bottom so open ones stay visible

Notes for later
- Reordering works with buttons for now; drag to reorder is on the enhancements list
```
