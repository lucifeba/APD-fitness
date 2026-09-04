export interface Env {
  AI: Ai;
  DB: D1Database;
  VECTORS: VectorizeIndex;
  SESSION: DurableObjectNamespace;

  // Secretos
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  OWNER_CHAT_ID?: string;
  PAIRING_CODE?: string;
  ADMIN_TOKEN?: string;
  PUBLIC_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  TAVILY_API_KEY?: string;
  BRAVE_API_KEY?: string;

  // Variables
  BOT_NAME?: string;
  OWNER_NAME?: string;
  OWNER_EMAIL?: string;
  TIMEZONE?: string;
  LANGUAGE?: string;
  DAILY_NEURON_BUDGET?: string;
  MODEL_CHAIN_SMART?: string;
  MODEL_CHAIN_FAST?: string;
  MODEL_VISION?: string;
  MODEL_STT?: string;
  MODEL_EMBED?: string;
  HEARTBEAT_ENABLED?: string;
  QUIET_HOURS?: string;
  MAX_AGENT_STEPS?: string;
  /** Clave de OpenAI (también puede vivir en el baúl como OPENAI_API_KEY, conectada desde el panel). */
  OPENAI_API_KEY?: string;

  // Personalización por cliente
  /** Lista de Google Tasks por defecto (nombre). Si no, la primera. */
  DEFAULT_TASK_LIST?: string;
  /** Hora local HH:MM del parte diario de agenda (vacío = desactivado). */
  DAILY_BRIEF?: string;
  /** Nombres de calendarios a considerar, separados por comas (vacío = todos). */
  ALLOWED_CALENDARS?: string;
  /** Correos con acceso al panel web además del propietario. */
  ADMIN_EMAILS?: string;
  BRAND_NAME?: string;
  BRAND_TAGLINE?: string;
  /** Esfuerzo de razonamiento para el proveedor chatgpt (low | medium | high). */
  CHATGPT_REASONING?: string;
}

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  provider: string;
  model: string;
  usage: { input: number; output: number };
}

export interface Incoming {
  chatId: string;
  messageId?: number;
  text: string;
  kind: 'text' | 'voice' | 'photo' | 'document' | 'callback' | 'system';
  replyTo?: { text: string; fromBot: boolean };
  attachments?: { type: string; fileId: string; mime?: string; name?: string; size?: number }[];
  callbackData?: string;
  callbackQueryId?: string;
  callbackMessageId?: number;
}

export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  summary: string;
  createdAt: string;
}
