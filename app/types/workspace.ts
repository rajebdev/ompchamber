/**
 * Session item shape. In real (non-mock) mode sessions come from oh-my-pi
 * JSONL discovery and use the omp session UUID (string) as id — hence the
 * union with string ids. Mock/demo mode keeps numeric SQLite ids.
 */
export interface SessionItemData {
  id: number | string;
  folder_id: number | string;
  title: string;
  created_at?: string;
  updated_at?: string;
  is_archived?: number;
  queue_list?: any[];
  timeAgo?: string;
  hasArrow?: boolean;
  hasSubagents?: boolean;
  subagentCount?: number;
}

/**
 * A sidebar workspace folder. In real mode folders are SQLite workspaces that
 * carry an optional `project_path` binding the folder to an oh-my-pi project
 * root; the folder name is the lowercase basename of that path.
 */
export interface WorkspaceFolderData {
  id: number;
  name: string;
  /** When set, this workspace is bound to an oh-my-pi project root; sessions
   *  discovered under that root render inside this folder. */
  project_path?: string | null;
  /** When true, the workspace is pinned and sorts to the top of the sidebar. */
  isPinned?: boolean;
  isExpanded: boolean;
  model?: string;
  accentColor?: string;
  icon?: string;
  customIconUrl?: string;
  sessions: SessionItemData[];
  hasMore: boolean;
  totalSessions: number;
  badge?: number | string;
  dotCount?: number;
  iconType?: 'chat' | 'folder' | 'code';
}

export type SessionSortOption = 'A-Z' | 'Z-A' | 'LATEST_SESSION' | 'LATEST_ADDED';

export type ViewportMode =
  | 'responsive'
  | 'desktop-16-9'
  | 'laptop'
  | 'tablet'
  | 'mobile'
  | 'mobile-lg';
