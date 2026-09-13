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
  id: number | string;
  name: string;
  path: string;
  content?: string;
  isDirty?: boolean;
  root?: string;
  repo?: string;
  isDiff?: boolean;
  diffStatus?: string;
  diffStaged?: boolean;
}

export interface SearchResultItem {
  file: string;
  line: number;
  content: string;
  preview?: string;
}

/** A flat file entry from the recursive file-listing endpoint (composer `@` mentions). */
export interface FsFileEntry {
  name: string;
  /** Workspace-relative path with forward slashes. */
  path: string;
}
