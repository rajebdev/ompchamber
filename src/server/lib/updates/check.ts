/**
 * Orchestrates the "Check for updates" flow: OMPChamber (GitHub releases) and
 * oh-my-pi (`omp`). Both probes run concurrently and neither is allowed to
 * reject, so the endpoint always returns a complete UpdateCheckResult.
 */

import { resolveOmpChamberVersion } from '@/server/lib/updates/install';
import { checkOmpUpdate } from '@/server/lib/updates/omp';
import type { UpdateCheckResult, UpdateTargetInfo } from '@/shared/types/updates';

async function checkOmpChamber(): Promise<UpdateTargetInfo> {
  try {
    // Reads the version on disk, so a completed update stops showing as
    // available even before the server is restarted.
    const info = await resolveOmpChamberVersion();
    return {
      current: info.current,
      latest: info.latest,
      updateAvailable: info.updateAvailable,
      installed: true,
      error: info.error,
      releaseName: info.release?.name ?? null,
      releaseUrl: info.release?.url ?? null,
    };
  } catch (err) {
    return {
      current: null,
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
