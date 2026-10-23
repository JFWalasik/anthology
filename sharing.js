// sharing.js
// Sharing by link: the Share panel, the Shared links page, and the page
// someone sees when they open a shared link. Uses the shared state and helpers
// in app.js.

// ---- Sharing ----

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
  shareItem = {
    kind: state.side === 'notes' ? 'notes' : 'taskLists',
    id: item.id,
    noun: state.side === 'notes' ? 'note' : 'task list',
  };
  els.shareHeading.textContent = `Share this ${shareItem.noun}`;
  els.shareSend.textContent = navigator.share && phoneLayout.matches ? 'Share link…' : 'Copy link';
  document.querySelector('input[name="share-mode"][value="view"]').checked = true;
  els.shareDialog.showModal();
  await loadShareLink(true);
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

  els.shareSend.addEventListener('click', () => shareAction('send'));
  els.shareNew.addEventListener('click', () => shareAction('new'));
  els.shareOff.addEventListener('click', () => shareAction('off'));
  byId('share-close').addEventListener('click', () => els.shareDialog.close());
  els.shareUrl.addEventListener('focus', () => els.shareUrl.select());
  for (const choice of document.querySelectorAll('input[name="share-mode"]')) {
    choice.addEventListener('change', () => loadShareLink());
  }
}
