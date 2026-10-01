/**
 * Orchestrates the "Check for updates" flow: OMPChamber (GitHub releases) and
 * oh-my-pi (`omp`). Both probes run concurrently and neither is allowed to
 * reject, so the endpoint always returns a complete UpdateCheckResult.
 *
 * MOCK mode answers a fixed pair that says an update is available. The real
 * probe reads the version installed on THIS machine, which on a development
 * checkout is usually the newest release — so the demo would never show the
 * update UI it exists to exercise, and the popup's own gate would never open.
 */

import { isMockMode } from '@/server/mock.server';
import { resolveOmpChamberVersion } from '@/server/lib/updates/install';
import { checkOmpUpdate } from '@/server/lib/updates/omp';
import type { UpdateCheckResult, UpdateTargetInfo } from '@/shared/types/updates';

/** The demo range's endpoints; `buildUpdateChangelog` serves the matching notes. */
export const MOCK_CURRENT_VERSION = '3.6.0';
export const MOCK_LATEST_VERSION = '3.8.0';

function mockTargets(): UpdateCheckResult {
  return {
    ompchamber: {
      current: MOCK_CURRENT_VERSION,
      latest: MOCK_LATEST_VERSION,
      updateAvailable: true,
      installed: true,
      error: null,
      releaseName: `v${MOCK_LATEST_VERSION}`,
      releaseUrl: `https://github.com/rajebdev/ompchamber/releases/tag/v${MOCK_LATEST_VERSION}`,
    },
    omp: { current: '18.3.0', latest: '18.4.0', updateAvailable: true, installed: true, error: null },
    checkedAt: new Date().toISOString(),
  };
}

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
  if (isMockMode()) return mockTargets();

  const [ompchamber, omp] = await Promise.all([checkOmpChamber(), checkOmpUpdate()]);
  return { ompchamber, omp, checkedAt: new Date().toISOString() };
}
