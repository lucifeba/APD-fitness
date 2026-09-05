# Nuvia · Secretaria digital de Ara — Documento de entrega

> Versión 1.0 · 5 de septiembre de 2026 · Preparado para que Araceli Delgado ("Ara") continúe el desarrollo y la personalización del sistema desde ChatGPT (Codex) o cualquier otra herramienta.
>
> Este documento **no contiene secretos**. Los nombres de los secretos aparecen, sus valores nunca.

---

## 1. Qué es

Un agente personal que vive en Telegram (bot **Secretario de Ara**) y en un panel web (`https://ara.nuviamedia.com`). Funciona por completo en la nube (Cloudflare + un relé mínimo en Vercel); no depende de ningún ordenador encendido.

Capacidades:

- **Conversación por Telegram**: texto, notas de voz (se transcriben), fotos (se describen) y cualquier archivo (PDF, Word, Excel, imágenes, texto), que queda indexado en su base de conocimiento.
- **Google** (`aradelg@gmail.com`): Gmail (buscar, leer, borradores, enviar con confirmación, archivar), Calendar en **todos** los calendarios (listar, crear, mover, borrar con confirmación), Drive y Docs (buscar, leer, crear, añadir), Google Tasks en **todas** las listas (listar, crear, completar). Lista de tareas predeterminada: **Araceli**.
- **Agenda inteligente** (`/agenda`, o preguntando): semáforo de carga, solapamientos, huecos libres, color por calendario, tareas que vencen, vencidas y sin fecha.
- **Parte diario a las 19:30**: agenda de mañana + propuesta razonada de replanificación con una única pregunta de confirmación. Nada se mueve sin confirmar.
- **Avisos automáticos**: 15 minutos antes de cada evento con hora y de cada tarea con hora; repaso a las 08:45 de las tareas del día sin hora.
- **Cerebros**: ChatGPT (`gpt-5.5`, con la suscripción Business de Ara, vía OAuth) como principal; de respaldo Cloudflare Workers AI, Gemini, Groq y OpenRouter (claves propias de Ara, todas gratuitas).
- **Memoria y conocimiento**: recuerda hechos, personas, preferencias y proyectos; indexa documentos enteros; aprende procedimientos ("habilidades") y lecciones de feedback.
- **Autonomía**: si no tiene herramienta para algo, busca la API, la prueba (`http_request`), se crea la herramienta permanente (`tool_create`), guarda la habilidad y puede reescribir sus propias instrucciones (`self_instruct`). Ejecuta código JavaScript en un sandbox (`run_code`) para cálculos y transformaciones.
- **Seguridad**: solo responde al chat emparejado; nunca envía, borra ni modifica nada externo sin que se pulse **Confirmar**; todo queda en un registro de auditoría; los textos de correos y webs se tratan como datos, no como órdenes.

Las reglas de trabajo de Ara (equipo, AVANZA, calendarios, CRM, matriz de autorización, estilo) están cargadas en su perfil, en sus instrucciones permanentes y en su base de conocimiento a partir de `CONOCIMIENTO_AGENTE_SECRETARIO_ARACELI.md`.

---

## 2. Dónde vive todo (inventario)

| Pieza | Dónde | Notas |
| --- | --- | --- |
| Código | GitHub `lucifeba/APD-fitness`, rama `claude/telegram-bots-review-2o824f`, carpeta `workers/secretario` | Un solo código para todos los clientes; cada cliente es un *entorno* de wrangler |
| Relé de ChatGPT | GitHub, carpeta `workers/chatgpt-relay` · desplegado en Vercel como `nuvia-chatgpt-relay` (`https://nuvia-chatgpt-relay.vercel.app/api/responses`) | Necesario porque `chatgpt.com` bloquea las IPs de Cloudflare Workers |
| Worker | Cloudflare, cuenta `pdhsport@gmail.com`, Worker **`secretario-ara`** | Dominio `ara.nuviamedia.com` (zona `nuviamedia.com` en la misma cuenta) |
| Base de datos | Cloudflare D1 **`secretario-ara`** | Migraciones en `workers/secretario/migrations` |
| Memoria vectorial | Cloudflare Vectorize **`secretario-ara-memoria`** (1024 dims, coseno, índice de metadatos `kind`) | |
| IA de Cloudflare | Workers AI (binding `AI`) | Transcripción, visión, embeddings, modelos de respaldo |
| Google Cloud | Proyecto **`Secretaria Ara`** en la cuenta `aradelg@gmail.com` | APIs Gmail, Calendar, Drive, Docs, Tasks; app OAuth "Nuvia" publicada; cliente web con URIs `/oauth/callback` y `/auth/google/callback` |
| Telegram | Bot creado en @BotFather por Ara | Token guardado como secreto del Worker |
| ChatGPT | Conectado desde el panel con la cuenta Business de Ara (código de dispositivo) | Tokens cifrados en el baúl del Worker; se renuevan solos |
| Panel | `https://ara.nuviamedia.com` | Entrada con Google: `aradelg@gmail.com` y `info@apdsport.com` |

---

## 3. Accesos que necesita Ara para seguir desarrollando

| Acceso | Cómo se concede | Quién |
| --- | --- | --- |
| **Código** | Añadir a Ara como colaboradora del repositorio `lucifeba/APD-fitness` (Settings → Collaborators) o crearle un repositorio propio con una copia de `workers/secretario` y `workers/chatgpt-relay` | Pablo |
| **Desplegar en Cloudflare** | Opción A: añadir a Ara como miembro de la cuenta de Cloudflare (Manage Account → Members) con rol *Workers Admin* + *D1 Admin* + *Vectorize Admin*. Opción B: crear un **API token** (My Profile → API Tokens) con permisos *Workers Scripts: Edit*, *Workers AI: Read*, *D1: Edit*, *Vectorize: Edit*, *Account Settings: Read*, *Workers Routes: Edit*, y dársele junto con el **Account ID** (`a0ec7e2c9e281eb7041771daaa83295e`). Con el token, Codex despliega sin navegador | Pablo |
| **Relé de Vercel** | Solo si hay que cambiarlo: añadir a Ara al equipo `lucifebas-projects` o que lo despliegue en su propia cuenta de Vercel y cambie `CHATGPT_RELAY_URL` | Pablo |
| **Google Cloud** | Ya es suyo (`aradelg@gmail.com`) | — |
| **Telegram** | Ya es suyo (@BotFather) | — |
| **Secretos del Worker** | Se escriben con `npx wrangler secret put NOMBRE --env ara`; no se pueden leer, solo sustituir | Quien tenga acceso a Cloudflare |

---

## 4. Cómo trabajar desde ChatGPT (Codex)

1. En `chatgpt.com/codex`, conectar GitHub y elegir el repositorio (o el suyo propio).
2. Configurar el entorno de Codex con estas variables (Settings del entorno → Secrets):
   - `CLOUDFLARE_API_TOKEN` (el token del punto 3).
   - `CLOUDFLARE_ACCOUNT_ID` = `a0ec7e2c9e281eb7041771daaa83295e`.
3. Script de arranque del entorno: `cd workers/secretario && npm install`.
4. Comandos habituales (siempre dentro de `workers/secretario`):
   - `npm run typecheck` → compila sin desplegar.
   - `npm run deploy -- --env ara` → despliega **el Worker de Ara**. (Sin `--env ara` desplegaría el de Pablo: no hacerlo.)
   - `npx wrangler secret put NOMBRE --env ara` → guardar o cambiar un secreto.
   - `npx wrangler d1 migrations apply DB --remote --env ara` → aplicar migraciones nuevas.
   - `npx wrangler tail secretario-ara` → ver los registros en directo.
5. Reglas para no romper nada: hacer `npm run typecheck` antes de desplegar; no tocar el bloque `vars` del entorno de Pablo; no escribir secretos en el código; probar con los endpoints de administración (sección 8) antes de dar por bueno un cambio.

**Prompt inicial sugerido para ChatGPT**:

> Eres el desarrollador de "Nuvia", mi secretaria digital. El código está en `workers/secretario` (TypeScript, Cloudflare Workers, D1, Vectorize, Workers AI) y su documentación en `workers/secretario/README.md` y `workers/secretario/docs/ENTREGA_ARA.md`. Mi despliegue es el entorno `ara` de `wrangler.jsonc` (Worker `secretario-ara`, dominio `ara.nuviamedia.com`). Antes de cambiar nada lee esos dos documentos. Trabaja en castellano, haz `npm run typecheck` antes de desplegar con `npm run deploy -- --env ara`, nunca escribas secretos en el código y respeta las reglas de seguridad del agente (nada se envía, borra ni modifica sin confirmación). Mi primera petición es: …

---

## 5. Mapa del código (`workers/secretario/src`)

| Archivo | Responsabilidad |
| --- | --- |
| `index.ts` | Punto de entrada: webhook de Telegram, cron cada 30 min, callback OAuth de Google, panel (`/`, `/auth/*`, `/api/*`), endpoints `/admin/*` |
| `session.ts` | Durable Object por chat: cola de mensajes, comandos `/…`, historial y resumen, confirmaciones por botón, alarmas de recordatorios, latido, parte diario |
| `agent.ts` | Bucle del agente: prompt de sistema (perfil, instrucciones propias, recuerdos, conocimiento, habilidades, lecciones), llamadas a herramientas, envío directo de textos ya formateados, aprendizaje en segundo plano |
| `router.ts` | Cadena de cerebros con conmutación automática (Workers AI, Gemini, Groq, OpenRouter, OpenAI por clave, ChatGPT por OAuth), presupuesto de neuronas, parser de llamadas a herramientas en texto, sondas |
| `chatgpt.ts` | "Entrar con ChatGPT": código de dispositivo, tokens, renovación, llamadas al backend de Codex (vía relé) |
| `google.ts` | Gmail, Calendar (todos los calendarios), Drive/Docs, Google Tasks (todas las listas), OAuth |
| `agenda.ts` | Agenda: unión de calendarios y tareas, semáforo, solapamientos, huecos, render para Telegram |
| `reminders.ts` | Avisos automáticos (`REMIND_MINUTES` antes) y repaso de tareas del día |
| `heartbeat.ts` | Correos que exigen atención (latido cada 30 min) |
| `knowledge.ts` | Base de conocimiento: conversión de cualquier formato a texto, troceado, indexado, búsqueda, resumen y hechos |
| `memory.ts` | Memoria a largo plazo (D1 + Vectorize) |
| `sandbox.ts` | Ejecución de JavaScript aislada (QuickJS en WebAssembly) |
| `dashboard.ts` | Panel web: entrada con Google, estado, conexión de ChatGPT y OpenAI, páginas legales |
| `telegram.ts` | API de Telegram, Markdown → HTML, troceado de mensajes, tablas |
| `media.ts` | Transcripción de voz y descripción de imágenes |
| `db.ts`, `util.ts`, `env.ts` | Utilidades de base de datos, fechas y tipos de configuración |
| `tools/` | Herramientas del agente: `systemTools` (think, subtask, get_time, run_code, send_file), `web` (búsqueda y lectura), `memoryTools`, `knowledgeTools`, `scheduleTools`, `skillTools`, `autonomyTools` (self_instruct, http_request, tool_create, baúl), `googleTools` (agenda, calendario, correo, Drive, tareas) |

Migraciones: `migrations/0001_init.sql` (memoria, habilidades, lecciones, tareas programadas, uso, recibos, auditoría) y `0002_knowledge.sql` (documentos, herramientas dinámicas, baúl).

---

## 6. Configuración del entorno `ara` (`wrangler.jsonc` → `env.ara.vars`)

| Variable | Valor actual | Para qué |
| --- | --- | --- |
| `BOT_NAME` / `OWNER_NAME` / `OWNER_EMAIL` | Secretario de Ara / Ara / aradelg@gmail.com | Identidad |
| `PUBLIC_URL` | https://ara.nuviamedia.com | Webhook, OAuth, panel |
| `TIMEZONE` | Europe/Madrid | Fechas y horas |
| `MODEL_CHAIN_SMART` | chatgpt:gpt-5.5, cf:gpt-oss-120b, gemini:gemini-3.6-flash, groq:gpt-oss-120b, cf:llama-4-scout, openrouter:… | Cerebros para razonar, en orden |
| `MODEL_CHAIN_FAST` | chatgpt:gpt-5.4-mini, cf:llama-3.1-8b, gemini:gemini-3.5-flash-lite, groq:gpt-oss-20b, … | Cerebros para tareas ligeras |
| `CHATGPT_RELAY_URL` | https://nuvia-chatgpt-relay.vercel.app/api/responses | Relé hacia chatgpt.com |
| `CHATGPT_REASONING` | (vacío = low) | Esfuerzo de razonamiento de ChatGPT: low, medium, high |
| `DEFAULT_TASK_LIST` | Araceli | Lista de Google Tasks por defecto |
| `DAILY_BRIEF` | 19:30 | Hora del parte diario (vacío = desactivado) |
| `REMIND_MINUTES` / `TASKS_DIGEST_TIME` | 15 / 08:45 | Avisos antes de eventos y tareas; repaso de tareas sin hora |
| `QUIET_HOURS` | 22-08 | Sin avisos proactivos en ese tramo |
| `ALLOWED_CALENDARS` | (vacío = todos) | Limitar a ciertos calendarios por nombre |
| `HEARTBEAT_ENABLED` | true | Latido cada 30 min |
| `DAILY_NEURON_BUDGET` | 9000 | Cupo gratuito diario de Workers AI que se reserva |
| `ADMIN_EMAILS` | info@apdsport.com | Correos con acceso al panel además de la propietaria |
| `BRAND_NAME` / `BRAND_TAGLINE` | Nuvia / Tu secretaria digital | Marca del panel |
| `MODEL_VISION` / `MODEL_STT` / `MODEL_EMBED` | llama-3.2-11b-vision / whisper-large-v3-turbo / bge-m3 | Modelos de Workers AI |

**Secretos** (solo nombres; se cambian con `npx wrangler secret put NOMBRE --env ara`): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PAIRING_CODE`, `ADMIN_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`, `OPENROUTER_API_KEY`. Opcionales: `OPENAI_API_KEY`, `BRAVE_API_KEY`, `GOOGLE_REFRESH_TOKEN`, `OWNER_CHAT_ID`.

En el **baúl cifrado** (tabla `vault`, clave derivada de `ADMIN_TOKEN`): `CHATGPT_TOKENS` (sesión de ChatGPT) y las credenciales que Ara guarde con `/secreto NOMBRE valor` para que el agente use APIs externas (`{{secret:NOMBRE}}`).

---

## 7. Uso diario (Telegram)

Comandos: `/agenda [hoy|mañana|semana|lunes|12/09|2026-09-12 3]`, `/docs`, `/herramientas`, `/secreto NOMBRE valor`, `/instrucciones [borrar]`, `/estado`, `/memoria [búsqueda]`, `/aprende <texto>`, `/olvida <id>`, `/skills`, `/tareas`, `/feedback <texto>`, `/modo silencio|normal`, `/nuevo`, `/google`, `/ayuda`.

Ejemplos de lo que entiende sin comandos: "añade para mañana gestionar caducidades de Farmacia Torres en Araceli", "¿qué tengo mañana?", "mueve la visita de Pilar al jueves", "prepara un correo para dirección comercial", "recuérdame llamar a Sagrario hoy a las cinco" (crea la tarea con hora y avisa 15 min antes), "¿a cuánto está el bitcoin?" (se busca la API y se crea la herramienta), "calcula …" (usa el sandbox).

Confirmaciones: cualquier acción hacia fuera muestra botones **Confirmar / Cancelar**. "Eso es" o "confirmo" ejecutan la propuesta pendiente sin cambios.

---

## 8. Operación y diagnóstico

Endpoints de administración (todos `POST`, cabecera `Authorization: Bearer ADMIN_TOKEN`):

| Endpoint | Para qué |
| --- | --- |
| `/admin/probe?tier=smart\|fast` (o `&chain=proveedor:modelo,…`) | Prueba cada cerebro con una llamada a herramienta |
| `/admin/models?provider=gemini\|groq\|openrouter\|openai` | Modelos disponibles con la clave configurada |
| `/admin/ask` `{text, tier?, only?}` | Pregunta directa a un cerebro sin herramientas |
| `/admin/agent` `{text}` | Ejecuta el agente completo sin Telegram y devuelve todo el rastro |
| `/admin/agenda?date=mañana&days=1&send=1` | Renderiza la agenda; con `send=1` la envía al chat |
| `/admin/knowledge` `{action: url\|text\|search\|list\|forget}` | Gestiona la base de conocimiento |
| `/admin/setup-webhook` | Registra el webhook de Telegram (tras cambiar token o dominio) |
| `/admin/heartbeat` | Fuerza un latido (correo, parte diario si toca, avisos) |
| `/admin/reindex` | Vuelve a vectorizar los recuerdos |
| `/admin/chatgpt-raw` `{text}` | Muestra el flujo crudo del backend de ChatGPT (depuración) |

`GET /health` (público) indica si el bot está emparejado.

Tareas frecuentes:

- **Ver registros**: `npx wrangler tail secretario-ara --format pretty`.
- **Re-emparejar con otro chat**: `npx wrangler d1 execute DB --remote --env ara --command "DELETE FROM settings WHERE key='owner_chat_id'"` y enviar el `PAIRING_CODE` desde el nuevo chat.
- **Desconectar Google o ChatGPT**: botón en el panel (ChatGPT) o `DELETE FROM settings WHERE key='google_refresh_token'` (Google) y `/google` de nuevo.
- **Cambiar la hora del parte diario o de los avisos**: editar `DAILY_BRIEF`, `REMIND_MINUTES`, `TASKS_DIGEST_TIME` en `wrangler.jsonc` y desplegar.
- **Cambiar cerebros**: editar `MODEL_CHAIN_SMART`/`MODEL_CHAIN_FAST` y comprobar con `/admin/probe`. Modelos de ChatGPT admitidos hoy: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.6-sol`.
- **Rotar un secreto**: `npx wrangler secret put NOMBRE --env ara` (no hace falta redesplegar, salvo `PUBLIC_URL`, que es variable).

---

## 9. Recetas de personalización

- **Nueva herramienta fija**: añadir un `ToolSpec` en `src/tools/*.ts` (definición JSON + `run`) y registrarla en `src/tools/index.ts`. Marcar `dangerous: true` y devolver `confirm(...)` si modifica algo fuera.
- **Nueva herramienta sin programar**: pedírselo al bot ("créate una herramienta que…"); usa `tool_create` (petición HTTP con plantillas) y queda en la tabla `dyn_tools`.
- **Nuevo comando de Telegram**: `handleCommand` en `src/session.ts`.
- **Cambiar el prompt del agente**: `systemPrompt` en `src/agent.ts` (reglas generales) o, sin desplegar, `/instrucciones` y `self_instruct` (reglas de Ara).
- **Cambiar el panel**: `src/dashboard.ts` (HTML, CSS y JS en un solo archivo; colores en las variables CSS `--accent`, `--accent2`, `--ink`).
- **Nueva tabla**: crear `migrations/0003_*.sql` y aplicar con `npx wrangler d1 migrations apply DB --remote --env ara`.
- **Otro cliente**: copiar el bloque `env.ara` de `wrangler.jsonc` con su nombre, crear su D1 y su Vectorize (`wrangler d1 create`, `wrangler vectorize create … --dimensions=1024 --metric=cosine`, `create-metadata-index --property-name=kind --type=string`), aplicar migraciones, guardar sus secretos y desplegar con `--env nombre`.

---

## 10. Límites y pendientes conocidos

- **Google**: la app OAuth está publicada sin verificación de Google (no hace falta para uso propio): al autorizar aparece "Google no ha verificado esta aplicación" → Avanzado → Continuar. La autorización que Ara dio mientras la app estaba en modo prueba caduca a los 7 días: conviene repetir `/google` una vez tras la publicación.
- **ChatGPT por OAuth**: usa el flujo de Codex; OpenAI lo tolera para herramientas tipo Codex pero no es una API oficial. Si dejara de funcionar, el agente sigue con los cerebros gratuitos, o se conecta una clave de API de OpenAI desde el panel.
- **OpenRouter gratuito** se satura a ratos (429): por eso va al final de la cadena.
- **Cupos gratuitos**: Workers AI ~10.000 neuronas/día (presupuesto 9.000), Vectorize y D1 en plan gratuito, Vercel Hobby para el relé.
- **CRM en Excel**: el agente puede leer el Excel de Drive (`drive_read`) y analizarlo (`run_code`), pero **escribir** en `Planificacion_CRM_Centro3_Office365.xlsx` conservando formato no está implementado como herramienta nativa; es el siguiente desarrollo natural (leer XLSX con una librería, modificar hojas PLAN MENSUAL y VISITAS y subir el mismo archivo).
- **Archivos por Telegram**: máximo 20 MB (límite de Telegram para bots).

---

## 11. Personas y contactos

- Propietaria: Araceli Delgado, `aradelg@gmail.com`.
- Implantación y soporte: Pablo, `info@apdsport.com` (Nuvia Media / APD Sport).
