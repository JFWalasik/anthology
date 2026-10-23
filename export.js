// export.js
// Making an export: one ZIP file (a single file holding other files and
// folders) with every note and task list as a Markdown file, plus the backup
// file. Also reads ZIP files back, so an export can be restored. Written
// without a library; ZIP is a simple, long-standing format.

const Export = (() => {
  // ---- Markdown files ----

  // File and folder names can't contain some characters on some computers.
  function safeName(name, fallback) {
    const cleaned = name
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 80)
      .trim();
    return cleaned || fallback;
  }

  // Two items with the same name in one folder become "Name" and "Name (2)".
  function uniqueName(used, base) {
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    used.add(name.toLowerCase());
    return name;
  }

  function noteTitle(note) {
    const firstLine = note.body.split('\n').find(line => line.trim() !== '') || '';
    return firstLine.replace(/^#+\s*/, '').trim();
  }

  // A note's first line becomes a Markdown heading ("# Title").
  function noteMarkdown(note) {
    const lines = note.body.split('\n');
    const first = lines[0].replace(/^#+\s*/, '').trim();
    const heading = first ? `# ${first}` : '';
    return `${[heading, ...lines.slice(1)].join('\n').trim()}\n`;
  }

  // A task list becomes a checklist: "- [ ]" for open tasks, "- [x]" for done ones.
  function listMarkdown(list, tasks) {
    const ordered = [...tasks.filter(t => !t.done), ...tasks.filter(t => t.done)];
    const lines = ordered.map(t => `- [${t.done ? 'x' : ' '}] ${t.text.replace(/\n/g, ' ')}`);
    return `# ${list.title.trim() || 'Untitled task list'}\n\n${lines.join('\n')}\n`;
  }

  // Returns [{ path, text, time }] for everything in the export.
  function buildFiles(data, backupText, rootName) {
    const files = [];
    // Each folder's path, such as "Garden/Vegetables", mirroring folders inside folders.
    const folderPath = new Map();
    const usedFolderNames = new Map(); // per parent folder
    const pathOf = (id, seen = new Set()) => {
      if (!id || seen.has(id)) return '';
      if (folderPath.has(id)) return folderPath.get(id);
      seen.add(id);
      const folder = data.folders.find(f => f.id === id);
      if (!folder) return '';
      const parent = pathOf(folder.parentId, seen);
      if (!usedFolderNames.has(parent)) usedFolderNames.set(parent, new Set());
      const name = uniqueName(usedFolderNames.get(parent), safeName(folder.name, 'Untitled folder'));
      folderPath.set(id, parent ? `${parent}/${name}` : name);
      return folderPath.get(id);
    };
    for (const folder of [...data.folders].sort((a, b) => a.name.localeCompare(b.name))) pathOf(folder.id);
    const usedNames = new Map(); // per folder path
    const place = (side, folderId, base, ext) => {
      const dir = [rootName, side, pathOf(folderId)].filter(Boolean).join('/');
      if (!usedNames.has(dir)) usedNames.set(dir, new Set());
      return `${dir}/${uniqueName(usedNames.get(dir), base)}${ext}`;
    };

    for (const note of data.notes) {
      files.push({
        path: place('Notes', note.folderId, safeName(noteTitle(note), 'Untitled note'), '.md'),
        text: noteMarkdown(note),
        time: note.updatedAt,
      });
    }
    for (const list of data.taskLists) {
      const tasks = data.tasks.filter(t => t.listId === list.id).sort((a, b) => a.position - b.position);
      files.push({
        path: place('Tasks', list.folderId, safeName(list.title, 'Untitled task list'), '.md'),
        text: listMarkdown(list, tasks),
        time: list.updatedAt,
      });
    }
    files.push({ path: `${rootName}/anthology-backup.json`, text: backupText, time: Date.now() });
    files.push({
      path: `${rootName}/About this export.txt`,
      time: Date.now(),
      text: [
        `This is an export of Anthology, made ${new Date().toLocaleString()}.`,
        '',
        'Notes and Tasks hold every note and task list as a Markdown file (plain text that opens in',
        'any text editor and imports into most notes apps). Task lists are checklists:',
        '"- [ ]" is an open task and "- [x]" a done one.',
        '',
        'anthology-backup.json is a backup that Anthology can restore: Settings and help, then',
        'Restore from backup. You can choose this file, or the whole ZIP file.',
        '',
      ].join('\n'),
    });
    return files;
  }

  // ---- Writing a ZIP file ----
  // Files are stored as they are (not compressed); notes are small.

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  // ZIP files record times in an old MS-DOS format.
  function dosTime(ms) {
    const d = new Date(Number.isFinite(ms) ? ms : Date.now());
    const year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.path);
      const data = encoder.encode(file.text);
      const crc = crc32(data);
      const { time, date } = dosTime(file.time);

      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); // local file header
      local.setUint16(4, 20, true);         // version needed
      local.setUint16(6, 0x0800, true);     // names are UTF-8
      local.setUint16(8, 0, true);          // stored, not compressed
      local.setUint16(10, time, true);
      local.setUint16(12, date, true);
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, name.length, true);
      local.setUint16(28, 0, true);
      parts.push(local, name, data);

      const entry = new DataView(new ArrayBuffer(46));
      entry.setUint32(0, 0x02014b50, true); // central directory entry
      entry.setUint16(4, 20, true);
      entry.setUint16(6, 20, true);
      entry.setUint16(8, 0x0800, true);
      entry.setUint16(10, 0, true);
      entry.setUint16(12, time, true);
      entry.setUint16(14, date, true);
      entry.setUint32(16, crc, true);
      entry.setUint32(20, data.length, true);
      entry.setUint32(24, data.length, true);
      entry.setUint16(28, name.length, true);
      entry.setUint32(42, offset, true);
      central.push(entry, name);

      offset += 30 + name.length + data.length;
    }
    const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); // end of central directory
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  // ---- Reading a ZIP file ----
  // Finds anthology-backup.json inside, whether stored or compressed.

  async function readBackupFromZip(buffer) {
    const view = new DataView(buffer);
    let end = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end === -1) throw new Error("This file couldn't be read as a ZIP file.");
    const count = view.getUint16(end + 10, true);
    let pos = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (view.getUint32(pos, true) !== 0x02014b50) break;
      const method = view.getUint16(pos + 10, true);
      const size = view.getUint32(pos + 20, true);
      const nameLength = view.getUint16(pos + 28, true);
      const extraLength = view.getUint16(pos + 30, true);
      const commentLength = view.getUint16(pos + 32, true);
      const localOffset = view.getUint32(pos + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, pos + 46, nameLength));
      pos += 46 + nameLength + extraLength + commentLength;
      if (!/(^|\/)anthology-backup[^/]*\.json$/.test(name)) continue;

      const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const bytes = new Uint8Array(buffer, dataStart, size);
      if (method === 0) return decoder.decode(bytes);
      if (method === 8) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return decoder.decode(await new Response(stream).arrayBuffer());
      }
      throw new Error("The backup inside this ZIP file is in a form that can't be read. Unzip it and choose anthology-backup.json instead.");
    }
    throw new Error("This ZIP file doesn't contain an Anthology backup.");
  }

  return { buildFiles, makeZip, readBackupFromZip };
})();
