/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * macOS process probe: `libproc` + `sysctl`, no subprocess.
 *
 * `ps -ax` answers the same questions, but it costs a process spawn and a full
 * process-table scan per snapshot — measured at ~32 ms here, against ~0.001 ms
 * for the direct calls — and the CLI's `waitForProcessExit` polls liveness every
 * 100 ms. These are the same APIs `ps` itself uses.
 *
 * `sysctl(KERN_PROC_PID)` is the liveness source rather than
 * `proc_pidinfo(PROC_PIDTBSDINFO)`: it answers for a ZOMBIE (which `proc_pidinfo`
 * refuses, returning 0 — verified) and for root-owned PIDs, so one call covers
 * liveness and the zombie distinction for every PID.
 *
 * Every entry point tolerates failure: a PID that vanished between two calls
 * makes the syscall report zero bytes, which is "not alive", and a sandbox that
 * denies the call degrades to signal 0 rather than throwing.
 */

import { dlopen, FFIType, ptr } from 'bun:ffi';

import type { ProcessProbe } from '@/server/lib/lifecycle/proc/types';

/** `sysctl` MIB pieces. */
const CTL_KERN = 1;
const KERN_PROC = 14;
const KERN_PROC_PID = 1;
const KERN_PROCARGS2 = 49;

/**
 * `struct kinfo_proc` up to its `p_stat` byte: `extern_proc`'s union (16),
 * `p_vmspace` (8), `p_sigacts` (8), `p_flag` (4). Verified against this
 * platform: a running process reads 2, a zombie reads 5, `launchd` reads 2.
 */
const KINFO_PROC_BYTES = 648;
const P_STAT_OFFSET = 36;
/** Darwin `p_stat` values. */
const SZOMB = 5;
const SZOMB_LIKE = new Set([SZOMB, 6 /* SDEAD */]);

/** Upper bound on a command line block; the kernel truncates instead. */
const ARGV_BUFFER_BYTES = 262_144;
const PATH_BUFFER_BYTES = 4096;

const libc = dlopen('libc.dylib', {
  sysctl: { args: [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
});

const libproc = dlopen('/usr/lib/libproc.dylib', {
  proc_pidpath: { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
});

/**
 * `p_stat` for a live PID, or null when the PID does not exist.
 *
 * A zero-length result is the kernel saying "no such process"; the call itself
 * failing (rc !== 0) is reported as null too, and callers then fall back.
 */
function procStatus(pid: number): number | null {
  const mib = new Int32Array([CTL_KERN, KERN_PROC, KERN_PROC_PID, pid]);
  const size = new BigUint64Array([BigInt(KINFO_PROC_BYTES)]);
  const buffer = new Uint8Array(KINFO_PROC_BYTES);
  try {
    if (libc.symbols.sysctl(ptr(mib), 4, ptr(buffer), ptr(size), null, 0) !== 0) return null;
  } catch {
    return null;
  }
  if (Number(size[0]) === 0) return null;
  return buffer[P_STAT_OFFSET];
}

/**
 * Executable path, or null. Also answers for root-owned PIDs (verified: pid 1 →
 * `/sbin/launchd`), which is what makes it the identity fallback when argv is
 * denied.
 */
function executablePath(pid: number): string | null {
  const buffer = new Uint8Array(PATH_BUFFER_BYTES);
  try {
    const written = libproc.symbols.proc_pidpath(pid, ptr(buffer), buffer.length);
    return written > 0 ? new TextDecoder().decode(buffer.subarray(0, written)) : null;
  } catch {
    return null;
  }
}

/**
 * argv of a live PID via `KERN_PROCARGS2`, or null.
 *
 * The block is laid out as: `argc` (i32), the executable path (NUL-terminated),
 * padding NULs, then `argc` NUL-terminated arguments. Denied for root-owned
 * PIDs, which is why `commandLine` also consults the executable path.
 */
function argvOf(pid: number): string[] | null {
  const mib = new Int32Array([CTL_KERN, KERN_PROCARGS2, pid]);
  const size = new BigUint64Array([BigInt(ARGV_BUFFER_BYTES)]);
  const buffer = new Uint8Array(ARGV_BUFFER_BYTES);
  try {
    if (libc.symbols.sysctl(ptr(mib), 3, ptr(buffer), ptr(size), null, 0) !== 0) return null;
  } catch {
    return null;
  }

  const length = Number(size[0]);
  if (length <= 4) return null;
  const argc = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(0, true);
  let cursor = 4;
  while (cursor < length && buffer[cursor] !== 0) cursor += 1;
  while (cursor < length && buffer[cursor] === 0) cursor += 1;

  const decoder = new TextDecoder();
  const args: string[] = [];
  for (let index = 0; index < argc && cursor < length; index += 1) {
    let end = cursor;
    while (end < length && buffer[end] !== 0) end += 1;
    args.push(decoder.decode(buffer.subarray(cursor, end)));
    cursor = end + 1;
  }
  return args;
}

function signalAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the PID exists, we may not signal it (root-owned, another user).
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export const darwinProbe: ProcessProbe = {
  commandLine(pid) {
    const args = argvOf(pid);
    if (args && args.length > 0) return args.join(' ');
    return executablePath(pid);
  },
  isAlive(pid) {
    const status = procStatus(pid);
    if (status !== null) return !SZOMB_LIKE.has(status);
    // The syscall itself failed (sandbox) — liveness alone is all that is left.
    return executablePath(pid) !== null || signalAlive(pid);
  },
  isZombie(pid) {
    const status = procStatus(pid);
    return status !== null && SZOMB_LIKE.has(status);
  },
};
