CREATE TABLE IF NOT EXISTS sales_dashboard_imports (
  id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_date TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  client_count INTEGER NOT NULL,
  product_count INTEGER NOT NULL,
  recovery_match_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_dashboard_quota (
  import_id TEXT NOT NULL,
  cod_del TEXT NOT NULL,
  delegate TEXT NOT NULL,
  quota_q REAL NOT NULL DEFAULT 0,
  objective_1 REAL NOT NULL DEFAULT 0,
  objective_2 REAL NOT NULL DEFAULT 0,
  objective_3 REAL NOT NULL DEFAULT 0,
  sale_1 REAL NOT NULL DEFAULT 0,
  sale_2 REAL NOT NULL DEFAULT 0,
  sale_3 REAL NOT NULL DEFAULT 0,
  coverage_q REAL NOT NULL DEFAULT 0,
  gap_q REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(import_id,cod_del)
);

CREATE TABLE IF NOT EXISTS sales_dashboard_cycles (
  import_id TEXT NOT NULL,
  cod_del TEXT NOT NULL,
  delegate TEXT NOT NULL,
  previous_q REAL NOT NULL DEFAULT 0,
  current_q REAL NOT NULL DEFAULT 0,
  platform REAL NOT NULL DEFAULT 0,
  push REAL NOT NULL DEFAULT 0,
  pharmacies_200 INTEGER NOT NULL DEFAULT 0,
  direct_orders INTEGER NOT NULL DEFAULT 0,
  transfer_orders INTEGER NOT NULL DEFAULT 0,
  direct_ratio REAL NOT NULL DEFAULT 0,
  clients_growing INTEGER NOT NULL DEFAULT 0,
  clients_declining INTEGER NOT NULL DEFAULT 0,
  euros_growing REAL NOT NULL DEFAULT 0,
  euros_declining REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(import_id,cod_del)
);

CREATE TABLE IF NOT EXISTS sales_dashboard_clients (
  import_id TEXT NOT NULL,
  vdl TEXT NOT NULL,
  cod_del TEXT NOT NULL,
  delegate TEXT NOT NULL,
  client TEXT NOT NULL,
  classification TEXT NOT NULL,
  client_type TEXT NOT NULL,
  previous_vrn REAL NOT NULL DEFAULT 0,
  current_vrn REAL NOT NULL DEFAULT 0,
  variation REAL NOT NULL DEFAULT 0,
  variation_pct REAL,
  objective REAL NOT NULL DEFAULT 0,
  coverage REAL,
  sow REAL,
  acute_share REAL,
  province TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  route TEXT NOT NULL DEFAULT '',
  units_total REAL NOT NULL DEFAULT 0,
  priority TEXT NOT NULL,
  PRIMARY KEY(import_id,vdl)
);
CREATE INDEX IF NOT EXISTS sales_dashboard_clients_delegate ON sales_dashboard_clients(import_id,cod_del);
CREATE INDEX IF NOT EXISTS sales_dashboard_clients_priority ON sales_dashboard_clients(import_id,priority,variation);

CREATE TABLE IF NOT EXISTS sales_dashboard_products (
  import_id TEXT NOT NULL,
  national_code TEXT NOT NULL,
  presentation TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT '',
  commercial_type TEXT NOT NULL DEFAULT '',
  focus TEXT NOT NULL DEFAULT '',
  units_current REAL NOT NULL DEFAULT 0,
  units_q1 REAL NOT NULL DEFAULT 0,
  trend_pct REAL,
  PRIMARY KEY(import_id,national_code)
);
CREATE INDEX IF NOT EXISTS sales_dashboard_products_focus ON sales_dashboard_products(import_id,focus);
