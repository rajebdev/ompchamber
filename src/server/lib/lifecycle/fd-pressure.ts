/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-descriptor pressure, and the honest name for a spawn that dies from it.
 *
 * On macOS `posix_spawn` fails with `EBADF: bad file descriptor` the moment it
 * must hand the child a descriptor numbered at or above `OPEN_MAX` (10240). The
 * error names the shim it tried to exec — `posix_spawn '/bin/sh'` — and says
 * nothing about the cause, so a terminal panel reads "Failed to start /bin/zsh:
 * EBADF: bad file descriptor, posix_spawn '/bin/sh'" while the real condition is
 * that the whole server process has run out of descriptors. Measured A/B on Bun
 * 1.4.2 / macOS 26: 10230 open descriptors spawn fine, 10240 fails with exactly
 * that message.
 *
 * A dev server reaches that state on its own, without a leak in this codebase:
 * `Bun.serve({ development: true })` keeps the client module graph open
 * (measured: 3545 descriptors for this app, against 17 in production), and a
 * macOS reload never closes the previous generation's (bun#40706, bun#40907 —
 * the pre-exec sweep exists only on Linux). The count therefore grows with
 * every rebuild, and past the cliff every spawn in the process fails at once:
 * the PTY shell, the `omp` child, `git`, `rg`.
 *
 * `countOpenFileDescriptors()` answers "how close?" with `fcntl(F_GETFD)` over
 * the descriptor table — the same `bun:ffi` route `flock.ts` takes. The sweep
 * stops at the cliff, because a descriptor above it cannot be opened anyway and
 * that bound keeps the probe near 1 ms. It returns null where the symbols are
 * unavailable (and on Windows), and every caller must read null as "unknown",
 * never as "fine": `describeSpawnFailure` only names exhaustion when it can see
 * the pressure, so a genuine bad-descriptor bug still reports itself plainly.
 */

import { dlopen, FFIType } from 'bun:ffi';
import type { FFIFunction, Library } from 'bun:ffi';

/**
 * Darwin's `OPEN_MAX`: the first descriptor number a process cannot hold, and
 * therefore the point where `posix_spawn` starts answering `EBADF`. Verified on
 * Bun 1.4.2 (10230 ok, 10240 fails).
 */
export const SPAWN_CLIFF = 10_240;

/**
 * Pressure is reported as "near" from 90% of the swept range. The remaining
 * 1024 descriptors are what a burst of spawns needs (an omp child takes
 * several), and the failure arrives without a warning of its own: once the
 * table is full there is room for neither a retry nor a log line.
 */
const NEAR_CLIFF_RATIO = 0.9;

const FD_SYMBOLS = {
  fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  getdtablesize: { args: [], returns: FFIType.i32 },
} satisfies Record<string, FFIFunction>;

/** Library names to try, in the order each platform resolves them. */
const LIBC_NAMES = ['libc.dylib', 'libSystem.B.dylib', 'libc.so.6'] as const;

/** `F_GETFD` — the cheapest question that distinguishes open from closed. */
const F_GETFD = 1;

declare global {
  // eslint-disable-next-line no-var
  var __ompChamberFdLib: Library<typeof FD_SYMBOLS> | null | undefined;
}

/** libc with `fcntl`/`getdtablesize`, or null where this host has neither. */
function libc(): Library<typeof FD_SYMBOLS> | null {
  if (globalThis.__ompChamberFdLib !== undefined) return globalThis.__ompChamberFdLib;
  globalThis.__ompChamberFdLib = null;
  if (process.platform === 'win32') return null;
  for (const name of LIBC_NAMES) {
    try {
      globalThis.__ompChamberFdLib = dlopen(name, FD_SYMBOLS);
      return globalThis.__ompChamberFdLib;
    } catch {
      // Try the next name; a host with none of them keeps the null answer.
    }
  }
  return null;
}

export interface FdPressure {
  /** Descriptors open below `limit`. */
  open: number;
  /** Highest descriptor number seen, or -1 when the table looked empty. */
  highest: number;
  /** Where the sweep stopped: `getdtablesize()`, capped at the cliff. */
  limit: number;
  /** Whether the next spawn is at risk. See `NEAR_CLIFF_RATIO`. */
  nearCliff: boolean;
}

/**
 * Sweep the descriptor table, or null when this host cannot answer.
 *
 * Descriptors are allocated lowest-first, so the number of open descriptors and
 * the highest one agree on a saturated table — which is the only state that
 * matters here, and the state a dev server reaches by degrees.
 *
 * Never throws: `GET /api/health` is the CLI's readiness probe and the client's
 * liveness check, so a host where the symbol resolves but the call does not
 * must degrade to "unknown" rather than take those down. `open` saturates at
 * `limit`, since the sweep stops there by design.
 */
export function countOpenFileDescriptors(): FdPressure | null {
  const symbols = libc();
  if (!symbols) return null;

  try {
    const reported = symbols.symbols.getdtablesize();
    const table = Number.isFinite(reported) && reported > 0 ? reported : SPAWN_CLIFF;
    const limit = Math.min(table, SPAWN_CLIFF);

    let open = 0;
    let highest = -1;
    for (let fd = 0; fd < limit; fd++) {
      if (symbols.symbols.fcntl(fd, F_GETFD, 0) !== -1) {
        open += 1;
        highest = fd;
      }
    }
    return { open, highest, limit, nearCliff: highest >= limit * NEAR_CLIFF_RATIO };
  } catch {
    return null;
  }
}

/**
 * What descriptor exhaustion looks like in Bun's own words. macOS names the
 * failing syscall (`EBADF … posix_spawn '/bin/sh'`), Linux the errno
 * (`EMFILE: too many open files, socketpair`) — measured on both.
 */
const EXHAUSTION_SYMPTOM = /\bEBADF\b|\bEMFILE\b|too many open files/i;

/**
 * The message to surface for a failed spawn: Bun's own, plus what it takes to
 * act on it when the cause is descriptor exhaustion.
 *
 * Two conditions, both required. The message must carry the symptom, and the
 * sweep must see real pressure — a truncated table is not the only way `EBADF`
 * reaches here, and appending "out of descriptors" to a genuine bad-descriptor
 * bug (or to an unrelated `ENOENT` that failed while the table happened to be
 * full) sends the next reader down the wrong path.
 */
export function describeSpawnFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (!EXHAUSTION_SYMPTOM.test(raw)) return raw;
  const pressure = countOpenFileDescriptors();
  if (!pressure || !pressure.nearCliff) return raw;
  return (
    `${raw} — the chamber server is out of file descriptors ` +
    `(${pressure.open} of ${pressure.limit} open, highest #${pressure.highest}); restart the instance. ` +
    `A dev server holds the whole client module graph open and a macOS reload never releases ` +
    `the previous generation (bun#40706), so the count only climbs.`
  );
}
