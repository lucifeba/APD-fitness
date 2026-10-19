# Separación OAuth de Aravitas

Revisión: 19 de octubre de 2026. Proyecto Google Cloud `secretaria-ara`.

## Estado comprobado

- Cliente existente: `Nuvia Telegram`. Comparte los retornos `/oauth/callback`
  (agente) y `/auth/google/callback` (acceso humano al panel).
- El agente llama a REST de Gmail, Drive, Docs, Sheets, Calendar y Tasks; no
  llama a servidores MCP de Google Workspace.
- La clasificación `Use this client for an AI-powered agent` estaba desactivada.
- Se ha preparado soporte para un cliente web independiente. No implica que
  las credenciales nuevas estén creadas, configuradas o activadas.

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
