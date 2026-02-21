CREATE TABLE IF NOT EXISTS patterns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  type TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  data TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_patterns_org ON patterns(organization_id);
