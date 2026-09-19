// ESM port of ompweb/bin/process-lifecycle.js.
// Semantics are preserved exactly: POSIX signals the whole process group
// (`process.kill(-pid, signal)`) with a `child.kill(signal)` fallback, while
// win32 shells out to `taskkill /pid <pid> /t [/f]`.

const forwardedSignals = ['SIGINT', 'SIGTERM'];
const shutdownTimeoutMs = 5_000;

// Time to wait for a terminated process tree to actually exit.
export const STOP_TIMEOUT_MS = 5_000;

// Signal numbers for the 128+N shell exit-code convention (os.constants.signals
// equivalent; only signals forwarded by this module are needed).
const SIGNAL_NUMBERS = { SIGINT: 2, SIGTERM: 15, SIGKILL: 9 };

function getSignalExitCode(signal) {
  const signalNumber = signal ? SIGNAL_NUMBERS[signal] : undefined;
  return typeof signalNumber === 'number' ? 128 + signalNumber : 1;
}

export function killChildTree(child, force, platform = process.platform, gracefulSignal = 'SIGTERM') {
  if (platform === 'win32' && child.pid) {
    const reaper = Bun.spawn({
      cmd: ['taskkill', '/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])],
      stdout: 'ignore',
      stderr: 'ignore',
      windowsHide: true,
    });
    const fallback = () => {
      try { child.kill(force ? 'SIGKILL' : 'SIGTERM'); } catch {}
    };
    void reaper.exited.then((code) => {
      if (code !== 0) fallback();
    }, fallback);
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
      resolve(exited);
    };
    const timer = setTimeout(() => finish(childHasExited(child)), timeoutMs);
    timer.unref?.();
    void child.exited.then(() => finish(true));
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
  let settled = false;
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

  void child.exited.then((code) => {
    if (settled) return;
    settled = true;
    if (shutdownTimer) clearTimeout(shutdownTimer);

    for (const [forwardedSignal, handler] of signalHandlers) {
      parentProcess.removeListener(forwardedSignal, handler);
    }
    if (handleChildExit?.({ code, signal: child.signalCode }) === true) return;

    parentProcess.exit(code ?? getSignalExitCode(child.signalCode));
  });
}
