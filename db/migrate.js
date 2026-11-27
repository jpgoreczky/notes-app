// Applies db/schema.sql and imports data/notes.json once (if the table is empty).
// Uses the direct (unpooled) connection, as recommended for schema changes.
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { withVerifyFull } = require('./connection');

async function main() {
	const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL_UNPOOLED is not set. Run `neon env pull`.');

	const client = new Client({ connectionString: withVerifyFull(connectionString) });
	await client.connect();
	try {
		await client.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
		console.log('Schema applied.');

		const { rows } = await client.query('SELECT count(*)::int AS count FROM notes');
		const seedFile = path.join(__dirname, '..', 'data', 'notes.json');
		if (rows[0].count === 0 && fs.existsSync(seedFile)) {
			const notes = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
			await client.query('BEGIN');
			for (const note of notes) {
				await client.query(
					`INSERT INTO notes (id, title, body, tags, summary, ai_generated, created_at, updated_at)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
					[note.id, note.title, note.body, note.tags || ['general'], note.summary || '',
						Boolean(note.aiGenerated), note.createdAt, note.updatedAt]
				);
			}
			await client.query('COMMIT');
			console.log(`Imported ${notes.length} notes from data/notes.json.`);
		} else {
			console.log(`Notes table has ${rows[0].count} rows; skipping import.`);
		}
	} finally {
		await client.end();
	}
}

main().catch((error) => {
	console.error('Migration failed:', error.message);
	process.exit(1);
});
