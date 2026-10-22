-- Failed imports never replace the published dashboard. Retain their original
-- privately so a corrected parser can retry without requesting the file again.
CREATE TABLE IF NOT EXISTS sales_dashboard_rejected_uploads (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  error TEXT NOT NULL,
  resolved_import_id TEXT
);
