/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Reading a panel plugin's files off disk.
 *
 * Split out of the scan so the two facts it owns have one home: what a
 * DIRECTORY under the marketplace is (a plugin only if it carries a manifest),
 * and how a manifest is found (a standalone `ompchamber.json` first, then
 * `package.json`'s `ompchamber` key). The scan, the installer and the builder
 * all go through `readPluginManifest`, which is what keeps them agreeing — when
 * the installer had its own copy it read only the first file and refused to
 * install any Bun package at all.
 *
 * Nothing here validates or interprets: `toManifest` owns the rules, and these
 * functions only report what the filesystem says.
 */

import { join } from 'path';
import { pathExists } from '@/server/lib/omp/core/paths';
import { isRecord } from '@/shared/lib/util/guards';

/** Sorted directory names directly under `dir`; empty when it does not exist. */
export async function subdirectories(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  try {
    return (await Array.fromAsync(new Bun.Glob('*/').scan({ cwd: dir, onlyFiles: false })))
      .map((name) => name.replace(/[/\\]+$/, ''))
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Read a JSON file, keeping ABSENT and UNPARSEABLE apart.
 *
 * The difference is load-bearing everywhere this is used: a marketplace
 * directory with no `marketplace.json` is a valid, empty store, while one whose
 * catalog exists but cannot be parsed is a fault the pane must report — the
 * file says "here are the plugins" and nothing can read it.
 */
export async function readJsonBody(
  file: string,
): Promise<{ kind: 'none' } | { kind: 'unreadable' } | { kind: 'body'; value: unknown }> {
  if (!(await pathExists(file))) return { kind: 'none' };
  try {
    return { kind: 'body', value: await Bun.file(file).json() };
  } catch {
    return { kind: 'unreadable' };
  }
}

/**
 * Read a plugin's manifest.
 *
 * Two files can carry it, and both must be tried: `ompchamber.json` for a
 * hand-written plugin, and `package.json`'s `ompchamber` key for a Bun package —
 * which is what a plugin IS, so the second is the common case rather than a
 * legacy one.
 *
 * Three answers, and the difference between the first two is load-bearing: a
 * directory with no manifest at all is not a plugin and is skipped in silence
 * (the root is a directory a user may drop a README into), while a manifest that
 * EXISTS but cannot be parsed is a plugin that was meant to be installed and
 * must be reported. Collapsing them made every stray folder show up as
 * "Rejected".
 */
export async function readPluginManifest(
  dir: string,
): Promise<{ kind: 'none' } | { kind: 'error'; reason: string } | { kind: 'manifest'; value: unknown }> {
  const own = await readJsonBody(join(dir, 'ompchamber.json'));
  if (own.kind === 'unreadable') return { kind: 'error', reason: 'ompchamber.json is not valid JSON' };
  if (own.kind === 'body') return { kind: 'manifest', value: own.value };

  const pkg = await readJsonBody(join(dir, 'package.json'));
  if (pkg.kind === 'unreadable') return { kind: 'error', reason: 'package.json is not valid JSON' };
  if (pkg.kind === 'none') return { kind: 'none' };
  if (!isRecord(pkg.value) || pkg.value.ompchamber === undefined) return { kind: 'none' };
  return { kind: 'manifest', value: pkg.value.ompchamber };
}
