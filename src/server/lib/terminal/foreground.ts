/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Is a shell busy, or sitting at its prompt?
 *
 * The PTY's foreground process group answers this exactly, and the kernel keeps
 * it up to date: when a command runs in the foreground the terminal's `tpgid`
 * becomes that command's group, and when the shell regains control `tpgid`
 * returns to the shell's own pid. Verified on macOS against a real PTY —
 * `sleep 30` moved `tpgid` off the shell's pid, `Ctrl+C` and a backgrounded job
 * both left it on the shell's pid (a background job is by definition not the
 * foreground job).
 *
 * Why it matters: the terminal cap counts *live* shells. "Live" has to mean
 * "has work in flight", otherwise a panel that was opened, restarted, or
 * switched a few times pins the budget with shells that are all idle at a
 * prompt, and the next attach is rejected with nothing actually running.
 *
 * Cost is one `ps` call for the whole registry, so this is safe to run on every
 * attach. It is advisory: any failure resolves to "not busy", because refusing
 * a shell to save a slot is worse than letting one extra through.
 */

const PS_TIMEOUT_MS = 1500;

/** `pid` is the shell's process (it is the PTY session leader, so pgid === pid). */
export interface ShellProcess {
  id: string;
  pid: number;
}

export async function detectBusyShells(shells: ShellProcess[]): Promise<Set<string>> {
  const busy = new Set<string>();
  if (shells.length === 0 || process.platform === 'win32') return busy;

  const byPid = new Map<number, string>();
  for (const shell of shells) byPid.set(shell.pid, shell.id);

  const ps = Bun.spawn(['ps', '-o', 'pid=,tpgid=', '-p', shells.map((s) => s.pid).join(',')], {
    stdout: 'pipe',
    stderr: 'ignore',
  });

  let output = '';
  try {
    output = await Promise.race([
      new Response(ps.stdout).text(),
      Bun.sleep(PS_TIMEOUT_MS).then(() => ''),
    ]);
  } catch {
    // The pipe died; fall through to the kill and the empty result.
  }
  try {
    ps.kill('SIGKILL');
  } catch {
    // Already exited.
  }
  void ps.exited.catch(() => {});

  for (const line of output.split('\n')) {
    const [pidText, tpgidText] = line.trim().split(/\s+/);
    const pid = Number(pidText);
    const tpgid = Number(tpgidText);
    if (!Number.isFinite(pid) || !Number.isFinite(tpgid)) continue;
    const id = byPid.get(pid);
    // The shell holds the terminal exactly when it is its own foreground group.
    if (id !== undefined && tpgid !== pid) busy.add(id);
  }
  return busy;
}
