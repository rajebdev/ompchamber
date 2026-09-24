import type { ThemeId } from '@/shared/lib/theme/catalog';

/** Wire protocol for the live agent event stream (chat timeline). */
export type StreamTransport = 'websocket' | 'sse';

export type SettingsCategoryId =
  // OMPCHAMBER
  | 'appearance'
  | 'chats'
  | 'notifications'
  | 'usage'
  | 'token-usage'
  // WORKSPACE
  | 'projects'
  // OMP
  | 'omp'
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
  /** Palette id from the theme catalog (`shared/lib/theme/catalog.ts`). Typed
   *  as the catalog's own id union, so a theme dropped from it breaks the build
   *  here rather than rendering unstyled at runtime. */
  theme: ThemeId;
  fontSize: 'compact' | 'standard' | 'comfort';
  editorFont: string;
  streamResponses: boolean;
  streamTransport: StreamTransport;
  /** Generate a session title from the first run. omp suppresses its
   *  own auto-titling under `--mode rpc-ui` (PI_NO_TITLE), so without this a
   *  chamber session keeps its `New Session - <timestamp>` placeholder. Asked
   *  once when the first user message settles, retried once at that run's end;
   *  a later run never re-titles it — and a user-set name is never overwritten. */
  autoSessionTitle: boolean;
  expandedThinking: boolean;
  detailedToolCalls: boolean;
  notificationsEnabled: boolean;
  buildFailureAlert: boolean;
  soundAlerts: boolean;
  chatCompletionSound: boolean;
  defaultWorkspacePath: string;
  tunnelEnabled: boolean;
  tunnelSubdomain: string;
  activeProvider: string;
  autoApproveSafeCmds: boolean;
  autoPatchErrors: boolean;
  followUpBehavior: 'queue' | 'steering';
  keybindingSend: 'Enter' | 'Shift + Enter' | 'Ctrl / Cmd + Enter';
  keybindingNewLine: 'Enter' | 'Shift + Enter' | 'Ctrl / Cmd + Enter';
  keybindingSteering: 'Enter' | 'Shift + Enter' | 'Ctrl / Cmd + Enter';
}
