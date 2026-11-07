// storage.js
// All saving and loading happens here, and nowhere else.
//
// How it works from 0.5:
// - Each person's notes and tasks are kept on the device (in the browser's
//   own storage), so the app opens instantly and works offline.
// - Every change is saved on the device first and added to an "outbox" of
//   changes waiting to go to the database (Supabase).
// - When there's a connection, waiting changes are sent, then anything
//   changed on other devices is fetched. If the same item was changed in two
//   places, the later change wins; the database checks this too.
// - Deleting marks a record as deleted in the database instead of erasing
//   it, so other devices learn about the deletion. Erasing for good leaves a
//   blank placeholder marked erased, for the same reason (from 1.1.1).
// - Each person's copy on a device is kept separately, and cleared when they
//   sign out.
//
// The record shapes the rest of the app uses:
// - folders: { id, name, parentId, createdAt, updatedAt }
// - notes: { id, folderId, body, createdAt, updatedAt }
// - task lists: { id, folderId, title, showCompleted, createdAt, updatedAt }
// - tasks: { id, listId, text, done, position, createdAt, completedAt, updatedAt }
// From 1.2, records read from the database also carry ownerId (whose it is)
// and changedBy (who made the latest change, if known). A note or task list
// someone shared with you has their ownerId; ownerDeleted marks one its owner
// has deleted, kept here until you choose to keep a copy or delete it.

const Storage = (() => {
  const OLD_DATA_KEY = 'anthology.data';          // notes saved on this device before 0.5
  const OLD_DATA_DONE_KEY = 'anthology.data.handled';
  const LAST_USER_KEY = 'anthology.lastUser';
  const BACKUP_FORMAT = 'anthology-backup';
  const BACKUP_VERSION = 2;
  const SYNC_DELAY_MS = 1500;
  const SYNC_EVERY_MS = 15 * 1000;     // how often to check for changes while the app is in view
  const RETRY_MS = 15 * 1000;
  const PAGE_SIZE = 1000;
  const KEEP_DELETED_MS = 30 * 24 * 60 * 60 * 1000; // Recently deleted keeps items for 30 days
  const REQUEST_TIMEOUT_MS = 8 * 1000;   // longest wait for one try of a request to the database
  const SYNC_TIMEOUT_MS = 60 * 1000;     // longest wait for a whole sync attempt

  const KINDS = ['folders', 'notes', 'taskLists', 'tasks'];
  const TABLE = { folders: 'folders', notes: 'notes', taskLists: 'task_lists', tasks: 'tasks' };

  // How each kind of record is written in the database, and read back.
  const toRow = {
    folders: f => ({ id: f.id, name: f.name, parent_id: f.parentId ?? null, pinned: Boolean(f.pinned), created_at: f.createdAt, updated_at: f.updatedAt }),
    notes: n => ({ id: n.id, folder_id: n.folderId ?? null, body: n.body, pinned: Boolean(n.pinned), created_at: n.createdAt, updated_at: n.updatedAt }),
    taskLists: l => ({
      id: l.id, folder_id: l.folderId ?? null, title: l.title, show_completed: l.showCompleted, pinned: Boolean(l.pinned),
      created_at: l.createdAt, updated_at: l.updatedAt,
    }),
    tasks: t => ({
      id: t.id, list_id: t.listId, text: t.text, done: t.done, position: t.position,
      created_at: t.createdAt, completed_at: t.completedAt ?? null, updated_at: t.updatedAt,
    }),
  };
  const fromRow = {
    folders: r => ({ id: r.id, name: r.name, parentId: r.parent_id, pinned: Boolean(r.pinned), createdAt: r.created_at, updatedAt: r.updated_at }),
    notes: r => ({
      id: r.id, folderId: r.folder_id, body: r.body, pinned: Boolean(r.pinned), createdAt: r.created_at, updatedAt: r.updated_at,
      ownerId: r.user_id, changedBy: r.changed_by ?? null,
    }),
    taskLists: r => ({
      id: r.id, folderId: r.folder_id, title: r.title, showCompleted: r.show_completed, pinned: Boolean(r.pinned),
      createdAt: r.created_at, updatedAt: r.updated_at, ownerId: r.user_id, changedBy: r.changed_by ?? null,
    }),
    tasks: r => ({
      id: r.id, listId: r.list_id, text: r.text, done: r.done, position: r.position,
      createdAt: r.created_at, completedAt: r.completed_at, updatedAt: r.updated_at,
      ownerId: r.user_id, changedBy: r.changed_by ?? null,
    }),
  };

  let client = null;        // the connection to Supabase
  let user = null;          // { id, email } of the person signed in
  let syncTimer = null;
  let syncRunning = null;
  let syncAgain = false;
  let status = 'idle';
  const listeners = { change: [], status: [], signedOut: [], cameBack: [] };

  // ---- Small helpers ----

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Now and then a request to the database gets no answer at all (seen in
  // testing: about 1 in 20). So each request gives up after a few seconds and
  // is tried once more. Every request the app makes is safe to repeat.
  async function patientFetch(url, options = {}) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch (err) {
        if (err.name !== 'TimeoutError' || attempt >= 2) throw err;
      }
    }
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`No answer after ${ms / 1000} seconds`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function emit(event, value) {
    for (const listener of listeners[event]) listener(value);
  }

  const dataKey = () => `anthology.u.${user.id}.data`;
  const outboxKey = () => `anthology.u.${user.id}.outbox`;
  const prefsKey = () => (user ? `anthology.u.${user.id}.prefs` : 'anthology.prefs');

  // trash holds recently deleted records: { kind, record, deletedAt }.
  // erasedHere lists what this device erased for good, { kind, id, at }, kept
  // for 30 days so it can say so if another device brings one back.
  // shares and people are copies of the database's lists (from 1.2), kept so
  // shared items still show who shared them while offline.
  function emptyData() {
    return { folders: [], notes: [], taskLists: [], tasks: [], trash: [], erasedHere: [], pulledAt: {}, shares: [], people: [] };
  }

  function readLocal() {
    const data = readJSON(dataKey(), null) || emptyData();
    for (const kind of KINDS) data[kind] = data[kind] || [];
    data.trash = data.trash || [];
    data.erasedHere = data.erasedHere || [];
    data.pulledAt = data.pulledAt || {};
    data.shares = data.shares || [];
    data.people = data.people || [];
    return data;
  }

  const writeLocal = data => writeJSON(dataKey(), data);
  const readOutbox = () => readJSON(outboxKey(), {});
  const writeOutbox = outbox => writeJSON(outboxKey(), outbox);

  function upsert(list, record) {
    const index = list.findIndex(existing => existing.id === record.id);
    if (index === -1) list.push({ ...record });
    else list[index] = { ...record };
  }

  // Adds changes to the outbox. A later change to the same record replaces an
  // earlier one that hasn't been sent yet. "erase" (Delete now, Empty, and
  // blank items discarded) leaves a blank placeholder marked erased, with the
  // text removed, so every device learns to remove the item too, even one that
  // was offline at the time. The placeholder is removed after 30 days, like
  // other deleted records (see eraseExpired). From 1.1.1; before that, erasing
  // removed the record outright, and devices that already had it never heard.
  const CONTENT = { folders: 'name', notes: 'body', taskLists: 'title', tasks: 'text' };

  function queue(changes) {
    const outbox = readOutbox();
    for (const { kind, record, deleted, erase } of changes) {
      const row = erase
        ? { ...toRow[kind](record), [CONTENT[kind]]: '', deleted: true, erased: true, updated_at: Date.now() }
        : { ...toRow[kind](record), deleted, erased: false };
      outbox[`${kind}:${record.id}`] = { kind, row, stamp: `${Date.now()}-${Math.random()}` };
    }
    writeOutbox(outbox);
    scheduleSync();
  }

  // Saves records on the device and queues them for the database.
  function put(kind, records) {
    const data = readLocal();
    for (const record of records) upsert(data[kind], record);
    writeLocal(data);
    queue(records.map(record => ({ kind, record, deleted: false })));
  }

  // Removes records from the device. Normally they go to Recently deleted and
  // the database marks them deleted; "discard" (for blank notes and tasks that
  // were never really used) erases them instead. Everything removed together
  // shares one deletion time, which is how a folder is later restored along
  // with its contents.
  function remove(data, kind, ids, changes, { now, discard = false }) {
    for (const id of ids) {
      const record = data[kind].find(r => r.id === id);
      if (!record) continue;
      data[kind] = data[kind].filter(r => r.id !== id);
      if (discard) {
        changes.push({ kind, record, erase: true });
      } else {
        data.trash = data.trash.filter(e => !(e.kind === kind && e.record.id === id));
        data.trash.push({ kind, record: { ...record }, deletedAt: now });
        changes.push({ kind, record: { ...record, updatedAt: now }, deleted: true });
      }
    }
  }

  // ---- Access (signing in) ----

  function connect() {
    client = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      global: { fetch: patientFetch },
    });
    client.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' && user) emit('signedOut');
    });
  }

  function rememberUser(sessionUser) {
    const found = { id: sessionUser.id, email: sessionUser.email };
    writeJSON(LAST_USER_KEY, found);
    return found;
  }

  // Finds who is signed in on this device. Offline, it trusts the last person
  // who signed in here, so the app still opens; sync resumes when back online.
  async function restoreUser() {
    const { data, error } = await client.auth.getSession();
    if (data && data.session) return rememberUser(data.session.user);
    const last = readJSON(LAST_USER_KEY, null);
    if (last && (error || !navigator.onLine)) return last;
    return null;
  }

  async function sendCode(email) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  }

  async function verifyCode(email, code) {
    const { data, error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
    return rememberUser(data.user);
  }

  // Signing out clears this person's copy from the device.
  async function signOut() {
    const leaving = user;
    user = null;
    clearTimeout(syncTimer);
    if (leaving) {
      for (const suffix of ['data', 'outbox', 'prefs', 'lastExport']) localStorage.removeItem(`anthology.u.${leaving.id}.${suffix}`);
    }
    localStorage.removeItem(LAST_USER_KEY);
    try {
      await client.auth.signOut();
    } catch (err) {
      console.error('Sign-out from the database failed; this device is signed out anyway', err);
    }
  }

  function openUser(signedIn) {
    user = signedIn;
    if (!localStorage.getItem(dataKey())) writeLocal(emptyData());
    window.addEventListener('online', () => sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') sync();
    });
    window.addEventListener('storage', event => {
      // Another tab of the app changed this person's data.
      if (user && event.key === dataKey()) emit('change');
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, SYNC_EVERY_MS);
  }

  // ---- Syncing with the database ----

  function setStatus(next) {
    if (next === status) return;
    status = next;
    emit('status', status);
  }

  function hasUnsynced() {
    return Boolean(user) && Object.keys(readOutbox()).length > 0;
  }

  function scheduleSync(delay = SYNC_DELAY_MS) {
    if (!user) return;
    if (status === 'synced') setStatus('pending');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(sync, delay);
  }

  async function sync() {
    if (!user) return;
    if (syncRunning) {
      syncAgain = true;
      return syncRunning;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    syncRunning = (async () => {
      setStatus('syncing');
      try {
        // If an attempt takes too long, give up on it and try again later,
        // rather than showing "Syncing…" forever.
        const result = await withTimeout((async () => {
          const { data } = await client.auth.getSession();
          if (!data.session) return null;
          // Shares first, so changes to things no longer shared with this
          // person can be left out of what's sent.
          const sharesChanged = await pullShares();
          await push();
          const { changed, cameBack } = await pull();
          const expired = await eraseExpired();
          return { changed: changed || sharesChanged, cameBack, expired };
        })(), SYNC_TIMEOUT_MS);
        if (!result) {
          setStatus('offline');
          return;
        }
        setStatus(hasUnsynced() ? 'pending' : 'synced');
        if (result.changed || result.expired) emit('change');
        if (result.cameBack.length) emit('cameBack', result.cameBack);
      } catch (err) {
        console.error('Sync failed; will try again', err);
        setStatus(navigator.onLine ? 'error' : 'offline');
        scheduleSync(RETRY_MS);
      }
    })();
    await syncRunning;
    syncRunning = null;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync(0);
    }
  }

  // Sends waiting changes, then removes them from the outbox unless they were
  // changed again while being sent.
  async function push() {
    dropUnreachable();
    const entries = Object.entries(readOutbox());
    for (const kind of KINDS) {
      const ofKind = entries.filter(([, entry]) => entry.kind === kind);
      for (let start = 0; start < ofKind.length; start += 500) {
        const chunk = ofKind.slice(start, start + 500);
        const saves = chunk.filter(([, entry]) => !entry.erase).map(([, entry]) => entry.row);
        // Only outboxes from before 1.1.1 can still hold an outright erase.
        const erases = chunk.filter(([, entry]) => entry.erase).map(([, entry]) => entry.id);
        if (saves.length) {
          const { error } = await client.from(TABLE[kind]).upsert(saves);
          if (error) throw error;
        }
        if (erases.length) {
          const { error } = await client.from(TABLE[kind]).delete().in('id', erases);
          if (error) throw error;
        }
        const outbox = readOutbox();
        for (const [key, entry] of chunk) {
          if (outbox[key] && outbox[key].stamp === entry.stamp) delete outbox[key];
        }
        writeOutbox(outbox);
      }
    }
  }

  // Fetches what changed in the database since this device last checked, and
  // applies it. Returns whether anything on the device changed, and anything
  // deleted on this device that came back, because it was changed or restored
  // on another device ({ kind, record } each).
  async function pull() {
    const before = readLocal();
    const fetched = {};
    for (const kind of KINDS) {
      fetched[kind] = [];
      const since = before.pulledAt[kind];
      for (let from = 0; ; from += PAGE_SIZE) {
        let query = client.from(TABLE[kind]).select('*').order('synced_at').range(from, from + PAGE_SIZE - 1);
        // A few seconds of overlap, so nothing saved at the same moment is missed.
        if (since) query = query.gt('synced_at', new Date(new Date(since).getTime() - 5000).toISOString());
        const { data: rows, error } = await query;
        if (error) throw error;
        fetched[kind].push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
    }

    // Applied all at once, after fetching, so changes made on this device in
    // the meantime aren't overwritten.
    const data = readLocal();
    const outbox = readOutbox();
    let changed = false;
    const cameBack = [];
    for (const kind of KINDS) {
      for (const row of fetched[kind]) {
        if (!data.pulledAt[kind] || row.synced_at > data.pulledAt[kind]) data.pulledAt[kind] = row.synced_at;
        if (outbox[`${kind}:${row.id}`]) continue; // this device has a newer change on its way
        const index = data[kind].findIndex(r => r.id === row.id);
        const inTrash = data.trash.findIndex(e => e.kind === kind && e.record.id === row.id);
        const record = fromRow[kind](row);
        if ((kind === 'notes' || kind === 'taskLists') && row.user_id !== user.id) {
          if (applySharedIn(data, kind, row, record, index)) changed = true;
          continue;
        }
        if (kind === 'tasks' && (row.deleted || row.erased)) {
          // Tasks in a shared list its owner deleted stay with the list, so
          // keeping a copy keeps them too.
          const list = data.taskLists.find(l => l.id === row.list_id);
          if (list && list.ownerDeleted) continue;
        }
        if (row.erased) {
          // Erased for good on another device: remove it here too, including
          // from Recently deleted.
          if (index !== -1) data[kind].splice(index, 1);
          if (inTrash !== -1) data.trash.splice(inTrash, 1);
          if (index !== -1 || inTrash !== -1) changed = true;
          continue;
        }
        if (row.deleted) {
          // Deleted on another device: move it to Recently deleted here too.
          if (index !== -1) {
            data[kind].splice(index, 1);
            changed = true;
          }
          if (inTrash === -1 && row.updated_at > Date.now() - KEEP_DELETED_MS) {
            data.trash.push({ kind, record, deletedAt: row.updated_at });
            changed = true;
          }
          continue;
        }
        if (inTrash !== -1) {
          // Restored on another device, or changed there after being deleted here.
          data.trash.splice(inTrash, 1);
          cameBack.push({ kind, record });
          changed = true;
        }
        if (index === -1) {
          const erased = data.erasedHere.findIndex(e => e.kind === kind && e.id === row.id);
          if (erased !== -1) {
            // Erased here for good, then changed or restored on another device.
            data.erasedHere.splice(erased, 1);
            cameBack.push({ kind, record });
          }
          data[kind].push(record);
          changed = true;
        } else if (data[kind][index].updatedAt <= record.updatedAt
          && JSON.stringify(data[kind][index]) !== JSON.stringify(record)) {
          data[kind][index] = record;
          changed = true;
        }
      }
    }
    writeLocal(data);
    return { changed, cameBack };
  }

  // A note or task list someone shared with this person. It sits at the top
  // level here (its owner's folders aren't shared), with this person's own
  // pin. If the owner deletes it, it stays here, marked, until this person
  // keeps a copy or deletes it. Returns whether anything changed.
  function applySharedIn(data, kind, row, record, index) {
    const share = activeShare(data, kind, row.id);
    record.folderId = null;
    record.pinned = Boolean(share && share.person_pinned);
    if (row.deleted || row.erased) {
      if (index === -1) {
        if (row.erased) return false;
        record.ownerDeleted = true;
        data[kind].push(record);
        return true;
      }
      if (data[kind][index].ownerDeleted) return false;
      data[kind][index] = { ...data[kind][index], ownerDeleted: true };
      return true;
    }
    if (index === -1) {
      data[kind].push(record);
      return true;
    }
    const current = data[kind][index];
    if (current.updatedAt <= record.updatedAt && JSON.stringify(current) !== JSON.stringify(record)) {
      data[kind][index] = record;
      return true;
    }
    return false;
  }

  // ---- Reading and saving, used by the rest of the app ----

  async function loadAll() {
    const data = readLocal();
    return {
      folders: data.folders, notes: data.notes, taskLists: data.taskLists, tasks: data.tasks,
      shares: data.shares, people: data.people,
    };
  }

  async function saveNote(note) {
    put('notes', [note]);
  }

  async function saveTaskList(list) {
    put('taskLists', [list]);
  }

  async function saveTask(task) {
    put('tasks', [{ ...task, updatedAt: Date.now() }]);
  }

  // Saves several tasks at once, for example after reordering.
  async function saveTasks(tasks) {
    const now = Date.now();
    put('tasks', tasks.map(task => ({ ...task, updatedAt: now })));
  }

  async function saveFolder(folder) {
    put('folders', [{ ...folder, updatedAt: Date.now() }]);
  }

  // Runs build(data, changes, how) against the device's copy, saves it, and
  // queues the changes.
  function removeAndQueue(build, discard = false) {
    const data = readLocal();
    const changes = [];
    build(data, changes, { now: Date.now(), discard });
    writeLocal(data);
    queue(changes);
  }

  // The delete functions below send items to Recently deleted. With
  // discard = true (blank notes and tasks), they're erased instead.

  async function deleteNote(id, discard = false) {
    removeAndQueue((data, changes, how) => remove(data, 'notes', [id], changes, how), discard);
  }

  async function deleteTask(id, discard = false) {
    removeAndQueue((data, changes, how) => remove(data, 'tasks', [id], changes, how), discard);
  }

  // Deleting a task list also deletes its tasks.
  async function deleteTaskList(id, discard = false) {
    removeAndQueue((data, changes, how) => {
      remove(data, 'tasks', data.tasks.filter(t => t.listId === id).map(t => t.id), changes, how);
      remove(data, 'taskLists', [id], changes, how);
    }, discard);
  }

  // Deleting a folder also deletes everything in it, including folders inside it.
  async function deleteFolder(id) {
    removeAndQueue((data, changes, how) => {
      const folderIds = [id];
      for (let i = 0; i < folderIds.length; i++) {
        for (const f of data.folders) if (f.parentId === folderIds[i]) folderIds.push(f.id);
      }
      const listIds = data.taskLists.filter(l => folderIds.includes(l.folderId)).map(l => l.id);
      remove(data, 'tasks', data.tasks.filter(t => listIds.includes(t.listId)).map(t => t.id), changes, how);
      remove(data, 'taskLists', listIds, changes, how);
      remove(data, 'notes', data.notes.filter(n => folderIds.includes(n.folderId)).map(n => n.id), changes, how);
      remove(data, 'folders', folderIds, changes, how);
    });
  }

  // Restoring a backup replaces everything in the account. What it replaces
  // goes to Recently deleted. Restored records count as just changed, so they
  // win over older copies on other devices.
  async function replaceAll(incoming) {
    removeAndQueue((data, changes, how) => {
      for (const kind of KINDS) {
        const keep = new Set(incoming[kind].map(r => r.id));
        // Things shared with this person aren't in their backups, and stay.
        const theirs = r => !keep.has(r.id) && !isOthers(data, kind, r);
        remove(data, kind, data[kind].filter(theirs).map(r => r.id), changes, how);
      }
    });
    const now = Date.now();
    for (const kind of KINDS) put(kind, incoming[kind].map(r => ({ ...r, updatedAt: now })));
  }

  // Restoring by "adding what's missing": only records not currently in the
  // account come back (including ones in Recently deleted). Everything that's
  // there now stays exactly as it is. Returns how many of each were added.
  async function addMissing(incoming) {
    const data = readLocal();
    const now = Date.now();
    const added = {};
    for (const kind of KINDS) {
      const present = new Set(data[kind].map(r => r.id));
      const missing = incoming[kind].filter(r => !present.has(r.id));
      added[kind] = missing.length;
      if (!missing.length) continue;
      const ids = new Set(missing.map(r => r.id));
      const fresh = readLocal();
      fresh.trash = fresh.trash.filter(e => !(e.kind === kind && ids.has(e.record.id)));
      writeLocal(fresh);
      // Counted as just changed, so they win over "deleted" marks on other devices.
      put(kind, missing.map(r => ({ ...r, updatedAt: now })));
    }
    return added;
  }

  // ---- Export dates, kept with the account ----

  async function exportInfo() {
    const { data } = await client.auth.getSession();
    const signedIn = data.session && data.session.user;
    if (!signedIn) return null;
    const meta = signedIn.user_metadata || {};
    const local = Number(localStorage.getItem(`anthology.u.${signedIn.id}.lastExport`)) || 0;
    return {
      createdAt: Date.parse(signedIn.created_at) || Date.now(),
      lastExportAt: Math.max(meta.last_export_at || 0, local),
      snoozedUntil: meta.export_reminder_snoozed_until || 0,
    };
  }

  // Remembers that an export was made, on this device straight away and with
  // the account when there's a connection.
  async function recordExport() {
    if (!user) return;
    const now = Date.now();
    localStorage.setItem(`anthology.u.${user.id}.lastExport`, String(now));
    try {
      await client.auth.updateUser({ data: { last_export_at: now } });
    } catch (err) {
      console.error('Export date not saved with the account yet', err);
    }
  }

  async function snoozeReminder(until) {
    const { error } = await client.auth.updateUser({ data: { export_reminder_snoozed_until: until } });
    if (error) throw error;
  }

  // ---- Recently deleted ----

  // True if trash entry e was deleted together with, and inside, entry parent
  // (a folder or a task list).
  function deletedWith(e, parent, trash) {
    if (e === parent || e.deletedAt !== parent.deletedAt) return false;
    if (parent.kind === 'taskLists') return e.kind === 'tasks' && e.record.listId === parent.record.id;
    if (parent.kind !== 'folders') return false;
    // Walk up from e's folder, through folders deleted at the same time, looking for parent.
    let folderId = e.record.folderId;
    if (e.kind === 'folders') folderId = e.record.parentId;
    if (e.kind === 'tasks') {
      const list = findEntry(trash, 'taskLists', e.record.listId);
      folderId = list && list.deletedAt === parent.deletedAt ? list.record.folderId : null;
    }
    const seen = new Set();
    while (folderId && !seen.has(folderId)) {
      if (folderId === parent.record.id) return true;
      seen.add(folderId);
      const folder = findEntry(trash, 'folders', folderId);
      if (!folder || folder.deletedAt !== parent.deletedAt) return false;
      folderId = folder.record.parentId;
    }
    return false;
  }

  const findEntry = (trash, kind, id) => trash.find(e => e.kind === kind && e.record.id === id);

  // What Recently deleted shows: newest first, with things deleted as part of
  // a folder or list counted under it rather than listed separately.
  function listTrash() {
    const data = readLocal();
    const nameOf = (kind, id) => {
      const record = data[kind].find(r => r.id === id) || findEntry(data.trash, kind, id)?.record;
      if (!record) return null;
      return kind === 'folders' ? record.name : record.title;
    };
    return data.trash
      .filter(e => !data.trash.some(parent => deletedWith(e, parent, data.trash)))
      .sort((a, b) => b.deletedAt - a.deletedAt)
      .map(e => {
        const inside = data.trash.filter(x => deletedWith(x, e, data.trash));
        return {
          kind: e.kind,
          record: e.record,
          deletedAt: e.deletedAt,
          contains: {
            folders: inside.filter(x => x.kind === 'folders').length,
            notes: inside.filter(x => x.kind === 'notes').length,
            taskLists: inside.filter(x => x.kind === 'taskLists').length,
            tasks: inside.filter(x => x.kind === 'tasks').length,
          },
          parentName: e.kind === 'tasks' ? nameOf('taskLists', e.record.listId)
            : e.kind === 'folders' ? (e.record.parentId ? nameOf('folders', e.record.parentId) : null)
            : e.record.folderId ? nameOf('folders', e.record.folderId) : null,
        };
      });
  }

  // Puts an item back, with anything deleted along with it, and its folder or
  // list if that was deleted too. Returns false if it can't be restored (a
  // task whose list is gone for good).
  async function restore(kind, id) {
    const data = readLocal();
    const entry = findEntry(data.trash, kind, id);
    if (!entry) return true;
    const picked = new Set([entry, ...data.trash.filter(e => deletedWith(e, entry, data.trash))]);

    // Brings back the folder something was in, and that folder's folder, and so
    // on, if they were deleted too. If one is gone for good, the item goes to
    // the top level, or into the nearest folder that still exists.
    const bringBackFolder = (record, field = 'folderId') => {
      let target = record;
      let key = field;
      while (target[key] && !data.folders.some(f => f.id === target[key])) {
        const folder = findEntry(data.trash, 'folders', target[key]);
        if (!folder) {
          target[key] = null;
          return;
        }
        picked.add(folder);
        target = folder.record;
        key = 'parentId';
      }
    };
    if (kind === 'notes' || kind === 'taskLists') bringBackFolder(entry.record);
    if (kind === 'folders') bringBackFolder(entry.record, 'parentId');
    if (kind === 'tasks' && !data.taskLists.some(l => l.id === entry.record.listId)) {
      const list = findEntry(data.trash, 'taskLists', entry.record.listId);
      if (!list) return false;
      picked.add(list);
      bringBackFolder(list.record);
    }

    data.trash = data.trash.filter(e => !picked.has(e));
    writeLocal(data);
    const now = Date.now();
    for (const k of KINDS) {
      const records = [...picked].filter(e => e.kind === k).map(e => ({ ...e.record, updatedAt: now }));
      if (records.length) put(k, records);
    }
    return true;
  }

  function rememberErased(data, entries) {
    const at = Date.now();
    data.erasedHere.push(...entries.map(e => ({ kind: e.kind, id: e.record.id, at })));
  }

  // Erases an item (and anything deleted along with it) for good.
  async function eraseForever(kind, id) {
    const data = readLocal();
    const entry = findEntry(data.trash, kind, id);
    if (!entry) return;
    const gone = [entry, ...data.trash.filter(e => deletedWith(e, entry, data.trash))];
    data.trash = data.trash.filter(e => !gone.includes(e));
    rememberErased(data, gone);
    writeLocal(data);
    queue(gone.map(e => ({ kind: e.kind, record: e.record, erase: true })));
  }

  async function emptyTrash() {
    const data = readLocal();
    const gone = data.trash;
    data.trash = [];
    rememberErased(data, gone);
    writeLocal(data);
    queue(gone.map(e => ({ kind: e.kind, record: e.record, erase: true })));
  }

  // Erases anything deleted more than 30 days ago: from this device every
  // time, and from the database about once a day.
  async function eraseExpired() {
    const cutoff = Date.now() - KEEP_DELETED_MS;
    const data = readLocal();
    const before = data.trash.length;
    data.trash = data.trash.filter(e => e.deletedAt >= cutoff);
    const changed = data.trash.length !== before;
    const remembered = data.erasedHere.length;
    data.erasedHere = data.erasedHere.filter(e => e.at >= cutoff);
    if (changed || data.erasedHere.length !== remembered) writeLocal(data);

    if (!data.erasedAt || data.erasedAt < Date.now() - 24 * 60 * 60 * 1000) {
      for (const kind of KINDS) {
        const { error } = await client.from(TABLE[kind]).delete().eq('deleted', true).lt('updated_at', cutoff);
        if (error) throw error;
      }
      const latest = readLocal();
      latest.erasedAt = Date.now();
      writeLocal(latest);
    }
    return changed;
  }

  // ---- Sharing by link ----
  // These talk to the database directly, so they need a connection. A link's
  // code is 43 random characters, effectively impossible to guess.

  const ITEM_KIND = { notes: 'note', taskLists: 'task_list' };

  function newToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Returns the item's current link of this kind, making one if needed.
  async function getOrCreateShareLink(kind, itemId, canEdit = false) {
    const { data, error } = await client.from('share_links').select('*')
      .eq('item_id', itemId).eq('active', true).eq('can_edit', canEdit).limit(1);
    if (error) throw error;
    if (data.length) return data[0];
    const link = { token: newToken(), item_kind: ITEM_KIND[kind], item_id: itemId, can_edit: canEdit };
    const { error: insertError } = await client.from('share_links').insert(link);
    if (insertError) throw insertError;
    return link;
  }

  async function turnOffShareLink(token) {
    const { error } = await client.from('share_links').update({ active: false }).eq('token', token);
    if (error) throw error;
  }

  // Turns the old link off and makes a new one for the same item.
  async function replaceShareLink(link) {
    await turnOffShareLink(link.token);
    const kind = link.item_kind === 'note' ? 'notes' : 'taskLists';
    return getOrCreateShareLink(kind, link.item_id, link.can_edit);
  }

  async function listShareLinks() {
    const { data, error } = await client.from('share_links').select('*')
      .eq('active', true).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  // What a link shows. Works without signing in. Returns null if the link is
  // off, or the item has been deleted.
  async function getSharedItem(token) {
    const { data, error } = await client.rpc('get_shared_item', { share_token: token });
    if (error) throw error;
    return data;
  }

  // Changes made through an edit link. They go straight to the database (no
  // offline copy), and work without signing in.
  async function callShared(name, args) {
    const { error } = await client.rpc(name, args);
    if (error) throw error;
  }

  const saveSharedNote = (token, body) => callShared('save_shared_note', { share_token: token, new_body: body });
  const saveSharedListTitle = (token, title) => callShared('save_shared_list_title', { share_token: token, new_title: title });
  const addSharedTask = (token, id, text) => callShared('add_shared_task', { share_token: token, task_id: id, task_text: text });
  const saveSharedTask = (token, id, text, done) =>
    callShared('save_shared_task', { share_token: token, task_id: id, task_text: text, task_done: done });
  const deleteSharedTask = (token, id) => callShared('delete_shared_task', { share_token: token, task_id: id });

  // ---- Sharing with people (from 1.2) ----
  // A note or task list shared with a specific Anthology account appears in
  // both people's apps and syncs like everything else. The owner keeps it in
  // their folders; the other person has it at the top level. Sharing, ending
  // a share and setting your name talk to the database directly, so they need
  // a connection.

  const SHARE_KIND = { notes: 'note', taskLists: 'task_list' };
  const KIND_OF = { note: 'notes', task_list: 'taskLists' };

  function activeShare(data, kind, id) {
    return data.shares.find(s => s.active && s.item_kind === SHARE_KIND[kind] && s.item_id === id) || null;
  }

  // Is this someone else's note or task list (or a task in someone else's list)?
  function isOthers(data, kind, record) {
    if (!user) return false;
    if (kind === 'tasks') {
      const list = data.taskLists.find(l => l.id === record.listId);
      return Boolean(list && list.ownerId && list.ownerId !== user.id);
    }
    if (kind === 'folders') return false;
    return Boolean(record.ownerId && record.ownerId !== user.id);
  }

  // Fetches the shares this person is part of, and the people in them.
  async function pullShares() {
    const [shares, people] = await Promise.all([
      client.from('shares').select('*'),
      client.from('people').select('*'),
    ]);
    if (shares.error) throw shares.error;
    if (people.error) throw people.error;
    const data = readLocal();
    const changed = JSON.stringify(data.shares) !== JSON.stringify(shares.data)
      || JSON.stringify(data.people) !== JSON.stringify(people.data);
    if (!changed) return false;
    data.shares = shares.data;
    data.people = people.data;
    // Someone else's pins come from the share, not the item.
    for (const kind of ['notes', 'taskLists']) {
      for (const record of data[kind]) {
        if (!isOthers(data, kind, record)) continue;
        const share = activeShare(data, kind, record.id);
        if (share) record.pinned = Boolean(share.person_pinned);
      }
    }
    writeLocal(data);
    return true;
  }

  // Leaves out waiting changes to things that are no longer shared with this
  // person; the database would refuse them, which would stop syncing.
  function dropUnreachable() {
    const data = readLocal();
    const outbox = readOutbox();
    let dropped = false;
    for (const [key, entry] of Object.entries(outbox)) {
      let kind = entry.kind;
      let id = entry.row.id;
      if (kind === 'tasks') {
        const list = data.taskLists.find(l => l.id === entry.row.list_id);
        if (!list) continue;
        kind = 'taskLists';
        id = list.id;
      }
      if (kind !== 'notes' && kind !== 'taskLists') continue;
      const record = data[kind].find(r => r.id === id);
      if (!record || !isOthers(data, kind, record)) continue;
      if (activeShare(data, kind, id) && !(entry.kind !== 'tasks' && (entry.row.deleted || entry.row.erased))) continue;
      delete outbox[key];
      dropped = true;
    }
    if (dropped) writeOutbox(outbox);
  }

  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }

  // Shares one of this person's notes or task lists with the account using
  // this email. Throws with the database's plain-language message if it can't.
  async function shareWithPerson(kind, id, email) {
    await sync(); // the item has to be in the database first
    const result = await rpc('share_with_person', { person_email: email, kind: SHARE_KIND[kind], item: id });
    await pullShares();
    return result;
  }

  // Ends a share. reason: 'left' when the other person removes something
  // still shared, 'closed' once they've answered the keep-or-delete question.
  async function endShare(shareId, reason = 'left') {
    await rpc('end_share', { share: shareId, reason });
    await pullShares();
  }

  async function markShareSeen(shareId) {
    await rpc('mark_share_seen', { share: shareId });
    await pullShares();
  }

  // Pins or unpins something shared with this person, for them only.
  async function pinShared(kind, id, pin) {
    const data = readLocal();
    const share = activeShare(data, kind, id);
    if (!share) return;
    await rpc('pin_shared', { share: share.id, pin });
    await pullShares();
  }

  async function saveMyName(name) {
    await rpc('save_my_name', { new_name: name });
    await pullShares();
  }

  // Removes someone else's note or task list from this device only, with its
  // tasks and any changes waiting to be sent. The owner's copy isn't touched.
  function forgetShared(kind, id) {
    const data = readLocal();
    data[kind] = data[kind].filter(r => r.id !== id);
    const taskIds = new Set();
    if (kind === 'taskLists') {
      for (const t of data.tasks) if (t.listId === id) taskIds.add(t.id);
      data.tasks = data.tasks.filter(t => t.listId !== id);
    }
    writeLocal(data);
    const outbox = readOutbox();
    delete outbox[`${kind}:${id}`];
    for (const taskId of taskIds) delete outbox[`tasks:${taskId}`];
    writeOutbox(outbox);
  }

  // Makes this person's own copy of someone else's note or task list (new
  // IDs, at the top level), then removes the shared one from this device.
  // Returns the copy's ID.
  function keepCopy(kind, id) {
    const data = readLocal();
    const original = data[kind].find(r => r.id === id);
    if (!original) return null;
    const now = Date.now();
    const copyId = crypto.randomUUID ? crypto.randomUUID() : `${now.toString(36)}${Math.random().toString(36).slice(2)}`;
    const { ownerId, changedBy, ownerDeleted, ...fields } = original;
    const copy = { ...fields, id: copyId, folderId: null, pinned: false, updatedAt: now };
    const tasks = kind === 'taskLists'
      ? data.tasks.filter(t => t.listId === id).map(({ ownerId: o, changedBy: c, ...t }) => ({
        ...t, id: crypto.randomUUID ? crypto.randomUUID() : `${t.id}-copy`, listId: copyId, updatedAt: now,
      }))
      : [];
    forgetShared(kind, id);
    put(kind, [copy]);
    if (tasks.length) put('tasks', tasks);
    return copyId;
  }

  // ---- Notes saved on this device before 0.5 ----

  // Returns counts if this device has notes from before sign-in that haven't
  // been added to an account or left out yet; otherwise null.
  function oldDeviceData() {
    if (localStorage.getItem(OLD_DATA_DONE_KEY)) return null;
    const old = readJSON(OLD_DATA_KEY, null);
    if (!old) return null;
    const data = cleanData({ folders: [], notes: [], ...old });
    if (data.notes.length + data.taskLists.length === 0) return null;
    return { data, notes: data.notes.length, taskLists: data.taskLists.length };
  }

  // Adds them to the signed-in person's account. The original copy stays on
  // the device, only marked as handled.
  async function addOldDeviceData() {
    const found = oldDeviceData();
    if (!found) return;
    const now = Date.now();
    put('folders', found.data.folders.map(f => ({ ...f, updatedAt: now })));
    put('notes', found.data.notes);
    put('taskLists', found.data.taskLists);
    put('tasks', found.data.tasks.map(t => ({ ...t, updatedAt: now })));
    localStorage.setItem(OLD_DATA_DONE_KEY, 'added');
  }

  function leaveOutOldDeviceData() {
    localStorage.setItem(OLD_DATA_DONE_KEY, 'left out');
  }

  // ---- Backups ----

  // A backup holds only this person's own things, so restoring it can't make
  // copies of things others shared with them. (The Markdown files in an
  // export include everything.)
  function makeBackup(data) {
    const own = user ? (r => !r.ownerId || r.ownerId === user.id) : (() => true);
    const lists = data.taskLists.filter(own);
    const listIds = new Set(lists.map(l => l.id));
    return JSON.stringify({
      format: BACKUP_FORMAT,
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      folders: data.folders,
      notes: data.notes.filter(own),
      taskLists: lists,
      tasks: data.tasks.filter(t => listIds.has(t.listId)),
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
      .map(f => ({ id: f.id, name: f.name, parentId: f.parentId ?? null, pinned: f.pinned === true, createdAt: time(f.createdAt), updatedAt: time(f.updatedAt) }));
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
        pinned: n.pinned === true,
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
        pinned: l.pinned === true,
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
        updatedAt: time(t.updatedAt),
      }));

    return { folders, notes, taskLists, tasks };
  }

  // ---- Preferences ----
  // Small per-device settings, such as which note was open, kept separately
  // for each person.

  function loadPrefs() {
    return readJSON(prefsKey(), {}) || {};
  }

  function savePrefs(prefs) {
    try {
      writeJSON(prefsKey(), prefs);
    } catch (err) {
      console.error('Could not save preferences', err);
    }
  }

  return {
    version: '1.2', // must match APP_VERSION in app.js
    connect, restoreUser, sendCode, verifyCode, signOut, openUser,
    sync, hasUnsynced, getStatus: () => status,
    onChange: fn => listeners.change.push(fn),
    onStatus: fn => listeners.status.push(fn),
    onSignedOut: fn => listeners.signedOut.push(fn),
    onCameBack: fn => listeners.cameBack.push(fn),
    loadAll, saveNote, deleteNote, saveTaskList, deleteTaskList, saveTask, saveTasks, deleteTask,
    saveFolder, deleteFolder, replaceAll,
    listTrash, restore, eraseForever, emptyTrash, addMissing,
    exportInfo, recordExport, snoozeReminder,
    getOrCreateShareLink, turnOffShareLink, replaceShareLink, listShareLinks, getSharedItem,
    saveSharedNote, saveSharedListTitle, addSharedTask, saveSharedTask, deleteSharedTask,
    oldDeviceData, addOldDeviceData, leaveOutOldDeviceData,
    makeBackup, parseBackup, loadPrefs, savePrefs,
    userId: () => (user ? user.id : null), kindOf: shareKind => KIND_OF[shareKind],
    shareWithPerson, endShare, markShareSeen, pinShared, saveMyName, forgetShared, keepCopy,
  };
})();
