import type { WorkspaceFolderData } from '@/types';

export interface ActiveProjectScope {
  folder: WorkspaceFolderData | null;
  /** Registered project root of the selected session's workspace, or null. */
  projectPath: string | null;
}

/**
 * Resolve the workspace folder that owns the currently selected session and,
 * when that folder is bound to an oh-my-pi project (project_path), the project
 * root the right-panel developer tools should be scoped to.
 */
export function activeProjectForSession(
  folders: WorkspaceFolderData[],
  sessionId: string | number | null | undefined
): ActiveProjectScope {
  if (!sessionId) return { folder: null, projectPath: null };
  for (const folder of folders) {
    const ownsSession = (folder.sessions || []).some((s) => String(s.id) === String(sessionId));
    if (ownsSession) return { folder, projectPath: folder.project_path ?? null };
  }
  return { folder: null, projectPath: null };
}
