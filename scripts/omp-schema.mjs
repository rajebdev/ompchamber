/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regenerates `src/client/data/settings/omp-schema.json` from the INSTALLED
 * oh-my-pi.
 *
 * The panel's tab/group/label/editor metadata mirrors omp's own settings
 * panel, and the only way to keep it in step is to read omp's registry rather
 * than transcribe it. The JSON sat frozen from the Remix→Elysia migration
 * (2026-09-18) until this script existed: 157 live settings had no row at all,
 * and 12 rows the chamber still offered were rejected by `omp config get` with
 * `Unknown setting:` — an editor whose write was guaranteed to fail.
 *
 * Source of truth: `orderedSettings()` from the installed
 * `@oh-my-pi/pi-coding-agent`, which imports every settings domain and lists
 * them in panel order. It is imported through omp's OWN source path, because
 * the published package ships `src/` beside `dist/` and `src` is where the
 * definitions live; `dist/cli.js` is a minified bundle whose definitions are
 * `re({…})` calls that only a partial evaluator could read (measured: the
 * enum/`ui` shape survives, but expression-valued defaults do not).
 *
 *   bun run scripts/omp-schema.mjs [--out <path>] [--check]
 *
 * `--check` regenerates in memory and exits non-zero when the file on disk
 * differs, so CI can fail a stale schema instead of shipping one.
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const DEFAULT_OUT = join(REPO, 'src/client/data/settings/omp-schema.json');

/** The package omp installs settings from. Resolved from the repo so a global
 *  install and a workspace install both work; `bun pm ls -g` is not consulted
 *  because the chamber may run against either. */
const PACKAGE = '@oh-my-pi/pi-coding-agent';

function findPackageDir() {
  const candidates = [
    join(REPO, 'node_modules', PACKAGE),
    join(dirname(process.execPath), '..', 'install', 'global', 'node_modules', PACKAGE),
    join(process.env.HOME ?? '', '.bun', 'install', 'global', 'node_modules', PACKAGE),
  ];
  for (const dir of candidates) {
    if (Bun.file(join(dir, 'src/config/all-settings.ts')).size > 0) return dir;
  }
  throw new Error(`could not locate ${PACKAGE}; install oh-my-pi or run from a checkout that has it`);
}

/** omp's tab order and labels, read from the TUI package rather than restated
 *  here — a tab added upstream must appear in the panel without an edit. */
async function readTabs(tuiDir) {
  const mod = await import(join(tuiDir, 'src/overlays/settings-defs.ts'));
  return { order: mod.SETTING_TABS, meta: mod.TAB_METADATA };
}

/** One schema entry, in the chamber's `SchemaEntry` shape. */
function toEntry(definition) {
  const entry = { type: definition.type };
  if (definition.default !== undefined) entry.default = definition.default;
  if (Array.isArray(definition.values)) entry.values = definition.values;
  if (definition.isCredential) entry.credential = true;
  entry.ui = { ...definition.ui };
  return entry;
}

async function build() {
  const pkgDir = findPackageDir();
  const tuiDir = pkgDir.replace(/pi-coding-agent$/, 'pi-tui');
  const [{ orderedSettings }, { order, meta }] = await Promise.all([
    import(join(pkgDir, 'src/config/all-settings.ts')),
    readTabs(tuiDir),
  ]);

  const settings = orderedSettings();
  const entries = {};
  const groupsByTab = new Map(order.map((tab) => [tab, []]));

  for (const { definition } of settings) {
    const ui = definition?.ui;
    // A setting with no `ui` has no row in omp's own panel either — the chamber
    // renders the panel surface, so it is deliberately not carried.
    if (!ui?.tab || !ui.label) continue;
    entries[definition.id] = toEntry(definition);
    const groups = groupsByTab.get(ui.tab);
    if (groups && ui.group && !groups.includes(ui.group)) groups.push(ui.group);
  }

  return {
    source: `${PACKAGE} ${order.length} tabs / ${settings.length} settings`,
    tabs: order.map((id) => ({
      id,
      label: meta[id]?.label ?? id,
      groups: groupsByTab.get(id) ?? [],
    })),
    entries,
  };
}

const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? resolve(process.argv[outIndex + 1]) : DEFAULT_OUT;
const check = process.argv.includes('--check');

const schema = await build();
const json = `${JSON.stringify(schema, null, 2)}\n`;

if (check) {
  const current = (await Bun.file(outPath).exists()) ? await Bun.file(outPath).text() : '';
  if (current !== json) {
    console.error(`${outPath} is stale — run: bun run scripts/omp-schema.mjs`);
    process.exit(1);
  }
  console.log(`${outPath} is up to date (${Object.keys(schema.entries).length} entries)`);
} else {
  await Bun.write(outPath, json);
  console.log(`wrote ${outPath}: ${schema.tabs.length} tabs, ${Object.keys(schema.entries).length} entries`);
}
