# CRM web — estado de implementación

La pestaña CRM permite crear, buscar y editar registros de Visitas y Acompañamientos.
Los nombres de campos proceden de las cabeceras de la fila 5 del Excel CRM.
Los registros se guardan en D1, con sesión Google obligatoria, control de origen
y actualización condicionada por versión para impedir sobrescrituras concurrentes.
No incluye datos personales de ejemplo ni importa automáticamente el Excel.

## Pendiente antes de considerar terminada la sincronización

- Importar el archivo real de Drive conservando ID de visita, VDL y referencia Calendar.
- Resolver registros de acompañamiento sin ID sin generar duplicados.
- Aplicar cambios por campo al XLSX conservando fórmulas, formato y compatibilidad Office.
- Detectar cambios externos del archivo antes de escribir y presentar conflictos.
- Implementar el botón de sincronización y actualizar synced_version solo tras éxito.
- Importar cambios y eliminaciones de Calendar conforme a las reglas de la propietaria.
- Obtener direcciones completas: CLIENTES contiene ciudad y CP, no calle y número.
- Verificar en navegador autenticado y confirmar despliegue de las migraciones.

La interfaz indica explícitamente que sus registros aún no se han sincronizado
con Excel. Guardar un registro no crea eventos ni modifica Drive.

Validación local: TypeScript y diez pruebas pasan, incluidas fechas inválidas,
campos protegidos, conflictos de versión y sintaxis del JavaScript del panel.
