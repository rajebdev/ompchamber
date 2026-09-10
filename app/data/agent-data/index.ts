import type { AgentItem } from '@/types';
import { builtinAgents } from '@/data/agent-data/builtin';
import { orchestratorAgents } from '@/data/agent-data/orchestrator';
import { specialistAgents } from '@/data/agent-data/specialist';

export const DEFAULT_AGENTS_LIST: AgentItem[] = [
  ...builtinAgents,
  ...orchestratorAgents,
  ...specialistAgents,
];
