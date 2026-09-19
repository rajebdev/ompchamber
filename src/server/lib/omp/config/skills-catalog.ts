/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skills.sh catalog bridge — real search via https://skills.sh/api/search and
 * install via `bunx skills add <package>` (same surfaces ompweb uses).
 * Search failures degrade to an empty list so the catalog tab still renders.
 */

import { isMockMode } from '@/server/mock.server';
import type { CatalogSkillItem } from '@/shared/types';

const SEARCH_API_BASE = Bun.env.SKILLS_API_URL || 'https://skills.sh';
const SEARCH_TIMEOUT_MS = 15_000;
const INSTALL_TIMEOUT_MS = 180_000;

export interface CatalogSearchResult {
  package: string;
  name: string;
  source: string;
  installs: number;
}

/** Search the skills.sh catalog; returns [] on any failure. */
export async function searchSkillCatalog(query: string, limit = 24): Promise<CatalogSearchResult[]> {
  if (isMockMode()) return [];
  const url = `${SEARCH_API_BASE}/api/search?q=${encodeURIComponent(query)}&limit=${Math.min(50, Math.max(1, limit))}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!response.ok) return [];
    const data = (await response.json()) as { skills?: Array<{ id?: string; name?: string; source?: string; installs?: number }> };
    return (data.skills ?? [])
      .filter((skill) => typeof skill.id === 'string' && skill.id.length > 0)
      .map((skill) => ({
        package: skill.id as string,
        name: typeof skill.name === 'string' ? skill.name : (skill.id as string),
        source: typeof skill.source === 'string' ? skill.source : '',
        installs: typeof skill.installs === 'number' ? skill.installs : 0,
      }));
  } catch {
    return [];
  }
}

/** Map catalog search results into the CatalogSkillItem contract of the UI.
 * instructions carries the package name so a later install POST can resolve
 * it back to a skills.sh package without extra component fields. */
export function toCatalogSkills(results: CatalogSearchResult[], sourceId: string): CatalogSkillItem[] {
  return results.map((result) => ({
    id: `catalog-${result.package}`,
    sourceId,
    name: result.name,
    description: result.source ? `From ${result.source}` : '',
    repoTag: result.package,
    githubUrl: result.source ? `https://github.com/${result.source}` : undefined,
    instructions: result.package,
  }));
}

async function runBunxSkills(args: string[]): Promise<string> {
  const proc = Bun.spawn({
    cmd: ['bunx', 'skills', ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: INSTALL_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  if (exitCode !== 0) throw new Error(stderr.trim() || `bunx skills ${args[0]} exited with code ${exitCode}`);
  return stdout;
}

/** Install a catalog skill into the omp agent skill root. */
export async function installCatalogSkill(pkg: string): Promise<{ output: string }> {
  if (!/^[\w.\-]+\/[\w.\-@:]+$/.test(pkg)) throw new Error('Invalid skill package');
  if (isMockMode()) throw new Error('Skill install is unavailable in mock mode');
  const output = await runBunxSkills(['add', pkg, '--agent', 'universal', '-g', '-y']);
  return { output: output.slice(-4000) };
}

/** Check for updates on an installed catalog skill. */
export async function checkCatalogSkillUpdate(pkg: string): Promise<{ output: string }> {
  if (!/^[\w.\-]+\/[\w.\-@:]+$/.test(pkg)) throw new Error('Invalid skill package');
  const output = await runBunxSkills(['check', pkg]);
  return { output: output.slice(-4000) };
}
