/**
 * Applies a requested update. oh-my-pi is updated through the omp binary;
 * OMPChamber through the shared self-update engine, which replaces the running
 * install in place (bun global install, or git fast-forward + rebuild).
 */

import { updateOmpChamber } from '@/server/lib/updates/install';
import { applyOmpUpdate } from '@/server/lib/updates/omp';
import type { UpdateApplyResult, UpdateTarget } from '@/shared/types/updates';

/** A server cannot replace its own process, so the user restarts it. */
const RESTART_NOTE = ' Restart the server (`ompchamber restart`) to apply it.';

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
    const result = await updateOmpChamber();
    return {
      success: result.success,
      target: 'ompchamber',
      manual: result.manual,
      message: `${result.message}${result.updated ? RESTART_NOTE : ''}`,
      output: result.output || undefined,
    };
  }

  return {
    success: false,
    target,
    manual: true,
    message: 'Unknown update target',
  };
}
