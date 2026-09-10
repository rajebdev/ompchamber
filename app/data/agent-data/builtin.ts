import type { AgentItem } from '@/types';

export const builtinAgents: AgentItem[] = [
  // BUILT-IN AGENTS
  {
    id: 'agent-explore',
    name: 'explore',
    description: 'Contextual grep for codebases. Locates keywords, definitions, and code structures.',
    scope: 'system',
    mode: 'subagent',
    overrideModel: 'Not selected',
    thinkingVariant: 'default',
    temperature: null,
    topP: null,
    systemPrompt: `You are an expert exploratory assistant designed to quickly search, grep, and analyze codebases without modifying files. Report precise file paths and line numbers.`,
    isBuiltIn: true,
  },
  {
    id: 'agent-general',
    name: 'general',
    description: 'General-purpose agent untuk multi-turn development, edits, and refactoring.',
    scope: 'system',
    mode: 'all',
    overrideModel: 'Not selected',
    thinkingVariant: 'default',
    temperature: null,
    topP: null,
    systemPrompt: `You are a general-purpose programming assistant. Solve tasks concisely, edit code surgically, and preserve formatting conventions.`,
    isBuiltIn: true,
  },
];
