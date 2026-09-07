CREATE TABLE IF NOT EXISTS user_preferences (
  email TEXT PRIMARY KEY,
  accent TEXT NOT NULL DEFAULT '#8b7cf6',
  updated_at TEXT NOT NULL
);
