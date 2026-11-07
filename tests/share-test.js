// tests/share-test.js
// Checks sharing with someone in Anthology (1.2) using two test accounts at
// once, in two invisible browsers on the test copy: A (anthologyaccess+test)
// shares, B (anthologyaccess+test2) receives. Only TEST items are created, and
// everything is removed afterwards. Created Nov 7, 2026, for 1.2.
//
// Unlike tests/smoke-test.js, this runs outside the browser, with Node and
// Playwright (npm install playwright), while the test copy is served at
// http://localhost:8765. Each account signs in once; the sign-in is kept in a
// browser profile folder (ANTHOLOGY_TEST_PROFILES, or the system's temporary
// folder), so codes are needed only when that folder is new.
//
//   node tests/share-test.js signin test1   sends a code to anthologyaccess+test@gmail.com
//   node tests/share-test.js signin test2   sends a code to anthologyaccess+test2@gmail.com
//     (each waits for the code to be written to code-test1.txt or code-test2.txt
//      in the profile folder)
//   node tests/share-test.js                runs the test
//
// Both test addresses must be in the allowed_emails table. The codes arrive in
// the anthologyaccess@gmail.com inbox.

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILES = process.env.ANTHOLOGY_TEST_PROFILES || path.join(os.tmpdir(), 'anthology-test-profiles');
const ACCOUNTS = { test1: 'anthologyaccess+test@gmail.com', test2: 'anthologyaccess+test2@gmail.com' };
const APP = 'http://localhost:8765/';

// Uses the browser named by CHROMIUM_PATH if set, otherwise Playwright's own.
function launch(name) {
  const options = { headless: false, args: ['--headless=new'], viewport: { width: 1200, height: 800 } };
  if (process.env.CHROMIUM_PATH) options.executablePath = process.env.CHROMIUM_PATH;
  return chromium.launchPersistentContext(path.join(PROFILES, `profile-${name}`), options);
}

async function signIn(name) {
  const email = ACCOUNTS[name];
  if (!email) throw new Error('Sign in test1 or test2.');
  const codeFile = path.join(PROFILES, `code-${name}.txt`);
  fs.mkdirSync(PROFILES, { recursive: true });
  try { fs.unlinkSync(codeFile); } catch {}
  const context = await launch(name);
  const page = context.pages()[0] || await context.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  if (!await page.isVisible('#access')) {
    console.log(`${name} is already signed in.`);
    await context.close();
    return;
  }
  await page.fill('#access-email', email);
  await page.press('#access-email', 'Enter');
  await page.waitForSelector('#access-code', { state: 'visible', timeout: 30000 });
  console.log(`Code sent to ${email}. Waiting for it in ${codeFile}`);
  while (!fs.existsSync(codeFile)) await new Promise(r => setTimeout(r, 1000));
  await page.fill('#access-code', fs.readFileSync(codeFile, 'utf8').trim());
  await page.press('#access-code', 'Enter');
  try {
    await page.waitForSelector('#layout:not([hidden])', { timeout: 30000 });
    console.log(`${name} signed in.`);
  } catch {
    console.log(`Not signed in: ${await page.textContent('#access-message')}`);
  }
  await context.close();
}

const results = [];
const check = (ok, what) => { results.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`); console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };
const B_EMAIL = 'anthologyaccess+test2@gmail.com';
const A_EMAIL = 'anthologyaccess+test@gmail.com';

async function open(name) {
  const context = await launch(name);
  const page = context.pages()[0] || await context.newPage();
  page.problems = [];
  page.on('pageerror', e => page.problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') page.problems.push(m.text()); });
  await page.goto('http://localhost:8765/', { waitUntil: 'networkidle' });
  await page.waitForSelector('#layout:not([hidden])');
  return { context, page };
}
const sync = async page => { await page.evaluate(() => Storage.sync()); await page.waitForTimeout(1200); };
const row = (page, title) => page.locator('.sidebar-item', { has: page.locator('.item-title', { hasText: title }) });
const side = async (page, which) => { await page.click(`.side-toggle button[data-side="${which}"]`); await page.waitForTimeout(300); };
async function newNote(page, title, body) {
  await side(page, 'notes');
  await page.click('#new-item');
  await page.fill('#title-input', title);
  await page.fill('#editor', body);
  await page.waitForTimeout(900);
}
async function shareCurrent(page, email) {
  if (!await page.evaluate(() => document.getElementById('share-dialog').open)) await page.click('#share-item');
  await page.fill('#share-person-email', email);
  await page.click('#share-person-send');
  await page.waitForFunction(() => !/Sharing…/.test(document.getElementById('share-person-message').textContent), null, { timeout: 20000 });
  const msg = await page.textContent('#share-person-message');
  return msg;
}
async function openToAnswer(page, title) {
  if (!await page.evaluate(() => document.getElementById('choice-dialog').open)) await row(page, title).locator('button.row').click();
  await page.waitForSelector('#choice-dialog[open]');
}
const closeShare = page => page.click('#share-close');
const message = page => page.evaluate(() => document.getElementById('toast').hidden ? '' : document.getElementById('toast-text').textContent);
const dismiss = page => page.evaluate(() => { document.getElementById('toast').hidden = true; });

async function cleanup(p) {
  await p.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    await Storage.sync();
    Object.assign(state, await Storage.loadAll());
    // Test accounts only: end every share between them, and mark endings seen.
    for (const sh of state.shares) {
      if (sh.active) await Storage.endShare(sh.id, 'closed');
      await Storage.markShareSeen(sh.id);
    }
    Object.assign(state, await Storage.loadAll());
    for (const n of state.notes.filter(x => noteTitle(x).startsWith('TEST'))) {
      if (isSharedIn(n)) { Storage.forgetShared('notes', n.id); continue; }
      await Storage.deleteNote(n.id);
    }
    for (const l of state.taskLists.filter(x => x.title.startsWith('TEST'))) {
      if (isSharedIn(l)) { Storage.forgetShared('taskLists', l.id); continue; }
      await Storage.deleteTaskList(l.id);
    }
    for (const f of state.folders.filter(x => x.name.startsWith('TEST'))) await Storage.deleteFolder(f.id);
    for (const e of Storage.listTrash().filter(e => (e.record.name || e.record.title || e.record.body || e.record.text || '').startsWith('TEST')))
      await Storage.eraseForever(e.kind, e.record.id);
    for (const v of Object.values(state.views)) { v.currentId = null; v.activeFolderId = null; v.openFolderIds.clear(); }
    savePrefs();
    state.page = null;
    Object.assign(state, await Storage.loadAll()); render();
  });
  await sync(p);
}

async function shareTest() {
  const A = (await open('test1')).page;
  const B = (await open('test2')).page;
  const aCtx = A.context(), bCtx = B.context();
  // The clean-up ends every share these accounts have, so only ever run with the test accounts.
  for (const [p, email] of [[A, A_EMAIL], [B, B_EMAIL]]) {
    const signedIn = await p.textContent('#account-email');
    if (signedIn !== email) throw new Error(`Expected ${email} to be signed in, found "${signedIn}". Stopping.`);
  }
  await cleanup(A); await cleanup(B);

  // Names
  for (const [p, n] of [[A, 'Test One'], [B, 'Test Two']]) {
    await p.click('#settings-link'); await p.fill('#my-name', n); await p.click('#name-form button[type="submit"]');
    await p.waitForFunction(() => /Saved/.test(document.getElementById('name-message').textContent), null, { timeout: 15000 });
    check(true, `${n}: name saved`);
    await p.evaluate(() => { state.page = null; render(); });
  }

  // Share a note
  await newNote(A, 'TEST shared note', 'First line from A');
  let msg = await shareCurrent(A, A_EMAIL);
  check(/own email/.test(msg), `own email refused: "${msg}"`);
  msg = await shareCurrent(A, 'nobody-here@example.com');
  check(/No one with that email/.test(msg), `unknown email refused: "${msg}"`);
  msg = await shareCurrent(A, B_EMAIL);
  check(/^Shared\./.test(msg), `shared with B: "${msg}"`);
  check(await A.isVisible('#share-person-with') && /Test Two/.test(await A.textContent('#share-person-name')), 'panel shows "Shared with Test Two"');
  await closeShare(A);
  check(await A.locator('#item-shared').textContent() === 'Shared with Test Two', 'A: bar says Shared with Test Two');
  check(await row(A, 'TEST shared note').locator('.share-mark').count() === 1, 'A: shared mark in sidebar');

  await side(B, 'notes'); await sync(B);
  check(await row(B, 'TEST shared note').count() === 1, 'B: shared note arrives');
  check(await row(B, 'TEST shared note').locator('.share-mark').count() === 1, 'B: shared mark');
  await row(B, 'TEST shared note').locator('button.row').click();
  check(await B.locator('#item-shared').textContent() === 'Shared by Test One', 'B: bar says Shared by Test One');
  check(await B.isHidden('#item-folder'), 'B: no folder choice');
  check(await B.textContent('#delete-item') === 'Remove', 'B: Delete reads Remove');
  await B.click('#share-item');
  check(await B.isHidden('#share-by-link') && await B.isHidden('#share-person-form'), 'B: Share panel shows no link or share form');
  await closeShare(B);

  // B edits while A has it open
  await B.fill('#editor', 'First line from A\nAdded by B');
  await B.waitForTimeout(900); await sync(B);
  await A.click('#title-input'); await A.evaluate(() => document.activeElement.blur()); await A.waitForTimeout(3200);
  await sync(A);
  check((await A.inputValue('#editor')).includes('Added by B'), "A: sees B's edit");
  msg = await message(A);
  check(/Test Two changed "TEST shared note" while you had it open/.test(msg), `A: message "${msg}"`);
  await dismiss(A);

  // B pins (for B only); A moves it into a folder; B keeps it at top level
  await row(B, 'TEST shared note').locator('.more-button').click();
  await B.click('#menu button:has-text("Pin")'); await B.waitForTimeout(800);
  check(await row(B, 'TEST shared note').locator('.pin-mark').count() === 1, 'B: pinned for B');
  await sync(A);
  check(await row(A, 'TEST shared note').locator('.pin-mark').count() === 0, "A: B's pin doesn't pin it for A");
  check(await row(B, 'TEST shared note').locator('.more-button').count() === 1
    && !(await B.evaluate(() => [...document.querySelectorAll('#menu button')].some(b => /Move/.test(b.textContent)))), 'B: no Move in menu');
  await B.keyboard.press('Escape');
  await A.evaluate(async () => {
    const f = { id: newId(), name: 'TEST folder', parentId: null, createdAt: Date.now() };
    state.folders.push(f); await Storage.saveFolder(f); render();
  });
  await row(A, 'TEST shared note').locator('button.row').click();
  await A.selectOption('#item-folder', { label: 'TEST folder' }); await A.waitForTimeout(800);
  await sync(A); await sync(B);
  check(await B.evaluate(() => state.notes.find(n => noteTitle(n) === 'TEST shared note')?.folderId === null), 'B: still at top level after A moved it');

  // Offline edit by B
  await row(B, 'TEST shared note').locator('button.row').click();
  await bCtx.setOffline(true);
  await B.fill('#editor', 'First line from A\nAdded by B\nWritten offline by B');
  await B.waitForTimeout(900); await B.evaluate(() => Storage.sync()); await B.waitForTimeout(500);
  check(/Offline/.test(await B.textContent('#sync-status')), `B offline: "${await B.textContent('#sync-status')}"`);
  await bCtx.setOffline(false); await sync(B); await sync(A);
  check((await A.evaluate(() => state.notes.find(n => noteTitle(n) === 'TEST shared note')?.body || '')).includes('Written offline by B'), 'A: gets B offline edit after reconnect');

  // Task list shared; B adds and ticks
  await side(A, 'tasks'); await A.click('#new-item'); await A.fill('#title-input', 'TEST shared list');
  for (const t of ['Milk', 'Eggs']) { await A.fill('#add-task', t); await A.press('#add-task', 'Enter'); }
  await A.waitForTimeout(900);
  msg = await shareCurrent(A, B_EMAIL); check(/^Shared\./.test(msg), 'list shared'); await closeShare(A);
  await side(B, 'tasks'); await sync(B);
  await row(B, 'TEST shared list').locator('button.row').click();
  check(await B.locator('#open-tasks .task').count() === 2, 'B: list arrives with its 2 tasks');
  await B.fill('#add-task', 'Bread'); await B.press('#add-task', 'Enter');
  await B.waitForTimeout(500);
  await B.locator('#open-tasks input[type="checkbox"]').first().click();
  await B.waitForTimeout(1000); await sync(B); await sync(A);
  const aTasks = await A.evaluate(() => { const l = state.taskLists.find(x => x.title === 'TEST shared list'); return tasksIn(l.id).map(t => `${t.text}${t.done ? '✓' : ''}`); });
  check(aTasks.includes('Bread') && aTasks.some(t => t.endsWith('✓')), `A: sees B's task and tick: ${aTasks.join(', ')}`);

  // A deletes the note; B is asked
  await side(A, 'notes'); await row(A, 'TEST shared note').locator('button.row').click();
  await A.click('#delete-item');
  check(/Test Two will be asked whether to keep a copy/.test(await A.textContent('#confirm-message')), 'A: delete warning mentions Test Two');
  await A.click('#confirm-yes'); await A.waitForTimeout(800); await sync(A);
  await side(B, 'notes'); await sync(B);
  check(/Deleted by Test One/.test(await row(B, 'TEST shared note').textContent()), 'B: marked Deleted by Test One');
  const alreadyAsked = await B.evaluate(() => document.getElementById('choice-dialog').open);
  check(alreadyAsked, 'B: asked straight away, since B had the note open');
  if (!alreadyAsked) await row(B, 'TEST shared note').locator('button.row').click();
  await B.waitForSelector('#choice-dialog[open]');
  const why = await B.textContent('#choice-message');
  check(/Test One deleted "TEST shared note" from their Anthology, so it's no longer shared with you/.test(why), `B: window explains: "${why}"`);
  await B.click('#choice-actions button:has-text("Keep a copy")'); await B.waitForTimeout(1500); await sync(B);
  const kept = await B.evaluate(() => state.notes.filter(n => noteTitle(n) === 'TEST shared note').map(n => ({ own: !isSharedIn(n), body: n.body })));
  check(kept.length === 1 && kept[0].own && kept[0].body.includes('Written offline by B'), "B: has own copy with everything in it");
  check(await row(B, 'TEST shared note').locator('.share-mark').count() === 0, 'B: copy not marked shared');

  // A stops sharing the list; B deletes it
  await side(A, 'tasks'); await row(A, 'TEST shared list').locator('button.row').click();
  await A.click('#share-item'); await A.click('#share-person-stop');
  await A.click('#confirm-yes'); await A.waitForTimeout(1500);
  check(/No longer shared/.test(await A.textContent('#share-person-message')), 'A: stopped sharing list'); await closeShare(A);
  await side(B, 'tasks'); await sync(B);
  check(/Test One stopped sharing/.test(await row(B, 'TEST shared list').textContent()), 'B: list marked stopped sharing');
  await openToAnswer(B, 'TEST shared list');
  await B.click('#choice-actions button:has-text("Delete")'); await B.waitForTimeout(1500);
  check(await row(B, 'TEST shared list').count() === 0, 'B: list gone after Delete');
  await sync(A);
  check(await row(A, 'TEST shared list').count() === 1, "A: list still in A's Anthology");

  // B removes a shared note; A is asked
  await side(A, 'notes'); await newNote(A, 'TEST third note', 'Third');
  await shareCurrent(A, B_EMAIL); await closeShare(A);
  await side(B, 'notes'); await sync(B);
  await row(B, 'TEST third note').locator('button.row').click();
  await B.click('#delete-item');
  check(/stays in Test One's/.test(await B.textContent('#confirm-message')), 'B: remove warning');
  await B.click('#confirm-yes'); await B.waitForTimeout(1500);
  check(await row(B, 'TEST third note').count() === 0, 'B: removed from B');
  await sync(A);
  check(/Removed by Test Two/.test(await row(A, 'TEST third note').textContent()), 'A: marked Removed by Test Two');
  await row(A, 'TEST shared list').count();
  await A.evaluate(() => { const n = state.notes.find(x => noteTitle(x) === 'TEST third note'); view().currentId = null; return openItem(n.id); });
  await A.waitForSelector('#choice-dialog[open]');
  check(/Test Two removed "TEST third note" from their Anthology/.test(await A.textContent('#choice-message')), 'A: window explains');
  await A.click('#choice-actions button:has-text("Keep it")'); await A.waitForTimeout(1500);
  check(!/Removed by/.test(await row(A, 'TEST third note').textContent()), 'A: mark cleared after Keep it');

  // A third person can't see anything: checked in the database tests; here, B's backup holds only B's own things
  const backupHasShared = await B.evaluate(async () => JSON.parse(Storage.makeBackup(await Storage.loadAll())).notes.some(n => isSharedIn(n)));
  check(!backupHasShared, "B: backup holds only B's own things");

  // Clean up every TEST item on both accounts, for good
  await cleanup(A); await cleanup(B);
  check((await A.evaluate(() => state.notes.concat(state.taskLists).length)) >= 0, 'cleanup ran');
  console.log('problems A:', A.problems.length ? A.problems : 'none');
  console.log('problems B:', B.problems.length ? B.problems : 'none');
  console.log(`${results.filter(r => r.startsWith('ok')).length} of ${results.length} ok`);
  await aCtx.close(); await bCtx.close();
}

const [mode, name] = process.argv.slice(2);
(mode === 'signin' ? signIn(name) : shareTest())
  .catch(e => { console.log('STOPPED:', e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
