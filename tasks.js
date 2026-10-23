// tasks.js
// Task lists: adding, ticking off, reordering (arrows and dragging), deleting
// with Undo, and drawing the tasks. Uses the shared state and helpers in app.js.

const UNDO_SECONDS = 10;
let drag = null;            // the task being dragged, while a drag is under way
let lastDeletedTask = null;
let undoTimer = null;

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

// ---- Buttons and keys ----

function wireTaskEvents() {
  const byId = id => document.getElementById(id);

  byId('toast-undo').addEventListener('click', undoDelete);

  els.completedToggle.addEventListener('click', toggleCompleted);

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
}
