/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Watch the skill/command roots omp reads and refresh every live child when one
 * of them changes.
 *
 * The chamber's own write path already reloads (settings/skills,
 * settings/commands), but that covers only writes it made. A SKILL.md can also
 * land from a hand edit, `git pull`, the `skills` CLI, another agent session, or
 * an editor — and omp discovers skills once per process, so a live child keeps
 * reporting the old inventory until it restarts. Verified against a live
 * chamber: a hand-written project skill was invisible to a running session, and
 * `/skill:<name>` reached the model as literal text.
 *
 * The refresh itself is one `/reload-plugins` per child (see reload.server.ts);
 * this module only decides WHEN. That is deliberately a filesystem signal
 * rather than a poll: the alternative re-runs `omp skill list` on a timer for
 * every workspace, spawning a process per tick to answer a question that only
 * changes when a file does.
 *
 * Roots watched come from `discovery-roots.ts` — ONE table shared with
 * `locateCommandFile`, because the two were written separately and this copy
 * was short by every root but the omp-native pair, so a skill added to
 * `.claude/skills`, `.codex/skills`, `.opencode/skills`, `.agents/skills` or
 * `.github/skills` in a live session was never noticed. It is applied to the
 * user scope, to every registered workspace, and to every LIVE session's cwd —
 * a session can run outside every registered workspace (a folder opened
 * straight from the sidebar, the app root) and omp still resolves project
 * skills from that directory.
 *
 * `fs.watch` with `recursive: true` costs no descriptors on macOS/Bun (measured
 * with the repo's own `countOpenFileDescriptors`: zero delta for three
 * recursive watchers over 42 entries), so the descriptor cliff this project
 * guards against is not a factor here.
 *
 * A root that does not exist yet is NOT created — the chamber must not write
 * `.omp/skills` into a user's repository just to watch it. Instead the nearest
 * existing ancestor is watched without recursion, and the real root is picked
 * up the moment it appears. That is what makes the very first skill a workspace
 * ever gets visible without a restart.
 *
 * The root list and the reload are injected, so the decision layer is testable
 * without patching modules: `createDiscoveryRootsWatch` builds an independent
 * instance, and the module-level `sync`/`stop` below drive the one the server
 * uses.
 */

import { watch, type FSWatcher } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getDb } from '@/server/db.server';
import { pathExists } from '@/server/lib/omp/core/paths';
import { commandRoots, skillRoots } from '@/server/lib/omp/config/discovery-roots';
import { listRpcSessions } from '@/server/lib/omp/rpc/session-registry';
import { reloadLiveSessions } from '@/server/lib/omp/session/reload.server';

/** One reload per burst: a save is several events (temp file, rename, the
 *  directory entry), and a catalog install writes many files at once. */
const DEBOUNCE_MS = 250;

/** A user with a hundred registered workspaces would otherwise hold two
 *  watchers per workspace; the cap keeps the cost bounded and is far above a
 *  real setup. */
const MAX_WORKSPACE_ROOTS = 20;

/** How far up to walk looking for a directory that exists. */
const MAX_ANCESTOR_DEPTH = 8;

export interface DiscoveryWatchDeps {
  /** Directories to watch. Read on every sync, so a workspace added later is
   *  picked up by the next one. */
  roots: () => Promise<string[]>;
  /** Called once per burst of filesystem events under a watched root. */
  onReload: () => void;
}

export interface DiscoveryWatch {
  /** Bring the watcher set in line with `deps.roots()`. Idempotent and
   *  serialized, so overlapping calls cannot double a watcher. Returns the
   *  number of roots requested. */
  sync: () => Promise<number>;
  /** Close every watcher and cancel a pending reload. */
  stop: () => void;
}

export function createDiscoveryRootsWatch(deps: DiscoveryWatchDeps): DiscoveryWatch {
  /** Watchers currently held, keyed by the directory watched — a real root or
   *  the ancestor bridging to one that does not exist yet. */
  const active = new Map<string, FSWatcher>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<number> = Promise.resolve(0);

  function scheduleReload(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // Re-sync first: a change may be the CREATION of a root that was bridged
      // through an ancestor, and that root needs its own recursive watcher
      // before its contents can be seen. The reconcile is idempotent, so a
      // burst that changed nothing structural costs one pass.
      void sync().finally(() => deps.onReload());
    }, DEBOUNCE_MS);
    debounceTimer.unref?.();
  }

  function attach(target: string, recursive: boolean, onChange: () => void): void {
    if (active.has(target)) return;
    try {
      const watcher = watch(target, { recursive }, onChange);
      watcher.on('error', (error) => {
        console.error(`[discovery-watch] watcher for ${target} failed:`, error);
      });
      active.set(target, watcher);
    } catch {
      // A root can disappear between the existence check and the watch (a scope
      // being deleted); the next sync re-establishes it.
    }
  }

  /**
   * Watch `target`, or the nearest existing ancestor when it is not there yet.
   *
   * Only a genuine root is watched RECURSIVELY. An ancestor standing in for a
   * missing root is watched for its direct children alone — the nearest
   * existing ancestor of `<workspace>/.omp/skills` can be the whole workspace,
   * and a recursive watch there would broadcast a reload for every file an
   * editor, a build or a `git checkout` touches.
   */
  async function ensureWatch(target: string, desired: Set<string>, isRoot: boolean, depth = 0): Promise<void> {
    const key = resolve(target);
    if (await pathExists(target)) {
      desired.add(key);
      attach(key, isRoot, scheduleReload);
      return;
    }
    if (depth >= MAX_ANCESTOR_DEPTH) return;
    const parent = dirname(target);
    if (parent === target) return;
    await ensureWatch(parent, desired, false, depth + 1);
  }

  async function reconcile(): Promise<number> {
    const roots = await deps.roots();
    const desired = new Set<string>();
    for (const root of roots) await ensureWatch(root, desired, true);

    for (const [key, watcher] of active) {
      if (desired.has(key)) continue;
      watcher.close();
      active.delete(key);
    }
    return roots.length;
  }

  function sync(): Promise<number> {
    // A rejection in an earlier pass must not poison the chain, or every later
    // sync would be skipped and the watcher set would freeze.
    chain = chain.then(reconcile, reconcile);
    return chain;
  }

  function stop(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    for (const watcher of active.values()) watcher.close();
    active.clear();
  }

  return { sync, stop };
}

/** Directories omp reads for skills/commands, user scope first. */
async function defaultRoots(): Promise<string[]> {
  const roots = [
    ...skillRoots().map((root) => root.dir),
    ...commandRoots().map((root) => root.dir),
    ...(await workspaceRoots()),
    ...liveSessionRoots(),
  ];
  // A session cwd inside a registered workspace repeats that workspace's roots.
  return [...new Set(roots.map((root) => resolve(root)))];
}

/**
 * `<cwd>/.omp/{skills,commands}` and every other root omp reads for each LIVE
 * session.
 *
 * A session can run outside every registered workspace — a folder opened
 * straight from the sidebar, or the app root — and omp still resolves project
 * skills from that cwd. Without this, a skill written into such a directory was
 * never watched (verified: a session spawned in `/tmp/final-check` did not see
 * a SKILL.md written into its own `.omp/skills`, while the identical write into
 * the user scope was picked up).
 */
function liveSessionRoots(): string[] {
  return listRpcSessions().flatMap((session) => [
    ...skillRoots(session.cwd).map((root) => root.dir),
    ...commandRoots(session.cwd).map((root) => root.dir),
  ]);
}

/** Every root omp reads for each registered workspace. */
async function workspaceRoots(): Promise<string[]> {
  const paths = await registeredWorkspacePaths();
  return paths.flatMap((path) => [
    ...skillRoots(path).map((root) => root.dir),
    ...commandRoots(path).map((root) => root.dir),
  ]);
}

async function registeredWorkspacePaths(): Promise<string[]> {
  try {
    const db = await getDb();
    const rows = (await db.all(
      'SELECT project_path FROM workspace_folders WHERE project_path IS NOT NULL ORDER BY id ASC LIMIT ?',
      [MAX_WORKSPACE_ROOTS],
    )) as { project_path: string }[];
    return rows.map((row) => row.project_path);
  } catch {
    // No database yet (or a locked one): the user scope is still worth watching.
    return [];
  }
}

/**
 * The server's watcher set, anchored on `globalThis`.
 *
 * `bun --hot` re-evaluates a changed module in place while the process — and
 * therefore every `fs.watch` handle the module opened — keeps living. A
 * module-binding instance would be replaced by a fresh, empty one, orphaning
 * the previous set: the old watchers still fire (each broadcast now duplicated)
 * and nothing can close them any more, since the reference was the only handle.
 * That is the same reason the database, the terminal store and the flock host
 * live here.
 */
function getServerWatch(): DiscoveryWatch {
  const slot = globalThis as { __ompDiscoveryWatch?: DiscoveryWatch };
  slot.__ompDiscoveryWatch ??= createDiscoveryRootsWatch({
    roots: defaultRoots,
    onReload: () => {
      void reloadLiveSessions().catch((error) => {
        console.error('[discovery-watch] reload failed:', error);
      });
    },
  });
  return slot.__ompDiscoveryWatch;
}

const serverWatch = getServerWatch();

/** Bring the server's watcher set in line with the current user scope and
 *  workspace list. Called at boot and again whenever a workspace is added. */
export function syncDiscoveryRootsWatch(): Promise<number> {
  return serverWatch.sync();
}

/** Close the server's watchers (shutdown). */
export function stopDiscoveryRootsWatch(): void {
  serverWatch.stop();
}
