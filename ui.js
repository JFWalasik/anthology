// ui.js
// Pieces used by several features: the ⋯ menu, the "Move to…" window and the
// confirmation window. Uses the shared state and helpers in app.js.

// ---- The ⋯ menu ----
// Touch screens have no hover, so rows show a ⋯ button that opens this menu
// with the same choices the hover buttons offer.

function moreButton(label, choices) {
  return button('more-button', '⋯', label, event => {
    event.stopPropagation();
    openMenu(event.currentTarget, choices);
  });
}

function openMenu(opener, choices) {
  closeMenu();
  const entries = choices.map(choice => {
    const entry = button(choice.danger ? 'danger' : '', choice.label, undefined, () => {
      closeMenu();
      choice.run();
    });
    entry.setAttribute('role', 'menuitem');
    return entry;
  });
  els.menu.replaceChildren(...entries);
  els.menu.hidden = false;

  // Place it under the ⋯ button, kept inside the screen.
  const at = opener.getBoundingClientRect();
  const size = els.menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(at.right - size.width, innerWidth - size.width - 8));
  let top = at.bottom + 4;
  if (top + size.height > innerHeight - 8) top = Math.max(8, at.top - size.height - 4);
  els.menu.style.left = `${left}px`;
  els.menu.style.top = `${top}px`;
  entries[0]?.focus();
}

function closeMenu() {
  if (els.menu.hidden) return;
  els.menu.hidden = true;
  els.menu.replaceChildren();
}

// The "Move to…" window: every folder, indented to show the nesting.
function openMoveDialog(what, title) {
  els.moveHeading.textContent = `Move "${title}" to…`;
  const blocked = new Set(what.kind === 'folder' ? descendantIds(what.id) : []);
  const here = what.kind === 'folder'
    ? findFolder(what.id).parentId || null
    : side().items().find(i => i.id === what.id).folderId || null;
  const choices = [];
  const addChoice = (label, folderId, depth) => {
    const li = el('li');
    const choice = button('move-choice', label, undefined, async () => {
      els.moveDialog.close();
      await moveThing(what, folderId);
    });
    choice.style.paddingLeft = `${10 + totalIndent(depth)}px`;
    if (folderId === here) {
      choice.classList.add('is-here');
      choice.append(el('span', 'move-here', ' (here now)'));
    }
    li.append(choice);
    choices.push(li);
  };
  addChoice('Top level', null, 0);
  const walk = (parentId, depth) => {
    for (const folder of childFolders(parentId)) {
      if (blocked.has(folder.id)) continue;
      addChoice(folder.name, folder.id, depth);
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 1);
  els.moveList.replaceChildren(...choices);
  els.moveDialog.showModal();
}

// ---- The app's own confirmation window ----
// Used for deleting, so it can say "Yes, delete" rather than just "OK".
// Resolves to true for yes, false for Cancel.

function askConfirm(message, yesLabel = 'Yes, delete') {
  els.confirmMessage.textContent = message;
  els.confirmYes.textContent = yesLabel;
  els.confirmDialog.showModal();
  return new Promise(resolve => {
    const finish = answer => {
      els.confirmDialog.close();
      els.confirmYes.removeEventListener('click', yes);
      els.confirmNo.removeEventListener('click', no);
      els.confirmDialog.removeEventListener('cancel', no);
      resolve(answer);
    };
    const yes = () => finish(true);
    const no = () => finish(false);
    els.confirmYes.addEventListener('click', yes);
    els.confirmNo.addEventListener('click', no);
    els.confirmDialog.addEventListener('cancel', no);
    els.confirmNo.focus();
  });
}

// ---- Buttons and keys ----

function wireUiEvents() {
  const byId = id => document.getElementById(id);

  byId('move-cancel').addEventListener('click', () => els.moveDialog.close());

  // The ⋯ menu closes on a tap elsewhere, Escape, scrolling or resizing.
  document.addEventListener('pointerdown', event => {
    if (!els.menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('scroll', closeMenu, true);
  window.addEventListener('resize', closeMenu);
}
