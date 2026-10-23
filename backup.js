// backup.js
// Export everything (a ZIP of Markdown files plus a backup), restoring from a
// backup, and the six-monthly export reminder. Uses the shared state and
// helpers in app.js; the files themselves are made by export.js.

const BACKUP_PICKER_ID = 'anthology-backups';
const EXPORT_TYPES = [{ description: 'Anthology export', accept: { 'application/zip': ['.zip'] } }];
const RESTORE_TYPES = [{ description: 'Anthology export or backup', accept: { 'application/zip': ['.zip'], 'application/json': ['.json'] } }];
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

// ---- Buttons and keys ----

function wireBackupEvents() {
  const byId = id => document.getElementById(id);

  byId('export-everything').addEventListener('click', exportEverything);
  byId('reminder-export').addEventListener('click', exportEverything);
  byId('reminder-later').addEventListener('click', snoozeReminder);

  byId('restore-backup').addEventListener('click', chooseBackupFile);
  els.restoreFile.addEventListener('change', () => {
    const file = els.restoreFile.files[0];
    els.restoreFile.value = '';
    if (file) restoreBackup(file);
  });
}
