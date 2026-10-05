/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Installing a panel plugin from a git URL.
 *
 * The install is a clone into the marketplace's own `plugins/` directory plus a
 * catalog entry, so an installed plugin and a bundled one are the same thing
 * afterwards — the scan does not distinguish them, and neither does the UI.
 *
 * Two properties are load-bearing:
 *
 * - **The clone lands in a temp directory first, and is moved into place only
 *   after its manifest validates.** A clone that fails halfway, or a repository
 *   that is not a plugin, must not leave a directory the scan then reports as
 *   broken; the marketplace either gains a working plugin or is untouched.
 * - **The destination name comes from the manifest id, not from the URL.** The
 *   repository's own name says nothing about the plugin's identity, and two
 *   clones of the same repo under different URLs must not produce two panels
 *   with one key.
 */

import { mkdir, rename, rm } from 'fs/promises';
import { join } from 'path';
import { pathExists } from '@/server/lib/omp/core/paths';
import { gitRun, firstLine } from '@/server/lib/wiki/git';
import { toManifest } from '@/server/lib/panels/manifest';
import { readPluginManifest } from '@/server/lib/panels/registry.server';
import { buildPanelPlugin } from '@/server/lib/panels/build.server';
import { isRecord } from '@/shared/lib/util/guards';
import {
  getMarketplaceCatalogPath,
  getMarketplaceDir,
  getMarketplacePluginsDir,
  invalidatePanelScan,
} from '@/server/lib/panels/registry.server';

const CLONE_TIMEOUT_MS = 120_000;

export interface InstallResult {
  ok: boolean;
  /** The plugin's manifest id, once its manifest has been read. */
  pluginId?: string;
  /** The directory the plugin was installed into. */
  dir?: string;
  error?: string;
}

/**
 * A source `git clone` accepts: an https/ssh URL, the `git@host:path` scp form,
 * or a local path / `file://` URL.
 *
 * The local forms are allowed deliberately. `git clone` treats them as
 * first-class, and the chamber already gives the user a real shell in the
 * terminal panel — so a local clone grants nothing that was not already
 * reachable, while making an offline install and a test repository work.
 */
export function isGitUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return true;
  if (/^ssh:\/\/\S+$/i.test(trimmed)) return true;
  if (/^git@[^:/\s]+:\S+$/.test(trimmed)) return true;
  if (/^file:\/\/\S+$/i.test(trimmed)) return true;
  if (trimmed.startsWith('/') || trimmed.startsWith('~')) return true;
  return false;
}

/** Strip a `.git` suffix and any trailing slash, for a readable temp name. */
function repoSlug(url: string): string {
  const tail = url.replace(/[/\\]+$/, '').split(/[/:]/).pop() ?? 'plugin';
  return tail.replace(/\.git$/i, '').replace(/[^a-z0-9._-]/gi, '-') || 'plugin';
}

/**
 * Clone `url` and install the plugin it contains.
 *
 * The order is: clone to a temp dir, read and validate its manifest, move it to
 * `plugins/<manifest.id>`, then append the catalog entry. Each step is a no-op
 * for the next if it fails, so a failure at any point leaves the marketplace in
 * a state the scan still describes correctly.
 */
export async function installPanelPluginFromGit(url: string): Promise<InstallResult> {
  if (!isGitUrl(url)) {
    return { ok: false, error: 'Expected an https, ssh or git@ URL.' };
  }

  const marketplaceDir = getMarketplaceDir();
  const pluginsDir = getMarketplacePluginsDir();
  // The temp directory is a SIBLING of `plugins/`, not inside it: the scan
  // globs `plugins/*/`, so a half-cloned repository there would be reported as a
  // broken plugin for as long as the clone runs.
  const stagingDir = join(marketplaceDir, `.installing-${repoSlug(url)}-${Date.now()}`);

  try {
    await mkdir(marketplaceDir, { recursive: true });
    await rm(stagingDir, { recursive: true, force: true });

    const clone = await gitRun(['clone', '--depth', '1', '--quiet', url, stagingDir], {
      timeoutMs: CLONE_TIMEOUT_MS,
    });
    if (clone.failed || clone.exitCode !== 0) {
      await rm(stagingDir, { recursive: true, force: true });
      return { ok: false, error: firstLine(clone.stderr) || 'git clone failed' };
    }

    // The same reader the scan uses, so a plugin whose manifest lives in
    // `package.json#ompchamber` (a Bun package — the common shape) installs just
    // as one with a standalone `ompchamber.json`.
    const read = await readPluginManifest(stagingDir);
    if (read.kind === 'none') {
      await rm(stagingDir, { recursive: true, force: true });
      return { ok: false, error: 'That repository has no ompchamber.json, and no ompchamber key in package.json.' };
    }
    if (read.kind === 'error') {
      await rm(stagingDir, { recursive: true, force: true });
      return { ok: false, error: read.reason };
    }

    const manifest = toManifest(read.value, stagingDir);
    if ('error' in manifest) {
      await rm(stagingDir, { recursive: true, force: true });
      return { ok: false, error: manifest.error };
    }

    await mkdir(pluginsDir, { recursive: true });
    const destination = join(pluginsDir, manifest.id);
    if (await pathExists(destination)) {
      await rm(stagingDir, { recursive: true, force: true });
      return { ok: false, error: `A plugin with id "${manifest.id}" is already installed.` };
    }

    await rename(stagingDir, destination);

    // Build BEFORE registering: a package whose build FAILS would otherwise be
    // listed as installed while every one of its frames 404s. A plugin that is
    // not a package is a different answer — its files are served as they are,
    // so it registers normally. The directory stays either way, so the pane can
    // offer a Rebuild.
    const build = await buildPanelPlugin(destination, manifest);
    if (build.status === 'failed') {
      invalidatePanelScan();
      return { ok: true, pluginId: manifest.id, dir: destination, error: build.reason ?? 'the plugin did not build' };
    }

    const catalog = await appendCatalogEntry({
      name: manifest.id,
      source: `plugins/${manifest.id}`,
      description: manifest.description,
      version: manifest.version,
    });

    invalidatePanelScan();
    if (!catalog.ok) {
      // The plugin IS installed — the directory is in place and the scan will
      // find it. Only the catalog entry failed, and the pane reports a missing
      // catalog entry as an error, so the outcome is honest rather than clean.
      return { ok: true, pluginId: manifest.id, dir: destination, error: catalog.error };
    }
    return { ok: true, pluginId: manifest.id, dir: destination };
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Append an entry to the catalog, preserving everything already in it.
 *
 * Read-modify-write rather than a template: the file carries the marketplace's
 * name, description and every earlier install, and rewriting it from a template
 * would drop them. A missing or unparseable catalog is replaced with a minimal
 * one — the alternative is an install that succeeds on disk while the catalog
 * stays broken, which the scan then reports on every load.
 */
async function appendCatalogEntry(entry: {
  name: string;
  source: string;
  description?: string;
  version?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const catalogPath = getMarketplaceCatalogPath();
  let body: Record<string, unknown> = {};
  if (await pathExists(catalogPath)) {
    try {
      const parsed: unknown = await Bun.file(catalogPath).json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }
  }

  const existing: unknown[] = Array.isArray(body.plugins) ? body.plugins : [];
  const already = existing.some((item) => isRecord(item) && item.name === entry.name);
  const plugins = already ? existing : [...existing, { ...entry, category: 'installed' }];

  try {
    await Bun.write(
      catalogPath,
      JSON.stringify({ ...body, plugins }, null, 2) + '\n',
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Remove a plugin: its directory AND its catalog entry.
 *
 * Both, because an install writes both. Dropping only the directory left the
 * catalog naming a path that no longer existed, so every removal produced a
 * permanent "Rejected — listed in marketplace.json but no plugin was found
 * there" row: the pane reporting the user's own successful action as a fault.
 *
 * The catalog is pruned by source path rather than by name, because the name an
 * install writes is the manifest id while a hand-written entry may use any
 * label — and it is the path that the scan resolves.
 */
export async function removePanelPlugin(pluginId: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(pluginId)) return { ok: false, error: 'Invalid plugin id.' };
  const dir = join(getMarketplacePluginsDir(), pluginId);
  if (!(await pathExists(dir))) return { ok: false, error: `No installed plugin with id "${pluginId}".` };
  try {
    await rm(dir, { recursive: true, force: true });
    const pruned = await pruneCatalogEntry(`plugins/${pluginId}`);
    invalidatePanelScan();
    // The directory is gone either way, so the removal succeeded; a catalog
    // that could not be pruned is reported rather than hidden, because the scan
    // will keep flagging the dangling entry.
    return pruned.ok ? { ok: true } : { ok: true, error: pruned.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Drop the catalog entry whose resolved source is `source`, keeping the rest. */
async function pruneCatalogEntry(source: string): Promise<{ ok: boolean; error?: string }> {
  const catalogPath = getMarketplaceCatalogPath();
  if (!(await pathExists(catalogPath))) return { ok: true };

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await Bun.file(catalogPath).json();
    if (!isRecord(parsed)) return { ok: true };
    body = parsed;
  } catch {
    return { ok: false, error: 'marketplace.json is not valid JSON; its entry was left in place.' };
  }

  const existing: unknown[] = Array.isArray(body.plugins) ? body.plugins : [];
  const kept = existing.filter((item) => !(isRecord(item) && item.source === source));
  if (kept.length === existing.length) return { ok: true };

  try {
    await Bun.write(catalogPath, JSON.stringify({ ...body, plugins: kept }, null, 2) + '\n');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

