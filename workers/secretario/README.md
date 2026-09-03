# Secretario

Agente personal de Pablo en Telegram. Corre íntegramente en Cloudflare Workers con el plan gratuito y usa IA gratuita. Sustituye a los bots NEXO MEDIA y Secretario de Pablo en un solo bot.

## Qué hace

- **Habla contigo por Telegram**: texto, notas de voz (Whisper), fotos (visión), archivos de texto, y sigue el hilo cuando respondes a un mensaje suyo.
- **Agente de verdad**: planifica con un cuaderno privado (`think`), usa herramientas, se divide el trabajo en subagentes (`subtask`), verifica y da feedback honesto.
- **Memoria**: hechos, preferencias, personas y proyectos en D1 + Vectorize (búsqueda semántica multilingüe con `bge-m3`). Aprende solo tras cada conversación y consolida un perfil tuyo cada día.
- **Habilidades**: guarda procedimientos que aprende (`skill_save`) y los reutiliza. Las lecciones de tu feedback (`/feedback`) se inyectan en cada respuesta.
- **Google (info@apdsport.com)**: Gmail (buscar, leer, borradores, enviar, archivar, papelera), Calendar (listar, crear, modificar, eliminar), Drive y Docs (buscar, leer, crear, añadir, subir), Google Tasks.
- **Internet**: búsqueda (Tavily o Brave si hay clave; DuckDuckGo si no) y lectura de páginas.
- **Tareas programadas**: recordatorios y trabajos recurrentes que ejecuta él mismo (alarmas de Durable Object + cron de respaldo).
- **Latido proactivo** cada 30 min: correos que exigen atención y eventos en los próximos 90 min. Respeta horas de silencio y `/modo silencio`.
- **Seguridad**: solo responde al chat emparejado; **nunca envía, modifica ni borra nada sin que pulses Confirmar**; las acciones quedan en `audit_log`; los textos de correos y webs se tratan como datos, no como órdenes.

## Cerebros (todo gratuito)

| Uso | Cadena por defecto |
|---|---|
| Razonamiento y herramientas | `@cf/openai/gpt-oss-120b` → Gemini 2.5 Flash → Groq Llama 3.3 70B → `@cf/meta/llama-4-scout-17b-16e-instruct` → OpenRouter (free) |
| Tareas ligeras (extraer memoria, resumir, filtrar) | `@cf/meta/llama-3.1-8b-instruct-fp8-fast` → Gemini 2.5 Flash-Lite → Groq Llama 3.1 8B → `@cf/qwen/qwen3-30b-a3b-fp8` |
| Voz | `@cf/openai/whisper-large-v3-turbo` (≈47 neuronas por minuto de audio) |
| Imágenes | `@cf/meta/llama-3.2-11b-vision-instruct` |
| Embeddings | `@cf/baai/bge-m3` (1024 dimensiones) |

Workers AI regala 10.000 neuronas al día. El router lleva la cuenta en `usage_daily` y, cuando se acerca a `DAILY_NEURON_BUDGET`, pasa a Gemini, Groq u OpenRouter (todos con nivel gratuito permanente) para que el servicio nunca se corte. Si un proveedor falla, salta al siguiente. Cambia las cadenas en `wrangler.jsonc` sin tocar código.

## Arquitectura

```
Telegram ──webhook──▶ Worker (index.ts) ──▶ Durable Object "SecretarioSession" (una por chat)
                                                │  historial + resumen, acciones pendientes, alarmas
                                                ├─▶ agent.ts: bucle de herramientas (router.ts elige cerebro)
                                                ├─▶ tools/: web, memoria, google, tareas, habilidades, sistema
                                                ├─▶ D1: memorias, skills, lecciones, tareas, uso, auditoría
                                                └─▶ Vectorize: embeddings de la memoria
Cron */30 ──▶ heartbeat (correo + agenda) ──▶ Telegram
```

## Puesta en marcha

Requisitos: cuenta de Cloudflare (plan gratuito vale), Node 20+, `npx wrangler login`.

1. **Bot de Telegram**. En @BotFather: `/newbot` (o reutiliza "Secretario de Pablo" con `/mybots` → API Token). Guarda el token.
2. **Recursos en Cloudflare**:
   ```bash
   cd workers/secretario
   npm install
   npx wrangler d1 create secretario          # copia el database_id a wrangler.jsonc
   npm run vectorize:create                   # índice secretario-memoria (1024 dims, cosine)
   npm run db:migrate:remote
   ```
3. **Secretos** (uno a uno con `npx wrangler secret put NOMBRE`):
   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `PAIRING_CODE`, `ADMIN_TOKEN`, `PUBLIC_URL` (la URL del Worker, p. ej. `https://secretario.<tu-subdominio>.workers.dev`).
   Opcionales pero recomendados: `GEMINI_API_KEY` (aistudio.google.com, gratis), `GROQ_API_KEY` (console.groq.com, gratis), `OPENROUTER_API_KEY`, `TAVILY_API_KEY` (1.000 búsquedas/mes gratis).
   Si ya conoces tu id de Telegram: `OWNER_CHAT_ID`.
4. **Desplegar y registrar el webhook**:
   ```bash
   npm run deploy
   curl -X POST "$PUBLIC_URL/admin/setup-webhook" -H "Authorization: Bearer $ADMIN_TOKEN"
   ```
5. **Emparejar**: abre el bot en Telegram y envía el `PAIRING_CODE`. Desde ese momento solo responde en tu chat.
6. **Google**. En Google Cloud Console crea un cliente OAuth "aplicación web" con URI de redirección `PUBLIC_URL/oauth/callback` y activa las APIs de Gmail, Calendar, Drive, Docs y Tasks. Guarda `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` como secretos, vuelve a desplegar y escribe `/google` en Telegram: te da el enlace de autorización y guarda el refresh token en D1. Si ya tienes un `GOOGLE_REFRESH_TOKEN` (del agente anterior), puedes ponerlo como secreto y saltarte este paso.

## Comandos

`/ayuda` · `/estado` · `/memoria [búsqueda]` · `/aprende <texto>` · `/olvida <id>` · `/skills` · `/tareas` · `/feedback <texto>` · `/modo silencio|normal` · `/nuevo` · `/google`

## Cómo enseñarle

- Dile cómo quieres las cosas: "a partir de ahora los resúmenes de correo en tres líneas" → guarda una lección.
- Explícale un procedimiento una vez: "cada lunes revisa los feedbacks de los atletas en Drive y mándame un resumen con semáforo" → guarda una habilidad y, si se lo pides, programa la tarea.
- Corrígele con `/feedback` o respondiendo a su mensaje. Las lecciones entran en el prompt de todas las respuestas siguientes.

## Límites del plan gratuito a tener en cuenta

- Workers: 100.000 peticiones/día, 10 ms de CPU por petición en el Worker (el trabajo pesado se hace en el Durable Object, que tiene 30 s).
- Workers AI: 10.000 neuronas/día. Con `gpt-oss-120b` equivale a unos 150.000 tokens de entrada + 50.000 de salida al día; después el router usa Gemini y Groq.
- D1: 5 GB; Vectorize: índices de hasta 20 millones de vectores; Durable Objects: 5 GB. Sobra para uso personal.
- Gemini gratis: ~10 peticiones/min y varios cientos al día por modelo. Groq gratis: ~1.000 peticiones/día en Llama 3.3 70B.
- El plan gratuito limita a 50 subpeticiones y 50 consultas D1 por invocación. Una tarea muy larga (muchos pasos con muchos correos) puede toparse con ese techo; el agente lo reporta y puedes pedirle que la divida. Si te ocurre a menudo, el plan Workers Paid (5 $/mes) lo multiplica por 20.

## Desarrollo local

```bash
cp .dev.vars.example .dev.vars   # rellena
npm run db:migrate:local
npm run dev
npm run typecheck
```
