// search.js
// The search box: searches titles, note text, task list names and tasks, on
// both sides. Uses the shared state and helpers in app.js.

// ---- Search ----
// Searches titles, note text, task list names and tasks, across both sides.
// While there's text in the search box, results replace the folder list.

let searchText = '';

// A short piece of text around the first match, on one line.
function snippetAround(text, query) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const at = flat.toLowerCase().indexOf(query);
  const start = Math.max(0, at - 30);
  const end = Math.min(flat.length, (at === -1 ? 0 : at + query.length) + 60);
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '');
}

function searchMatches(rawQuery) {
  const query = rawQuery.toLowerCase();
  const folderName = id => folderPath(id) || null;
  const results = [];
  for (const note of state.notes) {
    if (!note.body.toLowerCase().includes(query)) continue;
    const title = noteTitle(note);
    const { rest } = splitNote(note.body);
    const inTitle = title.toLowerCase().includes(query);
    const snippet = rest.toLowerCase().includes(query) ? snippetAround(rest, query) : snippetAround(rest, '');
    results.push({ side: 'notes', item: note, title, inTitle, snippet, folder: folderName(note.folderId) });
  }
  for (const list of state.taskLists) {
    const inTitle = list.title.toLowerCase().includes(query);
    const task = tasksIn(list.id).find(t => t.text.toLowerCase().includes(query));
    if (!inTitle && !task) continue;
    results.push({
      side: 'tasks', item: list, title: SIDES.tasks.title(list), inTitle,
      snippet: task ? snippetAround(task.text, query) : '', folder: folderName(list.folderId),
    });
  }
  // Title matches first, then the most recently changed.
  results.sort((a, b) => (b.inTitle - a.inTitle) || (b.item.updatedAt - a.item.updatedAt));
  return results.slice(0, 100);
}

// Puts text into an element with each match wrapped in <mark>, safely (no HTML).
function highlight(target, text, query) {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let from = 0;
  for (let at = lower.indexOf(q); q && at !== -1; at = lower.indexOf(q, from)) {
    if (at > from) target.append(document.createTextNode(text.slice(from, at)));
    target.append(el('mark', null, text.slice(at, at + q.length)));
    from = at + q.length;
  }
  if (from < text.length) target.append(document.createTextNode(text.slice(from)));
}

// The search clears when you open a result, tap ×, press Escape, switch
// between Notes and Tasks, or start something new, so the sidebar goes back to
// your folders.
function clearSearch() {
  if (!searchText && !els.search.value) return;
  els.search.value = '';
  searchText = '';
  renderSearch();
}

function renderSearch() {
  const query = searchText.trim();
  const searching = query.length > 0;
  els.searchClear.hidden = !els.search.value;
  els.tree.hidden = searching;
  els.newItemTarget.hidden = searching;
  els.searchResults.hidden = !searching;
  els.searchNone.hidden = true;
  if (!searching) return;
  const results = searchMatches(query);
  els.searchNone.hidden = results.length > 0;
  els.searchResults.replaceChildren(...results.map(result => {
    const li = el('li', 'sidebar-item');
    if (result.side === state.side && result.item.id === view().currentId && !state.page) li.classList.add('is-current');
    const open = button('row search-result', undefined, undefined, () => openFromSearch(result));
    const title = el('span', 'item-title');
    highlight(title, result.title, query);
    open.append(title);
    if (result.snippet) {
      const snippet = el('span', 'search-snippet');
      highlight(snippet, result.snippet, query);
      open.append(snippet);
    }
    const kind = result.side === 'notes' ? 'Note' : 'Task list';
    open.append(el('span', 'search-meta', result.folder ? `${kind} · ${result.folder}` : kind));
    li.append(open);
    return li;
  }));
}

// Opens a result and shows it in its folder, with the search cleared.
async function openFromSearch(result) {
  clearSearch();
  if (result.side !== state.side) await setSide(result.side);
  if (result.item.folderId) view().openFolderIds.add(result.item.folderId);
  await openItem(result.item.id);
  renderSidebar();
}

// ---- Buttons and keys ----

function wireSearchEvents() {
  els.search.addEventListener('input', () => {
    searchText = els.search.value;
    renderSearch();
  });
  els.search.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearSearch();
  });

  els.searchClear.addEventListener('click', () => {
    clearSearch();
    els.search.focus();
  });
}
