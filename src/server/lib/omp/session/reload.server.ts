/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Refresh the plugin/skill inventory of the LIVE omp children.
 *
 * omp discovers skills, commands and plugins once per process and does not
 * watch the filesystem: a SKILL.md written while a session runs is invisible to
 * that session until it restarts (measured: `get_available_commands` kept
 * reporting 8 skill entries after a ninth landed on disk, and `/skill:<new>`
 * resolved to nothing). The only refresh omp exposes is the `/reload-plugins`
 * builtin, which has a text-mode `handle` — so it is reachable as a prompt.
 *
 * Verified against omp 18.3.5: sending `/reload-plugins` as a prompt answers
 * `agentInvoked: false` (no model turn), writes nothing to the transcript, and
 * emits `available_commands_update`, after which the new skill is listed and
 * runnable. That is what makes broadcasting it safe.
 *
 * Only IDLE sessions are reloaded. A busy session is mid-turn, and a prompt
 * dispatched into a running turn is a queue insert with user-visible
 * consequences; its next turn picks the new skills up from the restart path
 * instead. Best-effort: one session failing never blocks the others.
 */

import { listRpcSessions } from '@/server/lib/omp/rpc/session-registry';

/** Ask every idle live session to re-discover plugins. Returns the ids that
 *  accepted the reload. */
export async function reloadLiveSessions(): Promise<string[]> {
  const reloaded: string[] = [];
  await Promise.all(
    listRpcSessions().map(async (session) => {
      if (session.isBusy()) return;
      try {
        await session.send({ type: 'prompt', message: '/reload-plugins' });
        reloaded.push(session.sessionId);
      } catch (error) {
        console.error(
          `Failed to reload plugins for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
  return reloaded;
}
