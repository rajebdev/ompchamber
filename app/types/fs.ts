export interface FsNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: number;
  children?: FsNode[];
  forceExpanded?: boolean;
}

export interface OpenedFile {
  id: number;
  name: string;
  path: string;
  content: string;
  isDirty?: boolean;
}

export interface SearchResultItem {
  file: string;
  line: number;
  content: string;
  preview?: string;
}
