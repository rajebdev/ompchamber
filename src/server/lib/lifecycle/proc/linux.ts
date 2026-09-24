/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Linux process probe: `/proc`, no subprocess and no FFI.
 *
 * `procfs` already holds everything `ps` reads, so this is both faster and
 * immune to a missing binary in minimal containers (where the previous `ps`
 * snapshot simply came back empty and identity degraded to `unknown`).
 *
 * `stat` is parsed from the LAST `)` because field 2 is the executable name in
 * parentheses and may itself contain spaces and parentheses.
 */

import fs from 'fs';

import type { ProcessProbe } from '@/server/lib/lifecycle/proc/types';

/** Field 3 of `/proc/<pid>/stat`, 1-indexed, once the comm field is stripped. */
const STATE_FIELD = 0;
const ZOMBIE_STATES = new Set(['Z', 'X']);

function readFile(path: string): string | null {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** `/proc/<pid>/stat` fields after the `(comm)` column, or null. */
function statTail(pid: number): string[] | null {
  const raw = readFile(`/proc/${pid}/stat`);
  if (raw === null) return null;
  const close = raw.lastIndexOf(')');
  if (close === -1) return null;
  return raw.slice(close + 1).trim().split(/\s+/);
}

export const linuxProbe: ProcessProbe = {
  commandLine(pid) {
    const raw = readFile(`/proc/${pid}/cmdline`);
    if (raw === null) return null;
    // NUL-separated argv, with a trailing NUL; empty for a kernel thread.
    const args = raw.split('\0').filter((part) => part.length > 0);
    if (args.length > 0) return args.join(' ');
    // Kernel threads have no argv — `comm` is all the identity there is.
    return readFile(`/proc/${pid}/comm`)?.trim() || null;
  },
  isAlive(pid) {
    // A `/proc` entry exists for a zombie too, so liveness is "the directory is
    // there"; `isZombie` is what separates a corpse from a running process.
    return fs.existsSync(`/proc/${pid}`);
  },
  isZombie(pid) {
    const fields = statTail(pid);
    if (fields === null) return false;
    return ZOMBIE_STATES.has(fields[STATE_FIELD]);
  },
};
