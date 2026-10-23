// app.js
// Draws the page and responds to clicks and typing. All saving and loading goes
// through Storage (storage.js), so this file doesn't care where data lives.
// Text people type is only ever put on the page as plain text (textContent or
// input values), never as HTML, so nothing typed can run as code.

const APP_VERSION = '0.10'; // must match the version in storage.js
const SAVE_DELAY_MS = 500;
const UNDO_SECONDS = 10;
const NO_RETRIEVE = 'There is no way to retrieve this.';
const CAN_RESTORE = 'You can restore it from Recently deleted for 30 days.';
const KEEP_DAYS = 30;
const NEW_FOLDER = 'new';
const BACKUP_PICKER_ID = 'anthology-backups';
const EXPORT_TYPES = [{ description: 'Anthology export', accept: { 'application/zip': ['.zip'] } }];
const RESTORE_TYPES = [{ description: 'Anthology export or backup', accept: { 'application/zip': ['.zip'], 'application/json': ['.json'] } }];

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
let drag = null;            // the task being dragged, while a drag is under way
let lastDeletedTask = null;
let undoTimer = null;

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

// Moving an item doesn't count as editing it, so its date stays the same.
async function moveCurrentItem(folderId) {
  const item = currentItem();
  if (!item) return;
  await moveThing({ kind: 'item', id: item.id }, folderId);
  view().activeFolderId = folderId;
  savePrefs();
  render();
}

function handleTitleInput() {
  const item = currentItem();
  if (!item) return;
  if (state.side === 'notes') {
    item.body = joinNote(els.titleInput.value, els.editor.value);
  } else {
    item.title = els.titleInput.value;
  }
  item.updatedAt = Date.now();
  setStatus('');
  saveItemSoon(item);
  renderSidebar();
}

// ---- Tasks ----

// Gives the tasks positions 0, 1, 2… in the given order and saves them.
async function savePositions(ordered) {
  ordered.forEach((task, index) => { task.position = index; });
  await runSave(() => Storage.saveTasks(ordered));
}

async function addTask(list, text, afterTask = null) {
  const task = {
    id: newId(), listId: list.id, text, done: false,
    position: 0, createdAt: Date.now(), completedAt: null,
  };
  const ordered = tasksIn(list.id);
  const index = afterTask ? ordered.indexOf(afterTask) + 1 : ordered.length;
  ordered.splice(index, 0, task);
  state.tasks.push(task);
  await savePositions(ordered);
  touchList(list.id);
  return task;
}

// Removes a task. Blank tasks are discarded (erased); others go to Recently
// deleted.
async function removeTaskQuietly(task) {
  cancelSave(`task:${task.id}`);
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  const discard = task.text.trim() === '';
  await runSave(() => Storage.deleteTask(task.id, discard));
  touchList(task.listId);
}

async function deleteTask(task) {
  await removeTaskQuietly(task);
  renderTasks();
  refreshTrash();
  renderSidebar();
  if (task.text.trim() !== '') showUndo(task);
}

async function setTaskDone(task, done) {
  task.done = done;
  task.completedAt = done ? Date.now() : null;
  await runSave(() => Storage.saveTask(task));
  touchList(task.listId);
  renderTasks();
}

// Moves a task one step up or down among the tasks in the same group
// (open or completed).
async function nudgeTask(task, step) {
  const group = tasksIn(task.listId).filter(t => t.done === task.done);
  const neighbor = group[group.indexOf(task) + step];
  if (!neighbor) return;
  const ordered = tasksIn(task.listId);
  const a = ordered.indexOf(task);
  const b = ordered.indexOf(neighbor);
  [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
  await savePositions(ordered);
  touchList(task.listId);
  renderTasks();
  const again = document.querySelector(`[data-task-id="${task.id}"] .${step < 0 ? 'move-up' : 'move-down'}`);
  if (again) again.focus();
}

async function dropTask(dragged, target, after) {
  const ordered = tasksIn(dragged.listId).filter(t => t !== dragged);
  ordered.splice(ordered.indexOf(target) + (after ? 1 : 0), 0, dragged);
  await savePositions(ordered);
  touchList(dragged.listId);
  renderTasks();
}

async function toggleCompleted() {
  const list = currentItem();
  if (!list) return;
  list.showCompleted = !list.showCompleted;
  await runSave(() => Storage.saveTaskList(list));
  renderTasks();
}

// ---- Dragging tasks ----
// Works the same with a mouse, trackpad or finger: press on the ⋮⋮ handle and
// move. Tasks can only be dragged within their own group (open or completed).

function startDrag(event, task, li) {
  if (event.button !== 0) return;
  event.preventDefault();
  closeMenu();
  drag = { task, li, target: null, after: false, pointerId: event.pointerId };
  li.classList.add('is-dragging');
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  clearDropMarks();
  drag.target = null;
  const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('.task');
  if (under && under !== drag.li && under.parentElement === drag.li.parentElement) {
    const box = under.getBoundingClientRect();
    drag.after = event.clientY - box.top > box.height / 2;
    drag.target = under;
    under.classList.add(drag.after ? 'drop-after' : 'drop-before');
  }
  // Scroll the list when dragging near its top or bottom edge.
  const pane = els.taskPane.getBoundingClientRect();
  if (event.clientY < pane.top + 48) els.taskPane.scrollTop -= 12;
  else if (event.clientY > pane.bottom - 48) els.taskPane.scrollTop += 12;
}

function endDrag(event, cancelled) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { task, li, target, after } = drag;
  drag = null;
  li.classList.remove('is-dragging');
  clearDropMarks();
  if (cancelled || !target) return;
  const targetTask = state.tasks.find(t => t.id === target.dataset.taskId);
  if (targetTask) dropTask(task, targetTask, after);
}

function clearDropMarks() {
  for (const marked of document.querySelectorAll('.drop-before, .drop-after')) {
    marked.classList.remove('drop-before', 'drop-after');
  }
}

// ---- The ⋯ menu ----
// Touch screens have no hover, so rows show a ⋯ button that opens this menu
// with the same choices the hover buttons offer.

function moreButton(label, choices) {
  return button('more-button', '⋯', label, event => {
    event.stopPropagation();
    openMenu(event.currentTarget, choices);
  });
}

function openMenu(opener, choices) {
  closeMenu();
  const entries = choices.map(choice => {
    const entry = button(choice.danger ? 'danger' : '', choice.label, undefined, () => {
      closeMenu();
      choice.run();
    });
    entry.setAttribute('role', 'menuitem');
    return entry;
  });
  els.menu.replaceChildren(...entries);
  els.menu.hidden = false;

  // Place it under the ⋯ button, kept inside the screen.
  const at = opener.getBoundingClientRect();
  const size = els.menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(at.right - size.width, innerWidth - size.width - 8));
  let top = at.bottom + 4;
  if (top + size.height > innerHeight - 8) top = Math.max(8, at.top - size.height - 4);
  els.menu.style.left = `${left}px`;
  els.menu.style.top = `${top}px`;
  entries[0]?.focus();
}

function closeMenu() {
  if (els.menu.hidden) return;
  els.menu.hidden = true;
  els.menu.replaceChildren();
}

function focusTask(taskId, atEnd = true) {
  const input = document.querySelector(`[data-task-id="${taskId}"] .task-text`);
  if (!input) return;
  input.focus();
  const at = atEnd ? input.value.length : 0;
  input.setSelectionRange(at, at);
}

// ---- Undo for deleted tasks ----

function showUndo(task) {
  lastDeletedTask = { ...task };
  els.toastText.textContent = 'Task deleted';
  els.toast.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, UNDO_SECONDS * 1000);
}

function hideUndo() {
  clearTimeout(undoTimer);
  els.toast.hidden = true;
  lastDeletedTask = null;
}

async function undoDelete() {
  const task = lastDeletedTask;
  hideUndo();
  if (task) await restoreDeleted('tasks', task.id);
}

// ---- Folders ----

function toggleFolder(folder) {
  const v = view();
  if (v.openFolderIds.has(folder.id)) {
    v.openFolderIds.delete(folder.id);
    if (v.activeFolderId === folder.id) v.activeFolderId = null;
  } else {
    v.openFolderIds.add(folder.id);
    v.activeFolderId = folder.id;
  }
  savePrefs();
  renderSidebar();
}

function startEditingFolder(id) {
  clearSearch();
  state.editingFolderId = id;
  renderSidebar();
}

async function finishEditingFolder(folder, name) {
  state.editingFolderId = null;
  if (name && folder && name !== folder.name) {
    folder.name = name;
    await runSave(() => Storage.saveFolder(folder));
  } else if (name && !folder) {
    const parentId = findFolder(view().activeFolderId) ? view().activeFolderId : null;
    const created = { id: newId(), name, parentId, createdAt: Date.now() };
    state.folders.push(created);
    view().openFolderIds.add(created.id);
    view().activeFolderId = created.id;
    savePrefs();
    await runSave(() => Storage.saveFolder(created));
  }
  render();
}

async function deleteFolder(folder) {
  const folderIds = descendantIds(folder.id);
  const inside = new Set(folderIds);
  const notes = state.notes.filter(note => inside.has(note.folderId));
  const lists = state.taskLists.filter(list => inside.has(list.folderId));
  const parts = [];
  if (folderIds.length > 1) parts.push(plural(folderIds.length - 1, 'folder', 'folders'));
  if (notes.length) parts.push(plural(notes.length, 'note', 'notes'));
  if (lists.length) parts.push(plural(lists.length, 'task list', 'task lists'));
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const contents = parts.length ? `, with ${joined} inside` : '';
  if (!await askConfirm(`Are you sure you want to delete the folder "${folder.name}"${contents}? ${CAN_RESTORE}`)) return;

  await flushSaves();
  const listIds = new Set(lists.map(list => list.id));
  state.notes = state.notes.filter(note => !inside.has(note.folderId));
  state.taskLists = state.taskLists.filter(list => !listIds.has(list.id));
  state.tasks = state.tasks.filter(task => !listIds.has(task.listId));
  state.folders = state.folders.filter(f => !inside.has(f.id));
  for (const [name, items] of [['notes', state.notes], ['tasks', state.taskLists]]) {
    const v = state.views[name];
    if (!items.some(item => item.id === v.currentId)) v.currentId = null;
    for (const id of folderIds) v.openFolderIds.delete(id);
    if (inside.has(v.activeFolderId)) v.activeFolderId = null;
  }
  await runSave(() => Storage.deleteFolder(folder.id));
  savePrefs();
  render();
}

// ---- Export and restore ----

// For example anthology-export-2026-10-22-1435
function exportName() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `anthology-export-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// Saves a file: Chrome and Edge show a Save window, so you choose the folder
// (it remembers the last one); other browsers use the downloads folder.
async function saveFile(blob, name, types) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ id: BACKUP_PICKER_ID, suggestedName: name, types });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false; // the Save window was cancelled
      console.error('Save window failed, downloading instead', err);
    }
  }
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

// One ZIP file with every note and task list as Markdown, plus the backup file.
async function exportEverything() {
  await flushSaves();
  let data;
  try {
    data = await Storage.loadAll();
  } catch (err) {
    console.error(err);
    alert("The export couldn't be made because your notes couldn't be read.");
    return;
  }
  const name = exportName();
  const files = Export.buildFiles(data, Storage.makeBackup(data), name);
  const saved = await saveFile(Export.makeZip(files), `${name}.zip`, EXPORT_TYPES);
  if (!saved) return;
  await Storage.recordExport();
  renderReminder();
}

async function chooseBackupFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ id: BACKUP_PICKER_ID, types: RESTORE_TYPES });
      restoreBackup(await handle.getFile());
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Open window failed, using the file chooser instead', err);
    }
  }
  els.restoreFile.click();
}

// Asks how to restore. Resolves to 'add', 'replace', or null (cancelled).
function askHowToRestore(summary) {
  els.restoreSummary.textContent = `This backup has ${summary}.`;
  els.restoreDialog.showModal();
  return new Promise(resolve => {
    const finish = choice => {
      els.restoreDialog.close();
      for (const [button, handler] of handlers) button.removeEventListener('click', handler);
      els.restoreDialog.removeEventListener('cancel', onCancel);
      resolve(choice);
    };
    const handlers = [
      [els.restoreAdd, () => finish('add')],
      [els.restoreReplace, () => finish('replace')],
      [els.restoreCancel, () => finish(null)],
    ];
    const onCancel = () => finish(null);
    for (const [button, handler] of handlers) button.addEventListener('click', handler);
    els.restoreDialog.addEventListener('cancel', onCancel);
  });
}

async function restoreBackup(file) {
  let data;
  try {
    const isZip = /\.zip$/i.test(file.name) || file.type === 'application/zip';
    const text = isZip ? await Export.readBackupFromZip(await file.arrayBuffer()) : await file.text();
    data = Storage.parseBackup(text);
  } catch (err) {
    alert(err.message);
    return;
  }
  const summary = `${plural(data.notes.length, 'note', 'notes')}, ` +
    `${plural(data.taskLists.length, 'task list', 'task lists')} and ` +
    `${plural(data.folders.length, 'folder', 'folders')}`;
  const choice = await askHowToRestore(summary);
  if (!choice) return;

  await flushSaves();
  hideUndo();
  try {
    if (choice === 'add') {
      const added = await Storage.addMissing(data);
      const parts = [];
      if (added.notes) parts.push(plural(added.notes, 'note', 'notes'));
      if (added.taskLists) parts.push(plural(added.taskLists, 'task list', 'task lists'));
      if (added.tasks) parts.push(plural(added.tasks, 'task', 'tasks'));
      if (added.folders) parts.push(plural(added.folders, 'folder', 'folders'));
      alert(parts.length
        ? `Added ${parts.join(', ')} from the backup. Everything else was left as it is.`
        : 'Nothing was missing: everything in this backup is already in Anthology.');
    } else {
      for (const pending of pendingSaves.values()) clearTimeout(pending.timer);
      pendingSaves.clear();
      await Storage.replaceAll(data);
      state.views = { notes: newView(), tasks: newView() };
    }
  } catch (err) {
    reportProblem(err);
    return;
  }
  Object.assign(state, await Storage.loadAll());
  savePrefs();
  render();
}

// ---- Export reminder ----
// A banner when the last export is about six months old (or, if there's never
// been one, six months after the account was made). "Not now" hides it for
// two weeks. Both dates are kept with the account, so every device agrees.

const REMIND_AFTER_MS = 182 * 24 * 60 * 60 * 1000;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

async function renderReminder() {
  let info = null;
  try {
    info = await Storage.exportInfo();
  } catch (err) {
    console.error(err);
  }
  const due = Boolean(info) && Date.now() - Math.max(info.lastExportAt || 0, info.createdAt || 0) > REMIND_AFTER_MS
    && Date.now() > (info.snoozedUntil || 0);
  els.reminder.hidden = !due;
}

async function snoozeReminder() {
  els.reminder.hidden = true;
  try {
    await Storage.snoozeReminder(Date.now() + SNOOZE_MS);
  } catch (err) {
    console.error(err);
  }
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

// ---- Folders inside folders ----

const childFolders = parentId => state.folders.filter(f => (f.parentId || null) === parentId).sort(byName);

// A folder and every folder inside it, at any depth.
function descendantIds(id) {
  const ids = [id];
  for (let i = 0; i < ids.length; i++) {
    for (const f of state.folders) if (f.parentId === ids[i] && !ids.includes(f.id)) ids.push(f.id);
  }
  return ids;
}

// For example "Garden › Vegetables".
function folderPath(id) {
  const names = [];
  const seen = new Set();
  for (let folder = findFolder(id); folder && !seen.has(folder.id); folder = findFolder(folder.parentId)) {
    seen.add(folder.id);
    names.unshift(folder.name);
  }
  return names.join(' › ');
}

// Each level indents a little less than the one before, then not at all, so
// deep folders still fit on a phone.
const INDENTS = [16, 12, 8, 4];
const indentFor = depth => INDENTS[depth - 1] ?? 0;
const totalIndent = depth => INDENTS.slice(0, depth).reduce((sum, n) => sum + n, 0);

// Opens a folder and the folders around it, so it can be seen.
function revealFolder(id) {
  for (let folder = findFolder(id); folder; folder = findFolder(folder.parentId)) {
    if (view().openFolderIds.has(folder.id) && folder.id !== id) break;
    view().openFolderIds.add(folder.id);
  }
}

function newFolderInside(folder) {
  revealFolder(folder.id);
  view().activeFolderId = folder.id;
  startEditingFolder(NEW_FOLDER);
}

// Moves a note, task list or folder into a folder (or to the top level when
// folderId is null). A folder can't go inside itself or its own folders.
async function moveThing(what, folderId) {
  if (what.kind === 'folder') {
    const folder = findFolder(what.id);
    if (!folder || (folder.parentId || null) === folderId) return;
    if (folderId && descendantIds(folder.id).includes(folderId)) return;
    folder.parentId = folderId;
    await runSave(() => Storage.saveFolder(folder));
  } else {
    const item = side().items().find(i => i.id === what.id);
    if (!item || (item.folderId || null) === folderId) return;
    await flushSaves();
    item.folderId = folderId; // moving doesn't count as editing, so the date stays
    await runSave(() => side().save(item));
  }
  if (folderId) revealFolder(folderId);
  savePrefs();
  render();
}

// The "Move to…" window: every folder, indented to show the nesting.
function openMoveDialog(what, title) {
  els.moveHeading.textContent = `Move "${title}" to…`;
  const blocked = new Set(what.kind === 'folder' ? descendantIds(what.id) : []);
  const here = what.kind === 'folder'
    ? findFolder(what.id).parentId || null
    : side().items().find(i => i.id === what.id).folderId || null;
  const choices = [];
  const addChoice = (label, folderId, depth) => {
    const li = el('li');
    const choice = button('move-choice', label, undefined, async () => {
      els.moveDialog.close();
      await moveThing(what, folderId);
    });
    choice.style.paddingLeft = `${10 + totalIndent(depth)}px`;
    if (folderId === here) {
      choice.classList.add('is-here');
      choice.append(el('span', 'move-here', ' (here now)'));
    }
    li.append(choice);
    choices.push(li);
  };
  addChoice('Top level', null, 0);
  const walk = (parentId, depth) => {
    for (const folder of childFolders(parentId)) {
      if (blocked.has(folder.id)) continue;
      addChoice(folder.name, folder.id, depth);
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1);
  els.moveList.replaceChildren(...choices);
  els.moveDialog.showModal();
}

// ---- Dragging onto folders (computers with a mouse or trackpad) ----

const canDrag = window.matchMedia('(hover: hover)');
let dragging = null; // { kind: 'item' | 'folder', id }
let openTimer = null;

function makeDraggable(row, what) {
  if (!canDrag.matches) return;
  row.draggable = true;
  row.addEventListener('dragstart', event => {
    dragging = what;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', what.id);
    row.classList.add('is-dragging');
  });
  row.addEventListener('dragend', () => {
    dragging = null;
    row.classList.remove('is-dragging');
    clearFolderDropMarks();
  });
}

function canDropInto(folderId) {
  if (!dragging) return false;
  if (dragging.kind === 'folder') return !folderId || !descendantIds(dragging.id).includes(folderId);
  return true;
}

function clearFolderDropMarks() {
  clearTimeout(openTimer);
  for (const marked of document.querySelectorAll('.drop-into')) marked.classList.remove('drop-into');
}

// A folder row accepts drops; holding over a closed folder opens it.
function makeDropTarget(row, folder) {
  if (!canDrag.matches) return;
  row.addEventListener('dragover', event => {
    if (!canDropInto(folder.id)) return;
    event.preventDefault();
    event.stopPropagation();
    if (row.classList.contains('drop-into')) return;
    clearFolderDropMarks();
    row.classList.add('drop-into');
    if (!view().openFolderIds.has(folder.id)) {
      openTimer = setTimeout(() => {
        view().openFolderIds.add(folder.id);
        renderSidebar();
      }, 700);
    }
  });
  row.addEventListener('drop', event => {
    if (!canDropInto(folder.id)) return;
    event.preventDefault();
    event.stopPropagation();
    const what = dragging;
    clearFolderDropMarks();
    moveThing(what, folder.id);
  });
}

// ---- Drawing the sidebar ----

// One level of the sidebar: pinned folders, then pinned notes or task lists,
// then the other folders (alphabetical) and items (most recently edited).
function levelRows(parentId, depth) {
  const rows = [];
  const activeId = findFolder(view().activeFolderId) ? view().activeFolderId : null;
  if (state.editingFolderId === NEW_FOLDER && activeId === parentId) rows.push(folderNameInput(null));
  const folders = childFolders(parentId);
  const items = itemsIn(parentId);
  const folderLine = folder => (state.editingFolderId === folder.id ? folderNameInput(folder) : folderRow(folder, depth));
  rows.push(
    ...folders.filter(f => f.pinned).map(folderLine),
    ...items.filter(i => i.pinned).map(itemRow),
    ...folders.filter(f => !f.pinned).map(folderLine),
    ...items.filter(i => !i.pinned).map(itemRow)
  );
  return rows;
}

// Pinning isn't editing, so an item's "last edited" date stays the same.
async function togglePin(kind, record) {
  record.pinned = !record.pinned;
  if (kind === 'folder') await runSave(() => Storage.saveFolder(record));
  else await runSave(() => side().save(record));
  render();
}

const pinMark = () => {
  const mark = el('span', 'pin-mark', '📌');
  mark.setAttribute('aria-label', 'Pinned');
  return mark;
};

function renderSidebar() {
  els.tree.replaceChildren(...levelRows(null, 0));
  renderSearch();

  // Recently deleted sits at the bottom of the sidebar, apart from the folders.
  els.trashCount.textContent = state.trash.length ? String(state.trash.length) : '';
  for (const [link, pages] of [[els.trashLink, ['trash']], [els.settingsLink, ['settings', 'links']]]) {
    const current = pages.includes(state.page);
    link.classList.toggle('is-current', current);
    if (current) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }

  const active = findFolder(view().activeFolderId);
  const what = `New ${side().plural} and folders`;
  els.newItemTarget.textContent = active ? `${what} go into ${folderPath(active.id)}` : `${what} go at the top level`;
}

function itemRow(item) {
  const title = side().title(item);
  const li = el('li');
  const row = el('div', 'sidebar-item');
  const open = button('row', undefined, undefined, () => openItem(item.id));
  if (item.id === view().currentId) {
    row.classList.add('is-current');
    open.setAttribute('aria-current', 'true');
  }
  if (item.pinned) open.append(pinMark());
  open.append(el('span', 'item-title', title), el('span', 'item-date', formatDate(item.updatedAt)));

  const move = () => openMoveDialog({ kind: 'item', id: item.id }, title);
  const pinLabel = item.pinned ? 'Unpin' : 'Pin';
  const actions = el('span', 'item-actions');
  actions.append(
    button('icon-button', pinLabel, `${pinLabel} ${title}`, () => togglePin('item', item)),
    button('icon-button', 'Move', `Move ${title}`, move),
    button('icon-button danger', 'Delete', `Delete ${title}`, () => deleteItem(item))
  );
  const more = moreButton(`More for ${title}`, [
    { label: pinLabel, run: () => togglePin('item', item) },
    { label: 'Move to…', run: move },
    { label: 'Delete', danger: true, run: () => deleteItem(item) },
  ]);

  row.append(open, actions, more);
  makeDraggable(row, { kind: 'item', id: item.id });
  li.append(row);
  return li;
}

function folderRow(folder, depth) {
  const isOpen = view().openFolderIds.has(folder.id);
  const items = itemsIn(folder.id);
  const children = isOpen ? levelRows(folder.id, depth + 1) : [];
  const li = el('li', 'folder');
  li.classList.toggle('is-open', isOpen);

  const row = el('div', 'folder-row');
  row.classList.toggle('is-active', view().activeFolderId === folder.id);

  const toggle = button('row', undefined, undefined, () => toggleFolder(folder));
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.append(el('span', 'chevron'));
  if (folder.pinned) toggle.append(pinMark());
  toggle.append(el('span', 'folder-name', folder.name), el('span', 'folder-count', String(items.length)));

  const move = () => openMoveDialog({ kind: 'folder', id: folder.id }, folder.name);
  const choices = [
    { label: folder.pinned ? 'Unpin' : 'Pin', run: () => togglePin('folder', folder) },
    { label: 'New folder inside', run: () => newFolderInside(folder) },
    { label: 'Rename', run: () => startEditingFolder(folder.id) },
    { label: 'Move to…', run: move },
    { label: 'Delete', danger: true, run: () => deleteFolder(folder) },
  ];
  // Four choices don't fit as hover buttons, so with a mouse the hover shows a
  // ⋯ that opens the same menu phones use.
  const actions = el('span', 'item-actions');
  actions.append(button('icon-button', '⋯', `More for folder ${folder.name}`, event => {
    event.stopPropagation();
    openMenu(event.currentTarget, choices);
  }));
  const more = moreButton(`More for folder ${folder.name}`, choices);

  row.append(toggle, actions, more);
  makeDraggable(row, { kind: 'folder', id: folder.id });
  makeDropTarget(row, folder);
  li.append(row);

  if (isOpen) {
    const list = el('ul', 'folder-items');
    list.style.paddingLeft = `${indentFor(depth + 1)}px`;
    list.append(...children);
    if (children.length === 0) list.append(el('li', 'empty-folder', `No ${side().plural} yet`));
    li.append(list);
  }
  return li;
}

// ---- The app's own confirmation window ----
// Used for deleting, so it can say "Yes, delete" rather than just "OK".
// Resolves to true for yes, false for Cancel.

function askConfirm(message, yesLabel = 'Yes, delete') {
  els.confirmMessage.textContent = message;
  els.confirmYes.textContent = yesLabel;
  els.confirmDialog.showModal();
  return new Promise(resolve => {
    const finish = answer => {
      els.confirmDialog.close();
      els.confirmYes.removeEventListener('click', yes);
      els.confirmNo.removeEventListener('click', no);
      els.confirmDialog.removeEventListener('cancel', no);
      resolve(answer);
    };
    const yes = () => finish(true);
    const no = () => finish(false);
    els.confirmYes.addEventListener('click', yes);
    els.confirmNo.addEventListener('click', no);
    els.confirmDialog.addEventListener('cancel', no);
    els.confirmNo.focus();
  });
}

function folderNameInput(folder) {
  const li = el('li');
  const input = el('input', 'folder-input');
  input.type = 'text';
  input.value = folder ? folder.name : '';
  input.placeholder = 'Folder name';
  input.maxLength = 100;
  input.setAttribute('aria-label', 'Folder name');

  let finished = false;
  const finish = keep => {
    if (finished) return;
    finished = true;
    finishEditingFolder(folder, keep ? input.value.trim() : '');
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    } else if (event.key === 'Escape') {
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));

  li.append(input);
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
  return li;
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

// ---- Search ----
// Searches titles, note text, task list names and tasks, across both sides.
// While there's text in the search box, results replace the folder list.

let searchText = '';

// A short piece of text around the first match, on one line.
function snippetAround(text, query) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query);
  const start = Math.max(0, at - 30);
  const end = Math.min(flat.length, (at === -1 ? 0 : at + query.length) + 60);
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

function searchMatches(rawQuery) {
  const query = rawQuery.toLowerCase();
  const folderName = id => folderPath(id) || null;
  const results = [];
  for (const note of state.notes) {
    if (!note.body.toLowerCase().includes(query)) continue;
    const title = noteTitle(note);
    const { rest } = splitNote(note.body);
    const inTitle = title.toLowerCase().includes(query);
    const snippet = rest.toLowerCase().includes(query) ? snippetAround(rest, query) : snippetAround(rest, '');
    results.push({ side: 'notes', item: note, title, inTitle, snippet, folder: folderName(note.folderId) });
  }
  for (const list of state.taskLists) {
    const inTitle = list.title.toLowerCase().includes(query);
    const task = tasksIn(list.id).find(t => t.text.toLowerCase().includes(query));
    if (!inTitle && !task) continue;
    results.push({
      side: 'tasks', item: list, title: SIDES.tasks.title(list), inTitle,
      snippet: task ? snippetAround(task.text, query) : '', folder: folderName(list.folderId),
    });
  }
  // Title matches first, then the most recently changed.
  results.sort((a, b) => (b.inTitle - a.inTitle) || (b.item.updatedAt - a.item.updatedAt));
  return results.slice(0, 100);
}

// Puts text into an element with each match wrapped in <mark>, safely (no HTML).
function highlight(target, text, query) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(q); q && at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) target.append(document.createTextNode(text.slice(from, at)));
    target.append(el('mark', null, text.slice(at, at + q.length)));
    from = at + q.length;
  }
  if (from < text.length) target.append(document.createTextNode(text.slice(from)));
}

// The search clears when you open a result, tap ×, press Escape, switch
// between Notes and Tasks, or start something new, so the sidebar goes back to
// your folders.
function clearSearch() {
  if (!searchText && !els.search.value) return;
  els.search.value = '';
  searchText = '';
  renderSearch();
}

function renderSearch() {
  const query = searchText.trim();
  const searching = query.length > 0;
  els.searchClear.hidden = !els.search.value;
  els.tree.hidden = searching;
  els.newItemTarget.hidden = searching;
  els.searchResults.hidden = !searching;
  els.searchNone.hidden = true;
  if (!searching) return;
  const results = searchMatches(query);
  els.searchNone.hidden = results.length > 0;
  els.searchResults.replaceChildren(...results.map(result => {
    const li = el('li', 'sidebar-item');
    if (result.side === state.side && result.item.id === view().currentId && !state.page) li.classList.add('is-current');
    const open = button('row search-result', undefined, undefined, () => openFromSearch(result));
    const title = el('span', 'item-title');
    highlight(title, result.title, query);
    open.append(title);
    if (result.snippet) {
      const snippet = el('span', 'search-snippet');
      highlight(snippet, result.snippet, query);
      open.append(snippet);
    }
    const kind = result.side === 'notes' ? 'Note' : 'Task list';
    open.append(el('span', 'search-meta', result.folder ? `${kind} · ${result.folder}` : kind));
    li.append(open);
    return li;
  }));
}

// Opens a result and shows it in its folder, with the search cleared.
async function openFromSearch(result) {
  clearSearch();
  if (result.side !== state.side) await setSide(result.side);
  if (result.item.folderId) view().openFolderIds.add(result.item.folderId);
  await openItem(result.item.id);
  renderSidebar();
}

// ---- Recently deleted ----

function refreshTrash() {
  state.trash = Storage.listTrash();
}

async function openPage(page) {
  await leaveCurrentItem();
  state.page = page;
  render();
  if (page === 'links') loadLinks();
}

const openTrash = () => openPage('trash');

const TRASH_KIND = { folders: 'Folder', notes: 'Note', taskLists: 'Task list', tasks: 'Task' };

function trashTitle(entry) {
  const r = entry.record;
  if (entry.kind === 'folders') return r.name;
  if (entry.kind === 'notes') return noteTitle(r);
  if (entry.kind === 'taskLists') return r.title.trim() || 'New task list';
  return r.text;
}

// For example "Folder · with 2 notes and 1 task list · deleted Oct 22 · 30 days left"
function trashDetails(entry) {
  const parts = [TRASH_KIND[entry.kind]];
  const c = entry.contains;
  const inside = [];
  if (c.folders) inside.push(plural(c.folders, 'folder', 'folders'));
  if (c.notes) inside.push(plural(c.notes, 'note', 'notes'));
  if (c.taskLists) inside.push(plural(c.taskLists, 'task list', 'task lists'));
  if (c.tasks && entry.kind === 'taskLists') inside.push(plural(c.tasks, 'task', 'tasks'));
  if (inside.length) parts.push(`with ${inside.join(' and ')}`);
  if (entry.parentName) parts.push(entry.kind === 'tasks' ? `from ${entry.parentName}` : `in ${entry.parentName}`);
  const daysLeft = Math.max(0, Math.ceil((entry.deletedAt + KEEP_DAYS * 86400000 - Date.now()) / 86400000));
  parts.push(`deleted ${formatDate(entry.deletedAt)}`, `${plural(daysLeft, 'day', 'days')} left`);
  return parts.join(' · ');
}

function renderTrash() {
  els.trashList.replaceChildren(...state.trash.map(entry => {
    const li = el('li', 'trash-item');
    const info = el('div', 'trash-info');
    info.append(el('span', 'trash-title', trashTitle(entry)), el('span', 'trash-details', trashDetails(entry)));
    const actions = el('div', 'trash-actions');
    actions.append(
      button('link', 'Restore', `Restore ${trashTitle(entry)}`, () => restoreDeleted(entry.kind, entry.record.id)),
      button('quiet danger', 'Delete now', `Delete ${trashTitle(entry)} now`, () => eraseDeleted(entry))
    );
    li.append(info, actions);
    return li;
  }));
  els.trashNone.hidden = state.trash.length > 0;
  els.trashEmpty.hidden = state.trash.length === 0;
}

async function restoreDeleted(kind, id) {
  const ok = await Storage.restore(kind, id);
  if (!ok) {
    alert("This task's list has been erased for good, so the task can't be restored.");
    return;
  }
  Object.assign(state, await Storage.loadAll());
  render();
}

async function eraseDeleted(entry) {
  if (!await askConfirm(`Delete "${trashTitle(entry)}" now? ${NO_RETRIEVE}`)) return;
  await Storage.eraseForever(entry.kind, entry.record.id);
  render();
}

async function emptyTrash() {
  if (!await askConfirm(`Delete everything in Recently deleted now? ${NO_RETRIEVE}`)) return;
  await Storage.emptyTrash();
  render();
}

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

function renderTasks() {
  const list = state.side === 'tasks' ? currentItem() : null;
  if (!list) return;
  const all = tasksIn(list.id);
  const open = all.filter(task => !task.done);
  const done = all.filter(task => task.done);

  els.openTasks.replaceChildren(...open.map((task, i) => taskRow(task, i, open.length)));
  els.completedHeader.hidden = done.length === 0;
  els.completedCount.textContent = `Completed (${done.length})`;
  els.completedToggle.textContent = list.showCompleted ? 'Hide' : 'Show';
  els.doneTasks.hidden = !list.showCompleted;
  els.doneTasks.replaceChildren(...(list.showCompleted ? done.map((task, i) => taskRow(task, i, done.length)) : []));
}

function taskRow(task, index, groupSize) {
  const li = el('li', 'task');
  li.dataset.taskId = task.id;
  li.classList.toggle('is-done', task.done);

  const handle = el('span', 'drag-handle', '⋮⋮');
  handle.title = 'Drag to reorder';
  handle.setAttribute('aria-hidden', 'true');
  // Only the handle starts a drag, so text in the task can still be selected.
  handle.addEventListener('pointerdown', event => startDrag(event, task, li));
  handle.addEventListener('pointermove', moveDrag);
  handle.addEventListener('pointerup', event => endDrag(event, false));
  handle.addEventListener('pointercancel', event => endDrag(event, true));

  const check = el('input');
  check.type = 'checkbox';
  check.checked = task.done;
  check.setAttribute('aria-label', task.done ? 'Mark as not done' : 'Mark as done');
  check.addEventListener('change', () => setTaskDone(task, check.checked));

  const text = el('input', 'task-text');
  text.type = 'text';
  text.value = task.text;
  text.setAttribute('aria-label', 'Task');
  text.addEventListener('input', () => {
    task.text = text.value;
    saveSoon(`task:${task.id}`, () => Storage.saveTask(task));
    touchList(task.listId);
  });
  text.addEventListener('keydown', async event => {
    if (event.key === 'Enter') {
      // Enter saves this task and starts a new one right below it.
      event.preventDefault();
      if (text.value.trim() === '') return;
      const list = currentItem();
      const added = await addTask(list, '', task);
      renderTasks();
      focusTask(added.id);
    } else if (event.key === 'Backspace' && text.value === '') {
      // Backspace in an empty task removes it and moves up to the one above.
      event.preventDefault();
      const above = tasksIn(task.listId).filter(t => t.done === task.done)[index - 1];
      await removeTaskQuietly(task);
      renderTasks();
      if (above) focusTask(above.id);
      else els.addTask.focus();
    }
  });
  text.addEventListener('blur', () => {
    // A task left empty is removed. Only this row is taken off the page, so a
    // click elsewhere still lands where it was aimed.
    if (!text.isConnected || text.value.trim() !== '') return;
    if (!state.tasks.includes(task)) return;
    removeTaskQuietly(task);
    li.remove();
  });

  const actions = el('span', 'item-actions');
  const up = button('icon-button move-up', '↑', 'Move up', () => nudgeTask(task, -1));
  const down = button('icon-button move-down', '↓', 'Move down', () => nudgeTask(task, 1));
  up.style.visibility = index === 0 ? 'hidden' : '';
  down.style.visibility = index === groupSize - 1 ? 'hidden' : '';
  actions.append(up, down, button('icon-button danger', 'Delete', 'Delete task', () => deleteTask(task)));

  const choices = [];
  if (index > 0) choices.push({ label: 'Move up', run: () => nudgeTask(task, -1) });
  if (index < groupSize - 1) choices.push({ label: 'Move down', run: () => nudgeTask(task, 1) });
  choices.push({ label: 'Delete', danger: true, run: () => deleteTask(task) });
  const more = moreButton('More for this task', choices);

  li.append(handle, check, text, actions, more);
  return li;
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
  byId('new-folder').addEventListener('click', () => startEditingFolder(NEW_FOLDER));
  els.deleteItem.addEventListener('click', () => deleteItem(currentItem()));
  els.itemFolder.addEventListener('change', () => moveCurrentItem(els.itemFolder.value || null));
  byId('export-everything').addEventListener('click', exportEverything);
  byId('reminder-export').addEventListener('click', exportEverything);
  byId('reminder-later').addEventListener('click', snoozeReminder);
  els.search.addEventListener('input', () => {
    searchText = els.search.value;
    renderSearch();
  });
  els.search.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearSearch();
  });
  byId('move-cancel').addEventListener('click', () => els.moveDialog.close());

  // Dropping onto the sidebar's empty space (not onto a folder) moves to the top level.
  els.tree.addEventListener('dragover', event => {
    if (!canDropInto(null) || event.target.closest('.folder-row')) return;
    event.preventDefault();
    if (!els.tree.classList.contains('drop-into')) {
      clearFolderDropMarks();
      els.tree.classList.add('drop-into');
    }
  });
  els.tree.addEventListener('drop', event => {
    if (!canDropInto(null) || event.target.closest('.folder-row')) return;
    event.preventDefault();
    const what = dragging;
    clearFolderDropMarks();
    moveThing(what, null);
  });

  els.searchClear.addEventListener('click', () => {
    clearSearch();
    els.search.focus();
  });
  byId('restore-backup').addEventListener('click', chooseBackupFile);
  els.restoreFile.addEventListener('change', () => {
    const file = els.restoreFile.files[0];
    els.restoreFile.value = '';
    if (file) restoreBackup(file);
  });
  byId('toast-undo').addEventListener('click', undoDelete);
  byId('back-button').addEventListener('click', goBack);
  byId('trash-back').addEventListener('click', goBack);
  els.trashEmpty.addEventListener('click', emptyTrash);
  els.trashLink.addEventListener('click', openTrash);
  els.settingsLink.addEventListener('click', () => openPage('settings'));
  byId('open-links').addEventListener('click', () => openPage('links'));
  byId('links-back').addEventListener('click', () => openPage('settings'));
  for (const back of document.querySelectorAll('.page-back')) back.addEventListener('click', goBack);
  byId('share-item').addEventListener('click', openSharePanel);
  byId('pin-item').addEventListener('click', () => {
    const item = currentItem();
    if (item) togglePin('item', item);
  });
  els.shareSend.addEventListener('click', () => shareAction('send'));
  els.shareNew.addEventListener('click', () => shareAction('new'));
  els.shareOff.addEventListener('click', () => shareAction('off'));
  byId('share-close').addEventListener('click', () => els.shareDialog.close());
  els.shareUrl.addEventListener('focus', () => els.shareUrl.select());
  for (const choice of document.querySelectorAll('input[name="share-mode"]')) {
    choice.addEventListener('change', () => loadShareLink());
  }
  byId('sign-out').addEventListener('click', signOut);
  window.addEventListener('popstate', handlePopState);

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

  // The ⋯ menu closes on a tap elsewhere, Escape, scrolling or resizing.
  document.addEventListener('pointerdown', event => {
    if (!els.menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
  els.completedToggle.addEventListener('click', toggleCompleted);

  els.titleInput.addEventListener('input', handleTitleInput);
  els.editor.addEventListener('input', handleTitleInput);

  // Enter in the title moves down to the note body, or to "Add a task".
  els.titleInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (state.side === 'notes') {
      els.editor.focus();
      els.editor.setSelectionRange(0, 0);
    } else {
      els.addTask.focus();
    }
  });
  // Backspace in an empty note body, or the up arrow at its very start, moves
  // back up to the title.
  els.editor.addEventListener('keydown', event => {
    const atStart = els.editor.selectionStart === 0 && els.editor.selectionEnd === 0;
    if ((event.key === 'Backspace' && els.editor.value === '') || (event.key === 'ArrowUp' && atStart)) {
      event.preventDefault();
      els.titleInput.focus();
    }
  });
  // Enter in "Add a task" adds it and stays ready for the next one.
  els.addTask.addEventListener('keydown', async event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const text = els.addTask.value.trim();
    const list = currentItem();
    if (!text || !list || state.side !== 'tasks') return;
    els.addTask.value = '';
    await addTask(list, text);
    renderTasks();
  });

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
