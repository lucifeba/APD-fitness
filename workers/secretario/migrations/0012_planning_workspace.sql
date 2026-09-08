CREATE TABLE IF NOT EXISTS planning_sources (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  routes_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  raw_row_count INTEGER NOT NULL DEFAULT 0,
  route_count INTEGER NOT NULL DEFAULT 0,
  pharmacy_count INTEGER NOT NULL DEFAULT 0,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS planning_sources_month ON planning_sources(month,imported_at DESC);

ALTER TABLE planning_proposals ADD COLUMN source_id TEXT;
ALTER TABLE planning_proposals ADD COLUMN calendar_snapshot TEXT;
ALTER TABLE planning_proposals ADD COLUMN updated_at TEXT;
