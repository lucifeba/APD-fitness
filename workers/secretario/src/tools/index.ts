import type { ToolDef } from '../env';
import { googleTools } from './googleTools';
import { memoryTools } from './memoryTools';
import { scheduleTools } from './scheduleTools';
import { skillTools } from './skillTools';
import { systemTools } from './systemTools';
import type { ToolSpec } from './types';
import { webTools } from './web';

export const ALL_TOOLS: ToolSpec[] = [...systemTools, ...webTools, ...memoryTools, ...scheduleTools, ...skillTools, ...googleTools];
const byName = new Map(ALL_TOOLS.map((t) => [t.def.name, t]));

export function getTool(name: string): ToolSpec | undefined {
  return byName.get(name);
}

export function toolDefs(includeGoogle: boolean): ToolDef[] {
  return ALL_TOOLS.filter((t) => includeGoogle || !googleTools.includes(t)).map((t) => t.def);
}
