# Quickstart: developing Anthology

Written Oct 23, 2026, at version 0.9; updated at 1.1. A short refresher for coming back after a few weeks away. Details live in docs/plan.md (decisions and phases), docs/roadmap.md (what's next), docs/design.md (look and feel) and docs/access-decisions.md (how people get in). Words in *italics* are explained in "Key terms" at the end.

## 1. What Anthology is made of

- **The app's files** live in a *repository* on GitHub: github.com/JFWalasik/anthology. A copy is on the Mac in Projects3/anthology.
- **GitHub Pages** publishes the live app from the main version of those files, at https://jfwalasik.github.io/anthology/. Every *push* to main (or *merged pull request*) goes live within about a minute.
- **Supabase** holds everyone's notes and tasks in a *database*, and checks who can get in. Project name: **anthology**.
- **anthologyaccess@gmail.com** sends the 6-digit access codes, through Supabase.
- **Claude Code** makes the changes: at the desk (this Mac) or from the phone (Claude app, Code tab).

## 2. Starting a development session

1. **Desk or phone?** docs/roadmap.md splits the work. Phone sessions suit small changes to the app itself; anything needing a *database script*, the Supabase dashboard, or careful testing is for the desk.
2. **Tell Claude** something like: "Read docs/roadmap.md and docs/plan.md, then let's plan [feature]." CLAUDE.md is read automatically, and asks Claude to check GitHub for unmerged phone work first.
3. **Which version is live?** In the app: Settings and help, at the bottom. On a phone, fully close and reopen the app to pick up an update.
4. **Testing** happens on a test copy on the Mac (`localhost:8765`, in Claude's Browser pane), signed in with your account. Claude uses items titled "TEST…" and removes them afterwards. You may be asked to sign in there with an access code.
5. **Releasing:** each version updates the version number in app.js, storage.js and sw.js, plus both changelogs. Pushing makes it live.

**From the phone** (sessions run on GitHub's copy in the cloud, so the Mac can be off):

1. In the Claude app, tap the menu button (three lines, top left) and choose Code. Tap New session. A button with the GitHub icon should show "anthology - main": Claude Code will work on the anthology repository on GitHub, starting from its main version. If it shows a different repository, tap it and choose anthology.
2. **Check it's in the right place** before asking for anything: "Read CLAUDE.md and docs/roadmap.md, and tell me the app's current version." If it can't find those files, start a new session and choose anthology.
3. Use Plan mode, and ask for one small change.
4. When it's done, create the pull request with the button in the session, then merge it (or leave it for the next desk session, which offers to merge it).
5. Check the change on the live app (on a phone, fully close and reopen it).
6. Phone sessions can't sign in to the test copy or run the smoke test, so keep changes small; the next desk session can run the smoke test. If a change turns out to need a database script, stop and leave it for the desk.

**If the GitHub button or "anthology" doesn't appear:**

- Tap the button, if there is one, and look for anthology in the list; it may be set to another repository.
- If anthology isn't in the list, the GitHub connection may need renewing. On the Mac, open claude.ai/code in a browser and follow its prompt to connect GitHub. Then check on GitHub that Claude can reach the repository: github.com/settings/installations, then Claude, then Repository access, which should include anthology. Then start a new session on the phone.
- Don't do the work in a session without anthology chosen: Claude won't find the project's files or CLAUDE.md, and nothing it changes would reach the app.

## 3. Your accounts

- **GitHub:** password and security key. **Supabase signs you in through GitHub** ("Continue with GitHub"), so there is no Supabase password, and your GitHub account protects everything. Keep its two-step sign-in on.
- **Supabase:** sign in at supabase.com with "Continue with GitHub". Supabase's own emails (including pause warnings) go to the email address on your GitHub account.
- **anthologyaccess@gmail.com:** in your password manager, with 2-Step Verification. Its *app password* is stored only in Supabase; if it's ever lost, make a new one in that Google account.

## 4. Supabase, step by step

**Sign in:** supabase.com, then Continue with GitHub, then open the **anthology** project.

**Let someone in (or take them out):**
1. Table Editor, then **allowed_emails**, then Insert, then Insert row. Type their email in lowercase; leave added_at empty. Save.
2. Tell them to open the app, enter that email, and type the code they receive.
3. To take someone out: delete their row in allowed_emails, and under Authentication, then Users, delete their account (this removes their notes too).

**Run a new database script** (when Claude writes one, in the supabase folder):
1. SQL Editor, then Create a new snippet.
2. Paste the whole script and click Run. A warning about "destructive operations" is normal for scripts that change permissions.
3. "Success. No rows returned" means it worked. Anything else: paste the message to Claude.
4. Scripts run so far: 001 (tables, access rules, allowed list), 002 (sharing), 003 (edit links), 004 (pinned items), 005 (Delete now reaches every device: when an item is deleted for good, with Delete now or Empty, it's removed from other devices that had it, including their Recently deleted).

**Look, but be careful:** Table Editor shows all data, including other people's notes. Editing there skips the app's safety checks, so avoid it except for allowed_emails.

**Where the settings are:**
- Authentication, then Hooks: the sign-up check (Before User Created)
- Authentication, then Emails: the code email templates and the SMTP (email sending) settings
- Authentication, then URL Configuration: the app's address (must change if the address does; see section 7)
- Project Settings, then API Keys: the publishable key (in the app) and the secret key (never copy it anywhere)
- Usage (Organization, then Usage): free-plan limits

## 5. Keeping it running

- **Pausing:** Supabase pauses a free project after about a week of little use. Using the app every few days prevents it. A warning email comes about a week before, to your GitHub email. **To resume:** sign in, open the project, click Resume project. Data is kept for up to a year after a pause. Devices already signed in keep working offline meanwhile.
- **Keep-alive:** none now, by decision (0.5.1). If pausing becomes a nuisance, a free service like cron-job.org can check in daily using only the publishable key; it's on the roadmap.
- **Exports:** the app reminds you every six months. Keep the ZIP somewhere off the device (for example a cloud drive).
- **Library alerts:** GitHub's Dependabot emails if the Supabase library has a security problem. Ask Claude to update it: it replaces the copy in vendor/ and the version in package.json, index.html and sw.js.
- **If access codes stop arriving:** devices already signed in keep working. Check spam; sign in to anthologyaccess@gmail.com and look for warnings; if needed, make a new app password and enter it under Authentication, then Emails, then SMTP Settings.
- **Planned:** a twice-yearly check run by Claude (first desk item on the roadmap).

## 6. Decisions worth remembering

- Supabase over Firebase: data stays portable (standard database, exportable).
- Access by emailed code, sent from a dedicated Gmail; no passwords; personal email kept out. (docs/access-decisions.md)
- Folders are shared by Notes and Tasks, and can nest without limit.
- Sharing by link (view or edit), not between accounts; edit links need a connection.
- Recently deleted keeps things 30 days; restore "adds what's missing" by default.
- Offline first: changes save on the device and sync; if two devices change the same thing, the later change wins.
- Plain HTML, CSS and JavaScript, no build step; one outside library (Supabase), kept as a copy in the repository.
- No keep-alive and no custom domain for now.

## 7. If you ever move to a custom domain

A custom domain (like anthologynotes.com, about $10 to $15 a year) changes the app's address. What that means:

- **Your notes don't move:** they live in Supabase, not at the address. Nothing needs copying.
- **Everyone needs the new address:** each person signs in again there and re-adds the home-screen icon. Before switching, open the app once at the old address so any offline changes are synced.
- **Shared links:** new links use the new address. Old links probably keep working while the app stays on GitHub Pages, because GitHub likely redirects the old address to the new one, but this isn't confirmed in GitHub's documentation; check at the time. If the app ever moves off GitHub Pages, old links will stop working and would need re-sending.
- **Supabase:** update Site URL and Redirect URLs (Authentication, then URL Configuration) to the new address.
- **Optional:** send access codes from the domain instead of the Gmail account (on the roadmap).

## 8. Known issues and limits

- About 1 in 20 requests to Supabase gets no answer; the app retries, so it shows only as an occasional delay.
- Changes from another device or an edit link take 15 seconds or more to appear.
- If two people edit the same note at the same moment, the later save wins for the whole note (task lists are safer).
- On iPhone, the home-screen app signs in separately from Safari.
- Free-plan limits: 30 access emails an hour; 500 MB of data (a very large number of notes).

## 9. Other things worth knowing

- **Keep main working:** changes go live as soon as they're pushed or merged. Keep phone changes small.
- **Never paste the secret key or any password into a chat.** The publishable key is designed to be public.
- **What could cost money:** Supabase's paid plan (if usage grew a lot, or to avoid pausing), and a domain. Everything else is free.
- **The app's code is split by feature** (since 1.1). Versions 0.1 to 0.10 kept all of it in one file, app.js (about 2,400 lines). In 1.1 that code was divided, unchanged, into app.js (the shared core, which starts the app) and nine feature files: sidebar, editor, tasks, sharing, search, backup, access, pages, and ui (pieces several features use). Smaller files make changes easier, especially from the phone. CLAUDE.md has the map.

## Key terms

- **Repository:** the project's folder of files, with a full history of changes, kept on GitHub.
- **Commit:** a saved version of the files, with a short note. **Push:** sending commits to GitHub.
- **Pull request:** a proposed set of changes (phone sessions make these); **merging** it applies them to main.
- **Database / table:** where data lives, organised like spreadsheets (folders, notes, task_lists, tasks, share_links, allowed_emails).
- **Access rules (row level security):** database rules so each person can only reach their own data.
- **Publishable key / secret key:** the publishable key identifies the app and is safe to be public; the secret key bypasses all access rules and must never leave the Supabase dashboard.
- **Database script (SQL):** instructions that change the database's setup, run in the SQL Editor.
- **Hook:** a check Supabase runs at a set moment; ours runs before an account is created and turns away emails not on the list.
- **SMTP / app password:** SMTP is the standard way programs send email; an app password is Google's separate password letting one program (Supabase) send from a Gmail account.
- **Sync / offline copy:** each device keeps a copy of your data and exchanges changes with the database when there's a connection.
- **Version numbers:** 1.1, 1.2, and so on for new features; a third number (1.1.1) for small fixes. Numbering went from 0.10 straight to 1.1, since the app was already dependable for daily use.
