import type { Env, ToolDef } from '../env';

export interface ToolCtx {
  env: Env;
  chatId: string;
  /** true cuando el usuario ya ha confirmado la acción con el botón. */
  confirmed: boolean;
  depth: number;
  tz: string;
  runSubagent: (goal: string, tier: 'smart' | 'fast') => Promise<string>;
  onTasksChanged: () => Promise<void>;
  sendFile: (name: string, content: string, caption?: string) => Promise<void>;
}

export interface NeedsConfirmation {
  needs_confirmation: true;
  summary: string;
}

export interface ToolSpec {
  def: ToolDef;
  /** Acciones hacia fuera o irreversibles: requieren confirmación explícita del usuario. */
  dangerous?: boolean;
  run: (args: Record<string, any>, ctx: ToolCtx) => Promise<unknown>;
}

export const confirm = (summary: string): NeedsConfirmation => ({ needs_confirmation: true, summary });

export const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
export const num = (description: string) => ({ type: 'integer', description });
export const bool = (description: string) => ({ type: 'boolean', description });
export const params = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
