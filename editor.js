// editor.js
// Typing in the title of a note or task list, and in a note's body. A note is
// stored as one piece of text; its first line shows in the title field and the
// rest in the body. Kept separate so a rich-text editor can replace it later.
// Uses the shared state and helpers in app.js.

function handleTitleInput() {
  const item = currentItem();
  if (!item) return;
  if (state.side === 'notes') {
    item.body = joinNote(els.titleInput.value, els.editor.value);
  } else {
    item.title = els.titleInput.value;
  }
  item.updatedAt = Date.now();
  setStatus('');
  saveItemSoon(item);
  renderSidebar();
}

// ---- Buttons and keys ----

function wireEditorEvents() {
  els.titleInput.addEventListener('input', handleTitleInput);
  els.editor.addEventListener('input', handleTitleInput);

  // Enter in the title moves down to the note body, or to "Add a task".
  els.titleInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (state.side === 'notes') {
      els.editor.focus();
      els.editor.setSelectionRange(0, 0);
    } else {
      els.addTask.focus();
    }
  });
  // Backspace in an empty note body, or the up arrow at its very start, moves
  // back up to the title.
  els.editor.addEventListener('keydown', event => {
    const atStart = els.editor.selectionStart === 0 && els.editor.selectionEnd === 0;
    if ((event.key === 'Backspace' && els.editor.value === '') || (event.key === 'ArrowUp' && atStart)) {
      event.preventDefault();
      els.titleInput.focus();
    }
  });
}
