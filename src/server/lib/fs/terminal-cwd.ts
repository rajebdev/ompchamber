import path from 'path';
import { isWithinRoot } from '@/server/lib/fs/root';

/** True when `dir` resolves to an existing directory (async stat probe). */
export async function isDirectory(dir: string): Promise<boolean> {
  const stat = await Bun.file(dir).stat().catch(() => null);
  return stat?.isDirectory() ?? false;
}

/**
 * Resolve the directory a terminal command should run in. `requestedCwd` is
 * honored only when it stays within `rootDir` and names a real directory;
 * otherwise the command runs at the root.
 */
export async function resolveTerminalCwd(rootDir: string, requestedCwd: string): Promise<string> {
  if (!requestedCwd) return rootDir;
  const resolved = path.isAbsolute(requestedCwd)
    ? path.resolve(requestedCwd)
    : path.resolve(rootDir, requestedCwd);
  if (isWithinRoot(rootDir, resolved) && (await isDirectory(resolved))) return resolved;
  return rootDir;
}

export type CdResult =
  | { ok: true; cwd: string }
  | { ok: false; reason: 'above-root' | 'missing' };

/**
 * Resolve a `cd <target>` against the current directory. The containment test
 * mirrors the original `startsWith(rootDir)` (no separator) exactly, so an
 * out-of-root sibling is still rejected the same way it always was.
 */
export async function resolveCdTarget(
  rootDir: string,
  currentDir: string,
  target: string,
): Promise<CdResult> {
  const nextDir = path.resolve(currentDir, target);
  if (!nextDir.startsWith(rootDir)) return { ok: false, reason: 'above-root' };
  if (!(await isDirectory(nextDir))) return { ok: false, reason: 'missing' };
  return { ok: true, cwd: path.relative(rootDir, nextDir) || '.' };
}

/** Match a bare `cd` invocation; returns the trimmed target or null. */
export function matchCdCommand(command: string): string | null {
  const match = command.match(/^cd(?:\s+(.*))?$/);
  if (!match) return null;
  return (match[1] || '').trim();
}
