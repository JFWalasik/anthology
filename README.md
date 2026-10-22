# Anthology

Anthology is a browser-based notes and tasks app for personal use, built to last for years. One app holds both, with a toggle between the Notes side and the Tasks side.

The live app is at https://jfwalasik.github.io/anthology/. To get in, enter your email and the access code emailed to you; only emails on the allowed list can get in. Notes and tasks sync between devices and work offline. A note or task list can be shared by link, either view-only or editable. Search is at the top of the sidebar. Settings and help, at the bottom of the sidebar, has export and backups, shared links, and short help.

## Adding Anthology to your phone's home screen

Copy and send these steps to anyone who needs them:

> **iPhone:** Open https://jfwalasik.github.io/anthology/ in Safari. Tap the Share button (the square with an arrow pointing up), scroll down, and tap Add to Home Screen, then Add. Open Anthology from the new icon and enter your email to get an access code.
>
> **Android:** Open https://jfwalasik.github.io/anthology/ in Chrome. Tap the menu (three dots, top right), then Add to Home screen or Install app, and confirm. Open Anthology from the new icon and enter your email to get an access code.

On iPhone, the home-screen app signs in separately from Safari, so enter the access code in the home-screen app itself.

## Important: the database can pause

Anthology's notes and tasks are stored in a free Supabase database. Supabase pauses free databases after about a week of little or no use. Nothing is lost when this happens, but it needs attention.

**Keeping it awake:** use Anthology. Opening it on any device every few days is enough. Nothing else is needed.

**What to look for:** an email from Supabase saying your project "anthology" is going to be paused, sent about a week beforehand, and a second email once it has been paused. Both go to the email address on your Supabase account (the one you signed up to Supabase with).

**If you get the warning email:** open Anthology once on any device. That counts as use and stops the pause.

**If it has been paused:**

- Devices already signed in still open your notes, and you can keep editing; changes wait on the device. The app may say it can't reach the database. A new device can't get in until the database is resumed.
- To resume it:
  1. Go to supabase.com and sign in, the same way you did when you created the account.
  2. Open the project named **anthology**.
  3. Click **Resume project** and confirm. It takes a few minutes.
  4. Open Anthology. Waiting changes go up on their own.
- Resume within a year. Supabase keeps a paused project's data for up to a year. As extra insurance, use **Export everything** (Settings and help) now and then; the app reminds you every six months.

If pausing ever becomes a nuisance, a free daily check-in service can keep the database awake automatically; it's on the enhancements list in docs/plan.md.

## Working on the app

To try changes before they go live, open index.html from the project folder in a browser.

How people get into the app, and why it works that way, is explained in [docs/access-decisions.md](docs/access-decisions.md).

The plan for the project is in [docs/plan.md](docs/plan.md).
