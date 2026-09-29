/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The one `git` spawn the wiki reader uses.
 *
 * **argv, never a shell string.** A wiki path is author-chosen and does hold
 * spaces (`Setting-up-a-OneDrive-project-to-use-with-diagrams.net.md`); a
 * checkout path is user-chosen and may hold a quote or a `$`. Passing them as
 * argv elements means there is no shell to escape them against, which is why
 * this does not go through `runShell`.
 *
 * `GIT_TERMINAL_PROMPT=0` is set on every call: without it a private wiki blocks
 * on a credential prompt with no terminal to answer it, and the read hangs to
 * its timeout instead of reporting that the wiki is not readable.
 */

export interface GitRun {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** True when the process was killed (timeout) or could not be started. */
  failed: boolean;
}

export interface GitRunOptions {
  cwd?: string;
  timeoutMs: number;
}

export async function gitRun(args: string[], { cwd, timeoutMs }: GitRunOptions): Promise<GitRun> {
  let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'>;
  try {
    proc = Bun.spawn({
      cmd: ['git', ...args],
      cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: timeoutMs,
      env: { ...Bun.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    // `git` is not on PATH. A wiki read is a convenience, so this reports an
    // unreachable wiki rather than throwing through the route.
    return { stdout: '', stderr: error instanceof Error ? error.message : String(error), exitCode: null, failed: true };
  }

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode, failed: exitCode === null || proc.signalCode != null };
}

/** One line of git's own message, for a response's `detail`. */
export function firstLine(value: string): string {
  return value.trim().split('\n')[0]?.trim() ?? '';
}
