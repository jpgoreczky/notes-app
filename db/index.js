require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const { Pool } = require('pg');
const { withVerifyFull } = require('./connection');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Run `neon env pull`.');

// Pooled connection string (-pooler) for app traffic; one pool reused across requests.
const pool = new Pool({ connectionString: withVerifyFull(process.env.DATABASE_URL), max: 10 });

pool.on('error', (error) => console.error('Postgres pool error:', error.message));

module.exports = { pool };
