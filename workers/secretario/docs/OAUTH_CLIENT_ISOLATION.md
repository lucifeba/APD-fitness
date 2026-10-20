# Separación OAuth de Aravitas

Revisión: 20 de octubre de 2026. Proyecto Google Cloud `secretaria-ara`.

## Estado comprobado

- Migración completada. El cliente existente, antes `Nuvia Telegram`, se llama
  `Aravitas - agente Telegram`, tiene activada la clasificación agéntica y solo
  conserva `https://ara.nuviamedia.com/oauth/callback`.
- Cliente humano independiente: `Aravitas - acceso web`, sin clasificación
  agéntica y con único retorno `https://ara.nuviamedia.com/auth/google/callback`.
- La propietaria guardó el par `GOOGLE_WEB_CLIENT_ID` y
  `GOOGLE_WEB_CLIENT_SECRET` como secretos del Worker `secretario-ara`.
- El agente llama a REST de Gmail, Drive, Docs, Sheets, Calendar y Tasks; no
  llama a servidores MCP de Google Workspace.
- Verificado un nuevo inicio de sesión completo con el cliente humano, usando
  exclusivamente `openid email profile` y la cuenta propietaria autorizada.
- Verificada una lectura real de eventos de octubre mediante la vista
  Planificación y las credenciales del agente, después del cambio.
- Verificada la casilla agéntica persistida al reabrir el cliente de Google Cloud.
- `/health`: `ok: true`, `capabilities.oauthClientsSeparated: true`, todos los
  checks positivos, `telegramPending: 0` y `queue.failed: 0`.
- Se conservan el ID, secreto y refresh token del agente; no se han añadido
  scopes ni se han activado servidores MCP.

## Migración sin sustituir el refresh token del agente

1. Crear en el mismo proyecto un cliente web convencional `Aravitas - acceso web`,
   sin la clasificación de agente. Único redirect autorizado:
   `https://ara.nuviamedia.com/auth/google/callback`.
2. Guardar su ID y secreto como `GOOGLE_WEB_CLIENT_ID` y
   `GOOGLE_WEB_CLIENT_SECRET` del Worker de Ara. No publicar secretos en git,
   correo, Telegram ni conversaciones. Configurar el par completo.
3. Comprobar un nuevo inicio de sesión al dashboard. El código solo solicita
   `openid email profile`; se mantiene la lista de cuentas autorizadas.
4. Solo tras verificar el nuevo acceso, retirar `/auth/google/callback` del
   cliente antiguo y marcar ese cliente como agéntico. Conservar
   `https://ara.nuviamedia.com/oauth/callback`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET` y el refresh token existentes.
5. Leer de nuevo la consola para verificar la casilla guardada y comprobar
   `/health` y una lectura Google. El nuevo soporte no añade permisos ni activa MCP.

Mientras no se configure el nuevo par, el código conserva el cliente antiguo
para no cortar los accesos. Un par incompleto o un ID idéntico al del agente
se rechaza, evitando mezclar credenciales. `/health` indica
`capabilities.oauthClientsSeparated`, que solo confirma separación de IDs en
el Worker: no certifica la casilla agéntica de Google Cloud.

## Aviso de Google

El correo recibido indica el 11 de noviembre de 2026 como fecha de aplicación
para MCP y el 12 de noviembre como bloqueo de cambios de clasificación de
clientes existentes. No presenta ese bloqueo como una interrupción de REST.

Documentación oficial consultada:

- https://support.google.com/cloud/answer/15549257#agentic-client
- https://developers.google.com/workspace/guides/configure-mcp-servers

Google requiere clientes separados para funcionalidades humanas y agénticas.
Marcar un cliente no concede por sí mismo nuevos scopes ni privilegios.
