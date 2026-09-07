-- Desviación de previsión específica por farmacia.
ALTER TABLE sales_dashboard_client_details
ADD COLUMN forecast_gap REAL NOT NULL DEFAULT 0;
