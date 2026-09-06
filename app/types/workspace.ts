export interface SessionItemData {
  id: number;
  folder_id: number;
  title: string;
  created_at?: string;
  updated_at?: string;
  is_archived?: number;
  timeAgo?: string;
  hasArrow?: boolean;
}

export interface WorkspaceFolderData {
  id: number;
  name: string;
  isExpanded: boolean;
  sessions: SessionItemData[];
  hasMore: boolean;
  totalSessions: number;
  badge?: number | string;
  dotCount?: number;
  iconType?: 'chat' | 'folder' | 'code';
}

export type SessionSortOption = 'A-Z' | 'Z-A' | 'LATEST_SESSION' | 'LATEST_ADDED';
