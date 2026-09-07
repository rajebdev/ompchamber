/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Locate an oh-my-pi session file by its session UUID. Uses the same mtime
 * cached scan as the sidebar list (no extra directory walks), then returns
 * the file path when an id matches.
 */

import { getSessionsDir } from './paths';
import { listSessionFiles, scanSessionInfo } from './session-files';

/** Find the absolute path of the .jsonl whose header id matches. */
export function findSessionFileById(
  sessionId: string,
  sessionsRoot: string = getSessionsDir(),
): string | undefined {
  const files = listSessionFiles(sessionsRoot);
  for (const file of files) {
    const info = scanSessionInfo(file);
    if (info?.id === sessionId) return file;
  }
  return undefined;
}
