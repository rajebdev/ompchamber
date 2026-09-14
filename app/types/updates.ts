/**
 * Shared shapes for the "Check for updates" feature: OMPChamber GitHub
 * releases and the oh-my-pi (`omp`) binary. The client depends on these
 * field names and null semantics, so keep them stable.
 */

export type UpdateTarget = 'ompchamber' | 'omp';

export interface UpdateTargetInfo {
  /** Installed/current version, or null when unknown/not installed. */
  current: string | null;
  /** Latest available version, or null when none could be resolved. */
  latest: string | null;
  updateAvailable: boolean;
  /** For omp: whether the omp binary was found. Always true for ompchamber. */
  installed: boolean;
  /** Human-readable error/status note, or null. */
  error: string | null;
  /** OMPChamber only: release title/url when a release was found. */
  releaseName?: string | null;
  releaseUrl?: string | null;
}

export interface UpdateCheckResult {
  ompchamber: UpdateTargetInfo;
  omp: UpdateTargetInfo;
  checkedAt: string; // ISO timestamp
}

export interface UpdateApplyResult {
  success: boolean;
  target: UpdateTarget;
  /** true when the update must be done manually (OMPChamber for now). */
  manual: boolean;
  message: string;
  /** Captured command output for the omp update. */
  output?: string;
}
