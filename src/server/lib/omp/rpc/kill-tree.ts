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

export function killProcessTree(pid: number | undefined, force: boolean, signal: NodeJS.Signals): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    const args = ['/pid', String(pid), '/t', ...(force ? ['/f'] : [])];
    try {
      const reaper = Bun.spawn({
        cmd: ['taskkill', ...args],
        stdout: 'ignore',
        stderr: 'ignore',
        windowsHide: true,
      });
      void reaper.exited.then(() => undefined, () => undefined);
      reaper.exited.then(() => {
        // taskkill missing from PATH: fall back to the direct child.
        if (!reaper.exitCode) return;
        try {
          process.kill(pid, signal);
        } catch {}
      });
    } catch {
      try {
        process.kill(pid, signal);
      } catch {}
    }
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {}
  }
}
