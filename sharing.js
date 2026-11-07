// sharing.js
// Sharing: with someone in Anthology (from 1.2), and by link (the Share panel,
// the Shared links page, and the page someone sees when they open a shared
// link). Uses the shared state and helpers in app.js.

// ---- Sharing with someone in Anthology ----
// A shared note or task list appears in both people's apps. Its owner keeps
// it in their folders; the other person has it at the top level, marked as
// shared, and can change it but not move it or share it further. Records of
// someone else's things carry their ownerId (see storage.js).

const SHARE_KIND = { notes: 'note', tasks: 'task_list' };
const sideKind = (name = state.side) => (name === 'notes' ? 'notes' : 'taskLists');

// Is this note or task list someone else's, shared with me?
function isSharedIn(item) {
  return Boolean(item && item.ownerId) && item.ownerId !== Storage.userId();
}

// The share for an item: the active one, or else the most recently ended.
function shareOf(item, name = state.side) {
  const matching = state.shares.filter(s => s.item_kind === SHARE_KIND[name] && s.item_id === item.id);
  return matching.find(s => s.active)
    || matching.sort((a, b) => Date.parse(b.ended_at || 0) - Date.parse(a.ended_at || 0))[0]
    || null;
}

const isShared = (item, name = state.side) => isSharedIn(item) || Boolean(shareOf(item, name)?.active);

// A person's name, or their email until they've set one.
function personName(id) {
  const person = state.people.find(p => p.id === id);
  return (person && (person.name || person.email)) || 'Someone';
}

// Anything about a shared item that needs answering: for the other person, the
// owner deleting it or stopping sharing; for the owner, the other person
// removing it. Returns { kind, label, share } or null.
function shareNotice(item, name = state.side) {
  const share = shareOf(item, name);
  if (isSharedIn(item)) {
    const owner = personName(item.ownerId);
    if (item.ownerDeleted) return { kind: 'deleted', label: `Deleted by ${owner}`, share };
    if (share && !share.active && !share.person_seen) return { kind: 'stopped', label: `${owner} stopped sharing`, share };
    return null;
  }
  if (share && !share.active && share.ended_reason === 'left' && !share.owner_seen) {
    return { kind: 'left', label: `Removed by ${personName(share.person_id)}`, share };
  }
  return null;
}

const shareMark = () => {
  const mark = el('span', 'share-mark', '👥');
  mark.setAttribute('aria-label', 'Shared');
  return mark;
};

async function reloadFromStorage() {
  Object.assign(state, await Storage.loadAll());
  render();
}

// Takes someone else's item off this device (theirs isn't touched).
async function forgetItem(item, name = state.side) {
  cancelSave(`item:${item.id}`);
  Storage.forgetShared(sideKind(name), item.id);
  if (state.views[name].currentId === item.id) state.views[name].currentId = null;
  savePrefs();
  await reloadFromStorage();
}

const NEEDS_CONNECTION = "That needs an internet connection. Try again when you're online.";

// Deleting something shared with me removes it from my Anthology only, and
// tells its owner.
async function removeSharedIn(item) {
  const title = side().title(item);
  const owner = personName(item.ownerId);
  const share = shareOf(item);
  if (!await askConfirm(`Remove "${title}" from your Anthology? It stays in ${owner}'s, and ${owner} will be told.`,
    'Yes, remove')) return;
  try {
    if (share && share.active) await Storage.endShare(share.id, item.ownerDeleted ? 'closed' : 'left');
  } catch (err) {
    console.error(err);
    showMessage(NEEDS_CONNECTION);
    return;
  }
  await forgetItem(item);
}

// Asks the keep-or-delete question for an item with a notice (see
// shareNotice). Only one question at a time.
let answeringNotice = null; // { side, id } of the item being asked about

async function answerNotice(item) {
  const notice = shareNotice(item);
  if (!notice || answeringNotice) return;
  answeringNotice = { side: state.side, id: item.id };
  try {
    await answer(item, notice);
  } finally {
    answeringNotice = null;
  }
}

// If the question was settled elsewhere while it was being asked (on another
// device, or by the latest sync), close the window.
function closeSettledNotice() {
  if (!answeringNotice || !closeChoice) return;
  const item = SIDES[answeringNotice.side].items().find(i => i.id === answeringNotice.id);
  if (!item || !shareNotice(item, answeringNotice.side)) closeChoice();
}

async function answer(item, notice) {
  const name = state.side;
  const title = side().title(item);
  const notNow = { label: 'Not now', value: null, style: 'quiet' };
  if (notice.kind === 'left') {
    const person = personName(notice.share.person_id);
    const choice = await askChoice(
      `${person} removed "${title}" from their Anthology, so it's no longer shared with them. Your copy is still here, ` +
      'unchanged. Keep it, or delete it?',
      [notNow, { label: 'Delete', value: 'delete', style: 'danger-button' }, { label: 'Keep it', value: 'keep', style: 'primary' }]);
    if (!choice) return;
    try {
      await Storage.markShareSeen(notice.share.id);
    } catch (err) {
      console.error(err);
      showMessage(NEEDS_CONNECTION);
      return;
    }
    if (choice === 'delete') {
      if (state.views[name].currentId === item.id) state.views[name].currentId = null;
      await removeItem(item);
      savePrefs();
    }
    await reloadFromStorage();
    return;
  }

  const owner = personName(item.ownerId);
  const what = notice.kind === 'deleted'
    ? `${owner} deleted "${title}" from their Anthology, so it's no longer shared with you.`
    : `${owner} stopped sharing "${title}" with you.`;
  const choice = await askChoice(`${what} You can keep a copy, as it is now, in your own Anthology, or delete it.`,
    [notNow, { label: 'Delete', value: 'delete', style: 'danger-button' }, { label: 'Keep a copy', value: 'keep', style: 'primary' }]);
  if (!choice) return;
  try {
    if (notice.share && notice.share.active) await Storage.endShare(notice.share.id, 'closed');
    else if (notice.share) await Storage.markShareSeen(notice.share.id);
  } catch (err) {
    console.error(err);
    // A share that already ended can be tidied up here regardless; one still
    // active has to end first, or the item would come back.
    if (notice.share && notice.share.active) {
      showMessage(NEEDS_CONNECTION);
      return;
    }
  }
  await flushSaves();
  if (choice === 'keep') {
    const copyId = Storage.keepCopy(sideKind(name), item.id);
    if (state.views[name].currentId === item.id) state.views[name].currentId = copyId;
    savePrefs();
    await reloadFromStorage();
    showMessage(`"${title}" is now yours alone, at the top level.`);
  } else {
    await forgetItem(item, name);
  }
}

// Asks about the open item, if it has a notice.
function checkOpenNotice() {
  const item = currentItem();
  if (item && !state.page && shareNotice(item)) answerNotice(item);
}

// Things shared with me that have quietly stopped being shared (answered on
// another of my devices) are taken off this one.
async function tidySharedIn() {
  let removed = false;
  for (const name of ['notes', 'tasks']) {
    for (const item of [...SIDES[name].items()]) {
      if (!isSharedIn(item) || item.ownerDeleted) continue;
      const share = shareOf(item, name);
      if (share && !share.active && share.person_seen) {
        Storage.forgetShared(sideKind(name), item.id);
        if (state.views[name].currentId === item.id) state.views[name].currentId = null;
        removed = true;
      }
    }
  }
  if (removed) Object.assign(state, await Storage.loadAll());
}

// What the Share panel says about sharing with someone in Anthology.
function renderSharePerson(message = '') {
  const item = currentItem();
  if (!item) return;
  const noun = state.side === 'notes' ? 'note' : 'task list';
  const sharedIn = isSharedIn(item);
  const share = shareOf(item);
  els.sharePersonForm.hidden = sharedIn || Boolean(share?.active);
  els.sharePersonWith.hidden = sharedIn || !share?.active;
  els.shareByLink.hidden = sharedIn;
  if (sharedIn) {
    const owner = personName(item.ownerId);
    els.sharePersonExplain.textContent = `${owner} shared this ${noun} with you. You can both change it, even offline. ` +
      `Only ${owner} can move it or share it with others.`;
  } else if (share?.active) {
    els.sharePersonExplain.textContent = `It's in their Anthology too, and you can both change it. Only you can move it.`;
    const person = state.people.find(p => p.id === share.person_id);
    els.sharePersonName.textContent = `Shared with ${person && person.name ? `${person.name} (${person.email})` : personName(share.person_id)}`;
  } else {
    els.sharePersonExplain.textContent = `It appears in their Anthology too, and you can both change it, even offline. ` +
      `Only you can move it or share it further.`;
  }
  els.sharePersonMessage.textContent = message;
}

async function shareWithPerson(event) {
  event.preventDefault();
  const item = currentItem();
  const email = els.sharePersonEmail.value.trim();
  if (!item || !email) return;
  els.sharePersonSend.disabled = true;
  renderSharePerson('Sharing…');
  try {
    await flushSaves();
    const result = await Storage.shareWithPerson(sideKind(), item.id, email);
    Object.assign(state, await Storage.loadAll());
    els.sharePersonEmail.value = '';
    renderSharePerson(`Shared. It will appear in ${result.name || result.email}'s Anthology the next time it syncs.`);
    renderSidebar();
    renderMain();
  } catch (err) {
    console.error(err);
    // The database's own messages are written for people; anything else is a connection problem.
    const known = err && err.message && !/fetch|network|timed? ?out/i.test(err.message);
    renderSharePerson(known ? err.message : navigator.onLine ? "It couldn't be shared. Try again in a moment." : NEEDS_CONNECTION);
  } finally {
    els.sharePersonSend.disabled = false;
  }
}

async function stopSharingWithPerson() {
  const item = currentItem();
  const share = item && shareOf(item);
  if (!share || !share.active) return;
  const person = personName(share.person_id);
  if (!await askConfirm(`Stop sharing "${side().title(item)}" with ${person}? They'll be asked whether to keep a copy.`,
    'Stop sharing')) return;
  try {
    await Storage.endShare(share.id);
    Object.assign(state, await Storage.loadAll());
    renderSharePerson('No longer shared.');
    renderSidebar();
    renderMain();
  } catch (err) {
    console.error(err);
    renderSharePerson(NEEDS_CONNECTION);
  }
}

// When the other person changes the open note or task list, say so, since if
// both of you change it at once, the later change wins. before is
// openSnapshot() from just before the changes arrived.
function openSnapshot() {
  const item = currentItem();
  if (!item || state.page) return null;
  const tasks = state.side === 'tasks' ? tasksIn(item.id) : [];
  return { side: state.side, id: item.id, updatedAt: item.updatedAt, taskTimes: new Map(tasks.map(t => [t.id, t.updatedAt])) };
}

function reportOthersChanges(before) {
  const item = currentItem();
  if (!before || !item || item.id !== before.id || state.side !== before.side) return;
  const me = Storage.userId();
  const changed = [];
  if (item.updatedAt > before.updatedAt) changed.push(item);
  if (state.side === 'tasks') {
    for (const task of tasksIn(item.id)) {
      const was = before.taskTimes.get(task.id);
      if (was === undefined || task.updatedAt > was) changed.push(task);
    }
  }
  const by = changed.map(r => r.changedBy).find(id => id && id !== me);
  if (by) showMessage(`${personName(by)} changed "${side().title(item)}" while you had it open.`);
}

// ---- Sharing by link ----

let shareLink = null; // the link shown in the Share panel

function shareUrl(token) {
  return `${location.origin}${location.pathname}#share=${token}`;
}

async function copyOrSend(url, title) {
  // Phones open their own share menu (Messages, Mail and so on); computers copy the link.
  if (navigator.share && phoneLayout.matches) {
    try {
      await navigator.share({ title, url });
      return '';
    } catch (err) {
      if (err.name === 'AbortError') return '';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'Link copied.';
  } catch {
    return 'Select the link above and copy it.';
  }
}

function showShareLink(link, message = '') {
  shareLink = link;
  els.shareUrl.value = link ? shareUrl(link.token) : '';
  els.shareSend.hidden = !link;
  els.shareNew.hidden = !link;
  els.shareOff.hidden = !link;
  els.shareMessage.textContent = message;
}

let shareItem = null; // { kind, id, noun } of the item the Share panel is for

const shareMode = () => document.querySelector('input[name="share-mode"]:checked').value;

async function openSharePanel() {
  const item = currentItem();
  if (!item) return;
  await flushSaves();
  renderSharePerson();
  els.sharePersonEmail.value = '';
  shareItem = {
    kind: state.side === 'notes' ? 'notes' : 'taskLists',
    id: item.id,
    noun: state.side === 'notes' ? 'note' : 'task list',
  };
  els.shareHeading.textContent = `Share this ${shareItem.noun}`;
  els.shareSend.textContent = navigator.share && phoneLayout.matches ? 'Share link…' : 'Copy link';
  document.querySelector('input[name="share-mode"][value="view"]').checked = true;
  els.shareDialog.showModal();
  if (!isSharedIn(item)) await loadShareLink(true);
}

// Shows the link for the chosen kind (Can view or Can edit), making it if needed.
async function loadShareLink(syncFirst = false) {
  const mode = shareMode();
  const noun = shareItem.noun;
  els.shareExplain.textContent = mode === 'edit'
    ? `Anyone with this link can change this ${noun}, without signing in. You'll see their changes, and they'll ` +
      'see yours. Share it only with people you trust.'
    : `Anyone with this link can see this ${noun}, and your changes as you make them, without signing in. ` +
      'This link is view-only, so they can\'t make changes.';
  showShareLink(null, 'Making a link…');
  try {
    if (syncFirst) await Storage.sync(); // the item has to be in the database before it can be shared
    const link = await Storage.getOrCreateShareLink(shareItem.kind, shareItem.id, mode === 'edit');
    if (shareMode() === mode) showShareLink(link);
  } catch (err) {
    console.error(err);
    showShareLink(null, shareProblem());
  }
}

function shareProblem() {
  return navigator.onLine
    ? "Something went wrong and the link couldn't be made. Try again in a moment."
    : "Sharing needs an internet connection. Try again when you're online.";
}

async function shareAction(action) {
  if (!shareLink) return;
  try {
    if (action === 'send') {
      showShareLink(shareLink, await copyOrSend(shareUrl(shareLink.token), els.shareHeading.textContent));
    } else if (action === 'new') {
      showShareLink(await Storage.replaceShareLink(shareLink), 'New link made. The old link no longer works.');
    } else if (action === 'off') {
      await Storage.turnOffShareLink(shareLink.token);
      showShareLink(null, 'Link turned off. Choose Share again to make a new one.');
      shareLink = null;
    }
  } catch (err) {
    console.error(err);
    els.shareMessage.textContent = shareProblem();
  }
}

// The Shared links page: everything shared, with Copy link and Turn off.
async function loadLinks() {
  els.linksMessage.textContent = 'Loading…';
  els.linksList.replaceChildren();
  let links;
  try {
    links = await Storage.listShareLinks();
  } catch (err) {
    console.error(err);
    els.linksMessage.textContent = 'Shared links need an internet connection.';
    return;
  }
  if (state.page !== 'links') return;
  els.linksMessage.textContent = links.length ? '' : "You haven't shared anything. Open a note or task list and choose Share.";
  els.linksList.replaceChildren(...links.map(link => {
    const isNote = link.item_kind === 'note';
    const item = isNote ? state.notes.find(n => n.id === link.item_id) : state.taskLists.find(l => l.id === link.item_id);
    const title = item ? (isNote ? noteTitle(item) : SIDES.tasks.title(item)) : 'Deleted item';
    const details = [isNote ? 'Note' : 'Task list', link.can_edit ? 'can edit' : 'view only', `shared ${formatDate(Date.parse(link.created_at))}`];

    const li = el('li', 'trash-item');
    const info = el('div', 'trash-info');
    info.append(el('span', 'trash-title', title), el('span', 'trash-details', details.join(' · ')));
    const status = el('span', 'trash-details');
    const actions = el('div', 'trash-actions');
    actions.append(
      button('link', 'Copy link', `Copy link to ${title}`, async () => {
        status.textContent = await copyOrSend(shareUrl(link.token), title);
      }),
      button('quiet danger', 'Turn off', `Turn off link to ${title}`, async () => {
        try {
          await Storage.turnOffShareLink(link.token);
          loadLinks();
        } catch (err) {
          console.error(err);
          status.textContent = 'That needs an internet connection.';
        }
      })
    );
    info.append(status);
    li.append(info, actions);
    return li;
  }));
}

// ---- The page someone sees when they open a shared link ----
// View links show the item read-only. Edit links let anyone with the link
// change it; those changes go straight to the database, so they need a
// connection.

const viewer = {
  token: null,
  item: null,        // what the link showed last time it was loaded
  timers: new Map(), // changes waiting to be saved, by what they change
  saving: 0,         // saves under way
  unsaved: new Map(), // saves that failed, to try again when back online
};

async function startViewer(token) {
  viewer.token = token;
  document.body.classList.add('viewing');
  els.layout.hidden = true;
  els.access.hidden = true;
  els.viewer.hidden = false;
  await loadShared(true);
  // Show the owner's changes: check every 15 seconds, and when the page comes back into view.
  setInterval(() => {
    if (document.visibilityState === 'visible') loadShared();
  }, 15 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadShared();
  });
  window.addEventListener('online', retryUnsaved);
}

// Someone is typing, or changes are still being saved: redrawing now would
// get in their way, so wait for the next check.
function viewerBusy() {
  const active = document.activeElement;
  const typing = els.viewer.contains(active) && active.matches('input[type="text"], textarea');
  return typing || viewer.timers.size > 0 || viewer.saving > 0 || viewer.unsaved.size > 0;
}

async function loadShared(force = false) {
  if (!force && viewerBusy()) return;
  let item;
  try {
    item = await Storage.getSharedItem(viewer.token);
  } catch (err) {
    console.error(err);
    if (!viewer.item) showViewerProblem("This link couldn't be opened. Check your connection and try again.");
    return;
  }
  if (!force && viewerBusy()) return;
  if (!item) {
    showViewerProblem("This link isn't available. It may have been turned off, or the item deleted.");
    return;
  }
  viewer.item = item;
  renderShared(item);
}

function showViewerProblem(text) {
  viewer.item = null;
  els.viewerTitle.textContent = '';
  els.viewerBody.replaceChildren();
  els.viewerBody.hidden = true;
  els.viewerTasks.hidden = true;
  els.viewerFooter.textContent = '';
  els.viewerMissing.hidden = false;
  els.viewerMissing.textContent = text;
}

function setViewerStatus(text, isProblem = false) {
  els.viewerStatus.textContent = text;
  els.viewerStatus.classList.toggle('is-problem', isProblem);
}

// Saves a change through the edit link. "key" names what's being changed, so
// a newer change to the same thing replaces one still waiting.
function saveShared(key, save, delay = 800) {
  clearTimeout(viewer.timers.get(key));
  viewer.unsaved.delete(key);
  setViewerStatus('');
  viewer.timers.set(key, setTimeout(() => runSharedSave(key, save), delay));
}

async function runSharedSave(key, save) {
  viewer.timers.delete(key);
  viewer.saving++;
  setViewerStatus('Saving…');
  try {
    await save();
    viewer.saving--;
    if (!viewer.saving && !viewer.timers.size && !viewer.unsaved.size) setViewerStatus('Saved');
  } catch (err) {
    viewer.saving--;
    console.error(err);
    if (/can't be used to make changes/.test(err.message || '')) {
      setViewerStatus('This link no longer allows changes, so your last change wasn\'t saved.', true);
      return;
    }
    viewer.unsaved.set(key, save);
    setViewerStatus("Not saved: no connection. It will be saved when you're back online; keep this page open.", true);
  }
}

function retryUnsaved() {
  for (const [key, save] of viewer.unsaved) {
    viewer.unsaved.delete(key);
    runSharedSave(key, save);
  }
}

// After adding, ticking off or deleting a task, show the list as it is now.
async function refreshSharedList() {
  const typingIn = document.activeElement === els.viewer.querySelector('.add-task') ? 'add' : null;
  await loadShared(true);
  if (typingIn) els.viewer.querySelector('.add-task')?.focus();
}

function renderShared(item) {
  els.viewerMissing.hidden = true;
  els.viewerFooter.textContent = item.can_edit
    ? 'Shared from Anthology. Anyone with this link can make changes.'
    : 'Shared from Anthology. This is a read-only copy; only its owner can change it.';
  if (item.kind === 'note') renderSharedNote(item);
  else renderSharedList(item);
}

function renderSharedNote(item) {
  const { title, rest } = splitNote(item.body);
  els.viewerTasks.hidden = true;
  els.viewerBody.hidden = false;
  if (!item.can_edit) {
    els.viewerTitle.textContent = title.replace(/^#+\s*/, '').trim() || 'Untitled note';
    els.viewerBody.replaceChildren(document.createTextNode(rest));
    document.title = `${els.viewerTitle.textContent} · Anthology`;
    return;
  }
  els.viewerTitle.textContent = '';
  const titleInput = el('input', 'title-input viewer-title-input');
  titleInput.type = 'text';
  titleInput.value = title;
  titleInput.placeholder = 'Title';
  titleInput.setAttribute('aria-label', 'Title');
  const editor = el('textarea', 'editor viewer-editor');
  editor.value = rest;
  editor.placeholder = 'Start writing.';
  editor.setAttribute('aria-label', 'Note text');
  const save = () => saveShared('note', () => Storage.saveSharedNote(viewer.token, joinNote(titleInput.value, editor.value)));
  titleInput.addEventListener('input', save);
  editor.addEventListener('input', save);
  titleInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      editor.focus();
      editor.setSelectionRange(0, 0);
    }
  });
  els.viewerBody.replaceChildren(titleInput, editor);
  document.title = `${title.trim() || 'Shared note'} · Anthology`;
}

function renderSharedList(item) {
  els.viewerBody.hidden = true;
  els.viewerTasks.hidden = false;
  const ordered = [...item.tasks.filter(t => !t.done), ...item.tasks.filter(t => t.done)];
  const listTitle = item.title.trim() || 'Untitled task list';
  document.title = `${listTitle} · Anthology`;

  if (!item.can_edit) {
    els.viewerTitle.textContent = listTitle;
    els.viewerTasks.replaceChildren(...ordered.map(task => {
      const li = el('li', 'task');
      li.classList.toggle('is-done', task.done);
      const check = el('input');
      check.type = 'checkbox';
      check.checked = task.done;
      check.disabled = true;
      check.setAttribute('aria-label', task.done ? 'Done' : 'Not done');
      li.append(check, el('span', 'task-text', task.text));
      return li;
    }));
    return;
  }

  // Editable: the title, each task's text and checkbox, Delete, and "Add a task".
  els.viewerTitle.textContent = '';
  const titleInput = el('input', 'title-input viewer-title-input');
  titleInput.type = 'text';
  titleInput.value = item.title;
  titleInput.placeholder = 'Task list name';
  titleInput.setAttribute('aria-label', 'Task list name');
  titleInput.addEventListener('input', () =>
    saveShared('title', () => Storage.saveSharedListTitle(viewer.token, titleInput.value)));
  els.viewerTitle.append(titleInput);

  const rows = ordered.map(task => {
    const li = el('li', 'task');
    li.classList.toggle('is-done', task.done);
    const check = el('input');
    check.type = 'checkbox';
    check.checked = task.done;
    check.setAttribute('aria-label', task.done ? 'Mark as not done' : 'Mark as done');
    const text = el('input', 'task-text');
    text.type = 'text';
    text.value = task.text;
    text.setAttribute('aria-label', 'Task');
    const save = delay => saveShared(`task:${task.id}`,
      () => Storage.saveSharedTask(viewer.token, task.id, text.value, check.checked), delay);
    text.addEventListener('input', () => save(800));
    check.addEventListener('change', async () => {
      li.classList.toggle('is-done', check.checked);
      clearTimeout(viewer.timers.get(`task:${task.id}`));
      viewer.timers.delete(`task:${task.id}`);
      await runSharedSave(`task:${task.id}`, () => Storage.saveSharedTask(viewer.token, task.id, text.value, check.checked));
      refreshSharedList();
    });
    const remove = button('icon-button danger viewer-delete', '×', 'Delete task', async () => {
      clearTimeout(viewer.timers.get(`task:${task.id}`));
      viewer.timers.delete(`task:${task.id}`);
      li.remove();
      await runSharedSave(`delete:${task.id}`, () => Storage.deleteSharedTask(viewer.token, task.id));
      refreshSharedList();
    });
    li.append(check, text, remove);
    return li;
  });

  const addRow = el('li', 'add-task-row');
  const add = el('input', 'add-task');
  add.type = 'text';
  add.placeholder = 'Add a task';
  add.setAttribute('aria-label', 'Add a task');
  add.addEventListener('keydown', async event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const value = add.value.trim();
    if (!value) return;
    add.value = '';
    await runSharedSave(`add:${Date.now()}`, () => Storage.addSharedTask(viewer.token, newId(), value));
    refreshSharedList();
  });
  addRow.append(el('span', 'add-task-mark', '+'), add);
  els.viewerTasks.replaceChildren(...rows, addRow);
}

// ---- Buttons and keys ----

function wireSharingEvents() {
  const byId = id => document.getElementById(id);

  byId('share-item').addEventListener('click', openSharePanel);
  els.sharePersonForm.addEventListener('submit', shareWithPerson);
  byId('share-person-stop').addEventListener('click', stopSharingWithPerson);

  els.shareSend.addEventListener('click', () => shareAction('send'));
  els.shareNew.addEventListener('click', () => shareAction('new'));
  els.shareOff.addEventListener('click', () => shareAction('off'));
  byId('share-close').addEventListener('click', () => els.shareDialog.close());
  els.shareUrl.addEventListener('focus', () => els.shareUrl.select());
  for (const choice of document.querySelectorAll('input[name="share-mode"]')) {
    choice.addEventListener('change', () => loadShareLink());
  }
}
