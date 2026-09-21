/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Git-ignore resolution for the Files panel.
 *
 * `git check-ignore` is the only authority that evaluates every rule source in
 * one pass — per-directory `.gitignore`, `.git/info/exclude`, and the global
 * `core.excludesFile` (`~/.gitignore`) — so the panel dims exactly what git
 * would refuse to track. Paths are fed NUL-separated over stdin (`--stdin -z`)
 * so a directory listing of any size cannot overflow argv, and the verbatim
 * NUL-separated reply maps straight back onto those same paths.
 *
 * Paths must be relative to `dir` and must exist on disk: git resolves
 * directory-only patterns (`build/`) by stat-ing the path.
 */
export async function collectIgnoredPaths(dir: string, relPaths: string[]): Promise<Set<string>> {
  if (relPaths.length === 0) return new Set();

  try {
    const proc = Bun.spawn({
      cmd: ['git', 'check-ignore', '--stdin', '-z'],
      cwd: dir,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
      timeout: 10_000,
    });

    // Drain stdout while the listing is written: a directory big enough to
    // fill both pipe buffers would otherwise deadlock child against parent.
    const stdout = new Response(proc.stdout).text();
    proc.stdin.write(relPaths.map(rel => `${rel}\0`).join(''));
    // FileSink.end() types as `number | Promise<number>` — EPIPE (child gone)
    // must not surface as an unhandled rejection.
    void Promise.resolve(proc.stdin.end()).catch(() => {});

    const [text, exitCode] = await Promise.all([stdout, proc.exited]);
    // 0 = at least one path matched, 1 = none, 128 = no repository. Only 0 can
    // carry a match list.
    if (exitCode !== 0) return new Set();

    return new Set(text.split('\0').filter(Boolean));
  } catch {
    return new Set(); // git missing / spawn failed — nothing is dimmed
  }
}
