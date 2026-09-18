/**
 * Applies a requested update. oh-my-pi is updated for real via the omp
 * binary; OMPChamber is still a manual, not-yet-implemented action.
 */

import { applyOmpUpdate } from '@/server/lib/updates/omp';
import type { UpdateApplyResult, UpdateTarget } from '@/shared/types/updates';

export async function applyUpdate(target: UpdateTarget): Promise<UpdateApplyResult> {
  if (target === 'omp') {
    try {
      const { output } = await applyOmpUpdate();
      return { success: true, target: 'omp', manual: false, message: 'oh-my-pi updated', output };
    } catch (err) {
      return {
        success: false,
        target: 'omp',
        manual: false,
        message: err instanceof Error ? err.message : 'Failed to update oh-my-pi',
      };
    }
  }

  if (target === 'ompchamber') {
    return {
      success: false,
      target: 'ompchamber',
      manual: true,
      message: 'Automatic OMPChamber update is not available yet. Pull the latest release manually and restart.',
    };
  }

  return {
    success: false,
    target,
    manual: true,
    message: 'Unknown update target',
  };
}
