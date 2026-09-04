# Relé de ChatGPT

Función mínima para Vercel que reenvía las llamadas del Secretario al backend de Codex de `chatgpt.com`, porque ese dominio bloquea las IPs de salida de Cloudflare Workers. Solo acepta peticiones con un token Bearer emitido por `auth.openai.com`.

Despliegue: `npx vercel deploy --prod` en esta carpeta. Luego, en el Worker del cliente, `CHATGPT_RELAY_URL=https://<proyecto>.vercel.app/api/responses`.
