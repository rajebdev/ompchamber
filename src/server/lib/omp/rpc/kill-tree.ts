/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Process-tree termination for a spawned `omp` child.
 *
 * POSIX: the child runs detached in its own process group, so signaling the
 * negative pid reaches its LSP servers and extension subprocesses too.
 * Windows: no portable negative-pid equivalent, so use taskkill's tree
 * operation instead. Both paths fall back to signaling the direct child when
 * the group/tree kill is unavailable.
 */

import type { ChildProcessWithoutNullStreams, spawn } from 'child_process';

export function killProcessTree(
  child: ChildProcessWithoutNullStreams,
  spawnProcess: typeof spawn,
  force: boolean,
  signal: NodeJS.Signals,
): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    const args = ['/pid', String(pid), '/t', ...(force ? ['/f'] : [])];
    const reaper = spawnProcess('taskkill', args, { windowsHide: true, stdio: 'ignore' });
    reaper.once('error', () => {
      try {
        child.kill(signal);
      } catch {}
    });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {}
  }
}
