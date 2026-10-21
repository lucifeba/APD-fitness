-- Publish only complete imports and retain the original workbook for reparsing.
ALTER TABLE sales_dashboard_imports ADD COLUMN current_quarter TEXT NOT NULL DEFAULT '';
ALTER TABLE sales_dashboard_imports ADD COLUMN parser_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_dashboard_imports ADD COLUMN product_months TEXT NOT NULL DEFAULT '[]';
ALTER TABLE sales_dashboard_imports ADD COLUMN ready INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS sales_dashboard_sources (
  import_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content BLOB NOT NULL,
  PRIMARY KEY(import_id,chunk_index)
);
