const form = document.querySelector('#note-form');
const titleInput = document.querySelector('#title');
const bodyInput = document.querySelector('#body');
const noteIdInput = document.querySelector('#note-id');
const notesList = document.querySelector('#notes-list');
const message = document.querySelector('#message');
const summary = document.querySelector('#summary');

async function loadNotes() {
  const response = await fetch('/api/notes');
  const notes = await response.json();
  document.querySelector('#note-count').textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;
  notesList.innerHTML = notes.length ? notes.map(noteHtml).join('') : '<p class="empty">No notes yet. Write your first one above.</p>';
}

function noteHtml(note) {
  const tags = note.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  return `<article class="note"><h3>${escapeHtml(note.title)}</h3><p>${escapeHtml(note.body)}</p><div class="tags">${tags}</div><div class="note-footer"><span class="note-date">Updated ${new Date(note.updatedAt).toLocaleString()}</span><div class="note-actions"><button class="edit-link" onclick="editNote('${note.id}')">Edit</button><button class="delete-link" onclick="deleteNote('${note.id}')">Delete</button></div></div></article>`;
}

function escapeHtml(text) {
  return text.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = noteIdInput.value;
  const response = await fetch(id ? `/api/notes/${id}` : '/api/notes', {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: titleInput.value, body: bodyInput.value })
  });
  const result = await response.json();
  if (!response.ok) return showMessage(result.error);
  showMessage(`Saved! Smart tags: ${result.tags.join(', ')}`);
  resetForm();
  loadNotes();
});

document.querySelector('#summarize-button').addEventListener('click', async () => {
  const response = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: bodyInput.value }) });
  const result = await response.json();
  summary.textContent = `Summary: ${result.summary}`;
  summary.classList.remove('hidden');
});

async function editNote(id) {
  const response = await fetch('/api/notes');
  const notes = await response.json();
  const note = notes.find((item) => item.id === id);
  if (!note) return;
  noteIdInput.value = note.id; titleInput.value = note.title; bodyInput.value = note.body;
  document.querySelector('#form-title').textContent = 'Edit your note';
  document.querySelector('#cancel-button').classList.remove('hidden');
  titleInput.focus(); window.scrollTo(0, 0);
}

async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  await fetch(`/api/notes/${id}`, { method: 'DELETE' });
  loadNotes();
}

document.querySelector('#cancel-button').addEventListener('click', resetForm);
function resetForm() { form.reset(); noteIdInput.value = ''; document.querySelector('#form-title').textContent = 'Write a note'; document.querySelector('#cancel-button').classList.add('hidden'); summary.classList.add('hidden'); }
function showMessage(text) { message.textContent = text; setTimeout(() => { message.textContent = ''; }, 4000); }
loadNotes();