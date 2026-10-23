// pages.js
// Pages that open in place of a note or task list: Recently deleted, and
// Settings and help (with Shared links, which is in sharing.js).
// Uses the shared state and helpers in app.js.

const NO_RETRIEVE = 'There is no way to retrieve this.';
const KEEP_DAYS = 30;

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

// ---- Buttons and keys ----

function wirePageEvents() {
  const byId = id => document.getElementById(id);

  byId('trash-back').addEventListener('click', goBack);
  els.trashEmpty.addEventListener('click', emptyTrash);
  els.trashLink.addEventListener('click', openTrash);
  els.settingsLink.addEventListener('click', () => openPage('settings'));
  byId('open-links').addEventListener('click', () => openPage('links'));
  byId('links-back').addEventListener('click', () => openPage('settings'));
  for (const back of document.querySelectorAll('.page-back')) back.addEventListener('click', goBack);
}
