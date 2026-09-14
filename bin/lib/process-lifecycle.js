// ESM port of ompweb/bin/process-lifecycle.js.
// Semantics are preserved exactly: POSIX signals the whole process group
// (`process.kill(-pid, signal)`) with a `child.kill(signal)` fallback, while
// win32 shells out to `taskkill /pid <pid> /t [/f]`.

import os from 'node:os';
import { spawn } from 'node:child_process';

const forwardedSignals = ['SIGINT', 'SIGTERM'];
const shutdownTimeoutMs = 5_000;

// Time to wait for a terminated process tree to actually exit.
export const STOP_TIMEOUT_MS = 5_000;

function getSignalExitCode(signal) {
  const signalNumber = signal ? os.constants.signals[signal] : undefined;
  return typeof signalNumber === 'number' ? 128 + signalNumber : 1;
}

export function killChildTree(child, force, platform = process.platform, gracefulSignal = 'SIGTERM') {
  if (platform === 'win32' && child.pid) {
    const reaper = spawn('taskkill', ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])], {
      windowsHide: true,
      stdio: 'ignore',
    });
    const fallback = () => {
      try { child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch {}
    };
    reaper.once('error', fallback);
    reaper.once('exit', (code) => {
      if (code !== 0) fallback();
    });
    reaper.unref?.();
    return;
  }

  const signal = force ? 'SIGKILL' : gracefulSignal;
  if (platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {}
  }

  try { child.kill(signal); } catch {}
}

function childHasExited(child) {
  return (child.exitCode !== null && child.exitCode !== undefined)
    || (child.signalCode !== null && child.signalCode !== undefined);
}

function waitForChildExit(child, timeoutMs) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timer = setTimeout(() => finish(childHasExited(child)), timeoutMs);
    timer.unref?.();
    child.once('exit', onExit);
  });
}

export async function terminateChildProcess(child, timeoutMs = STOP_TIMEOUT_MS, platform = process.platform) {
  if (childHasExited(child)) return true;
  const exited = waitForChildExit(child, timeoutMs);
  killChildTree(child, true, platform);
  return exited;
}

export function wireChildProcessLifecycle(child, parentProcess = process, timeoutMs = shutdownTimeoutMs, handleChildExit) {
  const signalHandlers = new Map();
  let shutdownTimer;
  const platform = parentProcess.platform ?? process.platform;

  const forceKill = () => killChildTree(child, true, platform);

  for (const signal of forwardedSignals) {
    const handler = () => {
      if (shutdownTimer) {
        forceKill();
        return;
      }

      shutdownTimer = setTimeout(forceKill, timeoutMs);
      shutdownTimer.unref?.();
      killChildTree(child, false, platform, signal);
    };
    signalHandlers.set(signal, handler);
    parentProcess.on(signal, handler);
  }

  child.once('exit', (code, signal) => {
    if (shutdownTimer) clearTimeout(shutdownTimer);

    for (const [forwardedSignal, handler] of signalHandlers) {
      parentProcess.removeListener(forwardedSignal, handler);
    }
    if (handleChildExit?.({ code, signal }) === true) return;

    parentProcess.exit(code ?? getSignalExitCode(signal));
  });
}
