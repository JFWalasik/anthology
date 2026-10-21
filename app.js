// app.js
// Draws the page and responds to clicks and typing. All saving and loading goes
// through Storage (storage.js), so this file doesn't care where data lives.
// Note text is only ever put on the page as plain text (textContent), never as
// HTML, so nothing typed into a note can run as code.

const SAVE_DELAY_MS = 500;
const NO_RETRIEVE = 'There is no way to retrieve this.';
const NEW_FOLDER = 'new';

const state = {
  folders: [],
  notes: [],
  side: 'notes',
  currentNoteId: null,
  activeFolderId: null,     // where "New note" puts the next note; null means top level
  openFolderIds: new Set(),
  editingFolderId: null,    // folder whose name is being typed, or NEW_FOLDER
};

const els = {};
let saveTimer = null;
let unsavedNoteId = null;

// ---- Small helpers ----

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// The title is the first line with any text, minus Markdown heading marks.
function noteTitle(note) {
  const firstLine = note.body.split('\n').find(line => line.trim() !== '') || '';
  return firstLine.replace(/^#+\s*/, '').trim() || 'New note';
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

function dateStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const byRecent = (a, b) => b.updatedAt - a.updatedAt;
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

function currentNote() {
  return state.notes.find(note => note.id === state.currentNoteId) || null;
}

function findFolder(id) {
  return state.folders.find(folder => folder.id === id) || null;
}

function notesIn(folderId) {
  return state.notes.filter(note => note.folderId === folderId).sort(byRecent);
}

function isEmpty(note) {
  return note.body.trim() === '';
}

function reportProblem(err) {
  console.error(err);
  alert("Your change couldn't be saved. The browser may be out of storage space or blocking it.");
}

function savePrefs() {
  Storage.savePrefs({
    side: state.side,
    currentNoteId: state.currentNoteId,
    activeFolderId: state.activeFolderId,
    openFolderIds: [...state.openFolderIds],
  });
}

function applyPrefs(prefs) {
  const folderIds = new Set(state.folders.map(folder => folder.id));
  if (prefs.side === 'tasks') state.side = 'tasks';
  if (state.notes.some(note => note.id === prefs.currentNoteId)) state.currentNoteId = prefs.currentNoteId;
  if (folderIds.has(prefs.activeFolderId)) state.activeFolderId = prefs.activeFolderId;
  for (const id of prefs.openFolderIds || []) {
    if (folderIds.has(id)) state.openFolderIds.add(id);
  }
}

// ---- Saving ----

function setStatus(text, isProblem = false) {
  els.saveStatus.textContent = text;
  els.saveStatus.classList.toggle('is-problem', isProblem);
}

function scheduleSave(noteId) {
  unsavedNoteId = noteId;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DELAY_MS);
}

async function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const note = state.notes.find(n => n.id === unsavedNoteId);
  unsavedNoteId = null;
  if (!note) return;
  try {
    await Storage.saveNote(note);
    if (note.id === state.currentNoteId) setStatus('Saved');
  } catch (err) {
    console.error(err);
    setStatus('Not saved: storage problem', true);
  }
}

function cancelPendingSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  unsavedNoteId = null;
}

async function removeNote(id) {
  state.notes = state.notes.filter(note => note.id !== id);
  try {
    await Storage.deleteNote(id);
  } catch (err) {
    reportProblem(err);
  }
}

// Saves the open note, or discards it if it was left empty.
async function leaveCurrentNote() {
  await flushSave();
  const note = currentNote();
  if (note && isEmpty(note)) await removeNote(note.id);
}

// ---- Notes ----

async function openNote(id) {
  if (id === state.currentNoteId) return;
  await leaveCurrentNote();
  state.currentNoteId = id;
  const note = currentNote();
  if (note) state.activeFolderId = note.folderId;
  setStatus('');
  savePrefs();
  render();
}

async function createNote() {
  await leaveCurrentNote();
  const now = Date.now();
  const note = { id: newId(), folderId: state.activeFolderId, body: '', createdAt: now, updatedAt: now };
  state.notes.push(note);
  state.currentNoteId = note.id;
  if (note.folderId) state.openFolderIds.add(note.folderId);
  try {
    await Storage.saveNote(note);
  } catch (err) {
    reportProblem(err);
  }
  setStatus('');
  savePrefs();
  render();
  els.editor.focus();
}

async function deleteCurrentNote() {
  const note = currentNote();
  if (!note) return;
  if (!isEmpty(note) && !confirm(`Are you sure you want to delete "${noteTitle(note)}"? ${NO_RETRIEVE}`)) return;
  cancelPendingSave();
  await removeNote(note.id);
  state.currentNoteId = null;
  savePrefs();
  render();
}

function handleTyping() {
  const note = currentNote();
  if (!note) return;
  note.body = els.editor.value;
  note.updatedAt = Date.now();
  setStatus('');
  scheduleSave(note.id);
  renderSidebar();
}

// ---- Folders ----

function toggleFolder(folder) {
  if (state.openFolderIds.has(folder.id)) {
    state.openFolderIds.delete(folder.id);
    if (state.activeFolderId === folder.id) state.activeFolderId = null;
  } else {
    state.openFolderIds.add(folder.id);
    state.activeFolderId = folder.id;
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
  try {
    if (name && folder && name !== folder.name) {
      folder.name = name;
      await Storage.saveFolder(folder);
    } else if (name && !folder) {
      const created = { id: newId(), name, parentId: null, createdAt: Date.now() };
      state.folders.push(created);
      state.openFolderIds.add(created.id);
      state.activeFolderId = created.id;
      savePrefs();
      await Storage.saveFolder(created);
    }
  } catch (err) {
    reportProblem(err);
  }
  renderSidebar();
}

async function deleteFolder(folder) {
  const count = state.notes.filter(note => note.folderId === folder.id).length;
  const contents = count === 0 ? '' : count === 1 ? ' and the note in it' : ` and the ${count} notes in it`;
  if (!confirm(`Are you sure you want to delete the folder "${folder.name}"${contents}? ${NO_RETRIEVE}`)) return;
  if (currentNote() && currentNote().folderId === folder.id) {
    cancelPendingSave();
    state.currentNoteId = null;
  }
  state.notes = state.notes.filter(note => note.folderId !== folder.id);
  state.folders = state.folders.filter(f => f.id !== folder.id);
  state.openFolderIds.delete(folder.id);
  if (state.activeFolderId === folder.id) state.activeFolderId = null;
  try {
    await Storage.deleteFolder(folder.id);
  } catch (err) {
    reportProblem(err);
  }
  savePrefs();
  render();
}

// ---- Backup ----

async function downloadBackup() {
  await flushSave();
  let data;
  try {
    data = await Storage.loadAll();
  } catch (err) {
    console.error(err);
    alert("The backup couldn't be made because your notes couldn't be read.");
    return;
  }
  const blob = new Blob([Storage.makeBackup(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `anthology-backup-${dateStamp()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function restoreBackup(file) {
  let data;
  try {
    data = Storage.parseBackup(await file.text());
  } catch (err) {
    alert(err.message);
    return;
  }
  const summary = `${data.notes.length} ${data.notes.length === 1 ? 'note' : 'notes'} and ` +
    `${data.folders.length} ${data.folders.length === 1 ? 'folder' : 'folders'}`;
  const ok = confirm(
    `Are you sure? Restoring replaces all your current notes and folders with the ${summary} in this backup. ` +
    `${NO_RETRIEVE} Download a backup first if you might want the current ones.`
  );
  if (!ok) return;
  cancelPendingSave();
  try {
    await Storage.replaceAll(data);
  } catch (err) {
    reportProblem(err);
    return;
  }
  state.folders = data.folders;
  state.notes = data.notes;
  state.currentNoteId = null;
  state.activeFolderId = null;
  state.openFolderIds.clear();
  savePrefs();
  render();
}

// ---- Sides ----

async function setSide(side) {
  if (side === state.side) return;
  await flushSave();
  state.side = side;
  savePrefs();
  renderSide();
}

// ---- Drawing the page ----

function render() {
  renderSide();
  renderSidebar();
  renderEditor();
}

function renderSide() {
  const onTasks = state.side === 'tasks';
  document.body.classList.toggle('side-tasks', onTasks);
  els.notesView.hidden = onTasks;
  els.tasksView.hidden = !onTasks;
  for (const button of els.sideButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.side === state.side));
  }
}

function renderSidebar() {
  const items = [];
  if (state.editingFolderId === NEW_FOLDER) items.push(folderNameInput(null));
  for (const folder of [...state.folders].sort(byName)) {
    items.push(state.editingFolderId === folder.id ? folderNameInput(folder) : folderItem(folder));
  }
  for (const note of notesIn(null)) items.push(noteItem(note));
  els.tree.replaceChildren(...items);

  const active = findFolder(state.activeFolderId);
  els.newNoteTarget.textContent = active ? `New notes go into ${active.name}` : 'New notes go at the top level';
}

function noteItem(note) {
  const li = el('li');
  const button = el('button', 'row note-row');
  button.type = 'button';
  if (note.id === state.currentNoteId) {
    button.classList.add('is-current');
    button.setAttribute('aria-current', 'true');
  }
  button.append(el('span', 'note-title', noteTitle(note)), el('span', 'note-date', formatDate(note.updatedAt)));
  button.addEventListener('click', () => openNote(note.id));
  li.append(button);
  return li;
}

function folderItem(folder) {
  const isOpen = state.openFolderIds.has(folder.id);
  const li = el('li', 'folder');
  li.classList.toggle('is-open', isOpen);

  const row = el('div', 'folder-row');
  row.classList.toggle('is-active', state.activeFolderId === folder.id);

  const toggle = el('button', 'row folder-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(isOpen));
  const notes = notesIn(folder.id);
  toggle.append(el('span', 'chevron'), el('span', 'folder-name', folder.name), el('span', 'folder-count', String(notes.length)));
  toggle.addEventListener('click', () => toggleFolder(folder));

  const actions = el('span', 'folder-actions');
  const rename = el('button', 'icon-button', 'Rename');
  rename.type = 'button';
  rename.setAttribute('aria-label', `Rename folder ${folder.name}`);
  rename.addEventListener('click', () => startEditingFolder(folder.id));
  const remove = el('button', 'icon-button danger', 'Delete');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Delete folder ${folder.name}`);
  remove.addEventListener('click', () => deleteFolder(folder));
  actions.append(rename, remove);

  row.append(toggle, actions);
  li.append(row);

  if (isOpen) {
    const list = el('ul', 'folder-notes');
    if (notes.length === 0) list.append(el('li', 'empty-folder', 'No notes yet'));
    for (const note of notes) list.append(noteItem(note));
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

function renderEditor() {
  const note = currentNote();
  els.editorPane.hidden = !note;
  els.emptyState.hidden = Boolean(note);
  if (!note) return;
  if (els.editor.value !== note.body) els.editor.value = note.body;
  const folder = findFolder(note.folderId);
  els.noteLocation.textContent = folder ? folder.name : 'Top level';
}

function showLoadError() {
  const message = el('div', 'load-error');
  message.append(
    el('p', null, "Your notes couldn't be loaded, so nothing has been changed."),
    el('p', null, 'Try reloading the page. If this keeps happening, ask for help before adding new notes.')
  );
  els.notesView.replaceChildren(message);
}

// ---- Start up ----

async function init() {
  els.notesView = document.getElementById('notes-view');
  els.tasksView = document.getElementById('tasks-view');
  els.sideButtons = document.querySelectorAll('.side-toggle button');
  els.tree = document.getElementById('tree');
  els.newNoteTarget = document.getElementById('new-note-target');
  els.editorPane = document.getElementById('editor-pane');
  els.emptyState = document.getElementById('empty-state');
  els.editor = document.getElementById('editor');
  els.noteLocation = document.getElementById('note-location');
  els.saveStatus = document.getElementById('save-status');
  els.restoreFile = document.getElementById('restore-file');

  try {
    const data = await Storage.loadAll();
    state.folders = data.folders;
    state.notes = data.notes;
  } catch (err) {
    console.error(err);
    showLoadError();
    return;
  }
  applyPrefs(Storage.loadPrefs());

  // Clear out notes that were left empty, except the one that's open.
  for (const note of state.notes.filter(n => isEmpty(n) && n.id !== state.currentNoteId)) {
    await removeNote(note.id);
  }

  for (const button of els.sideButtons) {
    button.addEventListener('click', () => setSide(button.dataset.side));
  }
  document.getElementById('new-note').addEventListener('click', createNote);
  document.getElementById('new-folder').addEventListener('click', () => startEditingFolder(NEW_FOLDER));
  document.getElementById('delete-note').addEventListener('click', deleteCurrentNote);
  document.getElementById('download-backup').addEventListener('click', downloadBackup);
  document.getElementById('restore-backup').addEventListener('click', () => els.restoreFile.click());
  els.restoreFile.addEventListener('change', () => {
    const file = els.restoreFile.files[0];
    els.restoreFile.value = '';
    if (file) restoreBackup(file);
  });
  els.editor.addEventListener('input', handleTyping);

  // Save right away if the page is closed or hidden mid-typing.
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
  });

  render();
}

init();
