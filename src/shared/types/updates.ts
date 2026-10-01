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

/**
 * One release, as the "What's new" popup reads it.
 *
 * `body` is the release note GitHub serves verbatim, which for this repository
 * is the `CHANGELOG.md` section `release.config.mjs` wrote for that tag — so the
 * popup renders the same prose the changelog carries, without reading the file.
 */
export interface ReleaseNote {
  /** Normalized version without the leading `v`. */
  version: string;
  /** The raw tag, so a link can point at the exact ref. */
  tag: string;
  name: string;
  url: string;
  publishedAt: string | null;
  body: string;
}

/**
 * How this OMPChamber copy can replace itself, so the popup knows whether to
 * offer a button or a command. `install.method` is what the manual-command
 * branch keys off, and `install.command` is the exact command to run (null for
 * the methods that update themselves).
 */
export interface UpdateInstallInfo {
  method: string;
  reason: string;
  manual: boolean;
  command: string | null;
}

/**
 * The version range between what is installed and what is published, newest
 * first. `total` is how many releases exist above `current` (before the caps
 * below trimmed the list), which is what lets the popup say "showing N of M".
 */
export interface UpdateChangelog {
  current: string | null;
  latest: string | null;
  versions: ReleaseNote[];
  /** Releases between `current` and `latest` before the caps were applied. */
  total: number;
  /** The list was cut by a cap; the newest releases are always kept. */
  truncated: boolean;
  releaseUrl: string | null;
  install: UpdateInstallInfo;
  /** Human-readable reason the range is empty, or null. */
  error: string | null;
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
