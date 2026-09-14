/**
 * Resolve the latest OMPChamber GitHub release. Tries the public REST API
 * first (no auth — fine for public repos), then falls back to the
 * authenticated `gh` CLI (needed while the repo is private). Never throws:
 * any failure resolves to null so the caller can surface "No releases
 * published yet" instead of erroring out.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** OMPChamber's own repository. */
const REPO = 'rajebdev/ompchamber';

export interface GitHubRelease {
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
}

function mapRelease(data: Record<string, unknown>): GitHubRelease {
  return {
    tag: typeof data.tag_name === 'string' ? data.tag_name : '',
    name: typeof data.name === 'string' ? data.name : '',
    url: typeof data.html_url === 'string' ? data.html_url : '',
    publishedAt: typeof data.published_at === 'string' ? data.published_at : null,
  };
}

async function fetchViaApi(): Promise<GitHubRelease | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ompchamber' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  return mapRelease(data);
}

async function fetchViaGh(): Promise<GitHubRelease | null> {
  const { stdout } = await execFileAsync('gh', ['api', `repos/${REPO}/releases/latest`], {
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  });
  const data = JSON.parse(stdout) as Record<string, unknown>;
  return mapRelease(data);
}

export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const viaApi = await fetchViaApi();
    if (viaApi) return viaApi;
  } catch {
    // Fall through to the gh CLI fallback.
  }
  try {
    return await fetchViaGh();
  } catch {
    return null;
  }
}
