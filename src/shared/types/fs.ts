export interface FsNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  size?: number;
  modified?: number;
  children?: FsNode[];
  forceExpanded?: boolean;
  /** Matches a git ignore rule (repo `.gitignore`, `.git/info/exclude`, or the
   *  global `core.excludesFile`) — rendered faded in the Files panel. */
  ignored?: boolean;
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
  /**
   * Character ranges within `content` that the query matched — one per
   * occurrence on the line, in document order. Ripgrep reports them in BYTES
   * and the route converts them, so the row can highlight the matched text and
   * the editor can be pointed at the first one.
   */
  ranges?: { start: number; end: number }[];
}

/** A flat file entry from the recursive file-listing endpoint (composer `@` mentions). */
export interface FsFileEntry {
  name: string;
  /** Workspace-relative path with forward slashes. */
  path: string;
}
