CREATE TABLE IF NOT EXISTS planning_proposals (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  proposal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK(status IN ('pending_approval','approved','cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS planning_proposals_month ON planning_proposals(month,created_at);
