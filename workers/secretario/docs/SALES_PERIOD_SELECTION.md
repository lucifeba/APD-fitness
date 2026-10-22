# Trimestre vigente e histórico comercial

Revisión: 21 de octubre de 2026.

## Selección y carga

- Los bloques de Cuadro Mando y Ciclos Cerrados se localizan por encabezados.
  Cada columna se asocia a su trimestre financiero, con Q1 de abril a junio.
  No hay un número fijo de meses ni de trimestres por bloque.
- El Q vigente es el declarado por el Excel, aunque todas sus ventas sean cero.
  Cuota, Cuadro Mando y Ciclos Cerrados deben corresponder al mismo Q.
- El último cuadro se ordena por Q financiero, fecha de datos y fecha de carga.
  Una carga atrasada de un Q anterior no sustituye al trimestre vigente.
- Las cargas web y Telegram usan el mismo importador. Solo se publican al
  completarse todas las tablas; se archiva el XLSX original por bloques de 256 KB.
  No se eliminan las versiones anteriores al incorporar una nueva.

## Consultas

- La web abre en modo automático y Q vigente. Un cambio de archivo reinicia
  la selección de Q. Una consulta histórica explícita queda identificada.
- El análisis auxiliar consulta exactamente el mismo import_id que los KPI.
- Las curvas conservan trimestres anteriores y toman la última observación
  de cada periodo. Las versiones no se suman entre sí; un cero nuevo sustituye
  al valor anterior de ese mismo periodo.
- El histórico de presentaciones une meses por código nacional. Para meses
  cubiertos por una nueva observación se reemplazan las compras anteriores,
  incluso cuando la nueva compra es cero o la referencia no aparece.
- El objetivo trimestral nunca se compara con las ventas de otro Q. La
  conciliación de Cuota corrige el último mes observado, no un mes futuro.

## Recuperación de la carga de octubre anterior a esta corrección

El importador anterior no conservaba los XLSX. Su rango fijo truncó la carga
`Cuadro Mando BU 10 Aranubia Q3.xlsx` del 21 de octubre, con datos del 13 de octubre.
Se reconstruyen las columnas de ventas total, plataforma y push que sí quedaron
almacenadas, para volver a mostrar Q3 26-27. Se valida total = plataforma + push.
También se recuperan los trimestres por farmacia y las unidades de octubre
conservadas en el detalle de Cliente-Presentación. El original no se inventa.

Los objetivos de farmacias >200 € y algunas celdas no conservadas necesitan
recargar el XLSX original. `requiresOriginal: true` lo identifica y la web muestra
«No disponible». No se utiliza el objetivo de otro Q como sustituto.

## Verificación

Pruebas de inserción de un Q con desplazamiento de todos los bloques, nuevos
meses, ceros vigentes, desglose incompatible, históricos sin duplicados,
recuperación de columnas antiguas y publicación completa con archivo original.
También se ha validado la lectura del Excel real anterior de septiembre.

## Corrección del rechazo de encabezados (22 de octubre)

Los bloques se identifican por secuencias trimestrales completas y por una
asignación única y ordenada a sus títulos. Se tolera el desplazamiento de hasta
dos columnas del título combinado al añadir meses o Q. No se eliminan Q
duplicados ni se adivinan etiquetas ambiguas. Se admiten guiones tipográficos.
Los errores indican hoja, fila y encabezados observados para diagnosticarlos.
Todos los bloques de Ciclos Cerrados deben cubrir los mismos trimestres.

Una carga que no supera la validación conserva su XLSX privado y no sustituye
los datos publicados. La propietaria puede consultar o descargarlo en
`GET /api/sales-dashboard/rejected-upload` (añadir `download=1` para el binario)
y reintentar con `POST /api/sales-dashboard/retry`, JSON `{uploadId}`. El panel
muestra el rechazo y el botón de reintento. El acceso requiere sesión de la
propietaria. Un reintento ya publicado devuelve su import_id sin duplicarlo.

La carga Q3 rechazada antes de esta mejora no se conservó. La captura permite
localizar la fase que falló, pero no reconstruir las etiquetas ni los valores
del XLSX. La comprobación final de esa carga necesita el archivo original.
