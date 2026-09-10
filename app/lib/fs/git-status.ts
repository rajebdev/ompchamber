import type { GitChange } from '@/types/git';

export interface GitStatusInfo {
  charStatus: string;
  label: string;
  colorClass: string;
  badgeBgClass: string;
  isStaged: boolean;
}

export interface FolderGitStatusInfo {
  count: number;
  hasModified: boolean;
  hasUntracked: boolean;
  hasStaged: boolean;
  hasDeleted: boolean;
  colorClass: string;
}

/**
 * Get display info for a single git status code.
 */
export function getGitStatusInfo(status: string, isStaged: boolean = false): GitStatusInfo {
  let charStatus = 'M';
  let label = 'Modified';
  let colorClass = 'text-info';
  let badgeBgClass = 'bg-info/10 text-info border-info/25';

  if (isStaged) {
    const s = status?.[0] || 'M';
    if (s === 'A') {
      charStatus = 'A';
      label = 'Added (Staged)';
      colorClass = 'text-success';
      badgeBgClass = 'bg-success/10 text-success border-success/25';
    } else if (s === 'D') {
      charStatus = 'D';
      label = 'Deleted (Staged)';
      colorClass = 'text-error';
      badgeBgClass = 'bg-error/10 text-error border-error/25';
    } else if (s === 'R') {
      charStatus = 'R';
      label = 'Renamed (Staged)';
      colorClass = 'text-meta';
      badgeBgClass = 'bg-meta/10 text-meta border-meta/25';
    } else {
      charStatus = 'M';
      label = 'Modified (Staged)';
      colorClass = 'text-info';
      badgeBgClass = 'bg-info/10 text-info border-info/25';
    }
  } else {
    if (status === '??' || status === '?') {
      charStatus = 'U';
      label = 'Untracked';
      colorClass = 'text-success';
      badgeBgClass = 'bg-success/10 text-success border-success/25';
    } else {
      const s = status?.[1] || status?.[0] || 'M';
      if (s === 'A') {
        charStatus = 'A';
        label = 'Added';
        colorClass = 'text-success';
        badgeBgClass = 'bg-success/10 text-success border-success/25';
      } else if (s === 'D') {
        charStatus = 'D';
        label = 'Deleted';
        colorClass = 'text-error';
        badgeBgClass = 'bg-error/10 text-error border-error/25';
      } else if (s === 'R') {
        charStatus = 'R';
        label = 'Renamed';
        colorClass = 'text-meta';
        badgeBgClass = 'bg-meta/10 text-meta border-meta/25';
      } else {
        charStatus = 'M';
        label = 'Modified';
        colorClass = 'text-info';
        badgeBgClass = 'bg-info/10 text-info border-info/25';
      }
    }
  }

  return { charStatus, label, colorClass, badgeBgClass, isStaged };
}

/**
 * Builds lookup maps for files and their ancestor folders.
 */
export function buildGitStatusMaps(changes: GitChange[]): {
  fileMap: Map<string, GitChange>;
  folderMap: Map<string, FolderGitStatusInfo>;
} {
  const fileMap = new Map<string, GitChange>();
  const folderMap = new Map<string, FolderGitStatusInfo>();

  if (!Array.isArray(changes)) {
    return { fileMap, folderMap };
  }

  for (const change of changes) {
    if (!change || !change.file) continue;
    const normalizedFile = change.file.replace(/^\/+/, '');
    fileMap.set(normalizedFile, change);

    // Also index with leading slash or without to ensure reliable lookup
    const segments = normalizedFile.split('/');
    segments.pop(); // remove filename

    let currentPath = '';
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = folderMap.get(currentPath) || {
        count: 0,
        hasModified: false,
        hasUntracked: false,
        hasStaged: false,
        hasDeleted: false,
        colorClass: 'text-info',
      };

      existing.count += 1;
      const isStaged = change.staged || (change.status && change.status[0] !== ' ' && change.status[0] !== '?');
      if (isStaged) existing.hasStaged = true;

      if (change.status === '??') {
        existing.hasUntracked = true;
      } else if (change.status?.includes('D')) {
        existing.hasDeleted = true;
      } else {
        existing.hasModified = true;
      }

      // Priority of folder indicator color: Staged / Modified (info/blue) > Untracked (success/green) > Deleted (error/red)
      if (existing.hasModified || existing.hasStaged) {
        existing.colorClass = 'text-info';
      } else if (existing.hasUntracked) {
        existing.colorClass = 'text-success';
      } else if (existing.hasDeleted) {
        existing.colorClass = 'text-error';
      }

      folderMap.set(currentPath, existing);
    }
  }

  return { fileMap, folderMap };
}
