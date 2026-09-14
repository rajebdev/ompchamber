#!/usr/bin/env node

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { parseArgs, helpText } from './lib/args.js';
import { configure, error, fail } from './lib/output.js';

const requireFromCli = createRequire(import.meta.url);
const { version } = requireFromCli('../package.json');

const COMMANDS = ['serve', 'stop', 'restart', 'status', 'logs'];

async function main() {
  const { command, positionals, options, unknown } = parseArgs(process.argv.slice(2));

  configure({ json: options.json, quiet: options.quiet });

  if (options.help || command === 'help') {
    process.stdout.write(helpText());
    return;
  }

  if (options.version) {
    process.stdout.write(`ompchamber ${version}\n`);
    return;
  }

  if (unknown.length > 0) {
    fail(`Unknown option: ${unknown[0]}\nRun "ompchamber --help" for usage.`);
  }

  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const ctx = { cwd: process.cwd(), pkgRoot, version };

  const name = command ?? 'serve';

  if (!COMMANDS.includes(name)) {
    error(`Unknown command: ${name}`);
    process.stderr.write(helpText());
    process.exit(1);
  }

  // Dynamic import keeps the CLI bootable even while a command module is
  // still being written by another process.
  const mod = await import(`./lib/commands/${name}.js`);

  if (typeof mod.run !== 'function') {
    fail(`Command "${name}" is unavailable (missing run()).`);
  }

  await mod.run(options, ctx);
}

main().catch((err) => {
  fail(err?.message ?? String(err));
});
