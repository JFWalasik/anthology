// app.js
// Draws the page and responds to clicks and typing. All saving and loading goes
// through Storage (storage.js), so this file doesn't care where data lives.
// Text people type is only ever put on the page as plain text (textContent or
// input values), never as HTML, so nothing typed can run as code.

const SAVE_DELAY_MS = 500;
const UNDO_SECONDS = 10;
const NO_RETRIEVE = 'There is no way to retrieve this.';
const NEW_FOLDER = 'new';
const BACKUP_PICKER_ID = 'anthology-backups';
const BACKUP_TYPES = [{ description: 'Anthology backup', accept: { 'application/json': ['.json'] } }];

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

// For example anthology-backup-2026-10-21-1435-12-notes-3-lists.json
function backupFileName(data) {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const notes = plural(data.notes.length, 'note', 'notes').replace(' ', '-');
  const lists = plural(data.taskLists.length, 'list', 'lists').replace(' ', '-');
  return `anthology-backup-${stamp}-${notes}-${lists}.json`;
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

async function removeItem(item) {
  cancelSave(`item:${item.id}`);
  if (state.side === 'notes') {
    state.notes = state.notes.filter(note => note.id !== item.id);
    await runSave(() => Storage.deleteNote(item.id));
  } else {
    for (const task of tasksIn(item.id)) cancelSave(`task:${task.id}`);
    state.taskLists = state.taskLists.filter(list => list.id !== item.id);
    state.tasks = state.tasks.filter(task => task.listId !== item.id);
    await runSave(() => Storage.deleteTaskList(item.id));
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
  if (isEmptyItem(item)) await removeItem(item);
}

// ---- Phone screens and the back gesture ----
// On phones, opening an item adds an entry to the browser's history, so the
// back gesture (or Android's back button) returns to the list instead of
// leaving the app.

const phoneLayout = window.matchMedia('(max-width: 700px)');
let ignoreNextPop = false;

function syncHistory() {
  if (!phoneLayout.matches) return;
  const onItem = Boolean(currentItem());
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
  if (currentItem()) goBack();
}

// On phones, goes from an open item back to the list of folders and items.
async function goBack() {
  await leaveCurrentItem();
  view().currentId = null;
  savePrefs();
  render();
}

async function openItem(id) {
  if (id === view().currentId) return;
  await leaveCurrentItem();
  view().currentId = id;
  const item = currentItem();
  if (item) view().activeFolderId = item.folderId;
  setStatus('');
  savePrefs();
  render();
}

async function createItem() {
  await leaveCurrentItem();
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
  if (!isEmptyItem(item)) {
    let message;
    if (state.side === 'notes') {
      message = `Are you sure you want to delete "${noteTitle(item)}"?`;
    } else {
      const count = tasksIn(item.id).length;
      const contents = count === 0 ? '' : ` and its ${plural(count, 'task', 'tasks')}`;
      message = `Are you sure you want to delete the task list "${side().title(item)}"${contents}?`;
    }
    if (!confirm(`${message} ${NO_RETRIEVE}`)) return;
  }
  if (item.id === view().currentId) view().currentId = null;
  await removeItem(item);
  savePrefs();
  render();
}

// Moving an item doesn't count as editing it, so its date stays the same.
async function moveCurrentItem(folderId) {
  const item = currentItem();
  if (!item || item.folderId === folderId) return;
  await flushSaves();
  item.folderId = folderId;
  if (folderId) view().openFolderIds.add(folderId);
  view().activeFolderId = folderId;
  await runSave(() => side().save(item));
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

async function removeTaskQuietly(task) {
  cancelSave(`task:${task.id}`);
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  await runSave(() => Storage.deleteTask(task.id));
  touchList(task.listId);
}

async function deleteTask(task) {
  await removeTaskQuietly(task);
  renderTasks();
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
  if (!task || !state.taskLists.some(list => list.id === task.listId)) return;
  state.tasks.push(task);
  await runSave(() => Storage.saveTask(task));
  touchList(task.listId);
  renderTasks();
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
  state.editingFolderId = id;
  renderSidebar();
}

async function finishEditingFolder(folder, name) {
  state.editingFolderId = null;
  if (name && folder && name !== folder.name) {
    folder.name = name;
    await runSave(() => Storage.saveFolder(folder));
  } else if (name && !folder) {
    const created = { id: newId(), name, parentId: null, createdAt: Date.now() };
    state.folders.push(created);
    view().openFolderIds.add(created.id);
    view().activeFolderId = created.id;
    savePrefs();
    await runSave(() => Storage.saveFolder(created));
  }
  render();
}

async function deleteFolder(folder) {
  const notes = state.notes.filter(note => note.folderId === folder.id);
  const lists = state.taskLists.filter(list => list.folderId === folder.id);
  const parts = [];
  if (notes.length) parts.push(plural(notes.length, 'note', 'notes'));
  if (lists.length) parts.push(plural(lists.length, 'task list', 'task lists'));
  const contents = parts.length ? ` and its ${parts.join(' and ')}` : '';
  if (!confirm(`Are you sure you want to delete the folder "${folder.name}"${contents}? ${NO_RETRIEVE}`)) return;

  await flushSaves();
  const listIds = new Set(lists.map(list => list.id));
  state.notes = state.notes.filter(note => note.folderId !== folder.id);
  state.taskLists = state.taskLists.filter(list => !listIds.has(list.id));
  state.tasks = state.tasks.filter(task => !listIds.has(task.listId));
  state.folders = state.folders.filter(f => f.id !== folder.id);
  for (const [name, items] of [['notes', state.notes], ['tasks', state.taskLists]]) {
    const v = state.views[name];
    if (!items.some(item => item.id === v.currentId)) v.currentId = null;
    v.openFolderIds.delete(folder.id);
    if (v.activeFolderId === folder.id) v.activeFolderId = null;
  }
  await runSave(() => Storage.deleteFolder(folder.id));
  savePrefs();
  render();
}

// ---- Backup ----

async function downloadBackup() {
  await flushSaves();
  let data;
  try {
    data = await Storage.loadAll();
  } catch (err) {
    console.error(err);
    alert("The backup couldn't be made because your notes couldn't be read.");
    return;
  }
  const text = Storage.makeBackup(data);
  const name = backupFileName(data);

  // Chrome and Edge can show a Save window, so you choose the folder; the
  // window remembers the last folder used. Other browsers use the downloads folder.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ id: BACKUP_PICKER_ID, suggestedName: name, types: BACKUP_TYPES });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // the Save window was cancelled
      console.error('Save window failed, downloading instead', err);
    }
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function chooseBackupFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ id: BACKUP_PICKER_ID, types: BACKUP_TYPES });
      restoreBackup(await handle.getFile());
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Open window failed, using the file chooser instead', err);
    }
  }
  els.restoreFile.click();
}

async function restoreBackup(file) {
  let data;
  try {
    data = Storage.parseBackup(await file.text());
  } catch (err) {
    alert(err.message);
    return;
  }
  const summary = `${plural(data.notes.length, 'note', 'notes')}, ` +
    `${plural(data.taskLists.length, 'task list', 'task lists')} and ` +
    `${plural(data.folders.length, 'folder', 'folders')}`;
  const ok = confirm(
    `Are you sure? Restoring replaces everything currently in Anthology with the ${summary} in this backup. ` +
    `${NO_RETRIEVE} Download a backup first if you might want the current ones.`
  );
  if (!ok) return;
  for (const pending of pendingSaves.values()) clearTimeout(pending.timer);
  pendingSaves.clear();
  hideUndo();
  try {
    await Storage.replaceAll(data);
  } catch (err) {
    reportProblem(err);
    return;
  }
  Object.assign(state, data);
  state.views = { notes: newView(), tasks: newView() };
  savePrefs();
  render();
}

// ---- Sides ----

async function setSide(name) {
  if (name === state.side) return;
  await leaveCurrentItem();
  state.side = name;
  state.editingFolderId = null;
  setStatus('');
  savePrefs();
  render();
}

// ---- Drawing the page ----

function render() {
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

function renderSidebar() {
  const rows = [];
  if (state.editingFolderId === NEW_FOLDER) rows.push(folderNameInput(null));
  for (const folder of [...state.folders].sort(byName)) {
    rows.push(state.editingFolderId === folder.id ? folderNameInput(folder) : folderRow(folder));
  }
  for (const item of itemsIn(null)) rows.push(itemRow(item));
  els.tree.replaceChildren(...rows);

  const active = findFolder(view().activeFolderId);
  const what = `New ${side().plural}`;
  els.newItemTarget.textContent = active ? `${what} go into ${active.name}` : `${what} go at the top level`;
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
  open.append(el('span', 'item-title', title), el('span', 'item-date', formatDate(item.updatedAt)));

  const actions = el('span', 'item-actions');
  actions.append(button('icon-button danger', 'Delete', `Delete ${title}`, () => deleteItem(item)));
  const more = moreButton(`More for ${title}`, [{ label: 'Delete', danger: true, run: () => deleteItem(item) }]);

  row.append(open, actions, more);
  li.append(row);
  return li;
}

function folderRow(folder) {
  const isOpen = view().openFolderIds.has(folder.id);
  const items = itemsIn(folder.id);
  const li = el('li', 'folder');
  li.classList.toggle('is-open', isOpen);

  const row = el('div', 'folder-row');
  row.classList.toggle('is-active', view().activeFolderId === folder.id);

  const toggle = button('row', undefined, undefined, () => toggleFolder(folder));
  toggle.setAttribute('aria-expanded', String(isOpen));
  toggle.append(el('span', 'chevron'), el('span', 'folder-name', folder.name), el('span', 'folder-count', String(items.length)));

  const actions = el('span', 'item-actions');
  actions.append(
    button('icon-button', 'Rename', `Rename folder ${folder.name}`, () => startEditingFolder(folder.id)),
    button('icon-button danger', 'Delete', `Delete folder ${folder.name}`, () => deleteFolder(folder))
  );
  const more = moreButton(`More for folder ${folder.name}`, [
    { label: 'Rename', run: () => startEditingFolder(folder.id) },
    { label: 'Delete', danger: true, run: () => deleteFolder(folder) },
  ]);

  row.append(toggle, actions, more);
  li.append(row);

  if (isOpen) {
    const list = el('ul', 'folder-items');
    if (items.length === 0) list.append(el('li', 'empty-folder', `No ${side().plural} yet`));
    for (const item of items) list.append(itemRow(item));
    li.append(list);
  }
  return li;
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
  const item = currentItem();
  document.body.classList.toggle('has-item', Boolean(item)); // phones show the item screen
  els.itemPane.hidden = !item;
  els.emptyState.hidden = Boolean(item);
  els.emptyMessage.textContent = side().emptyMessage;
  if (!item) return;

  els.titleInput.placeholder = side().titlePlaceholder;
  els.deleteItem.textContent = side().deleteLabel;
  const options = [new Option('Top level', '')];
  for (const folder of [...state.folders].sort(byName)) options.push(new Option(folder.name, folder.id));
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
  els.layout.replaceChildren(message);
}

// ---- Start up ----

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
  });

  try {
    const data = await Storage.loadAll();
    Object.assign(state, data);
  } catch (err) {
    console.error(err);
    showLoadError();
    return;
  }
  applyPrefs(Storage.loadPrefs());

  // Clear out blank tasks, and notes and task lists that were left empty,
  // except the open ones.
  for (const task of state.tasks.filter(t => t.text.trim() === '')) {
    state.tasks = state.tasks.filter(t => t !== task);
    await runSave(() => Storage.deleteTask(task.id));
  }
  const startSide = state.side;
  for (const name of ['notes', 'tasks']) {
    state.side = name;
    for (const item of side().items().filter(i => isEmptyItem(i) && i.id !== view().currentId)) {
      await removeItem(item);
    }
  }
  state.side = startSide;

  for (const toggle of els.sideButtons) {
    toggle.addEventListener('click', () => setSide(toggle.dataset.side));
  }
  els.newItem.addEventListener('click', createItem);
  byId('new-folder').addEventListener('click', () => startEditingFolder(NEW_FOLDER));
  els.deleteItem.addEventListener('click', () => deleteItem(currentItem()));
  els.itemFolder.addEventListener('change', () => moveCurrentItem(els.itemFolder.value || null));
  byId('download-backup').addEventListener('click', downloadBackup);
  byId('restore-backup').addEventListener('click', chooseBackupFile);
  els.restoreFile.addEventListener('change', () => {
    const file = els.restoreFile.files[0];
    els.restoreFile.value = '';
    if (file) restoreBackup(file);
  });
  byId('toast-undo').addEventListener('click', undoDelete);
  byId('back-button').addEventListener('click', goBack);
  window.addEventListener('popstate', handlePopState);

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

  // Save right away if the page is closed or hidden mid-typing.
  window.addEventListener('pagehide', flushSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSaves();
  });

  render();

  // The offline helper (sw.js) only works when the app is served from a web
  // address, not when index.html is opened as a file.
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('Offline helper not set up', err));
  }
}

init();
