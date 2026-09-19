/**
 * oh-my-pi (`omp`) update check + apply. Both go through the resolved omp
 * binary so OMPChamber never embeds the Bun-only SDK. The CLI's `update`
 * output is line-oriented, so we parse it leniently from stdout+stderr.
 */

import { invalidateOmpCliCache, resolveOmpBin } from '@/server/lib/omp/core/cli';
import type { UpdateTargetInfo } from '@/shared/types/updates';

/** Runs a command, capturing stdout/stderr separately. Non-zero exits keep the captured output. */
async function runCapture(bin: string, args: string[], timeoutMs: number, maxBuffer: number): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const proc = Bun.spawn({
    cmd: [bin, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: timeoutMs,
    maxBuffer,
    env: { ...Bun.env, PAGER: 'cat', FORCE_COLOR: '0' },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

function combined(stdout?: string, stderr?: string): string {
  return [stdout ?? '', stderr ?? ''].join('\n');
}

export async function checkOmpUpdate(): Promise<UpdateTargetInfo> {
  const bin = resolveOmpBin();
  if (!bin) {
    return {
      current: null,
      latest: null,
      updateAvailable: false,
      installed: false,
      error: 'omp binary not found',
    };
  }

  let out = '';
  let execMessage: string | null = null;
  try {
    const { stdout, stderr, exitCode } = await runCapture(bin, ['update', '--check'], 30000, 1024 * 1024);
    out = combined(stdout, stderr);
    if (exitCode !== 0) execMessage = `omp update --check exited with code ${exitCode}`;
  } catch (err) {
    execMessage = err instanceof Error ? err.message : String(err);
  }

  const current = out.match(/Current version:\s*(\S+)/)?.[1] ?? null;
  const latest =
    out.match(/New version available:\s*(\S+)/)?.[1] ??
    out.match(/Switching to \S+\s+(\S+)/)?.[1] ??
    out.match(/Forcing reinstall of\s+(\S+)/)?.[1] ??
    null;
  const upToDate = /already up to date/i.test(out);
  const updateAvailable = !upToDate && !!latest;

  let error: string | null = null;
  if (!upToDate && !latest) {
    error = execMessage ?? 'Could not determine omp update status';
  }

  return { current, latest, updateAvailable, installed: true, error };
}

export async function applyOmpUpdate(): Promise<{ output: string }> {
  const bin = resolveOmpBin();
  if (!bin) throw new Error('omp binary not found');

  try {
    const { stdout, stderr, exitCode } = await runCapture(bin, ['update'], 300000, 1024 * 1024 * 4);
    invalidateOmpCliCache();
    if (exitCode !== 0) {
      throw new Error(combined(stdout, stderr).trim() || `omp update exited with code ${exitCode}`);
    }
    return { output: combined(stdout, stderr).trim() };
  } catch (err) {
    invalidateOmpCliCache();
    throw err instanceof Error ? err : new Error(String(err));
  }
}
