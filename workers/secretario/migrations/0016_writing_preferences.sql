-- Preferencia explícita de Araceli: redacciones limpias y ReforVit con V.
-- No sustituye ni elimina instrucciones ni recuerdos existentes.
INSERT OR IGNORE INTO memories(id,kind,content,source,importance,status,created_at)
VALUES('preference_clean_writing_reforvit','preference',
'Araceli quiere todas las redacciones en castellano natural y legible, con párrafos separados y negrita o cursiva reales. Nunca mostrar barras de escape, almohadillas, tablas Markdown, separadores de código ni entidades HTML. La marca correcta es ReforVit, con V, no ReforBit. Aplicar en Telegram, documentos y borradores de Gmail. No inventar participantes, responsables, cifras, plazos ni acuerdos.',
'user:2026-10-19',5,'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO settings(key,value)
VALUES('writing_preference','Castellano legible y profesional; párrafos separados; negrita y cursiva reales, nunca símbolos de formato visibles, escapes, tablas Markdown ni entidades HTML. ReforVit se escribe con V. No inventar datos ni acciones realizadas.');
