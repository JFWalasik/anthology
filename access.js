// access.js
// Getting in: the access screen (email, then a 6-digit code) and signing out.
// Uses the shared state and helpers in app.js.

// ---- Access screen ----
// People get in by entering their email, then the 6-digit code emailed to them.
// After that they stay signed in on that device.

let accessEmail = '';

function showAccess(message = '') {
  document.body.classList.add('signed-out');
  els.layout.hidden = true;
  els.access.hidden = false;
  els.accessEmailForm.hidden = false;
  els.accessCodeForm.hidden = true;
  els.accessMessage.textContent = message;
  els.accessEmail.focus();
}

// Turns Supabase's error messages into plain ones.
function accessProblem(err) {
  const text = (err && err.message) || '';
  if (!navigator.onLine) return "You're offline. Connect to the internet to get in.";
  if (/on the list/i.test(text)) return "This email isn't on the list for Anthology.";
  if (/expired|invalid/i.test(text)) return "That code didn't work. It may have expired; you can send a new one.";
  if (/rate|too many|seconds/i.test(text)) return 'Too many tries in a short time. Wait a minute, then try again.';
  return `Something went wrong (${text || 'unknown problem'}). Try again in a moment.`;
}

async function sendAccessCode(email) {
  els.accessMessage.textContent = 'Sending…';
  try {
    await Storage.sendCode(email);
  } catch (err) {
    console.error(err);
    els.accessMessage.textContent = accessProblem(err);
    return;
  }
  accessEmail = email;
  els.accessEmailForm.hidden = true;
  els.accessCodeForm.hidden = false;
  els.accessCodeIntro.textContent = `A code is on its way to ${email}. Enter it here.`;
  els.accessCode.value = '';
  els.accessMessage.textContent = '';
  els.accessCode.focus();
}

async function checkAccessCode() {
  const code = els.accessCode.value.replace(/\D/g, '');
  if (code.length < 6) {
    els.accessMessage.textContent = 'Enter the 6-digit code from the email.';
    return;
  }
  els.accessMessage.textContent = 'Checking…';
  let user;
  try {
    user = await Storage.verifyCode(accessEmail, code);
  } catch (err) {
    console.error(err);
    els.accessMessage.textContent = accessProblem(err);
    return;
  }
  els.accessMessage.textContent = '';
  await startApp(user);
}

async function signOut() {
  await flushSaves();
  if (Storage.hasUnsynced()) await Storage.sync();
  if (Storage.hasUnsynced() && !confirm(
    "Some changes haven't reached the database yet, probably because you're offline. " +
    "If you sign out now, they'll be lost. Sign out anyway?"
  )) return;
  await Storage.signOut();
  location.reload();
}

// ---- Buttons and keys ----

function wireAccessEvents() {
  const byId = id => document.getElementById(id);

  byId('sign-out').addEventListener('click', signOut);

  // Access screen
  els.accessEmailForm.addEventListener('submit', event => {
    event.preventDefault();
    const email = els.accessEmail.value.trim().toLowerCase();
    if (email) sendAccessCode(email);
  });
  els.accessCodeForm.addEventListener('submit', event => {
    event.preventDefault();
    checkAccessCode();
  });
  byId('access-resend').addEventListener('click', () => sendAccessCode(accessEmail));
  byId('access-change').addEventListener('click', () => showAccess());
}
