/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Which shell the PTY runtime launches, with which argv, and with which
 * environment.
 *
 * Resolution is a pure function of the environment plus an existence probe, so
 * the preference order stays testable without spawning anything: the user's
 * `$SHELL` first, then the platform's usual suspects.
 */

const POSIX_FALLBACKS = ['/bin/zsh', '/bin/bash', '/bin/sh'];

/** Candidate executables, most preferred first. */
export function shellCandidates(
  env: Record<string, string | undefined> = Bun.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    const comspec = env.COMSPEC?.trim();
    return comspec ? [comspec] : ['cmd.exe'];
  }
  const candidates: string[] = [];
  const preferred = env.SHELL?.trim();
  // Only an absolute $SHELL is trusted: a bare name would be resolved against
  // PATH at spawn time, which is not the login shell the user configured.
  if (preferred && preferred.startsWith('/')) candidates.push(preferred);
  for (const fallback of POSIX_FALLBACKS) {
    if (!candidates.includes(fallback)) candidates.push(fallback);
  }
  return candidates;
}

/**
 * `-i -l` for POSIX shells: interactive (prompt, line editing, job control —
 * job control is what makes Ctrl+Z/`fg` work at all) and login (the user's
 * profile, so PATH and aliases match a normal terminal). cmd.exe takes neither.
 */
export function shellArgs(platform: NodeJS.Platform = process.platform): string[] {
  return platform === 'win32' ? [] : ['-i', '-l'];
}

/**
 * Full argv for the PTY child.
 *
 * POSIX shells are launched through a one-line `/bin/sh` shim that re-acquires
 * the PTY as its controlling terminal before `exec`-ing the real shell:
 *
 *     T=$(tty); exec <shell> -i -l <"$T" >"$T" 2>&1
 *
 * This is required, not cosmetic. The runtime must spawn with
 * `detached: true` — without it the child lands in the *server's* process
 * group, where a group signal would take the chamber down and `SIGWINCH`
 * cannot be addressed to the shell alone. But `setsid()` also drops the
 * controlling terminal, and a shell with no controlling tty silently disables
 * job control (`setopt monitor` fails): Ctrl+Z, `fg` and `jobs` stop working,
 * and typing while a foreground command runs goes to that command instead of
 * the shell. Opening the slave device as stdin/stdout restores it. Verified on
 * macOS: with the shim `tpgid` is the shell's own pid and Ctrl+Z suspends;
 * without it `tpgid` is 0 and Ctrl+Z is swallowed.
 *
 * `exec` keeps the pid, so the shell stays the session leader and group kill
 * still reaches everything it starts. If `tty` fails the shell runs
 * unredirected — stdio is already the PTY, only job control is lost.
 */
export function shellLaunch(executable: string, platform: NodeJS.Platform = process.platform): string[] {
  if (platform === 'win32') return [executable];
  const inner = [executable, ...shellArgs(platform)].join(' ');
  return ['/bin/sh', '-c', `T=$(tty 2>/dev/null); [ -n "$T" ] && exec ${inner} <"$T" >"$T" 2>&1; exec ${inner}`];
}

/**
 * Environment for the PTY child. `TERM`/`COLORTERM` describe the renderer on
 * the other end of the socket; `COLORFGBG` carries the active chamber theme so
 * prompts that read it (zsh themes, vim) pick readable colors.
 */
export function terminalEnv(
  base: Record<string, string | undefined>,
  theme: 'light' | 'dark' = 'dark',
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...base };
  // The chamber's own IPC descriptor is host-private and meaningless inside the
  // PTY; an inherited value makes Node CLIs fail to parse their IPC channel.
  delete env.NODE_CHANNEL_FD;
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.COLORFGBG = theme === 'light' ? '0;15' : '15;0';
  return env;
}

/** First candidate that exists on disk, or null when none does. */
export async function resolveShellExecutable(
  candidates: string[],
  exists: (target: string) => Promise<boolean> = async (target) => Bun.file(target).exists(),
): Promise<string | null> {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}
