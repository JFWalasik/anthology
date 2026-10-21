# Anthology: plan

Plan version 0.8 · started Oct 20, 2026 · updated Oct 21, 2026 · owner: Oscar

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

| Decision | Choice | Confidence | Why |
| --- | --- | --- | --- |
| App structure | One app, with a Notes/Tasks toggle | Moderate-high | Less duplicated work; each side can get its own look later |
| Code approach | Plain HTML, CSS and JavaScript, no build step | Moderate-high | Fewer dependencies, easier to read, ages well. Rich text can likely be added later with a library that needs no build step; live co-editing is the more likely point to revisit |
| Sync and database | Supabase | Moderate-high | Built on Postgres (open source), exportable, can be self-hosted; includes sign-in and access rules |
| Owner sign-in | Email link, no password, stays signed in for months | High | Needed so only the owner can read and change their data |
| Note format | Plain text with light Markdown-style formatting | Moderate | Exports cleanly; a formatting toolbar is planned soon after the MVP |
| Folders | One level in the MVP, nesting planned | High | Data designed from the start so nesting can be added |
| Sharing | Read-only links, no sign-in for viewers, first after the MVP (0.7) | Moderate-high | Lowest friction for viewers; edit sharing and co-editing kept in mind |
| Code home | Personal GitHub repository, public | Moderate | Simplest; can move to an organization later |
| Hosting | GitHub Pages | Moderate | Free and simple; easy to move later (see shared links note) |
| Export | Included in the MVP | High | Insurance against every other decision |

One Supabase limit to know about: [free projects pause after a week of low database activity](https://supabase.com/docs/guides/platform/free-project-pausing). Data is kept, and a paused project can be resumed from the dashboard in a couple of clicks for up to a year. A small automatic keep-alive (see the 0.5 phase and upkeep) should prevent pausing during quiet stretches.

## Phase plan

The MVP is complete at version 0.6, when the app syncs between phone and computer and can export everything. Sharing follows at 0.7.

1. **0.1, Setup.** Claude Code opened in the desktop app, a project folder on the laptop, and the GitHub repository created and linked to it, with secret scanning and CodeQL code checking turned on, and GitHub connected for phone sessions (see Working from your phone). Starter files added: README, CLAUDE.md with the project principles and working preferences, an ignore list, the two changelogs, an upkeep log, and this plan.
2. **0.2, Notes basics.** Notes/Tasks toggle, sidebar with one level of folders, create, edit, delete, autosave, first line as title. Saved in the browser only, as a short stepping stone to settle the look and feel. The saving code is kept in one place so it can be swapped for sync.
3. **0.3, Tasks basics.** Task lists inside folders; add, check off with strikethrough, hide or show completed, delete, reorder.
4. **0.4, Hosting and phone layout.** Hosted on GitHub Pages, so the app can be tried on a phone and added to the home screen. Each device still keeps its own notes; nothing syncs yet.
5. **0.5, Sync and sign-in.** Supabase database with access rules and email-link sign-in, so notes and tasks follow you between phone and computer. A free outside service (cron-job.org or UptimeRobot) checks in with the database daily so it doesn't pause during quiet weeks, with failure emails turned on. Dependabot library alerts are set up.
6. **0.6, Export, search, and recently deleted (MVP complete).** Export notes and tasks as Markdown files in folders, with tasks as checklists; search across notes and tasks; a recently deleted folder so deletes can be undone; a reminder banner when an export is due.
7. **0.7, Read-only sharing (minimally shareable version).** Share a single note or task list by unguessable link (whole folders later); turn a link off or replace it.
8. **Later.** First, set up the twice-yearly scheduled check by Claude. After that, work from the prioritized enhancements list below.

Versions stay below 1.0 until the app feels solid enough for daily use without surprises.

## Enhancements, prioritized

Read-only sharing comes first after the MVP, as version 0.7 in the phase plan. After that, nested folders, moving items between folders, and a custom domain look like the next candidates. All priorities and sizes here are tentative and speculative for now, meant to be re-sorted at each version; items Claude suggested are marked so they can be weighed accordingly.

| Enhancement | Side | Raised by | Priority | Size |
| --- | --- | --- | --- | --- |
| Nested folders | Both | Oscar | Next | Medium |
| Move items between folders (done for notes in 0.2.1) | Both | Claude | Next | Small |
| Custom domain, before sharing links widely | Setup | Claude | Next | Small |
| Distinct look for each side | Both | Oscar | Soon | Small |
| Colors that vary each time the app opens: blues, purples and oranges for Notes; yellows and greens for Tasks (see docs/design.md) | Both | Oscar | Soon | Small |
| Due dates | Tasks | Claude | Soon | Small |
| Task priorities | Tasks | Claude | Soon | Small |
| Pin notes to the top | Notes | Claude | Soon | Small |
| Dark mode | Both | Claude | Soon | Small |
| Edit sharing with specific people | Both | Oscar | Later | Large |
| Formatting toolbar (rich text) | Notes | Oscar | Soon | Large |
| Live co-editing | Both | Oscar | Later | Large |
| Offline editing that syncs later | Both | Claude | Later | Medium |
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
| Share links | The unguessable part of a shared link | Long and random; treated like a password; can be turned off or replaced | 0.7 |
| Keep-alive service | Outside service (cron-job.org or UptimeRobot) that checks in with the database daily | Uses only the public key, never the secret key; its account gets a strong password | 0.5 |

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
- [ ] Custom domain: waiting for now; revisit just before 0.7 (see hosting notes). Roughly $10 to $20 a year and about an hour of setup.
- [x] Recently deleted folder: moved into the MVP (0.6).
- [x] Sharing at 0.7: single notes and task lists first; whole folders later.
- [x] Where this plan lives: in the repository as docs/plan.md, the single source of truth.
- [x] Keep-alive for Supabase pausing: a free outside service (cron-job.org or UptimeRobot) that checks in daily, set up at 0.5.

## Upkeep: automated checks and a twice-yearly review

Most checks run automatically and only get in touch when something needs attention. What's left is a short review twice a year, about 15 minutes. Screen and menu names may shift over time, so look for the closest match.

### Automated

- **Keep-alive with failure alerts** (set up at 0.5). cron-job.org or UptimeRobot checks in with the database daily and emails you if a check fails.
- **Supabase pause emails** (built in). Supabase emails the owner about pausing, a backstop if the keep-alive fails.
- **GitHub secret scanning** (turned on when the repository is created). Blocks saving changes that contain recognized keys. CodeQL, turned on at the same time, checks the code for common security problems once there is code to check. Whether it recognizes Supabase keys is to be confirmed at setup.
- **Library update alerts** (set up at 0.5). GitHub's Dependabot emails about outdated or vulnerable libraries, using a small file that names the Supabase library version. To be tested with this setup.
- **Export reminder** (built into the app at 0.6). A banner appears when the last export is about six months old.
- **Scheduled check by Claude, twice a year** (set up after 0.7). Reads Supabase's pricing page for changes, compares the app's library version with the latest release, checks GitHub security alerts, adds a dated line to the upkeep log, and sends you a short summary. To be tested to confirm a scheduled run can reach the repository and the web.

### Twice a year

- [ ] **Read the summary.** Open the latest summary from the scheduled check. If anything is flagged, bring it to a chat.
- [ ] **Export and back up.** When the export banner appears, run a full export in the app.
  - Open two or three notes and task lists in a plain text app, to confirm the contents look complete.
  - Store the export somewhere safe, such as a cloud drive folder.
- [ ] **Review share links (after 0.7).** In the app, open the list of active share links and turn off any no longer needed.

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
