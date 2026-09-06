export interface GitChange {
  file: string;
  status: 'M' | 'A' | 'D' | '?' | 'R' | 'C' | 'U' | string;
  staged: boolean;
  additions?: number;
  deletions?: number;
}

export type GitViewMode = 'flat' | 'tree';

export interface GitTreeNode {
  id: string;
  name: string;
  path: string;
  type: 'folder' | 'file';
  change?: GitChange;
  children: GitTreeNode[];
  changeCount: number;
}

export interface GitStatusData {
  changes: GitChange[];
  branch: string;
  branches: string[];
  repos: string[];
  activeRepo: string;
}
