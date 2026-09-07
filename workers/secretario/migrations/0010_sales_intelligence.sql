CREATE TABLE IF NOT EXISTS sales_dashboard_client_details (
  import_id TEXT NOT NULL,
  vdl TEXT NOT NULL,
  monthly_sales TEXT NOT NULL,
  quarters_json TEXT NOT NULL,
  recovery_json TEXT NOT NULL,
  agreement_json TEXT NOT NULL,
  otc_json TEXT NOT NULL,
  purchase_pattern TEXT NOT NULL,
  direct_pct REAL,
  PRIMARY KEY(import_id,vdl)
);

CREATE TABLE IF NOT EXISTS sales_dashboard_delegate_details (
  import_id TEXT NOT NULL,
  cod_del TEXT NOT NULL,
  delegate TEXT NOT NULL,
  quarters_json TEXT NOT NULL,
  openings_count INTEGER NOT NULL DEFAULT 0,
  openings_sales REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(import_id,cod_del)
);

CREATE TABLE IF NOT EXISTS sales_dashboard_product_details (
  import_id TEXT NOT NULL,
  national_code TEXT NOT NULL,
  months_json TEXT NOT NULL,
  quarters_json TEXT NOT NULL,
  status TEXT NOT NULL,
  current_avg REAL NOT NULL DEFAULT 0,
  previous_avg REAL NOT NULL DEFAULT 0,
  change_pct REAL,
  total_units REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(import_id,national_code)
);
CREATE INDEX IF NOT EXISTS sales_dashboard_product_status ON sales_dashboard_product_details(import_id,status);

CREATE TABLE IF NOT EXISTS sales_dashboard_client_products (
  import_id TEXT NOT NULL,
  vdl TEXT NOT NULL,
  products_json TEXT NOT NULL,
  PRIMARY KEY(import_id,vdl)
);

CREATE TABLE IF NOT EXISTS sales_dashboard_alerts (
  import_id TEXT NOT NULL,
  id TEXT NOT NULL,
  severity TEXT NOT NULL,
  type TEXT NOT NULL,
  vdl TEXT,
  cod_del TEXT,
  client TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY(import_id,id)
);
CREATE INDEX IF NOT EXISTS sales_dashboard_alerts_delegate ON sales_dashboard_alerts(import_id,cod_del,severity);
