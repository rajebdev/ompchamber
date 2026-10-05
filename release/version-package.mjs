/**
 * The version write for a published package.
 *
 * `@semantic-release/npm` is the usual plugin for this and cannot be used here:
 * it writes the version by shelling out to `npm version`, and npm does not
 * support the `workspace:` protocol that `packages/ui` declares its SDK
 * dependency with. Running it inside this workspace root fails outright —
 * measured on npm 11 in a rehearsal of the real pipeline:
 *
 *     npm error code EUNSUPPORTEDPROTOCOL
 *     npm error Unsupported URL Type "workspace:": workspace:*
 *
 * npm reifies the whole workspace tree to run `version`, so the failure is on a
 * sibling package's manifest and has nothing to do with the one being released.
 * (It also removed `node_modules` outright in the first rehearsal.)
 *
 * What is left of the plugin's job here is one field, because this pipeline
 * never publishes: `publish-plugins.yml` does, with `bun publish`, which packs
 * the workspace protocol correctly (verified: the published tarball carries the
 * exact SDK version, not `workspace:*`). So the version is written directly,
 * with no package manager in the loop.
 *
 * The manifest is re-serialized with the same two-space indent and trailing
 * newline the files already use, and `JSON.parse` preserves key order, so a
 * release commit's diff is the version line alone.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Read a package's manifest.
 *
 * @param {string} cwd
 * @param {string} dir
 * @returns {object}
 */
function readManifest(cwd, dir) {
  return JSON.parse(readFileSync(join(cwd, dir, 'package.json'), 'utf8'));
}

/**
 * A semantic-release plugin object that keeps one package's version in its own
 * manifest.
 *
 * Returned as an object rather than a module: semantic-release accepts a plain
 * object in `plugins` and reads its step names off it, which is what lets the
 * directory be a closure instead of another config option.
 *
 * @param {string} dir Package directory, relative to the repository root.
 * @returns {{verifyConditions: Function, prepare: Function}}
 */
export function versionPackagePlugin(dir) {
  return {
    verifyConditions(_pluginConfig, { cwd, logger }) {
      const manifest = readManifest(cwd, dir);

      if (manifest.private === true) {
        throw new Error(`${dir} is private; a private package has no version to release`);
      }

      if (!manifest.version) {
        throw new Error(`${dir}/package.json declares no version`);
      }

      logger.log(`${manifest.name} is at ${manifest.version}`);
    },

    prepare(_pluginConfig, { cwd, nextRelease, logger }) {
      const path = join(cwd, dir, 'package.json');
      const manifest = readManifest(cwd, dir);

      manifest.version = nextRelease.version;
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
      logger.log(`Wrote ${nextRelease.version} to ${dir}/package.json`);
    },
  };
}
