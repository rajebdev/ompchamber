/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a platform must be able to answer about a foreign PID, in its own
 * syscall vocabulary. One implementation per OS, selected in `identity.ts`.
 *
 * Every method must degrade rather than throw: a diagnostic question about a
 * PID is never worth failing a request over, and a platform that cannot answer
 * says so (`null` / `false`) so the caller can fall back.
 */
export interface ProcessProbe {
  /** Command line of a live PID, or null when unreadable. */
  commandLine(pid: number): string | null;
  /** True when the PID exists. */
  isAlive(pid: number): boolean;
  /** True when the PID is defunct — exited but not yet reaped by its parent.
   *  Such a PID still answers signal 0 and holds no port. */
  isZombie(pid: number): boolean;
  /**
   * Foreground process group of the PID's controlling terminal — the value
   * `ps -o tpgid=` prints, including its `0` for "no controlling terminal".
   * Null when this platform (or this call) cannot answer, which is the
   * caller's signal to fall back to `ps`.
   *
   * A PTY's `tpgid` is what tells a shell sitting at its prompt (the group is
   * the shell itself) from one running a command (the group is that command),
   * so it is the exact answer to "is this terminal busy".
   */
  foregroundGroup(pid: number): number | null;
}
