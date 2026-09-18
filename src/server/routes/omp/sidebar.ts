/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GET /api/omp/sidebar — oh-my-pi sidebar discovery data for OMPChamber.
 *
 * Response mirrors omp-web's sidebar data source (its /api/projects +
 * /api/sessions endpoints), read straight from the oh-my-pi agent directory
 * (~/.omp/agent): managed projects from projects.json merged with projects
 * discovered from session files, plus the full session list (newest first).
 * Read-only — never touches the agent's files.
 *
 * Response:
 *   {
 *     projects: OmpProject[],   // registered (sortOrder/addedAt) + discovered
 *     sessions: OmpSession[],   // newest-modified first, each with projectRoot
 *     agentDir: string,
 *     available: boolean,
 *     generatedAt: string
 *   }
 */

import { json } from '@/server/lib/remix-compat';
import { loadOmpSidebarData } from '@/server/lib/omp/session/reader';

export async function loader() {
  try {
    const data = await loadOmpSidebarData();
    return json(data, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error), code: 'omp_sidebar_load_failed' },
      { status: 500 },
    );
  }
}
