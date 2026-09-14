import { json } from '@remix-run/node';
import { checkAllUpdates } from '@/lib/updates/check';
import type { UpdateCheckResult, UpdateTargetInfo } from '@/types/updates';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function failureResult(message: string): UpdateCheckResult {
  const target = (): UpdateTargetInfo => ({
    current: null,
    latest: null,
    updateAvailable: false,
    installed: false,
    error: message,
  });
  return { ompchamber: target(), omp: target(), checkedAt: new Date().toISOString() };
}

/**
 * GET /api/updates/check — latest OMPChamber release + oh-my-pi status.
 * Always returns a valid UpdateCheckResult so the client never sees a 500.
 */
export async function loader() {
  try {
    return json(await checkAllUpdates(), { headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check for updates';
    return json(failureResult(message), { headers: NO_STORE });
  }
}
