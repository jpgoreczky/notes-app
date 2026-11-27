CREATE TABLE IF NOT EXISTS notes (
	id uuid PRIMARY KEY,
	title text NOT NULL,
	body text NOT NULL,
	tags text[] NOT NULL DEFAULT '{}',
	summary text NOT NULL DEFAULT '',
	ai_generated boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at DESC);
