/**
 * Orchestrates the "Check for updates" flow: OMPChamber (GitHub releases) and
 * oh-my-pi (`omp`). Both probes run concurrently and neither is allowed to
 * reject, so the endpoint always returns a complete UpdateCheckResult.
 */

import packageJson from '@/../package.json';
import { fetchLatestRelease } from '@/server/lib/updates/github';
import { checkOmpUpdate } from '@/server/lib/updates/omp';
import { isNewer, normalizeVersion } from '@/shared/lib/updates/semver';
import type { UpdateCheckResult, UpdateTargetInfo } from '@/shared/types/updates';

async function checkOmpChamber(): Promise<UpdateTargetInfo> {
  const current = packageJson.version;
  try {
    const release = await fetchLatestRelease();
    const latest = release ? normalizeVersion(release.tag) : null;
    return {
      current,
      latest,
      updateAvailable: !!latest && isNewer(latest, current),
      installed: true,
      error: release ? null : 'No releases published yet',
      releaseName: release?.name ?? null,
      releaseUrl: release?.url ?? null,
    };
  } catch (err) {
    return {
      current,
      latest: null,
      updateAvailable: false,
      installed: true,
      error: err instanceof Error ? err.message : 'Failed to check OMPChamber updates',
      releaseName: null,
      releaseUrl: null,
    };
  }
}

export async function checkAllUpdates(): Promise<UpdateCheckResult> {
  const [ompchamber, omp] = await Promise.all([checkOmpChamber(), checkOmpUpdate()]);
  return { ompchamber, omp, checkedAt: new Date().toISOString() };
}
