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
}
