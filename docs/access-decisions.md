# Access options and decisions

Written Oct 22, 2026, for Anthology 0.5 · owner: Oscar

This explains how people get into Anthology, which other ways were considered, and why this one was chosen. It's written for someone who has never heard of Supabase, including a future Oscar who has forgotten the details.

## The short version

People get in by entering their email address and then a 6-digit access code, which is emailed to them from a dedicated Gmail account, anthologyaccess@gmail.com. They do this once on each device and then stay signed in for months.

This was the simplest option that met all of these at once:

- works on phones, including Anthology added to an iPhone home screen
- works for more than one person (Oscar and Oscar's SO for now, perhaps others later)
- no passwords
- no access to Oscar's personal email

## Why the app needs a database

Until version 0.5, notes and tasks were saved inside the browser on one device. Notes written on the phone never appeared on the computer, and clearing the browser could erase them.

To have the same notes everywhere, they have to live somewhere online that every device can reach. That's a database. And once notes are online, the database has to know who is asking, so that each person sees only their own notes. That is the only reason Anthology needs any kind of access step at all.

## Choosing the database: Supabase or Firebase

Both are services where a company runs the database and the sign-in system, so Anthology doesn't need its own server.

- **Supabase** is built on PostgreSQL, a widely used open-source database. Data can be exported in a standard form, moved to another company, or even run on your own computer.
- **Firebase** is Google's equivalent. It stores data in Google's own format, which is harder to move elsewhere.

Supabase was chosen because one of the project's principles is that the data must always be movable. Its free plan is more than enough for this app.

What this choice means:

- Oscar has a Supabase account, used to manage the database on Supabase's website.
- On the free plan, Supabase pauses a project after about a week with no activity. The data is kept, and a small daily automatic check (planned for 0.5.1) prevents the pause.
- Supabase's rules for sending email shaped the access decision, as explained below.

## Two different kinds of account

These are easy to confuse:

- **The Supabase account** is for the Supabase website, where the database is set up and managed. Only Oscar has one. Supabase groups the people who manage a project into an "organization" (its documentation also calls them the project's "team"). Oscar is its only member. Anyone added to it can see and change everything in the project, including everyone's notes.
- **Anthology accounts** are for people using the app. They live in a list of users inside the project. People using Anthology never see Supabase's website. This document is about these accounts.

## Terms used here

- **Access code:** a 6-digit number, sent by email, that's typed into the app. It works once and expires after an hour.
- **Email sender:** whatever actually sends an email on the app's behalf. Supabase has a built-in one, or it can send through an email account you connect to it. Programs connect to email accounts using SMTP, the standard method for sending email between programs.
- **App password:** Google's own term for a separate password that lets one outside program, here Supabase, send email from a Gmail account. It can't be used to sign in to the Gmail account itself, and it can be deleted at any time.
- **Allowed list:** a list of email addresses kept in the database. Only those addresses can create an Anthology account.
- **Home-screen app:** Anthology added to a phone's home screen. It opens full-screen like an app, but it's the same website.

## The iPhone link problem

Many apps let you in by emailing a link: you tap it, and you're signed in. On an iPhone, this fails for Anthology's home-screen app:

1. On iPhone, a home-screen app keeps its own separate storage, apart from Safari. Being signed in to one doesn't sign you in to the other.
2. When you tap a link in an email, the iPhone always opens it in Safari, never in the home-screen app.
3. So tapping a sign-in link signs you in to Anthology in Safari, while the home-screen app stays signed out.

An access code avoids this, because you type it into whichever app you're using. Codes also work on Android phones and computers, so one method works everywhere. (The access email also includes a link, which works fine on a computer.)

## The options considered

| Option | Works in the iPhone home-screen app | No password | One-time setup | Decision |
| --- | --- | --- | --- | --- |
| Code or link from Supabase's built-in email | No (link only) | Yes | None | Not suitable |
| Code sent from Oscar's personal email | Yes | Yes | Small | Ruled out |
| Code sent from a dedicated Gmail account | Yes | Yes | About 30 minutes | **Chosen** |
| Code sent from a custom domain through an email service | Yes | Yes | About an hour, plus a domain | Possible later |
| Passwords | Yes | No | Small | Reluctant last resort |
| Sign in with Google | Uncertain | Yes | 20 to 30 minutes | Possible later |
| Sign in with Apple | Uncertain | Yes | $99 a year | Ruled out |
| Text-message codes | Yes | Yes | Paid texting service | Ruled out |
| Firebase instead of Supabase | No (link only) | Yes | Moving the database | Not better |

**1. Supabase's built-in email.** Supabase can send access emails without any setup, but its documentation describes the built-in sender as for testing, not everyday use:

- It only delivers to members of the project's organization (see "Two different kinds of account"). To reach Oscar's SO, they'd have to be added to the organization, which would let them see and change everything, including Oscar's notes.
- It sends at most 2 emails an hour for the whole project. For two people who rarely sign in, that would seldom matter; it mostly gets in the way while testing or setting up several devices at once.
- Its emails can't be edited unless you connect your own email sender, so they can only contain a link, not a code. That runs straight into the iPhone link problem.

**2. Oscar's personal email as the sender.** Supabase would need permission to send email from Oscar's own account. It would work, but giving a service access to personal email was ruled out.

**3. A dedicated Gmail account as the sender (chosen).** A separate Gmail account, used for nothing else, sends the codes. Supabase gets an app password for that account only.

- For people: enter your email, type the code. Nothing else.
- Setup: create the Gmail account, turn on 2-Step Verification, create an app password, and enter it in Supabase's email settings.
- Risks: Google might one day disable the account (new accounts that only send automated email are sometimes flagged), or stop offering app passwords. Either way, devices already signed in keep working, and the sender can be replaced without changing the app.
- Upkeep: one more account in the password manager.

**4. A custom domain with an email-sending service.** Buy a web address (about $10 to $15 a year) and connect it to a service such as Resend, so codes come from an address like signin@yourdomain.com. This is the most polished option, but it needs the domain plus two new accounts. Without a domain, these services either only send to your own address or tend to land in spam. Worth revisiting only if a domain is bought for another reason.

**5. Passwords.** Oscar would create each account in Supabase with an email and password, and a password manager would fill it in. Setup is simple and no email is sent. It was set aside because passwords don't suit a simple notes app; they remain the fallback if every email option failed.

**6. Sign in with Google.** People tap "Sign in with Google" and pick their Google account. Their Google password is only ever typed on Google's own page; Supabase receives a signed confirmation from Google and stores just the email and name. Each person needs a Google account, and Oscar would do 20 to 30 minutes of setup on Google's developer website, which is free. The open question is iPhone home-screen apps: signing in means leaving the app for Google's page and coming back, which has historically been unreliable there. It could be added later as a second way in, after testing on an iPhone.

**7. Sign in with Apple.** Similar to Google, but the setup needs a paid Apple developer membership, $99 a year.

**8. Text-message codes.** Supabase supports these, but they need a paid texting service.

**9. Firebase instead of Supabase.** Firebase sends sign-in emails itself without setup, but only as links (the iPhone problem again), and its free plan sends at most 5 sign-in emails a day. It wouldn't have been simpler.

## Why the dedicated Gmail account

- It keeps the experience to "enter your email, type the code", with no passwords.
- It keeps Oscar's personal email out of it entirely.
- It works for anyone on the allowed list, on every device, including the iPhone home-screen app.
- The setup is one-time, and the only upkeep is one more saved account.
- It's easy to replace: switching to another email sender later, such as a custom domain, is a change in Supabase's settings, not in the app.

## How it's set up, for reference

- **Gmail account:** anthologyaccess@gmail.com, named "Anthology Access", with 2-Step Verification on and an app password named "Supabase".
- **Supabase email settings** (Authentication, then Emails, then SMTP Settings): host smtp.gmail.com, port 465, username anthologyaccess@gmail.com, the app password, sender name "Anthology Access".
- **Email templates** (Authentication, then Emails, then Templates): "Confirm signup" (used the first time someone gets in) and "Magic Link" (used after that) both contain the code (`{{ .Token }}`) and a link.
- **Allowed list:** the `allowed_emails` table. A check that runs before Supabase creates any new account (a "Before User Created" hook, under Authentication, then Hooks) turns away addresses not on the list. Both come from `supabase/001_setup.sql`.
- **Return address** (Authentication, then URL Configuration): the app's address, so the link in the email can only lead back to Anthology.

## Adding someone

1. In Supabase, open Table Editor, then `allowed_emails`, and insert a row with their email in lowercase.
2. Tell them to open Anthology, enter that email, and type the code they receive.

Worth telling them: as the project's owner, Oscar could technically see their notes on Supabase's website.

## If codes stop arriving

- Devices already signed in keep working; only getting in on a new device is affected.
- Check the spam folder.
- Sign in to anthologyaccess@gmail.com. Look for warnings from Google, and check whether the codes appear in its Sent folder.
- If the app password was removed, create a new one in that Google account and enter it in Supabase's email settings.
- Supabase's Authentication logs show any errors from sending.
- If Gmail can't be used any more, switch to option 4, or to passwords as a stopgap.

## What this doesn't cover

Sharing notes or task lists between people, such as a shared grocery list, is a separate feature on the enhancements list in docs/plan.md.
