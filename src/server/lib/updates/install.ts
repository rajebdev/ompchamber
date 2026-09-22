/**
 * OMPChamber self-update.
 *
 * Resolves the newest published release, works out how this copy was installed
 * (./install-method), then replaces it in place:
 *
 * - `bun-global` — `bun add -g ompchamber@<version>`.
 * - `git` — fetch, fast-forward to the release tag, then `bun install` and a
 *   client rebuild (`dist/` is gitignored, so a source checkout must rebuild).
 *
 * `ompchamber update` and the console's `POST /api/updates/apply` both run
 * through here, so the CLI and the web button can never drift apart.
 */

import { join as joinPath, resolve as resolvePath } from 'node:path';

import { resolveBunBin } from '@/server/lib/lifecycle/bun';
import { fetchLatestRelease, type GitHubRelease } from '@/server/lib/updates/github';
import {
  detectInstallMethod,
  isManualMethod,
  manualUpdateCommand,
  type InstallMethod,
  type InstallMethodInfo,
} from '@/server/lib/updates/install-method';
import { isNewer, normalizeVersion } from '@/shared/lib/updates/semver';

/** Package root of the running copy: src/server/lib/updates -> four levels up. */
const DEFAULT_PKG_ROOT = resolvePath(import.meta.dir, '..', '..', '..', '..');
/** A client rebuild is slow, but a hung child is worse. */
const STEP_TIMEOUT_MS = 600_000;
/** Cap on the captured output returned to the console. */
const OUTPUT_LIMIT = 20_000;

export interface OmpChamberVersionInfo {
  /** Version on disk right now (`package.json`), null when unreadable. */
  current: string | null;
  /** Newest published release, null when none could be resolved. */
  latest: string | null;
  updateAvailable: boolean;
  release: GitHubRelease | null;
  error: string | null;
}

export interface InstallContext extends InstallMethodInfo {
  pkgRoot: string;
  gitRemote: string | null;
  /** Resolved Bun binary used for `bun add` / `bun install` / `bun run build`. */
  bunBin: string;
}

export interface UpdateStep {
  label: string;
  cmd: string[];
  cwd: string;
}

export interface UpdateOptions {
  /** Reinstall even when the installed version is already the latest. */
  force?: boolean;
  pkgRoot?: string;
  /** Receives command output as it arrives (the CLI streams it; the server does not). */
  onLine?: (chunk: string) => void;
  /** Receives a step label before the step runs. */
  onStage?: (label: string) => void;
}

export interface OmpChamberUpdateResult {
  success: boolean;
  /** The environment cannot self-update; `message` holds the command to run. */
  manual: boolean;
  /** Files were actually replaced by this call. */
  updated: boolean;
  method: InstallMethod;
  reason: string;
  current: string | null;
  latest: string | null;
  /** The release version this call targeted. */
  version: string | null;
  message: string;
  releaseUrl: string | null;
  /** Captured command output (tail), for non-streaming callers. */
  output: string;
}

function runSync(cmd: string[], cwd?: string): { ok: boolean; out: string } {
  try {
    const proc = Bun.spawnSync({
      cmd,
      cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 15_000,
    });
    return { ok: proc.exitCode === 0, out: proc.stdout.toString().trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

/** Version installed on disk — not the one the running process imported. */
export async function readInstalledVersion(pkgRoot = DEFAULT_PKG_ROOT): Promise<string | null> {
  try {
    const pkg = (await Bun.file(joinPath(resolvePath(pkgRoot), 'package.json')).json()) as { version?: unknown };
    return typeof pkg?.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  }
}

/** Installed version + newest published release, never throws. */
export async function resolveOmpChamberVersion(pkgRoot = DEFAULT_PKG_ROOT): Promise<OmpChamberVersionInfo> {
  const current = await readInstalledVersion(pkgRoot);
  let release: GitHubRelease | null = null;
  try {
    release = await fetchLatestRelease();
  } catch {
    release = null;
  }
  const latest = release ? normalizeVersion(release.tag) : null;
  return {
    current,
    latest,
    updateAvailable: Boolean(current && latest && isNewer(latest, current)),
    release,
    error: release ? null : 'No OMPChamber release could be resolved',
  };
}

/** Which install this is, plus the git facts and Bun binary the steps need. */
export function resolveInstallContext(pkgRoot = DEFAULT_PKG_ROOT): InstallContext {
  // Callers pass a path built with `..` segments (CLI/`import.meta.dir`), and
  // these strings end up in user-facing messages and git arguments.
  const root = resolvePath(pkgRoot);
  const inside = runSync(['git', '-C', root, 'rev-parse', '--is-inside-work-tree']);
  const gitWorkTree = inside.ok && inside.out === 'true';
  const remote = gitWorkTree ? runSync(['git', '-C', root, 'remote', 'get-url', 'origin']) : null;
  const gitRemote = remote?.ok && remote.out.length > 0 ? remote.out : null;

  return {
    ...detectInstallMethod({ pkgRoot: root, gitWorkTree, gitRemote }),
    pkgRoot: root,
    gitRemote,
    bunBin: resolveBunBin(),
  };
}

/** The commands that install `version` for a given install method. */
export function planUpdateSteps({ method, version, pkgRoot, bunBin }: { method: InstallMethod; version: string; pkgRoot: string; bunBin: string }): UpdateStep[] {
  if (method === 'bun-global') {
    return [
      {
        label: `Installing ompchamber@${version}`,
        cmd: [bunBin, 'add', '-g', `ompchamber@${version}`],
        cwd: pkgRoot,
      },
    ];
  }

  return [
    { label: 'Fetching release tags', cmd: ['git', '-C', pkgRoot, 'fetch', '--tags', 'origin'], cwd: pkgRoot },
    { label: `Fast-forwarding to v${version}`, cmd: ['git', '-C', pkgRoot, 'merge', '--ff-only', `v${version}`], cwd: pkgRoot },
    { label: 'Installing dependencies', cmd: [bunBin, 'install'], cwd: pkgRoot },
    { label: 'Building the client bundle', cmd: [bunBin, 'run', 'build'], cwd: pkgRoot },
  ];
}

async function pump(stream: ReadableStream<Uint8Array>, sink?: (chunk: string) => void): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk.length === 0) continue;
    text += chunk;
    sink?.(chunk);
  }
  return text;
}

async function runStep(step: UpdateStep, onLine?: (chunk: string) => void): Promise<{ ok: boolean; exitCode: number | null; output: string }> {
  const proc = Bun.spawn({
    cmd: step.cmd,
    cwd: step.cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: STEP_TIMEOUT_MS,
    env: { ...Bun.env, PAGER: 'cat', FORCE_COLOR: '0' },
  });
  const [stdout, stderr] = await Promise.all([pump(proc.stdout, onLine), pump(proc.stderr, onLine)]);
  const exitCode = await proc.exited;
  return { ok: exitCode === 0, exitCode, output: `${stdout}${stderr}`.trim() };
}

function tail(text: string): string {
  return text.length > OUTPUT_LIMIT ? `…\n${text.slice(-OUTPUT_LIMIT)}` : text;
}

/**
 * Bring this install to the newest release. Never throws: every failure mode
 * (no release, unsupported install, dirty work tree, failing step) comes back
 * as `success: false` with a message the CLI can print and the console can
 * show verbatim.
 */
export async function updateOmpChamber({ force = false, pkgRoot = DEFAULT_PKG_ROOT, onLine, onStage }: UpdateOptions = {}): Promise<OmpChamberUpdateResult> {
  const context = resolveInstallContext(pkgRoot);
  const root = context.pkgRoot;
  const base = {
    manual: false,
    updated: false,
    method: context.method,
    reason: context.reason,
    current: null,
    latest: null,
    version: null,
    releaseUrl: null,
    output: '',
  } satisfies Omit<OmpChamberUpdateResult, 'success' | 'message'>;
  const fail = (message: string, patch: Partial<OmpChamberUpdateResult> = {}): OmpChamberUpdateResult => ({
    success: false,
    ...base,
    message,
    ...patch,
  });

  let info: OmpChamberVersionInfo;
  try {
    info = await resolveOmpChamberVersion(root);
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'Failed to resolve the latest release');
  }

  const resolved = { current: info.current, latest: info.latest, releaseUrl: info.release?.url ?? null };

  if (!info.latest) {
    return fail(info.error ?? 'No OMPChamber release could be resolved', resolved);
  }

  if (!info.updateAvailable && !force && info.current) {
    return {
      success: true,
      ...base,
      ...resolved,
      version: info.latest,
      message: `OMPChamber ${info.current} is already up to date.`,
    };
  }

  if (isManualMethod(context.method)) {
    return fail(`This copy (${context.reason}) cannot update itself. Run: ${manualUpdateCommand(context.method, info.latest)}`, { ...resolved, manual: true, version: info.latest });
  }

  if (context.method === 'git') {
    // Uncommitted work in the checkout: never merge over it.
    const dirty = runSync(['git', '-C', root, 'status', '--porcelain']);
    if (dirty.ok && dirty.out.length > 0) {
      return fail(`Uncommitted changes in ${root}. Commit or stash them, then update again.`, { ...resolved, manual: true, version: info.latest });
    }
  }

  const collected: string[] = [];
  for (const step of planUpdateSteps({ method: context.method, version: info.latest, pkgRoot: root, bunBin: context.bunBin })) {
    onStage?.(step.label);

    let stepResult: { ok: boolean; exitCode: number | null; output: string };
    try {
      stepResult = await runStep(step, onLine);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return fail(`${step.cmd[0]} could not be started: ${detail}`, { ...resolved, version: info.latest, output: tail(collected.join('\n\n')) });
    }

    if (stepResult.output.length > 0) collected.push(stepResult.output);

    if (!stepResult.ok) {
      return fail(`\`${step.cmd.join(' ')}\` failed with exit code ${stepResult.exitCode ?? 'unknown'}.`, {
        ...resolved,
        version: info.latest,
        output: tail(collected.join('\n\n')),
      });
    }
  }

  return {
    success: true,
    ...base,
    ...resolved,
    updated: true,
    version: info.latest,
    message: `OMPChamber updated to v${info.latest} (${context.method}).`,
    output: tail(collected.join('\n\n')),
  };
}
