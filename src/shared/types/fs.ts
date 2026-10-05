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
  /**
   * Set on a tab that holds a plugin-contributed panel rather than a file. The
   * value is the panel's registry key; the editor renders the panel frame
   * instead of a buffer, and the tab carries no path to save to.
   */
  isPluginPanel?: string;
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
