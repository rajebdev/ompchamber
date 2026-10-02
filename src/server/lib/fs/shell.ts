/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bun-native replacement for the former `util.promisify(exec)` pattern.
 *
 * Runs a command through /bin/sh (matching node's `exec` shell semantics) and
 * captures stdout/stderr as text. Exit handling is explicit: unlike the
 * promisified node API, Bun never throws for non-zero exits — callers check
 * `exitCode`. `error` carries the spawn failure only (ENOENT, timeout kill is
 * surfaced via signalCode instead).
 *
 * The timeout signals the whole process GROUP. A shell that forked a child
 * (`sh -c 'sleep 5'` does on Linux) keeps stdout open from that child, so
 * killing only the shell leaves the reads below blocked until the child exits
 * on its own — measured at the full 5s instead of the 100ms timeout. Bun's own
 * `timeout` option signals the shell alone, which is why the kill is ours.
 * Windows has no POSIX process group and gets the single kill.
 */

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  killed: boolean;
  error?: Error;
}

export interface ShellOptions {
  cwd?: string;
  /** Signal the process group after this many milliseconds. */
  timeout?: number;
  /** Kill the process once it has emitted more than this many bytes (Bun-native). */
  maxBuffer?: number;
  env?: Record<string, string | undefined>;
}

export function runShell(command: string, options: ShellOptions = {}): Promise<ShellResult> {
  const timeout = options.timeout;
  const groupKill = timeout !== undefined && process.platform !== 'win32';
  const proc = Bun.spawn({
    cmd: ['sh', '-c', command],
    cwd: options.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    // Only a timeout needs the shell to lead a group that can be signalled.
    detached: groupKill,
    maxBuffer: options.maxBuffer,
    env: options.env ? { ...Bun.env, ...options.env } : undefined,
  });
  const timer = timeout === undefined
    ? undefined
    : setTimeout(() => {
        try {
          if (groupKill) process.kill(-proc.pid, 'SIGTERM');
          else proc.kill('SIGTERM');
        } catch {
          // Already gone: the command finished inside its own timeout.
        }
      }, timeout);
  return (async () => {
    let error: Error | undefined;
    let stdout = '';
    let stderr = '';
    try {
      [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
    }
    const exitCode = await proc.exited;
    clearTimeout(timer);
    return {
      stdout,
      stderr,
      exitCode,
      signalCode: proc.signalCode,
      killed: proc.killed,
      error,
    };
  })();
}

/** True when the result represents a usable success (exit 0 and no spawn error). */
export function shellOk(result: ShellResult): boolean {
  return result.error === undefined && result.exitCode === 0;
}
