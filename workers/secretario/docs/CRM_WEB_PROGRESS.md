# CRM web — implementación

La pestaña CRM permite importar el XLSX de Drive, crear, buscar y editar registros de Visitas y Acompañamientos, y sincronizarlos de vuelta al mismo archivo mediante un botón.

## Seguridad e integridad

- Inicio de sesión Google obligatorio; solo la propietaria puede importar y sincronizar.
- Control de origen para escrituras web.
- Versiones por registro para impedir sobrescrituras entre dispositivos.
- Antes de escribir se compara la fecha de modificación del archivo de Drive. Si cambió, se exige una nueva importación.
- La escritura modifica únicamente las celdas de VISITAS y ACOMPAÑAMIENTOS dentro del XLSX. El resto de las entradas ZIP se conserva byte por byte.
- ID de visita y referencia de Calendar permanecen protegidos en el editor.

## Planificación

La web permite cargar rutas disponibles, generar una propuesta determinista y aprobarla. Solo acepta martes, miércoles y jueves; alterna Madrid y Aragón; equilibra delegados; y penaliza repetir rutas y farmacias. Cada farmacia debe incluir nombre, dirección y clasificación.

Al aprobar:

1. comprueba que el Excel no ha cambiado;
2. crea eventos de día completo y libres en Calendario de acompañamiento delegados;
3. crea las visitas en Planificación con dirección, clasificación y ruta;
4. registra visitas y acompañamientos en el CRM;
5. sincroniza los registros con el XLSX de Drive.

Los eventos usan identificadores estables para evitar duplicados al reintentar una ejecución interrumpida.

## Validación

TypeScript, pruebas de negocio y sintaxis del navegador. Una prueba de integración sobre una copia real confirmó que la modificación del CRM altera únicamente `xl/worksheets/sheet7.xml` y deja intactos todos los demás archivos internos del libro.
