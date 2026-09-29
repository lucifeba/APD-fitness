-- Nueva raíz única para transcripciones, calls, reuniones y otros materiales de análisis.
INSERT INTO settings(key, value, updated_at)
VALUES(
  'transcriptions_drive_folder_id',
  '1rJyl0Mo-vNhRDIJpnSqWxDE2doI-Zm5N',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
