require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const noteColumns = 'id, title, body, tags, summary, ai_generated, created_at, updated_at';

function toNote(row) {
	return {
		id: row.id,
		title: row.title,
		body: row.body,
		tags: row.tags,
		summary: row.summary,
		aiGenerated: row.ai_generated,
		createdAt: row.created_at.toISOString(),
		updatedAt: row.updated_at.toISOString()
	};
}

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

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

async function generateWithAI(title, body) {
	const fallback = {
		tags: generateTags(title, body),
		summary: makeSummary(body),
		aiGenerated: false
	};
	if (!process.env.GEMINI_API_KEY) return fallback;

	try {
		const request = {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					parts: [{
						text: `Read this note and return only valid JSON in this format: {"tags":["tag1"],"summary":"short summary"}. Choose 1 to 3 lowercase tags. Keep the summary under 300 characters.\nTitle: ${title}\nNote: ${body}`
					}]
				}]
			})
		};
		const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;
		let response = await fetch(url, request);
		if (response.status === 429 || response.status === 503) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			response = await fetch(url, request);
		}
		if (!response.ok) throw new Error(`Gemini API returned ${response.status}: ${(await response.text()).slice(0, 200)}`);

		const data = await response.json();
		const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
		const result = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '').trim());
		if (!Array.isArray(result.tags) || typeof result.summary !== 'string') throw new Error('Invalid Gemini response');

		return {
			tags: result.tags.map((tag) => String(tag).toLowerCase()).slice(0, 3),
			summary: result.summary.slice(0, 300),
			aiGenerated: true
		};
	} catch (error) {
		console.error('Gemini request failed, using local fallback:', error.message);
		return fallback;
	}
}

app.get('/api/notes', async (req, res) => {
	const { rows } = await pool.query(`SELECT ${noteColumns} FROM notes ORDER BY updated_at DESC`);
	res.json(rows.map(toNote));
});

app.post('/api/notes', async (req, res) => {
	const title = String(req.body.title || '').trim();
	const body = String(req.body.body || '').trim();
	if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });

	const generated = await generateWithAI(title, body);
	const { rows } = await pool.query(
		`INSERT INTO notes (id, title, body, tags, summary, ai_generated)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${noteColumns}`,
		[crypto.randomUUID(), title, body, generated.tags, generated.summary, generated.aiGenerated]
	);
	res.status(201).json(toNote(rows[0]));
});

app.put('/api/notes/:id', async (req, res) => {
	if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Note not found.' });
	const title = String(req.body.title || '').trim();
	const body = String(req.body.body || '').trim();
	if (!title || !body) return res.status(400).json({ error: 'Title and body are required.' });

	const existing = await pool.query('SELECT 1 FROM notes WHERE id = $1', [req.params.id]);
	if (existing.rowCount === 0) return res.status(404).json({ error: 'Note not found.' });

	const generated = await generateWithAI(title, body);
	const { rows } = await pool.query(
		`UPDATE notes SET title = $2, body = $3, tags = $4, summary = $5, ai_generated = $6, updated_at = now()
		 WHERE id = $1 RETURNING ${noteColumns}`,
		[req.params.id, title, body, generated.tags, generated.summary, generated.aiGenerated]
	);
	if (rows.length === 0) return res.status(404).json({ error: 'Note not found.' });
	res.json(toNote(rows[0]));
});

app.delete('/api/notes/:id', async (req, res) => {
	if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Note not found.' });
	const { rowCount } = await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
	if (rowCount === 0) return res.status(404).json({ error: 'Note not found.' });
	res.status(204).end();
});

app.get('/api/health', async (req, res) => {
	const { rows } = await pool.query('SELECT 1 AS ok');
	res.json({ database: rows[0].ok === 1 ? 'ok' : 'error' });
});

app.post('/api/summarize', async (req, res) => {
	const body = String(req.body.body || '');
	const generated = await generateWithAI('', body);
	res.json({ summary: generated.summary, aiGenerated: generated.aiGenerated });
});

app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
	console.error(error);
	res.status(500).json({ error: 'Internal server error.' });
});

app.listen(port, () => {
	console.log(`Notes app is running at http://localhost:${port}`);
});
