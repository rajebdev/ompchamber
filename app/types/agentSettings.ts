export type AgentMode = 'primary' | 'subagent' | 'all';
export type AgentScope = 'system' | 'user' | 'project';

export interface AgentItem {
  id: string;
  name: string;
  description: string;
  scope: AgentScope;
  mode: AgentMode;
  overrideModel?: string;
  thinkingVariant?: string;
  temperature?: number | null;
  topP?: number | null;
  systemPrompt: string;
  isBuiltIn?: boolean;
}
