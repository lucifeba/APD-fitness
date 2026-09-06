CREATE TABLE IF NOT EXISTS crm_records (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL CHECK(section IN ('visits','accompaniments')),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  synced_version INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS crm_section_updated ON crm_records(section,updated_at);
