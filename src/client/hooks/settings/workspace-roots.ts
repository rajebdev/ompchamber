/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'preact/hooks';
import type { ProjectOption } from '@/client/components/settings/ProjectSelectorDropdown';

interface ProjectConfigItem {
  id: string;
  name: string;
  path?: string;
}

export interface WorkspaceRoots {
  options: ProjectOption[];
  /** Workspace root for a selected option id, or null for the user scope. */
  rootFor: (optionId: string) => string | null;
}

/** Option id for the user-level (no workspace) scope. */
export const GLOBAL_SCOPE_ID = 'global';

/**
 * The workspace folders the skills/commands panels can be scoped to.
 *
 * These are the real registered folders (`/api/settings/projects`), not the
 * hardcoded placeholder list the panels used to offer: a skill panel scoped to
 * a made-up project name sent a root the server could not resolve, so the
 * picker silently did nothing. The `value` of each option is the folder's
 * project path, which is what the API expects as `?root=`.
 */
export function useWorkspaceRoots(): WorkspaceRoots {
  const [options, setOptions] = useState<ProjectOption[]>([
    { id: GLOBAL_SCOPE_ID, name: 'global', label: 'User (all projects)', value: '' },
  ]);

  useEffect(() => {
    let active = true;
    fetch('/api/settings/projects')
      .then((res) => res.json())
      .then((data: { projects?: ProjectConfigItem[] }) => {
        if (!active) return;
        const folders = (data.projects ?? [])
          .filter((project) => typeof project.path === 'string' && project.path)
          .map((project) => ({
            id: project.id,
            name: project.name,
            label: project.name,
            value: project.path as string,
          }));
        setOptions([
          ...folders,
          { id: GLOBAL_SCOPE_ID, name: 'global', label: 'User (all projects)', value: '' },
        ]);
      })
      .catch((error) => console.error('Failed to load workspace folders:', error));
    return () => {
      active = false;
    };
  }, []);

  const rootFor = (optionId: string): string | null => {
    const option = options.find((candidate) => candidate.id === optionId);
    const value = option?.value ?? '';
    return value || null;
  };

  return { options, rootFor };
}
