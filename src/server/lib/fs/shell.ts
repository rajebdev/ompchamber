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
  /** Kill the process after this many milliseconds (Bun-native). */
  timeout?: number;
  /** Kill the process once it has emitted more than this many bytes (Bun-native). */
  maxBuffer?: number;
  env?: Record<string, string | undefined>;
}

export function runShell(command: string, options: ShellOptions = {}): Promise<ShellResult> {
  const proc = Bun.spawn({
    cmd: ['sh', '-c', command],
    cwd: options.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: options.env ? { ...Bun.env, ...options.env } : undefined,
  });
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
