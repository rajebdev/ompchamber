export type SettingsCategoryId =
  // OMPCHAMBER
  | 'general'
  | 'appearance'
  | 'chat'
  | 'notifications'
  | 'sessions'
  | 'shortcuts'
  | 'voice'
  | 'integrations'
  | 'usage'
  | 'about'
  // WORKSPACE
  | 'projects'
  | 'remote-instances'
  | 'external-tunnel'
  | 'git'
  // OMP
  | 'providers'
  | 'agents'
  | 'behavior'
  | 'commands'
  | 'mcp';

export interface SettingsCategoryItem {
  id: SettingsCategoryId;
  label: string;
  iconName: string;
  badge?: string;
  section: 'OMPCHAMBER' | 'WORKSPACE' | 'OMP';
  description?: string;
}

export interface SettingsState {
  binaryPath: string;
  showUpdateNotifications: boolean;
  agentControlTool: boolean;
  ompChamberWebTool: boolean;
  theme: 'paper' | 'contrast' | 'noir';
  fontSize: 'compact' | 'standard' | 'comfort';
  editorFont: string;
  autoScrollChat: boolean;
  streamResponses: boolean;
  expandedThinking: boolean;
  detailedToolCalls: boolean;
  notificationsEnabled: boolean;
  buildFailureAlert: boolean;
  soundAlerts: boolean;
  defaultWorkspacePath: string;
  gitAutoFetch: boolean;
  gitAuthorName: string;
  gitAuthorEmail: string;
  tunnelEnabled: boolean;
  tunnelSubdomain: string;
  activeProvider: string;
  autoApproveSafeCmds: boolean;
  autoPatchErrors: boolean;
}
