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
  /** Absolute omp project root — meaningful only when scope is 'this-project'. */
  projectPath?: string;
  enabled: boolean;
  reachType: McpReachType;
  commandArgs: string[];
  linkUrl?: string;
  envVars: McpEnvVar[];
  status?: 'active' | 'inactive' | 'error';
}
