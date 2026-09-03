-- Secretario: esquema inicial. Nada se borra físicamente sin confirmación: las tablas usan estados.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Memoria semántica y episódica. El vector vive en Vectorize con el mismo id.
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'fact',          -- fact | preference | person | project | episode | lesson
  content TEXT NOT NULL,
  source TEXT,                                -- chat | learn | heartbeat | tool
  importance INTEGER NOT NULL DEFAULT 3,      -- 1..5
  status TEXT NOT NULL DEFAULT 'active',      -- active | archived (nunca se borra sin confirmar)
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status, kind);

-- Habilidades: procedimientos que el agente aprende y mejora.
CREATE TABLE IF NOT EXISTS skills (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  procedure TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Lecciones a partir del feedback del usuario.
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  context TEXT,
  sentiment TEXT NOT NULL DEFAULT 'neutral',  -- positive | negative | neutral
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

-- Tareas programadas: recordatorios y trabajos del agente.
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'reminder',      -- reminder | agent
  instruction TEXT NOT NULL,
  due_at TEXT NOT NULL,
  cron TEXT,                                  -- si existe, se reprograma tras ejecutar
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | done | cancelled | failed
  last_run_at TEXT,
  last_result TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(status, due_at);

-- Uso diario por proveedor y modelo. Sirve para no agotar el nivel gratuito.
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  neurons REAL NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider, model)
);

-- Recibos para no repetir avisos (correos, eventos, updates de Telegram).
CREATE TABLE IF NOT EXISTS receipts (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- Auditoría de acciones externas y confirmaciones.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Resúmenes diarios de conversación (memoria episódica).
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  day TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO settings(key, value) VALUES ('initialized_at', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
