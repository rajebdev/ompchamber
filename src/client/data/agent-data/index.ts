import type { AgentItem } from '@/shared/types';
import { builtinAgents } from '@/client/data/agent-data/builtin';
import { orchestratorAgents } from '@/client/data/agent-data/orchestrator';
import { specialistAgents } from '@/client/data/agent-data/specialist';

export const DEFAULT_AGENTS_LIST: AgentItem[] = [
  ...builtinAgents,
  ...orchestratorAgents,
  ...specialistAgents,
];
