export type McpReachType = 'command' | 'link';
export type McpScope = 'every-project' | 'this-project';

export interface McpEnvVar {
  id: string;
  key: string;
  value: string;
}

export interface McpServerItem {
  id: string;
  name: string;
  scope: McpScope;
  enabled: boolean;
  reachType: McpReachType;
  commandArgs: string[];
  linkUrl?: string;
  envVars: McpEnvVar[];
  status?: 'active' | 'inactive' | 'error';
}
