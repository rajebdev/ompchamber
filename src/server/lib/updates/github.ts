/**
 * Resolve OMPChamber's GitHub releases. Tries the public REST API first (no
 * auth — fine for public repos), then falls back to the authenticated `gh` CLI
 * (needed while the repo is private). Neither entry point throws: a failure
 * resolves to null/empty so the caller can surface a status note instead of
 * erroring out.
 *
 * Two callers with different needs share this module. The update CHECK only
 * wants the newest release, so it asks for `/releases/latest` and gets no
 * bodies. The "What's new" popup needs the whole range between the installed
 * version and the newest one, bodies included, so it lists `/releases` — a
 * heavier read that is therefore cached here rather than re-issued per request.
 */

/** OMPChamber's own repository. */
const REPO = 'rajebdev/ompchamber';

/** Cap on the release page the popup's range is built from. */
export const RELEASE_LIST_LIMIT = 100;

/** How long a listed release page is reused. The list changes on release, not on read. */
const LIST_TTL_MS = 60_000;

/** Cap on the bytes captured from the `gh` fallback. */
const MAX_BUFFER = 8 * 1024 * 1024;

export interface GitHubRelease {
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  /** Release notes as GitHub serves them; empty for the `/latest` read. */
  body: string;
}

function mapRelease(data: Record<string, unknown>, withBody = false): GitHubRelease {
  return {
    tag: typeof data.tag_name === 'string' ? data.tag_name : '',
    name: typeof data.name === 'string' ? data.name : '',
    url: typeof data.html_url === 'string' ? data.html_url : '',
    publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
    body: withBody && typeof data.body === 'string' ? data.body : '',
  };
}

/**
 * One authenticated read of the GitHub API. An unauthenticated IP is limited to
 * 60 calls an hour, so a token from the environment is used when present; a
 * non-OK answer is a miss, never an exception, because both callers have a `gh`
 * fallback behind it.
 */
async function apiGet(path: string): Promise<unknown> {
  const token = Bun.env.GITHUB_TOKEN ?? Bun.env.GH_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ompchamber',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return res.ok ? ((await res.json()) as unknown) : null;
}

/** `gh api` is the fallback for a private repo or an exhausted rate limit. */
async function ghApi(path: string): Promise<unknown> {
  const proc = Bun.spawn({
    cmd: ['gh', 'api', path],
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 15_000,
    maxBuffer: MAX_BUFFER,
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) throw new Error(`gh api failed with exit code ${proc.exitCode}`);
  return JSON.parse(stdout) as unknown;
}

/**
 * The newest release, bodies omitted. `/releases/latest` is one small request
 * and excludes drafts and pre-releases, which is exactly what a version check
 * wants; the popup uses {@link fetchReleases} instead.
 */
export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const data = await apiGet('releases/latest');
    if (data) return mapRelease(data as Record<string, unknown>);
  } catch {
    // Fall through to the gh CLI fallback.
  }
  try {
    const data = await ghApi(`repos/${REPO}/releases/latest`);
    return mapRelease(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** One page of releases, newest first, bodies included. Never throws. */
async function readReleases(limit: number): Promise<GitHubRelease[]> {
  const cap = Math.max(1, Math.min(limit, RELEASE_LIST_LIMIT));
  try {
    const data = await apiGet(`releases?per_page=${cap}`);
    if (Array.isArray(data)) return data.map((entry) => mapRelease(entry as Record<string, unknown>, true));
  } catch {
    // Fall through to the gh CLI fallback.
  }
  try {
    const data = await ghApi(`repos/${REPO}/releases?per_page=${cap}`);
    if (Array.isArray(data)) return data.map((entry) => mapRelease(entry as Record<string, unknown>, true));
  } catch {
    // Reported as an empty list; the caller words the failure.
  }
  return [];
}

/**
 * Cached release list. The cache is keyed by the requested limit and anchored on
 * `globalThis`, for the same reason the database handle is: a `bun --hot`
 * reload re-evaluates this module while the previous result is still valid.
 */
interface ReleaseCache {
  releases: GitHubRelease[];
  at: number;
  limit: number;
}

const cacheSlot = globalThis as typeof globalThis & { __ompChamberReleaseCache?: ReleaseCache };

/** Releases newer-first, bodies included. Serves a cached page within its TTL. */
export async function fetchReleases({ limit = 30, force = false }: { limit?: number; force?: boolean } = {}): Promise<GitHubRelease[]> {
  const cached = cacheSlot.__ompChamberReleaseCache;
  if (!force && cached && cached.limit >= limit && Date.now() - cached.at < LIST_TTL_MS) return cached.releases;

  const releases = await readReleases(limit);
  // An empty read is not cached: a transient network failure would otherwise
  // pin "no releases" for a minute and hide a real update.
  if (releases.length > 0) cacheSlot.__ompChamberReleaseCache = { releases, at: Date.now(), limit };
  return releases;
}
