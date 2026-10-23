// sidebar.js
// The sidebar: folders (including folders inside folders), pinning, moving
// things into folders (Move to… and dragging), and drawing the list of folders
// and items. Uses the shared state and helpers in app.js.

// Moving an item doesn't count as editing it, so its date stays the same.
async function moveCurrentItem(folderId) {
  const item = currentItem();
  if (!item) return;
  await moveThing({ kind: 'item', id: item.id }, folderId);
  view().activeFolderId = folderId;
  savePrefs();
  render();
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

// ---- Buttons and keys ----

function wireSidebarEvents() {
  const byId = id => document.getElementById(id);

  byId('new-folder').addEventListener('click', () => startEditingFolder(NEW_FOLDER));

  els.itemFolder.addEventListener('change', () => moveCurrentItem(els.itemFolder.value || null));

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

  byId('pin-item').addEventListener('click', () => {
    const item = currentItem();
    if (item) togglePin('item', item);
  });
}
