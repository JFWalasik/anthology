// tests/smoke-test.js
// A quick check of every feature, run in the test copy (localhost) while signed
// in. It clicks and types the way a person would, and reports what happened.
// It only touches items whose titles start with "TEST", and erases them at
// the end, on every device (from 1.1.1, with database script 005). Export
// and restore happen in memory: no file is saved, the "last export" date
// isn't changed, and "Replace everything" is never chosen.
//
// To run it, in the browser's console (or ask Claude) on http://localhost:8765:
//   await import('./tests/smoke-test.js?' + Date.now()); await smokeTest();
// Each line of the result starts with "ok" or "FAIL". Some things can't be
// checked this way and are done by hand: see docs/test-checklist.md.

window.smokeTest = async function smokeTest() {
  if (!['localhost', '127.0.0.1'].includes(location.hostname)) {
    throw new Error('The smoke test only runs on the test copy (localhost).');
  }

  // ---- Helpers ----

  const log = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const byId = id => document.getElementById(id);
  const check = (name, ok, detail = '') => log.push(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
  const same = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
      JSON.stringify(actual) === JSON.stringify(expected) ? '' : `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  const settle = () => sleep(250);

  async function waitFor(fn, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const value = fn();
      if (value) return value;
      await sleep(50);
    }
    return fn();
  }

  async function click(target) {
    const node = typeof target === 'string' ? $(target) : target;
    if (!node) throw new Error(`Nothing to click: ${target}`);
    node.click();
    await settle();
  }

  function type(input, value) {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  async function key(target, name) {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    await settle();
    return event.defaultPrevented;
  }

  const itemRowEl = title => $$('#tree .sidebar-item').find(r => r.querySelector('.item-title')?.textContent === title);
  const folderRowEl = name => $$('#tree .folder-row').find(r => r.querySelector('.folder-name')?.textContent === name);
  const isHidden = node => node.hidden || node.closest('[hidden]') !== null;

  // The labels of one sidebar level, e.g. ["F:Garden", "I:Shopping"], with 📌 for pinned.
  function levelLabels(list = byId('tree')) {
    return [...list.children].map(li => {
      if (li.classList.contains('folder')) {
        const row = li.querySelector('.folder-row');
        return `F:${row.querySelector('.pin-mark') ? '📌' : ''}${row.querySelector('.folder-name').textContent}`;
      }
      const row = li.querySelector('.sidebar-item');
      if (!row) return li.className || li.tagName;
      return `I:${row.querySelector('.pin-mark') ? '📌' : ''}${row.querySelector('.item-title').textContent}`;
    });
  }
  const testLabels = list => levelLabels(list).filter(label => label.includes('TEST'));

  async function menuChoose(opener, label) {
    await click(opener);
    const entry = $$('#menu button').find(b => b.textContent === label);
    if (!entry) throw new Error(`No "${label}" in the menu: ${$$('#menu button').map(b => b.textContent)}`);
    await click(entry);
  }

  async function answerConfirm(yes) {
    await waitFor(() => byId('confirm-dialog').open);
    const message = byId('confirm-message').textContent;
    await click(yes ? '#confirm-yes' : '#confirm-no');
    return message;
  }

  async function newFolder(name, opener = '#new-folder') {
    if (typeof opener === 'string') await click(opener);
    const input = await waitFor(() => $('#tree .folder-input'));
    type(input, name);
    await key(input, 'Enter');
    await settle();
  }

  async function newItem(title) {
    await click('#new-item');
    type(byId('title-input'), title);
    await settle();
  }

  async function openRow(title) {
    await click(itemRowEl(title).querySelector('button.row'));
  }

  async function setSideTo(name) {
    await click(`.side-toggle button[data-side="${name}"]`);
  }

  async function search(text) {
    type(byId('search'), text);
    await settle();
    return $$('#search-results li').map(li => ({
      title: li.querySelector('.item-title').textContent,
      marked: li.querySelector('mark')?.textContent ?? null,
      meta: li.querySelector('.search-meta').textContent,
    }));
  }

  function dragOnto(sourceRow, target) {
    const data = new DataTransfer();
    sourceRow.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: data }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    sourceRow.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: data }));
  }

  const noteByTitle = title => state.notes.find(n => noteTitle(n) === title);
  const listByTitle = title => state.taskLists.find(l => l.title === title);
  const folderByName = name => state.folders.find(f => f.name === name);
  const openTaskTexts = () => $$('#open-tasks .task-text').map(i => i.value);
  const doneTaskTexts = () => $$('#done-tasks .task-text').map(i => i.value);

  // A second connection to the database, signed in as the same person: it
  // checks what reached the database, and plays "another device".
  const db = supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  // The app's own alert() messages are collected instead of shown.
  const alerts = [];
  const realAlert = window.alert;
  window.alert = message => alerts.push(message);

  try {
    await run();
  } catch (err) {
    check('the test ran to the end', false, err.stack || String(err));
  } finally {
    window.alert = realAlert;
  }
  try {
    await cleanUp();
  } catch (err) {
    check('clean-up', false, String(err));
  }
  return log.join('\n');

  // ---- The checks ----

  async function run() {
    if (state.page) {
      state.page = null;
      render();
    }
    await setSideTo('notes');
    check('version shown in Settings', byId('about-version').textContent !== '', byId('about-version').textContent);
    check('signed in, email shown', byId('account-email').textContent.includes('@'));

    // Notes
    await newItem('TEST note A');
    same('new note: item pane shown', isHidden(byId('item-pane')), false);
    same('new note: delete label', byId('delete-item').textContent, 'Delete note');
    same('new note: title placeholder', byId('title-input').placeholder, 'Title');
    check('new note: appears in sidebar', Boolean(itemRowEl('TEST note A')));
    await sleep(700);
    same('note: save status after typing', byId('save-status').textContent, 'Saved');
    const movedDown = await key(byId('title-input'), 'Enter');
    check('Enter in title moves to body', movedDown && document.activeElement === byId('editor'));
    type(byId('editor'), 'First line\nzebrafish findme');
    await sleep(700);
    same('note body saved', noteByTitle('TEST note A').body, 'TEST note A\nFirst line\nzebrafish findme');
    await key(byId('editor'), 'Backspace');
    check('Backspace in a non-empty body stays in body', document.activeElement === byId('editor'));
    byId('editor').setSelectionRange(0, 0);
    await key(byId('editor'), 'ArrowUp');
    check('Up arrow at start of body moves to title', document.activeElement === byId('title-input'));

    await click('#new-item');
    const emptyCount = state.notes.length;
    await openRow('TEST note A');
    same('an empty new note is discarded on leaving it', state.notes.length, emptyCount - 1);

    await newItem('# TEST heading note');
    check('heading marks left out of the sidebar title', Boolean(itemRowEl('TEST heading note')));

    // Folders
    await newFolder('TEST folder 1');
    check('new folder appears', Boolean(folderRowEl('TEST folder 1')));
    same('new folder is open', folderRowEl('TEST folder 1').querySelector('button.row').getAttribute('aria-expanded'), 'true');
    same('target line names the folder', byId('new-item-target').textContent, 'New notes and folders go into TEST folder 1');
    check('empty folder says so', folderRowEl('TEST folder 1').closest('li').textContent.includes('No notes yet'));
    await newItem('TEST note in F1');
    same('new note goes into the open folder', noteByTitle('TEST note in F1').folderId, folderByName('TEST folder 1').id);
    same('folder menu above the note shows the folder', byId('item-folder').selectedOptions[0].textContent.trim(), 'TEST folder 1');
    same('folder count', folderRowEl('TEST folder 1').querySelector('.folder-count').textContent, '1');

    await menuChoose(folderRowEl('TEST folder 1').querySelector('.more-button'), 'New folder inside');
    await newFolder('TEST sub', null);
    check('folder inside a folder', Boolean(folderByName('TEST sub')) && folderByName('TEST sub').parentId === folderByName('TEST folder 1').id);
    same('target line shows the path', byId('new-item-target').textContent, 'New notes and folders go into TEST folder 1 › TEST sub');
    same('first level inside a folder indents 16px', folderRowEl('TEST sub').closest('ul').style.paddingLeft, '16px');

    await menuChoose(folderRowEl('TEST folder 1').querySelector('.more-button'), 'Rename');
    let input = await waitFor(() => $('#tree .folder-input'));
    same('rename starts with the old name', input.value, 'TEST folder 1');
    type(input, 'TEST nope');
    await key(input, 'Escape');
    check('Escape cancels a rename', Boolean(folderRowEl('TEST folder 1')));
    await menuChoose(folderRowEl('TEST folder 1').querySelector('.more-button'), 'Rename');
    input = await waitFor(() => $('#tree .folder-input'));
    type(input, 'TEST folder 1b');
    await key(input, 'Enter');
    await settle();
    check('rename with Enter', Boolean(folderRowEl('TEST folder 1b')));

    await click(folderRowEl('TEST folder 1b').querySelector('button.row'));
    same('clicking an open folder closes it', folderRowEl('TEST folder 1b').querySelector('button.row').getAttribute('aria-expanded'), 'false');
    // Known quirk (0.10): closing a folder only resets the target when the folder
    // itself is the target, so here new items still go into the hidden TEST sub.
    same('closing an outer folder keeps an inner target', byId('new-item-target').textContent, 'New notes and folders go into TEST folder 1b › TEST sub');
    await click(folderRowEl('TEST folder 1b').querySelector('button.row'));

    // Moving
    // Syncing can swap in fresh copies of records, so look the note up each time.
    const noteA = () => noteByTitle('TEST note A');
    const dateA = noteA().updatedAt;
    await click(itemRowEl('TEST note A').querySelector('.item-actions button:nth-child(2)'));
    same('Move window heading', byId('move-heading').textContent, 'Move "TEST note A" to…');
    const choices = $$('#move-list .move-choice').map(b => b.textContent);
    check('Move window lists top level (here now) and nested folders',
      choices[0] === 'Top level (here now)' && choices.includes('TEST folder 1b') && choices.includes('TEST sub'), choices.filter(c => /TEST|Top/.test(c)).join(', '));
    same('nested folder indented in Move window', $$('#move-list .move-choice').find(b => b.textContent === 'TEST sub').style.paddingLeft, '38px');
    await click($$('#move-list .move-choice').find(b => b.textContent === 'TEST sub'));
    same('note moved into nested folder', noteA().folderId, folderByName('TEST sub').id);
    same('moving keeps the edited date', noteA().updatedAt, dateA);

    await menuChoose(folderRowEl('TEST folder 1b').querySelector('.more-button'), 'Move to…');
    const folderChoices = $$('#move-list .move-choice').map(b => b.textContent);
    check('a folder can\'t be moved into itself or its folders', !folderChoices.some(c => c.startsWith('TEST folder 1b') || c.startsWith('TEST sub')));
    await click('#move-cancel');

    await openRow('TEST note A');
    byId('item-folder').value = '';
    byId('item-folder').dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    same('folder menu above the note moves it to top level', noteA().folderId ?? null, null);

    const canDrag = matchMedia('(hover: hover)').matches;
    check('this browser counts as a computer for dragging', canDrag);
    if (canDrag) {
      dragOnto(itemRowEl('TEST note A'), folderRowEl('TEST folder 1b'));
      await settle();
      same('dragging a note onto a folder moves it', noteA().folderId, folderByName('TEST folder 1b').id);
      dragOnto(itemRowEl('TEST note A'), byId('tree'));
      await settle();
      same('dragging onto empty sidebar space moves to top level', noteA().folderId ?? null, null);
      dragOnto(folderRowEl('TEST folder 1b'), folderRowEl('TEST sub'));
      await settle();
      same('a folder can\'t be dragged into its own folder', folderByName('TEST folder 1b').parentId ?? null, null);
    }

    // Pinning
    await newItem('TEST note B');
    await openRow('TEST note A');
    const dateBefore = noteA().updatedAt;
    await click(itemRowEl('TEST note A').querySelector('.item-actions button:nth-child(1)'));
    check('pinned note shows a pin mark', Boolean(itemRowEl('📌TEST note A') || itemRowEl('TEST note A')?.querySelector('.pin-mark')));
    same('pinning keeps the edited date', noteA().updatedAt, dateBefore);
    same('bar button says Unpin', byId('pin-item').textContent, 'Unpin');
    await menuChoose(folderRowEl('TEST folder 1b').querySelector('.more-button'), 'Pin');
    const top = levelLabels();
    const firstUnpinned = top.findIndex(l => !l.includes('📌'));
    check('pinned things come first', top.slice(firstUnpinned).every(l => !l.includes('📌')));
    check('pinned folder before pinned note', top.indexOf('F:📌TEST folder 1b') < top.indexOf('I:📌TEST note A') && top.indexOf('F:📌TEST folder 1b') !== -1, testLabels().join(', '));
    check('unpinned folders before unpinned items', top.slice(firstUnpinned).findIndex(l => l.startsWith('I:')) === -1
      || top.slice(firstUnpinned).findLastIndex(l => l.startsWith('F:')) < top.slice(firstUnpinned).findIndex(l => l.startsWith('I:')));
    await click('#pin-item');
    same('Unpin from the bar', noteA().pinned, false);
    await menuChoose(folderRowEl('TEST folder 1b').querySelector('.more-button'), 'Unpin');
    same('Unpin a folder from the menu', Boolean(folderByName('TEST folder 1b').pinned), false);

    // Search
    let results = await search('zebrafish');
    same('search finds note text', results.map(r => r.title), ['TEST note A']);
    check('search hides the folder list', isHidden(byId('tree')) && !isHidden(byId('search-results')));
    same('search result meta', results[0]?.meta, 'Note');
    same('search highlights the match', $('#search-results .search-snippet mark')?.textContent, 'zebrafish');
    await key(byId('search'), 'Escape');
    check('Escape clears search', byId('search').value === '' && !isHidden(byId('tree')));
    results = await search('TEST note in');
    same('search result in a folder shows the path', results[0]?.meta, 'Note · TEST folder 1b');
    same('search highlights a title match', results[0]?.marked, 'TEST note in');
    await click('#search-clear');
    check('× clears search', byId('search').value === '' && isHidden(byId('search-clear')));
    await search('qqzzxxq');
    check('no matches message', !isHidden(byId('search-none')));
    await search('zebrafish');
    await click('#search-results button.row');
    check('opening a result clears search and opens it', byId('search').value === '' && currentItem()?.id === noteA().id);

    // Tasks
    await setSideTo('tasks');
    check('Tasks side', document.body.classList.contains('side-tasks') && byId('new-item').textContent === 'New task list');
    await newItem('TEST list');
    same('list title placeholder', byId('title-input').placeholder, 'Task list name');
    same('list delete label', byId('delete-item').textContent, 'Delete list');
    await key(byId('title-input'), 'Enter');
    check('Enter in list title goes to Add a task', document.activeElement === byId('add-task'));
    for (const text of ['alpha', 'beta', 'gamma']) {
      type(byId('add-task'), text);
      await key(byId('add-task'), 'Enter');
    }
    await settle();
    same('tasks added in order', openTaskTexts(), ['alpha', 'beta', 'gamma']);
    check('Add a task cleared and kept focus', byId('add-task').value === '' && document.activeElement === byId('add-task'));
    const alphaInput = () => $$('#open-tasks .task-text').find(i => i.value === 'alpha');
    alphaInput().focus();
    await key(alphaInput(), 'Enter');
    await settle();
    same('Enter in a task adds one below', openTaskTexts(), ['alpha', '', 'beta', 'gamma']);
    check('the new task has focus', document.activeElement === $$('#open-tasks .task-text')[1]);
    await key($$('#open-tasks .task-text')[1], 'Backspace');
    await settle();
    same('Backspace in an empty task removes it', openTaskTexts(), ['alpha', 'beta', 'gamma']);
    check('focus goes to the task above', document.activeElement === alphaInput());

    const rowFor = text => $$('#open-tasks .task, #done-tasks .task').find(li => li.querySelector('.task-text').value === text);
    check('first task has no up arrow', rowFor('alpha').querySelector('.move-up').style.visibility === 'hidden');
    await click(rowFor('alpha').querySelector('.move-down'));
    same('Move down', openTaskTexts(), ['beta', 'alpha', 'gamma']);
    await click(rowFor('alpha').querySelector('.move-up'));
    same('Move up', openTaskTexts(), ['alpha', 'beta', 'gamma']);

    const betaCheck = rowFor('beta').querySelector('input[type="checkbox"]');
    betaCheck.checked = true;
    betaCheck.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    same('ticked task moves to Completed', [openTaskTexts(), doneTaskTexts()], [['alpha', 'gamma'], ['beta']]);
    same('Completed count', byId('completed-count').textContent, 'Completed (1)');
    await click('#completed-toggle');
    check('Hide completed', isHidden(byId('done-tasks')) && byId('completed-toggle').textContent === 'Show');
    await click('#completed-toggle');
    check('Show completed', !isHidden(byId('done-tasks')) && byId('completed-toggle').textContent === 'Hide');

    await click(rowFor('gamma').querySelector('.item-actions .danger'));
    same('deleted task gone', openTaskTexts(), ['alpha']);
    check('Undo message shows', !byId('toast').hidden && byId('toast-text').textContent === 'Task deleted');
    await click('#toast-undo');
    await waitFor(() => openTaskTexts().includes('gamma'));
    same('Undo brings the task back', openTaskTexts(), ['alpha', 'gamma']);

    await menuChoose(rowFor('gamma').querySelector('.more-button'), 'Move up');
    same('⋯ menu Move up on a task', openTaskTexts(), ['gamma', 'alpha']);
    const menuLabels = async text => {
      await click(rowFor(text).querySelector('.more-button'));
      const labels = $$('#menu button').map(b => b.textContent);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return labels;
    };
    same('first task ⋯ menu', await menuLabels('gamma'), ['Move down', 'Delete']);
    check('Escape closes the menu', byId('menu').hidden);

    type(byId('add-task'), 'blankme');
    await key(byId('add-task'), 'Enter');
    const blank = $$('#open-tasks .task-text').find(i => i.value === 'blankme');
    type(blank, '');
    blank.dispatchEvent(new Event('blur'));
    await settle();
    check('a task emptied and left is removed', !state.tasks.some(t => t.text === 'blankme' || (t.text === '' && t.listId === listByTitle('TEST list').id)));

    results = await search('gamma');
    same('search finds a task, on the other side', results.find(r => r.title === 'TEST list')?.meta, 'Task list');
    await click('#search-clear');

    await click('#delete-item');
    same('delete list confirmation', await answerConfirm(false),
      'Are you sure you want to delete the task list "TEST list" and its 3 tasks? You can restore it from Recently deleted for 30 days.');
    check('Cancel keeps the list', Boolean(listByTitle('TEST list')));

    await setSideTo('notes');
    same('each side remembers its open item', currentItem()?.id, noteA().id);

    // Recently deleted
    const trashBefore = Storage.listTrash().length;
    await openRow('TEST note B');
    await click('#delete-item');
    same('delete note confirmation', await answerConfirm(true),
      'Are you sure you want to delete "TEST note B"? You can restore it from Recently deleted for 30 days.');
    check('deleted note leaves the sidebar', !itemRowEl('TEST note B'));
    same('Recently deleted count goes up', byId('trash-count').textContent, String(trashBefore + 1));
    await click('#trash-link');
    check('Recently deleted page opens', !isHidden(byId('trash-pane')));
    const trashRow = title => $$('#trash-list .trash-item').find(li => li.querySelector('.trash-title').textContent === title);
    check('deleted note listed with details', /^Note · deleted .+ · 30 days left$/.test(trashRow('TEST note B')?.querySelector('.trash-details').textContent || ''),
      trashRow('TEST note B')?.querySelector('.trash-details').textContent);
    await click(trashRow('TEST note B').querySelector('.link'));
    check('Restore brings it back', Boolean(noteByTitle('TEST note B')) && !trashRow('TEST note B'));
    await click('#trash-empty');
    same('Empty asks first', await answerConfirm(false), 'Delete everything in Recently deleted now? There is no way to retrieve this.');
    await click('#trash-back');

    // Folder delete and restore, with things inside
    await menuChoose(folderRowEl('TEST folder 1b').querySelector('.more-button'), 'Delete');
    same('delete folder confirmation', await answerConfirm(true),
      'Are you sure you want to delete the folder "TEST folder 1b", with 1 folder and 1 note inside? You can restore it from Recently deleted for 30 days.');
    check('folder and its note gone', !folderByName('TEST folder 1b') && !folderByName('TEST sub') && !noteByTitle('TEST note in F1'));
    await click('#trash-link');
    same('deleted folder details', trashRow('TEST folder 1b')?.querySelector('.trash-details').textContent.replace(/deleted .+? ·/, 'deleted … ·'),
      'Folder · with 1 folder and 1 note · deleted … · 30 days left');
    await click(trashRow('TEST folder 1b').querySelector('.link'));
    check('restoring a folder brings back its folders and notes', Boolean(folderByName('TEST folder 1b') && folderByName('TEST sub') && noteByTitle('TEST note in F1')));
    await click('#trash-back');

    // Settings, shared links
    await click('#settings-link');
    check('Settings page opens', !isHidden(byId('settings-pane')) && byId('settings-link').classList.contains('is-current'));
    await click('#open-links');
    check('Shared links page opens', !isHidden(byId('links-pane')));
    await waitFor(() => byId('links-message').textContent !== 'Loading…', 8000);
    check('Shared links loaded', byId('links-message').textContent !== 'Loading…', byId('links-message').textContent || `${$$('#links-list li').length} links`);
    await click('#links-back');
    check('back to Settings', !isHidden(byId('settings-pane')));
    await click('#settings-pane .page-back');
    check('Back closes Settings', state.page === null);

    // Sharing
    await openRow('TEST note A');
    await click('#share-item');
    check('Share panel opens', byId('share-dialog').open);
    same('Share heading', byId('share-heading').textContent, 'Share this note');
    await waitFor(() => byId('share-url').value.includes('#share='), 10000);
    check('view link made', byId('share-url').value.includes('#share='), byId('share-message').textContent);
    const viewUrl = byId('share-url').value;
    check('view explanation', byId('share-explain').textContent.includes('view-only'));
    const editRadio = $('input[name="share-mode"][value="edit"]');
    editRadio.checked = true;
    editRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => byId('share-url').value.includes('#share=') && byId('share-url').value !== viewUrl, 10000);
    check('edit link is different', byId('share-url').value !== viewUrl && byId('share-url').value.includes('#share='));
    check('edit explanation', byId('share-explain').textContent.includes('can change this note'));
    const editUrl = byId('share-url').value;
    await click('#share-new');
    await waitFor(() => byId('share-message').textContent !== '', 10000);
    same('Make a new link', byId('share-message').textContent, 'New link made. The old link no longer works.');
    check('new link differs', byId('share-url').value !== editUrl);
    const newEditUrl = byId('share-url').value;
    await click('#share-close');
    check('Done closes the Share panel', !byId('share-dialog').open);

    // The shared page, opened in a small frame as if by someone else.
    const viewDoc = await openFrame(viewUrl);
    await waitFor(() => viewDoc().getElementById('viewer-title')?.textContent, 10000);
    same('view link shows the title', viewDoc().getElementById('viewer-title').textContent, 'TEST note A');
    check('view link shows the text', viewDoc().getElementById('viewer-body').textContent.includes('zebrafish'));
    check('view link can\'t be changed', !viewDoc().querySelector('#viewer-body textarea, #viewer-body input'));
    same('view link footer', viewDoc().getElementById('viewer-footer').textContent,
      'Shared from Anthology. This is a read-only copy; only its owner can change it.');
    closeFrame();

    const oldEditDoc = await openFrame(editUrl);
    await waitFor(() => !oldEditDoc().getElementById('viewer-missing').hidden, 10000);
    same('the replaced edit link no longer works', oldEditDoc().getElementById('viewer-missing').textContent,
      "This link isn't available. It may have been turned off, or the item deleted.");
    closeFrame();

    const editDoc = await openFrame(newEditUrl);
    const editor = await waitFor(() => editDoc().querySelector('#viewer-body textarea'), 10000);
    check('edit link shows an editable note', Boolean(editor));
    same('edit link footer', editDoc().getElementById('viewer-footer').textContent,
      'Shared from Anthology. Anyone with this link can make changes.');
    if (editor) {
      editor.value = 'First line\nzebrafish findme\nTEST edited through the link';
      editor.dispatchEvent(new (frameWindow().Event)('input', { bubbles: true }));
      await waitFor(() => editDoc().getElementById('viewer-status').textContent === 'Saved', 10000);
      same('the edit link saves', editDoc().getElementById('viewer-status').textContent, 'Saved');
    }
    closeFrame();
    await openRow('TEST note B');
    await Storage.sync();
    await waitFor(() => noteA().body.includes('edited through the link'), 20000);
    check('the owner gets the change made through the link', noteA().body.includes('edited through the link'));

    // Turning links off: in the Share panel, then on the Shared links page.
    await openRow('TEST note A');
    await click('#share-item');
    await waitFor(() => byId('share-url').value.includes('#share='), 10000);
    await click('#share-off');
    await waitFor(() => byId('share-message').textContent !== '', 10000);
    same('Turn off link', byId('share-message').textContent, 'Link turned off. Choose Share again to make a new one.');
    await click('#share-close');
    const offDoc = await openFrame(viewUrl);
    await waitFor(() => !offDoc().getElementById('viewer-missing').hidden, 10000);
    check('a turned-off link no longer works', !offDoc().getElementById('viewer-missing').hidden);
    closeFrame();

    await click('#settings-link');
    await click('#open-links');
    const linkRows = () => $$('#links-list .trash-item').filter(li => li.querySelector('.trash-title').textContent === 'TEST note A');
    await waitFor(() => linkRows().length > 0, 8000);
    same('Shared links lists the edit link', linkRows().map(li => li.querySelector('.trash-details').textContent.replace(/shared .+$/, 'shared …')),
      ['Note · can edit · shared …']);
    await click(linkRows()[0].querySelector('.danger'));
    await waitFor(() => linkRows().length === 0, 8000);
    check('Turn off on the Shared links page', linkRows().length === 0);
    await click('#links-pane .page-back');

    // Export, then restore what's missing
    let savedBlob = null;
    let savedName = null;
    let recorded = false;
    const realSave = window.showSaveFilePicker;
    const realOpen = window.showOpenFilePicker;
    const realRecord = Storage.recordExport;
    window.showSaveFilePicker = async options => {
      savedName = options.suggestedName;
      return { createWritable: async () => ({ write: async blob => { savedBlob = blob; }, close: async () => {} }) };
    };
    Storage.recordExport = async () => { recorded = true; };
    try {
      await click('#settings-link');
      await click('#export-everything');
      await waitFor(() => recorded, 8000);
      check('export file name', /^anthology-export-\d{4}-\d\d-\d\d-\d{4}\.zip$/.test(savedName || ''), savedName);
      check('export records the date', recorded);
      const names = zipNames(new Uint8Array(await savedBlob.arrayBuffer()));
      check('export has the note as Markdown', names.some(n => n.endsWith('TEST note A.md')), names.filter(n => n.includes('TEST')).join(', '));
      check('export has the nested folder path', names.some(n => n.includes('TEST folder 1b/TEST sub/') || n.includes('TEST folder 1b/')));
      check('export has the task list', names.some(n => n.endsWith('TEST list.md')));
      check('export has the backup file', names.some(n => n.endsWith('.json')));

      // Erase TEST note B for good, then add it back from the export.
      await click('#settings-pane .page-back');
      await openRow('TEST note B');
      const noteBId = currentItem().id;
      await click('#delete-item');
      await answerConfirm(true);
      await click('#trash-link');
      await click(trashRow('TEST note B').querySelector('.danger'));
      same('Delete now asks first', await answerConfirm(true), 'Delete "TEST note B" now? There is no way to retrieve this.');
      check('Delete now erases it', !trashRow('TEST note B'));
      await Storage.sync();
      const { data: erasedRows } = await db.from('notes').select('body,deleted,erased').eq('id', noteBId);
      same('Delete now leaves a blank erased placeholder in the database', erasedRows, [{ body: '', deleted: true, erased: true }]);

      window.showOpenFilePicker = async () => [{ getFile: async () => new File([savedBlob], savedName, { type: 'application/zip' }) }];
      await click('#settings-link');
      await click('#restore-backup');
      await waitFor(() => byId('restore-dialog').open);
      check('restore window shows what the backup has', /^This backup has \d+ notes?, \d+ task lists? and \d+ folders?\.$/.test(byId('restore-summary').textContent), byId('restore-summary').textContent);
      await click('#restore-add');
      await waitFor(() => alerts.length > 0, 8000);
      same('Add what\'s missing adds only the erased note', alerts.at(-1), 'Added 1 note from the backup. Everything else was left as it is.');
      check('the note is back', Boolean(noteByTitle('TEST note B')));
      await Storage.sync();
      const { data: backRows } = await db.from('notes').select('deleted,erased').eq('id', noteBId);
      same('the restored note is back in the database', backRows, [{ deleted: false, erased: false }]);
      await click('#restore-backup');
      await waitFor(() => byId('restore-dialog').open);
      await click('#restore-cancel');
      check('restore can be cancelled', !byId('restore-dialog').open);
    } finally {
      window.showSaveFilePicker = realSave;
      window.showOpenFilePicker = realOpen;
      Storage.recordExport = realRecord;
    }

    // Export reminder (with made-up dates; nothing saved)
    const realInfo = Storage.exportInfo;
    const realSnooze = Storage.snoozeReminder;
    let snoozed = false;
    Storage.exportInfo = async () => ({ lastExportAt: Date.now() - 200 * 86400000, createdAt: 0, snoozedUntil: 0 });
    Storage.snoozeReminder = async () => { snoozed = true; };
    try {
      await renderReminder();
      check('reminder shows when an export is due', !byId('reminder').hidden);
      await click('#reminder-later');
      check('Not now hides it and snoozes', byId('reminder').hidden && snoozed);
    } finally {
      Storage.exportInfo = realInfo;
      Storage.snoozeReminder = realSnooze;
      await renderReminder();
    }
    await click('#settings-pane .page-back');

    // Erasing on another device reaches this one: the "other device" here
    // writes an erased placeholder straight to the database.
    await newItem('TEST erased elsewhere');
    const elsewhere = { ...noteByTitle('TEST erased elsewhere') };
    await openRow('TEST note B');
    await Storage.sync();
    const { data: liveRows } = await db.from('notes').select('id').eq('id', elsewhere.id);
    same('a new note reaches the database', liveRows?.length, 1);
    const { error: eraseError } = await db.from('notes').upsert({
      id: elsewhere.id, folder_id: null, body: '', pinned: false, created_at: elsewhere.createdAt,
      updated_at: Date.now(), deleted: true, erased: true,
    });
    check('the other device erases it', !eraseError, eraseError?.message);
    await Storage.sync();
    await waitFor(() => !noteByTitle('TEST erased elsewhere'), 8000);
    check('a note erased on another device disappears here',
      !noteByTitle('TEST erased elsewhere') && !Storage.listTrash().some(e => e.record.id === elsewhere.id));

    // The access screen (shown, then put back; nothing sent)
    showAccess('TEST message');
    check('access screen shows', !isHidden(byId('access')) && isHidden(byId('layout')) && byId('access-message').textContent === 'TEST message');
    check('access screen starts with the email form', !byId('access-email-form').hidden && byId('access-code-form').hidden);
    same('access messages are plain', accessProblem({ message: 'Token has expired or is invalid' }),
      navigator.onLine ? "That code didn't work. It may have expired; you can send a new one." : "You're offline. Connect to the internet to get in.");
    document.body.classList.remove('signed-out');
    byId('access').hidden = true;
    byId('layout').hidden = false;
  }

  // A small frame showing a shared link, the way someone else would see it.
  async function openFrame(url) {
    closeFrame();
    const frame = el('iframe');
    frame.id = 'smoke-frame';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:420px;height:320px;z-index:9999;border:2px solid #888;background:#fff';
    frame.src = url;
    document.body.append(frame);
    await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    return () => frame.contentDocument;
  }

  function frameWindow() {
    return byId('smoke-frame').contentWindow;
  }

  function closeFrame() {
    byId('smoke-frame')?.remove();
  }

  // Lists the file names inside a ZIP.
  function zipNames(bytes) {
    const view = new DataView(bytes.buffer);
    const names = [];
    for (let at = 0; at + 30 < bytes.length;) {
      if (view.getUint32(at, true) !== 0x04034b50) break;
      const size = view.getUint32(at + 18, true);
      const nameLength = view.getUint16(at + 26, true);
      const extraLength = view.getUint16(at + 28, true);
      names.push(new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength)));
      at += 30 + nameLength + extraLength + size;
    }
    return names;
  }

  // Deletes every TEST item and folder, then erases them from Recently deleted.
  async function cleanUp() {
    closeFrame();
    for (const dialog of $$('dialog[open]')) dialog.close();
    state.page = null;
    const testIds = new Set([...state.notes.filter(n => noteTitle(n).startsWith('TEST')), ...state.taskLists.filter(l => l.title.startsWith('TEST'))].map(i => i.id));
    try {
      for (const link of await Storage.listShareLinks()) {
        if (testIds.has(link.item_id)) await Storage.turnOffShareLink(link.token);
      }
    } catch (err) {
      check('clean-up: TEST share links turned off', false, String(err));
    }
    for (const name of ['notes', 'tasks']) {
      await setSideTo(name);
      for (const item of side().items().filter(i => side().title(i).startsWith('TEST'))) {
        view().currentId = null;
        await removeItem(item);
      }
    }
    for (const folder of state.folders.filter(f => f.name.startsWith('TEST') && !(f.parentId && findFolder(f.parentId)))) {
      await flushSaves();
      state.folders = state.folders.filter(f => !descendantIds(folder.id).includes(f.id));
      await runSave(() => Storage.deleteFolder(folder.id));
    }
    for (const entry of Storage.listTrash()) {
      const title = trashTitle(entry);
      const fromTest = entry.kind === 'tasks' ? entry.parentName?.startsWith('TEST') : title.startsWith('TEST');
      if (fromTest) await Storage.eraseForever(entry.kind, entry.record.id);
    }
    await setSideTo('notes');
    savePrefs();
    render();
    const left = [...state.notes.map(noteTitle), ...state.taskLists.map(l => l.title), ...state.folders.map(f => f.name),
      ...Storage.listTrash().map(trashTitle)].filter(t => t.startsWith('TEST'));
    check('clean-up removed every TEST item here', left.length === 0, left.join(', '));

    // In the database, everything the test made should now be an erased
    // placeholder, so other devices remove it too.
    await Storage.sync();
    const notErased = [];
    for (const [table, field] of [['notes', 'body'], ['task_lists', 'title'], ['folders', 'name']]) {
      const { data, error } = await db.from(table).select(`id,${field}`).eq('erased', false)
        .or(`${field}.like.TEST%,${field}.like.# TEST%`);
      if (error) notErased.push(`${table}: ${error.message}`);
      else notErased.push(...data.map(row => `${table}: ${row[field].split('\n')[0]}`));
    }
    check('clean-up erased every TEST item in the database', notErased.length === 0, notErased.join(', '));
  }
};
