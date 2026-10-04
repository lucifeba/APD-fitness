CREATE TABLE IF NOT EXISTS delegate_kpi_imports (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('planning','report')),
  period TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  delegates_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS delegate_kpi_imports_period
ON delegate_kpi_imports(period,kind,imported_at DESC);

CREATE TABLE IF NOT EXISTS delegate_kpi_rows (
  import_id TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  activity_date TEXT NOT NULL,
  delegate_key TEXT NOT NULL,
  delegate TEXT NOT NULL,
  client_key TEXT NOT NULL,
  pharmacy TEXT NOT NULL,
  nif TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  classification TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  effective INTEGER,
  order_done TEXT NOT NULL DEFAULT '',
  accompanied TEXT NOT NULL DEFAULT '',
  visit_time TEXT NOT NULL DEFAULT '',
  conclusions TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  growth_proposal TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(import_id,row_number)
);

CREATE INDEX IF NOT EXISTS delegate_kpi_rows_lookup
ON delegate_kpi_rows(import_id,delegate_key,activity_date,client_key);

CREATE TABLE IF NOT EXISTS delegate_kpi_goals (
  period TEXT NOT NULL,
  delegate_key TEXT NOT NULL,
  delegate TEXT NOT NULL,
  goals_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY(period,delegate_key)
);
