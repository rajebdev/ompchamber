/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Read-only port of omp-web's agent-directory resolution
 * (omp-web/lib/omp/paths.ts → oh-my-pi packages/utils/src/dirs.ts).
 *
 * Resolves where oh-my-pi keeps its agent state so OMPChamber can *discover*
 * the same workspaces and sessions the omp agent writes, without owning or
 * mutating them. Covered: PI_CODING_AGENT_DIR override, PI_CONFIG_DIR rename,
 * and the XDG data layout (used only when $XDG_DATA_HOME/omp already exists).
 */

import { existsSync, realpathSync } from 'fs';
import { homedir, tmpdir } from 'os';
import * as path from 'path';

const APP_NAME = 'omp';
const CONFIG_DIR_NAME = '.omp';

/** Config root name (~/.omp), honoring the PI_CONFIG_DIR rename. */
export function getConfigDirName(): string {
  return Bun.env.PI_CONFIG_DIR || CONFIG_DIR_NAME;
}

/** Config root: ~/.omp (plus PI_CONFIG_DIR rename). */
export function getConfigRoot(): string {
  return path.join(homedir(), getConfigDirName());
}

/** The agent state directory (~/.omp/agent). PI_CODING_AGENT_DIR overrides it. */
export function getAgentDir(): string {
  const override = Bun.env.PI_CODING_AGENT_DIR;
  if (override) return path.resolve(override);
  return path.join(getConfigRoot(), 'agent');
}

function isDefaultAgentDir(): boolean {
  const override = Bun.env.PI_CODING_AGENT_DIR;
  if (override) {
    return path.resolve(override) === path.join(getConfigRoot(), 'agent');
  }
  return true;
}

/** XDG data root for the default agent dir: only honored on linux/darwin when
 *  $XDG_DATA_HOME/omp already exists — omp treats the XDG layout as opt-in via
 *  `omp config init-xdg`. XDG flattens the `agent/` prefix:
 *  ~/.omp/agent/sessions → $XDG_DATA_HOME/omp/sessions. */
function xdgDataAgentRoot(): string | undefined {
  if (process.platform !== 'linux' && process.platform !== 'darwin') return undefined;
  if (!isDefaultAgentDir()) return undefined;
  const value = Bun.env.XDG_DATA_HOME;
  if (!value) return undefined;
  try {
    const appRoot = path.join(value, APP_NAME);
    return existsSync(appRoot) ? appRoot : undefined;
  } catch {
    return undefined;
  }
}

function agentDataSubdir(subdir: string): string {
  const xdg = xdgDataAgentRoot();
  return path.join(xdg ?? getAgentDir(), subdir);
}

/** ~/.omp/agent/sessions (or $XDG_DATA_HOME/omp/sessions). */
export function getSessionsDir(): string {
  return agentDataSubdir('sessions');
}

/** ~/.omp/agent/projects.json — omp-web's managed-project registry. */
export function getProjectsRegistryPath(): string {
  return path.join(getAgentDir(), 'projects.json');
}

/** Best-effort canonicalization (resolve symlinks when the path exists). */
export function canonicalize(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return value;
  }
}

/**
 * Session directory slug for a cwd — faithful port of
 * getDefaultSessionDirName (oh-my-pi session-paths.ts):
 * - under $HOME: "-" + relative path with [/\:] replaced by dashes ("-" for $HOME itself)
 * - under tmpdir: "-tmp" (+ "-" + dashed relative path)
 * - otherwise: legacy absolute encoding "--abs-path-dashed--"
 */
export function getSessionDirNameForCwd(cwd: string): string {
  const canonicalCwd = canonicalize(path.resolve(cwd));
  const canonicalHome = canonicalize(homedir());
  const canonicalTmp = canonicalize(tmpdir());
  const homeRelative = path.relative(canonicalHome, canonicalCwd);
  const tempRelative = path.relative(canonicalTmp, canonicalCwd);
  if (homeRelative === '' || (!homeRelative.startsWith('..') && !path.isAbsolute(homeRelative))) {
    return encodeRelativeSessionDirName('-', homeRelative);
  }
  if (tempRelative === '' || (!tempRelative.startsWith('..') && !path.isAbsolute(tempRelative))) {
    return encodeRelativeSessionDirName('-tmp', tempRelative);
  }
  return encodeLegacyAbsoluteSessionDirName(canonicalCwd);
}

function encodeRelativeSessionDirName(prefix: string, relative: string): string {
  const encoded = relative.replace(/[/\\:]/g, '-');
  return encoded ? (prefix.endsWith('-') ? `${prefix}${encoded}` : `${prefix}-${encoded}`) : prefix;
}

function encodeLegacyAbsoluteSessionDirName(cwd: string): string {
  const resolvedCwd = path.resolve(cwd);
  return `--${resolvedCwd.replace(/^[/\\]/, '').replace(/[/\\:]/g, '-')}--`;
}
