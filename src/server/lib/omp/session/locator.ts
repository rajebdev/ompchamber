/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locate an oh-my-pi session file by its session UUID. Uses the same mtime
 * cached scan as the sidebar list (no extra directory walks), then returns
 * the file path when an id matches.
 */

import { json } from '@/server/lib/remix-compat';
import { getSessionsDir } from '@/server/lib/omp/core/paths';
import { listSessionFiles, readRawHeaderLine, scanSessionInfoCached } from '@/server/lib/omp/session/files';

/** Find the absolute path of the .jsonl whose header id matches. */
export async function findSessionFileById(
  sessionId: string,
  sessionsRoot: string = getSessionsDir(),
): Promise<string | undefined> {
  const files = await listSessionFiles(sessionsRoot);
  for (const file of files) {
    const info = await scanSessionInfoCached(file);
    if (info?.id === sessionId) return file;
  }
  return undefined;
}

/** The JSON 404 envelope every session-resolve guard answers with. */
export function sessionNotFoundResponse(): Response {
  return json({ error: 'Session not found' }, { status: 404 });
}

/**
 * Resolve a session id to its on-disk JSONL path, or the shared 404 response.
 * The union keeps the guard explicit at each call site: `if ('response' in
 * resolved) return resolved.response;`.
 */
export async function resolveSessionFileOr404(
  sessionId: string,
): Promise<{ filePath: string } | { response: Response }> {
  const filePath = await findSessionFileById(sessionId);
  if (!filePath) return { response: sessionNotFoundResponse() };
  return { filePath };
}

/**
 * Resolve the session file path and its recorded cwd (used to respawn the
 * agent in the directory the session was created in), or the shared 404.
 */
export async function resolveSessionPathOr404(
  sessionId: string,
): Promise<{ filePath: string; recordedCwd: string | null } | { response: Response }> {
  const filePath = await findSessionFileById(sessionId);
  if (!filePath) return { response: sessionNotFoundResponse() };
  let recordedCwd: string | null = null;
  const header = await readRawHeaderLine(filePath);
  if (header && typeof header.cwd === 'string') recordedCwd = header.cwd;
  return { filePath, recordedCwd };
}
