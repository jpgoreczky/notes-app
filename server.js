const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const dataFile = path.join(__dirname, 'data', 'notes.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readNotes() {
	const notes = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
	let changed = false;

	notes.forEach((note) => {
		if (!Array.isArray(note.tags) || note.tags.length === 0) {
			note.tags = generateTags(note.title, note.body);
			changed = true;
		}
		if (!note.summary) {
			note.summary = makeSummary(note.body);
			changed = true;
		}
	});

	if (changed) saveNotes(notes);
	return notes;
}

function saveNotes(notes) {
	fs.writeFileSync(dataFile, JSON.stringify(notes, null, 2));
}

function generateTags(title, body) {
	const text = `${title} ${body}`.toLowerCase();
	const possibleTags = {
		work: ['work', 'meeting', 'project', 'office', 'deadline'],
		personal: ['personal', 'home', 'family', 'friend'],
		ideas: ['idea', 'think', 'maybe', 'plan'],
		study: ['study', 'learn', 'school', 'book', 'research'],
		shopping: ['buy', 'shop', 'store', 'shopping', 'price'],
		travel: ['travel', 'trip', 'hotel', 'flight', 'visit'],
		writing: ['write', 'story', 'script', 'novel', 'character']
	};
	const tags = Object.keys(possibleTags).filter((tag) =>
		possibleTags[tag].some((word) => text.includes(word))
	);

	return tags.length ? tags : ['general'];
}

function makeSummary(body) {
	const cleanBody = body.replace(/\s+/g, ' ').trim();
	if (!cleanBody) return 'There is nothing to summarize yet.';
	const sentences = cleanBody.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleanBody];
	return sentences.slice(0, 2).join(' ').slice(0, 300);
}

app.get('/api/notes', (req, res) => {
	res.json(readNotes().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
});

app.post('/api/notes', (req, res) => {
	const title = String(req.body.title || '').trim();
	const body = String(req.body.body || '').trim();
	if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });

	const now = new Date().toISOString();
	const note = {
		id: crypto.randomUUID(),
		title,
		body,
		tags: generateTags(title, body),
		summary: makeSummary(body),
		createdAt: now,
		updatedAt: now
	};
	const notes = readNotes();
	notes.push(note);
	saveNotes(notes);
	res.status(201).json(note);
});

app.put('/api/notes/:id', (req, res) => {
	const notes = readNotes();
	const note = notes.find((item) => item.id === req.params.id);
	if (!note) return res.status(404).json({ error: 'Note not found.' });

	note.title = String(req.body.title || '').trim();
	note.body = String(req.body.body || '').trim();
	if (!note.title || !note.body) return res.status(400).json({ error: 'Title and body are required.' });
	note.tags = generateTags(note.title, note.body);
	note.summary = makeSummary(note.body);
	note.updatedAt = new Date().toISOString();
	saveNotes(notes);
	res.json(note);
});

app.delete('/api/notes/:id', (req, res) => {
	const notes = readNotes();
	const remainingNotes = notes.filter((note) => note.id !== req.params.id);
	if (remainingNotes.length === notes.length) return res.status(404).json({ error: 'Note not found.' });
	saveNotes(remainingNotes);
	res.status(204).end();
});

app.post('/api/summarize', (req, res) => {
	res.json({ summary: makeSummary(String(req.body.body || '')) });
});

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
	console.log(`Notes app is running at http://localhost:${port}`);
});
