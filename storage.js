// storage.js
// All saving and loading happens here, and nowhere else. For now the data lives
// in the browser's own storage (localStorage). In 0.5 this file is replaced with
// one that talks to Supabase, and the rest of the app shouldn't need to change.
// The data functions return Promises (results that arrive later), because a
// database is never instant; with browser storage they finish right away.

const Storage = (() => {
  const DATA_KEY = 'anthology.data';
  const PREFS_KEY = 'anthology.prefs';
  const BACKUP_FORMAT = 'anthology-backup';
  const BACKUP_VERSION = 1;

  function readData() {
    const raw = localStorage.getItem(DATA_KEY);
    if (!raw) return { folders: [], notes: [] };
    const parsed = JSON.parse(raw);
    return { folders: parsed.folders || [], notes: parsed.notes || [] };
  }

  function writeData(data) {
    localStorage.setItem(DATA_KEY, JSON.stringify({
      version: 1,
      folders: data.folders,
      notes: data.notes,
    }));
  }

  function upsert(list, item) {
    const index = list.findIndex(existing => existing.id === item.id);
    if (index === -1) list.push({ ...item });
    else list[index] = { ...item };
  }

  // ---- Notes and folders ----

  async function loadAll() {
    return readData();
  }

  async function saveNote(note) {
    const data = readData();
    upsert(data.notes, note);
    writeData(data);
  }

  async function deleteNote(id) {
    const data = readData();
    data.notes = data.notes.filter(note => note.id !== id);
    writeData(data);
  }

  async function saveFolder(folder) {
    const data = readData();
    upsert(data.folders, folder);
    writeData(data);
  }

  // Deleting a folder also deletes the notes in it.
  async function deleteFolder(id) {
    const data = readData();
    data.folders = data.folders.filter(folder => folder.id !== id);
    data.notes = data.notes.filter(note => note.folderId !== id);
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
    }, null, 2);
  }

  // Reads a backup file's text and returns clean { folders, notes }, or throws
  // an Error with a plain-language message.
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

  // Keeps only well-formed folders and notes, so a damaged file can't break the app.
  function cleanData(input) {
    const time = value => (Number.isFinite(value) ? value : Date.now());
    const folders = input.folders
      .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
      .map(f => ({ id: f.id, name: f.name, parentId: f.parentId ?? null, createdAt: time(f.createdAt) }));
    const folderIds = new Set(folders.map(f => f.id));
    for (const folder of folders) {
      if (!folderIds.has(folder.parentId)) folder.parentId = null;
    }
    const notes = input.notes
      .filter(n => n && typeof n.id === 'string' && typeof n.body === 'string')
      .map(n => ({
        id: n.id,
        folderId: folderIds.has(n.folderId) ? n.folderId : null,
        body: n.body,
        createdAt: time(n.createdAt),
        updatedAt: time(n.updatedAt),
      }));
    return { folders, notes };
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
    loadAll, saveNote, deleteNote, saveFolder, deleteFolder, replaceAll,
    makeBackup, parseBackup, loadPrefs, savePrefs,
  };
})();
