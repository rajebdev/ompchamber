/**
 * oh-my-pi (`omp`) update check + apply. Both go through the resolved omp
 * binary so OMPChamber never embeds the Bun-only SDK. The CLI's `update`
 * output is line-oriented, so we parse it leniently from stdout+stderr.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { invalidateOmpCliCache, resolveOmpBin } from '@/server/lib/omp/core/cli';
import type { UpdateTargetInfo } from '@/shared/types/updates';

const execFileAsync = promisify(execFile);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
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
    const { stdout, stderr } = await execFileAsync(bin, ['update', '--check'], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      env: { ...Bun.env, PAGER: 'cat', FORCE_COLOR: '0' },
    });
    out = combined(stdout, stderr);
  } catch (err) {
    const error = err as ExecError;
    out = combined(error.stdout, error.stderr);
    execMessage = error.message;
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
    const { stdout, stderr } = await execFileAsync(bin, ['update'], {
      timeout: 300000,
      maxBuffer: 1024 * 1024 * 4,
      env: { ...Bun.env, PAGER: 'cat', FORCE_COLOR: '0' },
    });
    invalidateOmpCliCache();
    return { output: combined(stdout, stderr).trim() };
  } catch (err) {
    invalidateOmpCliCache();
    const error = err as ExecError;
    const tail = combined(error.stdout, error.stderr).trim() || error.message;
    throw new Error(tail);
  }
}
