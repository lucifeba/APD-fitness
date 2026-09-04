import type { Env, ToolDef } from '../env';
import { autonomyTools, loadDynamicTools, reserveNames } from './autonomyTools';
import { googleTools } from './googleTools';
import { knowledgeTools } from './knowledgeTools';
import { memoryTools } from './memoryTools';
import { scheduleTools } from './scheduleTools';
import { skillTools } from './skillTools';
import { systemTools } from './systemTools';
import type { ToolSpec } from './types';
import { webTools } from './web';

export const ALL_TOOLS: ToolSpec[] = [...systemTools, ...webTools, ...memoryTools, ...knowledgeTools, ...scheduleTools, ...skillTools, ...autonomyTools, ...googleTools];
const byName = new Map(ALL_TOOLS.map((t) => [t.def.name, t]));
reserveNames([...byName.keys()]);

export function getTool(name: string): ToolSpec | undefined {
  return byName.get(name);
}

/** Herramienta fija o creada por el agente. */
export async function resolveTool(env: Env, name: string): Promise<ToolSpec | undefined> {
  return byName.get(name) ?? (await loadDynamicTools(env)).find((t) => t.def.name === name);
}

/** Conjunto completo de herramientas disponibles ahora mismo (fijas + dinámicas). */
export async function allTools(env: Env, includeGoogle: boolean): Promise<{ defs: ToolDef[]; lookup: (name: string) => ToolSpec | undefined }> {
  const fixed = ALL_TOOLS.filter((t) => includeGoogle || !googleTools.includes(t));
  const dyn = await loadDynamicTools(env).catch((e) => {
    console.warn('herramientas dinámicas', e?.message);
    return [] as ToolSpec[];
  });
  const map = new Map([...fixed, ...dyn].map((t) => [t.def.name, t]));
  return { defs: [...map.values()].map((t) => t.def), lookup: (name) => map.get(name) };
}

export function toolDefs(includeGoogle: boolean): ToolDef[] {
  return ALL_TOOLS.filter((t) => includeGoogle || !googleTools.includes(t)).map((t) => t.def);
}
