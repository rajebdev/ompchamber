/**
 * Applies a requested update. oh-my-pi is updated through the omp binary;
 * OMPChamber through the shared self-update engine, which replaces the running
 * install in place (bun global install, or git fast-forward + rebuild) and then
 * restarts this instance through a detached `ompchamber restart` — unless the
 * instance was started from source, which its own launcher has to restart.
 */

import { scheduleSelfRestart } from '@/server/lib/lifecycle/restart';
import { updateOmpChamber } from '@/server/lib/updates/install';
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
    const result = await updateOmpChamber();
    // Only a call that actually replaced files has something to restart for:
    // an "already up to date" answer must not bounce a healthy server.
    const restart = result.success && result.updated ? scheduleSelfRestart() : null;
    return {
      success: result.success,
      target: 'ompchamber',
      manual: result.manual,
      message: restart ? `${result.message} ${restart.message}` : result.message,
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
