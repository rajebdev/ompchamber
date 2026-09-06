export type SettingsCategoryId =
  // OMPCHAMBER
  | 'general'
  | 'appearance'
  | 'chats'
  | 'notifications'
  | 'usage'
  // WORKSPACE
  | 'projects'
  | 'git'
  // OMP
  | 'providers'
  | 'agents'
  | 'behavior'
  | 'commands'
  | 'mcp'
  // LIBRARY
  | 'skills'
  | 'skills-catalog';

export interface SettingsCategoryItem {
  id: SettingsCategoryId;
  label: string;
  iconName: string;
  badge?: string;
  section: 'OMPCHAMBER' | 'WORKSPACE' | 'OMP' | 'LIBRARY';
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
  followUpBehavior: 'queue' | 'steering';
}
