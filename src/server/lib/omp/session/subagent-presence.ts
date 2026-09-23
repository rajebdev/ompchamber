/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cached "does this session have subagents?" probe.
 *
 * The sidebar loader asks this for EVERY session on EVERY fetch. The honest
 * answer needs the session file's `task` toolCalls, which is the authoritative
 * roster — but reading them means parsing a file that can reach hundreds of
 * megabytes, and doing that per session per poll dominated the endpoint's cost
 * (the dataset scan itself is cached; this probe was not).
 *
 * The roster can only change when the session file gains entries or its
 * sibling artifacts directory changes, so that (last-entry timestamp,
 * sibling-dir mtime) pair is a sufficient cache version. Both cost one stat —
 * orders of magnitude cheaper than the parse they gate. The timestamp is the
 * file's last ENTRY time, not its mtime: a title-slot rewrite bumps mtime
 * without appending anything, and a spurious version bump would re-run the
 * parse it exists to avoid.
 */

import { promises as fs } from 'fs';
import { extractSubagentHistory } from '@/server/lib/omp/subagent/history';
import { siblingDirForSession } from '@/server/lib/omp/subagent/history/paths';

interface PresenceEntry {
  version: string;
  hasSubagents: boolean;
}

/** Bounded so a long-lived server with many sessions cannot grow unbounded. */
const MAX_ENTRIES = 2_000;

const cache = new Map<string, PresenceEntry>();

async function siblingDirMtimeMs(dir: string): Promise<number> {
  try {
    return (await fs.stat(dir)).mtimeMs;
  } catch {
    return 0;
  }
}

export async function sessionHasSubagents(
  sessionPath: string,
  sessionLastEntryAt: string,
): Promise<boolean> {
  const siblingDir = siblingDirForSession(sessionPath);
  const version = `${sessionLastEntryAt}:${await siblingDirMtimeMs(siblingDir)}`;

  const cached = cache.get(sessionPath);
  if (cached && cached.version === version) return cached.hasSubagents;

  let hasSubagents = false;
  try {
    const files = await fs.readdir(siblingDir);
    hasSubagents = files.some((file) => file.endsWith('.jsonl'));
  } catch {
    hasSubagents = false;
  }
  if (!hasSubagents) {
    try {
      hasSubagents = (await extractSubagentHistory(sessionPath)).length > 0;
    } catch {
      hasSubagents = false;
    }
  }

  if (!cached && cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(sessionPath, { version, hasSubagents });
  return hasSubagents;
}
