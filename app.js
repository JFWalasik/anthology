// app.js
// Shared state and helpers, saving, opening and closing notes and task lists,
// drawing the page, syncing, and start-up. Each feature has its own file
// (sidebar.js, editor.js, tasks.js and so on); index.html loads them first and
// this file last, since it starts the app. They all share the names defined
// here, such as state, els and el().
// All saving and loading goes through Storage (storage.js), so no file here
// cares where data lives.
// Text people type is only ever put on the page as plain text (textContent or
// input values), never as HTML, so nothing typed can run as code.

const APP_VERSION = '1.1.1'; // must match the version in storage.js
const SAVE_DELAY_MS = 500;
const CAN_RESTORE = 'You can restore it from Recently deleted for 30 days.';
const NEW_FOLDER = 'new';

// Folders are shared. Each side lists its own kind of item inside them.
const SIDES = {
  notes: {
    items: () => state.notes,
    title: note => noteTitle(note),
    save: note => Storage.saveNote(note),
    newLabel: 'New note',
    plural: 'notes',
    titlePlaceholder: 'Title',
    deleteLabel: 'Delete note',
    emptyMessage: 'Choose a note, or start a new one.',
  },
  tasks: {
    items: () => state.taskLists,
    title: list => list.title.trim() || 'New task list',
    save: list => Storage.saveTaskList(list),
    newLabel: 'New task list',
    plural: 'task lists',
    titlePlaceholder: 'Task list name',
    deleteLabel: 'Delete list',
    emptyMessage: 'Choose a task list, or start a new one.',
  },
};

function newView() {
  return {
    currentId: null,
    activeFolderId: null,   // where the New button puts the next item; null means top level
    openFolderIds: new Set(),
  };
}

const state = {
  folders: [],
  notes: [],
  taskLists: [],
  tasks: [],
  side: 'notes',
  views: { notes: newView(), tasks: newView() },
  editingFolderId: null,    // folder whose name is being typed, or NEW_FOLDER
  trash: [],                // what Recently deleted shows
  page: null,               // a page open instead of an item: 'trash', 'settings' or 'links'
};

const els = {};
const pendingSaves = new Map();
let problemReported = false;

// ---- Small helpers ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, label, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', onClick);
  return node;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// The title is the first line with any text, minus Markdown heading marks.
function noteTitle(note) {
  const firstLine = note.body.split('\n').find(line => line.trim() !== '') || '';
  return firstLine.replace(/^#+\s*/, '').trim() || 'New note';
}

// A note is stored as one piece of text. On screen, its first line is shown in
// the larger title field and the rest in the body.
function splitNote(body) {
  const lineBreak = body.indexOf('\n');
  if (lineBreak === -1) return { title: body, rest: '' };
  return { title: body.slice(0, lineBreak), rest: body.slice(lineBreak + 1) };
}

function joinNote(title, rest) {
  return rest === '' ? title : `${title}\n${rest}`;
}

function formatDate(ms) {
  const date = new Date(ms);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const options = { month: 'short', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString([], options);
}

const byRecent = (a, b) => b.updatedAt - a.updatedAt;
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const byPosition = (a, b) => a.position - b.position;

const side = () => SIDES[state.side];
const view = () => state.views[state.side];

function currentItem() {
  return side().items().find(item => item.id === view().currentId) || null;
}

function findFolder(id) {
  return state.folders.find(folder => folder.id === id) || null;
}

function itemsIn(folderId) {
  return side().items().filter(item => item.folderId === folderId).sort(byRecent);
}

function tasksIn(listId) {
  return state.tasks.filter(task => task.listId === listId).sort(byPosition);
}

function isEmptyItem(item) {
  if (state.side === 'notes') return item.body.trim() === '';
  return item.title.trim() === '' && !state.tasks.some(task => task.listId === item.id);
}

function reportProblem(err) {
  console.error(err);
  setStatus('Not saved: storage problem', true);
  if (!problemReported) {
    problemReported = true;
    alert("Your change couldn't be saved. The browser may be out of storage space or blocking it.");
  }
}

// ---- Preferences (per device) ----

function savePrefs() {
  const viewPrefs = v => ({
    currentId: v.currentId,
    activeFolderId: v.activeFolderId,
    openFolderIds: [...v.openFolderIds],
  });
  Storage.savePrefs({
    side: state.side,
    views: { notes: viewPrefs(state.views.notes), tasks: viewPrefs(state.views.tasks) },
  });
}

function applyPrefs(prefs) {
  const folderIds = new Set(state.folders.map(folder => folder.id));
  if (prefs.side === 'tasks') state.side = 'tasks';
  const saved = prefs.views || {};
  // Preferences saved by 0.2 only covered notes.
  if (!saved.notes && prefs.currentNoteId !== undefined) {
    saved.notes = { currentId: prefs.currentNoteId, activeFolderId: prefs.activeFolderId, openFolderIds: prefs.openFolderIds };
  }
  for (const [name, items] of [['notes', state.notes], ['tasks', state.taskLists]]) {
    const from = saved[name] || {};
    const to = state.views[name];
    if (items.some(item => item.id === from.currentId)) to.currentId = from.currentId;
    if (folderIds.has(from.activeFolderId)) to.activeFolderId = from.activeFolderId;
    for (const id of from.openFolderIds || []) {
      if (folderIds.has(id)) to.openFolderIds.add(id);
    }
  }
}

// ---- Saving ----
// Typing is saved about half a second after it stops. Each pending save has a
// key, such as "note:<id>", so saves for the same thing replace each other.

function setStatus(text, isProblem = false) {
  els.saveStatus.textContent = text;
  els.saveStatus.classList.toggle('is-problem', isProblem);
}

async function runSave(run) {
  try {
    await run();
  } catch (err) {
    reportProblem(err);
  }
}

function saveSoon(key, run) {
  cancelSave(key);
  const timer = setTimeout(() => {
    pendingSaves.delete(key);
    runSave(run);
  }, SAVE_DELAY_MS);
  pendingSaves.set(key, { timer, run });
}

function cancelSave(key) {
  const pending = pendingSaves.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pendingSaves.delete(key);
  }
}

async function flushSaves() {
  const waiting = [...pendingSaves.values()];
  pendingSaves.clear();
  for (const pending of waiting) {
    clearTimeout(pending.timer);
    await runSave(pending.run);
  }
}

function saveItemSoon(item) {
  const save = side().save;
  saveSoon(`item:${item.id}`, async () => {
    await save(item);
    if (item.id === view().currentId) setStatus('Saved');
  });
}

// A change to any task counts as editing its list, which moves the list to
// the top of the sidebar.
function touchList(listId) {
  const list = state.taskLists.find(l => l.id === listId);
  if (!list) return;
  list.updatedAt = Date.now();
  saveSoon(`item:${list.id}`, async () => {
    await Storage.saveTaskList(list);
    if (list.id === state.views.tasks.currentId) setStatus('Saved');
  });
  renderSidebar();
}

// ---- Notes and task lists ----

// Removes a note or task list. It goes to Recently deleted, unless discard is
// true (for one left empty), which erases it.
async function removeItem(item, discard = false) {
  cancelSave(`item:${item.id}`);
  if (state.side === 'notes') {
    state.notes = state.notes.filter(note => note.id !== item.id);
    await runSave(() => Storage.deleteNote(item.id, discard));
  } else {
    for (const task of tasksIn(item.id)) cancelSave(`task:${task.id}`);
    state.taskLists = state.taskLists.filter(list => list.id !== item.id);
    state.tasks = state.tasks.filter(task => task.listId !== item.id);
    await runSave(() => Storage.deleteTaskList(item.id, discard));
  }
}

// Saves the open item, or discards it if it was left empty. Blank tasks left
// in a task list are cleared out too.
async function leaveCurrentItem() {
  await flushSaves();
  const item = currentItem();
  if (!item) return;
  if (state.side === 'tasks') {
    for (const task of tasksIn(item.id).filter(t => t.text.trim() === '')) await removeTaskQuietly(task);
  }
  if (isEmptyItem(item)) await removeItem(item, true);
}

// ---- Phone screens and the back gesture ----
// On phones, opening an item adds an entry to the browser's history, so the
// back gesture (or Android's back button) returns to the list instead of
// leaving the app.

const phoneLayout = window.matchMedia('(max-width: 700px)');
let ignoreNextPop = false;

function syncHistory() {
  if (!phoneLayout.matches) return;
  const onItem = Boolean(currentItem()) || Boolean(state.page);
  const inHistory = history.state && history.state.anthology === 'item';
  if (onItem && !inHistory) {
    history.pushState({ anthology: 'item' }, '');
  } else if (!onItem && inHistory) {
    // The item was closed some other way (Back button, delete): drop its entry.
    ignoreNextPop = true;
    history.back();
  }
}

function handlePopState() {
  if (ignoreNextPop) {
    ignoreNextPop = false;
    return;
  }
  if (currentItem() || state.page) goBack();
}

// On phones, goes from an open item (or Recently deleted) back to the list of
// folders and items.
async function goBack() {
  if (state.page) {
    state.page = state.page === 'links' ? 'settings' : null;
  } else {
    await leaveCurrentItem();
    view().currentId = null;
  }
  savePrefs();
  render();
}

async function openItem(id) {
  if (id === view().currentId && !state.page) return;
  await leaveCurrentItem();
  state.page = null;
  view().currentId = id;
  const item = currentItem();
  if (item) view().activeFolderId = item.folderId;
  setStatus('');
  savePrefs();
  render();
}

async function createItem() {
  clearSearch();
  await leaveCurrentItem();
  state.page = null;
  const now = Date.now();
  const base = { id: newId(), folderId: view().activeFolderId, createdAt: now, updatedAt: now };
  const item = state.side === 'notes'
    ? { ...base, body: '' }
    : { ...base, title: '', showCompleted: true };
  side().items().push(item);
  view().currentId = item.id;
  if (item.folderId) view().openFolderIds.add(item.folderId);
  await runSave(() => side().save(item));
  setStatus('');
  savePrefs();
  render();
  els.titleInput.focus();
}

async function deleteItem(item) {
  if (!item) return;
  const empty = isEmptyItem(item);
  if (!empty) {
    let message;
    if (state.side === 'notes') {
      message = `Are you sure you want to delete "${noteTitle(item)}"?`;
    } else {
      const count = tasksIn(item.id).length;
      const contents = count === 0 ? '' : ` and its ${plural(count, 'task', 'tasks')}`;
      message = `Are you sure you want to delete the task list "${side().title(item)}"${contents}?`;
    }
    if (!await askConfirm(`${message} ${CAN_RESTORE}`)) return;
  }
  if (item.id === view().currentId) view().currentId = null;
  await removeItem(item, empty);
  savePrefs();
  render();
}

// ---- Sides ----

async function setSide(name) {
  if (name === state.side) return;
  clearSearch();
  await leaveCurrentItem();
  state.side = name;
  state.editingFolderId = null;
  setStatus('');
  savePrefs();
  render();
}

// ---- Drawing the page ----

function render() {
  refreshTrash();
  renderSide();
  renderSidebar();
  renderMain();
  syncHistory();
}

function renderSide() {
  document.body.classList.toggle('side-tasks', state.side === 'tasks');
  for (const toggle of els.sideButtons) {
    toggle.setAttribute('aria-pressed', String(toggle.dataset.side === state.side));
  }
  els.newItem.textContent = side().newLabel;
}

function renderMain() {
  const page = state.page;
  const item = page ? null : currentItem();
  document.body.classList.toggle('has-item', Boolean(item) || Boolean(page)); // phones show the item screen
  els.trashPane.hidden = page !== 'trash';
  els.settingsPane.hidden = page !== 'settings';
  els.linksPane.hidden = page !== 'links';
  els.itemPane.hidden = !item;
  els.emptyState.hidden = Boolean(item) || Boolean(page);
  els.emptyMessage.textContent = side().emptyMessage;
  if (page === 'trash') renderTrash();
  if (!item) return;

  els.titleInput.placeholder = side().titlePlaceholder;
  els.deleteItem.textContent = side().deleteLabel;
  els.pinItem.textContent = item.pinned ? 'Unpin' : 'Pin';
  const options = [new Option('Top level', '')];
  const addOptions = (parentId, depth) => {
    for (const folder of childFolders(parentId)) {
      options.push(new Option(`${'\u00a0\u00a0\u00a0'.repeat(depth)}${folder.name}`, folder.id));
      addOptions(folder.id, depth + 1);
    }
  };
  addOptions(null, 0);
  els.itemFolder.replaceChildren(...options);
  els.itemFolder.value = item.folderId || '';

  const onNotes = state.side === 'notes';
  els.editor.hidden = !onNotes;
  els.taskPane.hidden = onNotes;
  if (onNotes) {
    if (joinNote(els.titleInput.value, els.editor.value) !== item.body) {
      const { title, rest } = splitNote(item.body);
      els.titleInput.value = title;
      els.editor.value = rest;
    }
  } else {
    if (els.titleInput.value !== item.title) els.titleInput.value = item.title;
    renderTasks();
  }
}

function showLoadError() {
  const message = el('div', 'load-error');
  message.append(
    el('p', null, "Your notes and tasks couldn't be loaded, so nothing has been changed."),
    el('p', null, 'Try reloading the page. If this keeps happening, ask for help before adding anything new.')
  );
  els.layout.hidden = false;
  els.layout.replaceChildren(message);
}

// ---- Syncing ----

const SYNC_TEXT = {
  idle: '',
  synced: 'All changes synced',
  pending: 'Syncing…',
  syncing: 'Syncing…',
  offline: 'Offline: changes are saved on this device and will sync later',
  error: "Can't reach the database right now; will keep trying",
};

function showSyncStatus(status) {
  // A routine check with nothing to send keeps the "All changes synced" message.
  if (status === 'syncing' && !Storage.hasUnsynced()) return;
  els.syncStatus.textContent = SYNC_TEXT[status] ?? '';
  els.syncStatus.classList.toggle('is-problem', status === 'error');
}

// Changes arrived from another device, another tab, or an edit link. Anything
// with a save still waiting keeps its on-screen version, so typing isn't lost.
// The open item is updated straight away unless someone typed in the last few
// seconds; then the update waits until they move away.
let mainIsStale = false;
let lastTypedAt = 0;
const TYPING_PAUSE_MS = 3000;

async function applyRemoteChanges() {
  const data = await Storage.loadAll();
  const keep = (fresh, current, prefix) => {
    const pending = current.filter(record => pendingSaves.has(`${prefix}:${record.id}`));
    return [...fresh.filter(record => !pending.some(p => p.id === record.id)), ...pending];
  };
  state.folders = data.folders;
  state.notes = keep(data.notes, state.notes, 'item');
  state.taskLists = keep(data.taskLists, state.taskLists, 'item');
  state.tasks = keep(data.tasks, state.tasks, 'task');
  refreshTrash();
  renderSide();
  renderSidebar();
  const active = document.activeElement;
  const typing = pendingSaves.size > 0 || Date.now() - lastTypedAt < TYPING_PAUSE_MS;
  // Fields that stay in place when the open item is redrawn (task rows don't).
  const steady = [els.editor, els.titleInput, els.addTask].includes(active);
  if (!els.itemPane.contains(active)) {
    renderMain();
    syncHistory();
  } else if (!typing && steady) {
    // Show the new version, keeping the cursor where it was.
    const start = active.selectionStart;
    const end = active.selectionEnd;
    renderMain();
    active.setSelectionRange(Math.min(start, active.value.length), Math.min(end, active.value.length));
  } else {
    mainIsStale = true;
  }
}

// On first sign-in in a browser that has notes from before 0.5, offer to add them.
async function offerOldDeviceData() {
  const found = Storage.oldDeviceData();
  if (!found) return;
  const parts = [];
  if (found.notes) parts.push(plural(found.notes, 'note', 'notes'));
  if (found.taskLists) parts.push(plural(found.taskLists, 'task list', 'task lists'));
  const them = found.notes + found.taskLists === 1 ? 'it' : 'them';
  const add = confirm(
    `This browser has ${parts.join(' and ')} saved from before you signed in. Add ${them} to your account?\n\n` +
    `OK adds ${them}. Cancel leaves ${them} out; ${them === 'it' ? 'it stays' : 'they stay'} saved in this browser.`
  );
  if (add) {
    await Storage.addOldDeviceData();
    Object.assign(state, await Storage.loadAll());
    render();
  } else {
    Storage.leaveOutOldDeviceData();
  }
}

// ---- Start up ----

// Clears out blank tasks, and notes and task lists that were left empty,
// except the open ones.
async function clearOutEmpties() {
  for (const task of state.tasks.filter(t => t.text.trim() === '')) {
    state.tasks = state.tasks.filter(t => t !== task);
    await runSave(() => Storage.deleteTask(task.id, true));
  }
  const startSide = state.side;
  for (const name of ['notes', 'tasks']) {
    state.side = name;
    for (const item of side().items().filter(i => isEmptyItem(i) && i.id !== view().currentId)) {
      await removeItem(item, true);
    }
  }
  state.side = startSide;
}

async function startApp(user) {
  Storage.openUser(user);
  document.body.classList.remove('signed-out');
  els.access.hidden = true;
  els.layout.hidden = false;
  els.accountEmail.textContent = user.email;
  try {
    Object.assign(state, await Storage.loadAll());
  } catch (err) {
    console.error(err);
    showLoadError();
    return;
  }
  applyPrefs(Storage.loadPrefs());
  await clearOutEmpties();
  render();
  await offerOldDeviceData();
  renderReminder();
  Storage.sync();
}

function wireEvents() {
  const byId = id => document.getElementById(id);

  for (const toggle of els.sideButtons) {
    toggle.addEventListener('click', () => setSide(toggle.dataset.side));
  }
  els.newItem.addEventListener('click', createItem);

  els.deleteItem.addEventListener('click', () => deleteItem(currentItem()));

  byId('back-button').addEventListener('click', goBack);

  window.addEventListener('popstate', handlePopState);

  document.addEventListener('input', () => { lastTypedAt = Date.now(); });

  // Changes that arrived while someone was typing are shown once they finish.
  els.itemPane.addEventListener('focusout', event => {
    if (mainIsStale && !els.itemPane.contains(event.relatedTarget)) {
      mainIsStale = false;
      renderMain();
      syncHistory();
    }
  });

  // Save right away if the page is closed or hidden mid-typing.
  window.addEventListener('pagehide', flushSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves();
  });

  // Each feature hooks up its own buttons and keys.
  wireSidebarEvents();
  wireEditorEvents();
  wireTaskEvents();
  wireUiEvents();
  wireBackupEvents();
  wireSearchEvents();
  wirePageEvents();
  wireSharingEvents();
  wireAccessEvents();

  Storage.onChange(applyRemoteChanges);
  Storage.onStatus(showSyncStatus);
  Storage.onSignedOut(() => showAccess("You've been signed out. Enter your email to get back in."));
}

async function init() {
  const byId = id => document.getElementById(id);
  Object.assign(els, {
    layout: byId('layout'),
    sideButtons: document.querySelectorAll('.side-toggle button'),
    newItem: byId('new-item'),
    newItemTarget: byId('new-item-target'),
    tree: byId('tree'),
    itemPane: byId('item-pane'),
    itemFolder: byId('item-folder'),
    saveStatus: byId('save-status'),
    deleteItem: byId('delete-item'),
    titleInput: byId('title-input'),
    editor: byId('editor'),
    taskPane: byId('task-pane'),
    openTasks: byId('open-tasks'),
    addTask: byId('add-task'),
    completedHeader: byId('completed-header'),
    completedCount: byId('completed-count'),
    completedToggle: byId('completed-toggle'),
    doneTasks: byId('done-tasks'),
    emptyState: byId('empty-state'),
    emptyMessage: byId('empty-message'),
    restoreFile: byId('restore-file'),
    toast: byId('toast'),
    toastText: byId('toast-text'),
    menu: byId('menu'),
    trashPane: byId('trash-pane'),
    trashList: byId('trash-list'),
    trashNone: byId('trash-none'),
    trashEmpty: byId('trash-empty'),
    trashLink: byId('trash-link'),
    trashCount: byId('trash-count'),
    settingsLink: byId('settings-link'),
    settingsPane: byId('settings-pane'),
    linksPane: byId('links-pane'),
    linksList: byId('links-list'),
    linksMessage: byId('links-message'),
    aboutVersion: byId('about-version'),
    shareDialog: byId('share-dialog'),
    shareHeading: byId('share-heading'),
    shareExplain: byId('share-explain'),
    shareUrl: byId('share-url'),
    shareSend: byId('share-send'),
    shareNew: byId('share-new'),
    shareOff: byId('share-off'),
    shareMessage: byId('share-message'),
    viewer: byId('viewer'),
    viewerTitle: byId('viewer-title'),
    viewerBody: byId('viewer-body'),
    viewerTasks: byId('viewer-tasks'),
    viewerMissing: byId('viewer-missing'),
    viewerStatus: byId('viewer-status'),
    moveDialog: byId('move-dialog'),
    moveHeading: byId('move-heading'),
    moveList: byId('move-list'),
    confirmDialog: byId('confirm-dialog'),
    confirmMessage: byId('confirm-message'),
    confirmYes: byId('confirm-yes'),
    confirmNo: byId('confirm-no'),
    pinItem: byId('pin-item'),
    search: byId('search'),
    searchClear: byId('search-clear'),
    searchResults: byId('search-results'),
    searchNone: byId('search-none'),
    reminder: byId('reminder'),
    restoreDialog: byId('restore-dialog'),
    restoreSummary: byId('restore-summary'),
    restoreAdd: byId('restore-add'),
    restoreReplace: byId('restore-replace'),
    restoreCancel: byId('restore-cancel'),
    viewerFooter: byId('viewer-footer'),
    syncStatus: byId('sync-status'),
    accountEmail: byId('account-email'),
    access: byId('access'),
    accessEmailForm: byId('access-email-form'),
    accessEmail: byId('access-email'),
    accessCodeForm: byId('access-code-form'),
    accessCodeIntro: byId('access-code-intro'),
    accessCode: byId('access-code'),
    accessMessage: byId('access-message'),
  });

  // Right after an update, a browser can briefly load a mix of old and new
  // files. If so, reload once to get a matching set.
  if (Storage.version !== APP_VERSION) {
    if (!sessionStorage.getItem('anthology.reloadedForUpdate')) {
      sessionStorage.setItem('anthology.reloadedForUpdate', 'yes');
      location.reload();
      return;
    }
    showLoadError();
    return;
  }
  sessionStorage.removeItem('anthology.reloadedForUpdate');
  els.aboutVersion.textContent = APP_VERSION;

  // A shared link (…#share=CODE) shows just that item, without signing in.
  if (location.hash.startsWith('#share=')) {
    try {
      Storage.connect();
    } catch (err) {
      console.error(err);
      showLoadError();
      return;
    }
    startViewer(decodeURIComponent(location.hash.slice('#share='.length)));
    return;
  }

  wireEvents();

  // The offline helper (sw.js) only works when the app is served from a web
  // address, not when index.html is opened as a file. It's left off on the
  // test copy (localhost), so testing always uses the latest files.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    if (location.hostname === 'localhost') {
      navigator.serviceWorker.getRegistrations().then(all => all.forEach(r => r.unregister()));
    } else {
      navigator.serviceWorker.register('sw.js').catch(err => console.error('Offline helper not set up', err));
    }
  }

  let user = null;
  try {
    Storage.connect();
    user = await Storage.restoreUser();
  } catch (err) {
    console.error(err);
    showLoadError();
    return;
  }
  if (user) await startApp(user);
  else showAccess();
}

init();
