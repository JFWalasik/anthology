// storage.js
// All saving and loading happens here, and nowhere else. For now the data lives
// in the browser's own storage (localStorage). In 0.5 this file is replaced with
// one that talks to Supabase, and the rest of the app shouldn't need to change.
// The data functions return Promises (results that arrive later), because a
// database is never instant; with browser storage they finish right away.
//
// The data has four kinds of records:
// - folders, shared by both sides: { id, name, parentId, createdAt }
// - notes: { id, folderId, body, createdAt, updatedAt }
// - task lists: { id, folderId, title, showCompleted, createdAt, updatedAt }
// - tasks: { id, listId, text, done, position, createdAt, completedAt }

const Storage = (() => {
  const DATA_KEY = 'anthology.data';
  const PREFS_KEY = 'anthology.prefs';
  const BACKUP_FORMAT = 'anthology-backup';
  const BACKUP_VERSION = 2;

  function readData() {
    const raw = localStorage.getItem(DATA_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      folders: parsed.folders || [],
      notes: parsed.notes || [],
      taskLists: parsed.taskLists || [],
      tasks: parsed.tasks || [],
    };
  }

  function writeData(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify({
      version: 2,
      folders: data.folders,
      notes: data.notes,
      taskLists: data.taskLists,
      tasks: data.tasks,
    }));
  }

  function upsert(list, item) {
    const index = list.findIndex(existing => existing.id === item.id);
    if (index === -1) list.push({ ...item });
    else list[index] = { ...item };
  }

  async function saveRecords(kind, records) {
    const data = readData();
    for (const record of records) upsert(data[kind], record);
    writeData(data);
  }

  // ---- Reading ----

  async function loadAll() {
    return readData();
  }

  // ---- Notes ----

  async function saveNote(note) {
    await saveRecords('notes', [note]);
  }

  async function deleteNote(id) {
    const data = readData();
    data.notes = data.notes.filter(note => note.id !== id);
    writeData(data);
  }

  // ---- Task lists and tasks ----

  async function saveTaskList(list) {
    await saveRecords('taskLists', [list]);
  }

  // Deleting a task list also deletes its tasks.
  async function deleteTaskList(id) {
    const data = readData();
    data.taskLists = data.taskLists.filter(list => list.id !== id);
    data.tasks = data.tasks.filter(task => task.listId !== id);
    writeData(data);
  }

  async function saveTask(task) {
    await saveRecords('tasks', [task]);
  }

  // Saves several tasks at once, for example after reordering.
  async function saveTasks(tasks) {
    await saveRecords('tasks', tasks);
  }

  async function deleteTask(id) {
    const data = readData();
    data.tasks = data.tasks.filter(task => task.id !== id);
    writeData(data);
  }

  // ---- Folders ----

  async function saveFolder(folder) {
    await saveRecords('folders', [folder]);
  }

  // Deleting a folder also deletes the notes and task lists in it.
  async function deleteFolder(id) {
    const data = readData();
    const listIds = new Set(data.taskLists.filter(list => list.folderId === id).map(list => list.id));
    data.folders = data.folders.filter(folder => folder.id !== id);
    data.notes = data.notes.filter(note => note.folderId !== id);
    data.taskLists = data.taskLists.filter(list => !listIds.has(list.id));
    data.tasks = data.tasks.filter(task => !listIds.has(task.listId));
    writeData(data);
  }

  async function replaceAll(data) {
    writeData(data);
  }

  // ---- Backups ----

  function makeBackup(data) {
    return JSON.stringify({
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folders: data.folders,
      notes: data.notes,
      taskLists: data.taskLists,
      tasks: data.tasks,
    }, null, 2);
  }

  // Reads a backup file's text and returns clean data, or throws an Error with
  // a plain-language message. Backups from 0.2 have no tasks, which is fine.
  function parseBackup(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("This file couldn't be read as a backup.");
    }
    if (!parsed || parsed.format !== BACKUP_FORMAT) {
      throw new Error("This file doesn't look like an Anthology backup.");
    }
    if (parsed.backupVersion > BACKUP_VERSION) {
      throw new Error('This backup was made by a newer version of Anthology.');
    }
    if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.notes)) {
      throw new Error('This backup is missing its notes or folders.');
    }
    return cleanData(parsed);
  }

  // Keeps only well-formed records, so a damaged file can't break the app.
  function cleanData(input) {
    const time = value => (Number.isFinite(value) ? value : Date.now());
    const isRecord = r => r && typeof r.id === 'string';

    const folders = input.folders
      .filter(f => isRecord(f) && typeof f.name === 'string')
      .map(f => ({ id: f.id, name: f.name, parentId: f.parentId ?? null, createdAt: time(f.createdAt) }));
    const folderIds = new Set(folders.map(f => f.id));
    for (const folder of folders) {
      if (!folderIds.has(folder.parentId)) folder.parentId = null;
    }

    const notes = input.notes
      .filter(n => isRecord(n) && typeof n.body === 'string')
      .map(n => ({
        id: n.id,
        folderId: folderIds.has(n.folderId) ? n.folderId : null,
        body: n.body,
        createdAt: time(n.createdAt),
        updatedAt: time(n.updatedAt),
      }));

    const taskLists = (Array.isArray(input.taskLists) ? input.taskLists : [])
      .filter(isRecord)
      .map(l => ({
        id: l.id,
        folderId: folderIds.has(l.folderId) ? l.folderId : null,
        title: typeof l.title === 'string' ? l.title : '',
        showCompleted: l.showCompleted !== false,
        createdAt: time(l.createdAt),
        updatedAt: time(l.updatedAt),
      }));
    const listIds = new Set(taskLists.map(l => l.id));

    const tasks = (Array.isArray(input.tasks) ? input.tasks : [])
      .filter(t => isRecord(t) && listIds.has(t.listId) && typeof t.text === 'string')
      .map((t, index) => ({
        id: t.id,
        listId: t.listId,
        text: t.text,
        done: t.done === true,
        position: Number.isFinite(t.position) ? t.position : index,
        createdAt: time(t.createdAt),
        completedAt: Number.isFinite(t.completedAt) ? t.completedAt : null,
      }));

    return { folders, notes, taskLists, tasks };
  }

  // ---- Preferences ----
  // Small per-device settings, such as which note was open. These stay in the
  // browser even after sync arrives, since each device can differ.

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function savePrefs(prefs) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (err) {
      console.error('Could not save preferences', err);
    }
  }

  return {
    loadAll, saveNote, deleteNote, saveTaskList, deleteTaskList, saveTask, saveTasks, deleteTask,
    saveFolder, deleteFolder, replaceAll, makeBackup, parseBackup, loadPrefs, savePrefs,
  };
})();
