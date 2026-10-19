INSERT OR IGNORE INTO memories(id,kind,content,source,importance,status,created_at)
VALUES('preference_meeting_summary_not_speakers','preference',
'Araceli pide que un resumen, acta o correo de una reunión sea una síntesis por temas, conclusiones y próximos pasos. No quiere interacciones, Orador A/B, marcas de tiempo, listas de asistentes deducidas ni transcripciones. Respetar exactamente lo solicitado y los acuerdos de la fuente: no inventar acciones, nombres, canales, cantidades ni plazos. Solo entregar transcripción literal si la pide expresamente.',
'user:2026-10-19:correction',5,'active',strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO settings(key,value)
VALUES('meeting_summary_preference','Resumen por temas, conclusiones y próximos pasos. Sin oradores, turnos, marcas de tiempo ni asistentes deducidos. No inventar acuerdos ni modificar cifras, duraciones o plazos.');
