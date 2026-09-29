/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `GET /api/wiki` — the wiki behind the repository the right-panel scope points
 * at: its provider, its commit, and every path in its tree.
 *
 * Scope resolution is the same `root` + `repo` pair every other right-panel view
 * takes (see `@/server/lib/fs/root` and `@/server/lib/fs/repo-scope`), so the
 * Wiki view follows the picker the Files, Search, Git and Terminal views share
 * and cannot end up describing a different repository.
 *
 * The repository's `origin` is the only thing that decides WHICH wiki is read —
 * there is no setting and no per-provider code path — because both hosts publish
 * a project's wiki at `<origin>.wiki.git`. See `@/server/lib/wiki/remote`.
 */

import { json, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { resolveRoot } from '@/server/lib/fs/root';
import { scopeToRepo } from '@/server/lib/fs/repo-scope';
import { firstLine, gitRun } from '@/server/lib/wiki/git';
import { ensureWikiMirror, listWikiPaths, readWikiPage } from '@/server/lib/wiki/mirror.server';
import { detectWikiProvider } from '@/server/lib/wiki/provider.server';
import { parseWikiRemote, redactRemoteUrl, wikiWebUrl } from '@/server/lib/wiki/remote';
import { buildWikiEntries } from '@/shared/lib/wiki/pages';
import { findWikiSidebarPath, parseWikiSidebar, withRemainingPages } from '@/shared/lib/wiki/sidebar';
import type { WikiNavSection, WikiRepoPayload } from '@/shared/types/wiki';

/** Read the checkout's `origin`; null when there is none to read. */
async function readOriginRemote(dir: string): Promise<{ remote: string | null; error: string }> {
  const out = await gitRun(['-C', dir, 'remote', 'get-url', 'origin'], { timeoutMs: 5_000 });
  if (out.exitCode !== 0) return { remote: null, error: firstLine(out.stderr) };
  return { remote: out.stdout.trim() || null, error: '' };
}

/** MOCK=true: a deterministic wiki so the panel renders its full range offline. */
function mockPayload(): WikiRepoPayload {
  const entries = buildWikiEntries([
    'Home.md',
    'Getting-Started.md',
    'guides/Deployment.md',
    'guides/Troubleshooting.md',
    'change_logs/v1.0.0.md',
    'images/diagram.svg',
    '_Sidebar.md',
    '.gitlab/redirects.yml',
  ]);
  return {
    repo: {
      provider: 'github',
      host: 'github.com',
      slug: 'ompchamber/demo',
      remote: 'https://github.com/ompchamber/demo',
      webUrl: 'https://github.com/ompchamber/demo/wiki',
      revision: '0000000000000000000000000000000000000000',
      updatedAt: new Date().toISOString(),
    },
    entries,
    // A sidebar with every shape the renderer handles: a group heading, a page
    // that resolves, an external link, a dangling target and a note block.
    sidebar: [
      {
        title: 'Navigation',
        notes: [],
        links: [
          { label: '🏠 Home', target: 'Home', path: 'Home.md', url: null },
          { label: '🚀 Getting Started', target: 'Getting-Started', path: 'Getting-Started.md', url: null },
          { label: '🐙 Repository', target: 'https://github.com/ompchamber/ompchamber', path: null, url: 'https://github.com/ompchamber/ompchamber' },
          { label: '📕 Missing Page', target: 'missing-page', path: null, url: null },
        ],
      },
      {
        title: 'Guides',
        notes: [],
        links: [
          { label: 'Deployment', target: 'guides/Deployment', path: 'guides/Deployment.md', url: null },
          { label: 'Troubleshooting', target: 'guides/Troubleshooting', path: 'guides/Troubleshooting.md', url: null },
        ],
      },
      {
        title: 'Info',
        notes: ['Version: 1.0.0', 'Runtime: Bun'],
        links: [],
      },
    ],
    generatedAt: new Date().toISOString(),
    isMock: true,
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const generatedAt = new Date().toISOString();

  if (isMockMode()) return json(mockPayload());

  const rootDir = await resolveRoot(url.searchParams.get('root'), process.cwd());
  const targetDir = await scopeToRepo(rootDir, url.searchParams.get('repo'));

  const { remote, error } = await readOriginRemote(targetDir);
  if (!remote) {
    const payload: WikiRepoPayload = {
      repo: null,
      entries: [],
      reason: 'no-remote',
      detail: error || 'This repository has no origin remote',
      generatedAt,
      isMock: false,
    };
    return json(payload);
  }

  const parsed = parseWikiRemote(remote);
  if (!parsed) {
    const payload: WikiRepoPayload = {
      repo: null,
      entries: [],
      reason: 'unsupported-remote',
      detail: `No wiki can be derived from ${redactRemoteUrl(remote)}`,
      generatedAt,
      isMock: false,
    };
    return json(payload);
  }

  const mirror = await ensureWikiMirror(parsed.host, parsed.slug, parsed.wikiRemote, url.searchParams.get('refresh') === '1');
  if (!mirror.ok) {
    const payload: WikiRepoPayload = {
      repo: null,
      entries: [],
      reason: mirror.reason,
      detail: mirror.detail,
      generatedAt,
      isMock: false,
    };
    return json(payload);
  }

  // Probed only now, when the host is known to be reachable and a wiki exists.
  const provider = await detectWikiProvider(parsed.host);
  const paths = await listWikiPaths(mirror.mirror.repoDir);
  const entries = buildWikiEntries(paths);

  // The wiki's own navigation, when the author wrote one: the panel renders its
  // grouping and labels instead of re-deriving a tree from the file layout. Any
  // page it does not mention is appended, so nothing becomes unreachable.
  const sidebarPath = findWikiSidebarPath(paths);
  let sidebar: WikiNavSection[] | null = null;
  if (sidebarPath) {
    const file = await readWikiPage(mirror.mirror.repoDir, sidebarPath);
    if (file.ok) sidebar = withRemainingPages(parseWikiSidebar(file.text, sidebarPath, entries), entries);
  }

  const payload: WikiRepoPayload = {
    repo: {
      provider,
      host: parsed.host,
      slug: parsed.slug,
      remote: redactRemoteUrl(remote),
      webUrl: wikiWebUrl(provider, parsed.host, parsed.slug),
      revision: mirror.mirror.revision,
      updatedAt: mirror.mirror.updatedAt,
    },
    entries,
    sidebar,
    generatedAt,
    isMock: false,
  };
  return json(payload);
}
