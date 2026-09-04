-- Base de conocimiento: documentos completos troceados e indexados en Vectorize (metadata kind='doc').
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT,                                -- telegram | url | drive | tool | photo
  mime TEXT,
  chars INTEGER NOT NULL DEFAULT 0,
  chunks INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active',      -- active | archived
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doc_chunks (
  id TEXT PRIMARY KEY,                        -- k_<doc>_<idx>
  doc_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc ON doc_chunks(doc_id, idx);

-- Herramientas creadas por el propio agente (peticiones HTTP declarativas).
CREATE TABLE IF NOT EXISTS dyn_tools (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  params_json TEXT NOT NULL,                  -- [{name, description, required}]
  request_json TEXT NOT NULL,                 -- {method, url, headers, body, extract, needs_confirmation}
  version INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Credenciales para APIs externas, cifradas con una clave derivada de ADMIN_TOKEN.
CREATE TABLE IF NOT EXISTS vault (
  name TEXT PRIMARY KEY,
  value_enc TEXT NOT NULL,
  created_at TEXT NOT NULL
);
