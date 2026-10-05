// Restart scope for `ompchamber update`.
//
// Kept separate from the command so the rule is testable without a live server,
// exactly as `stop-scope.js` is for `stop`. The rule is ownership: an update
// replaces this package on disk, so the only instance it may restart is one it
// started — and, crucially, the one it picks must be that instance rather than
// whichever answers first.
//
// The bug this exists to prevent: picking the LOWEST PORT instead of the owned
// one. `bun run dev` on 3000 beside the updated daemon on 3001 (a real layout
// on this machine) made `update` select the dev server, classify it `direct`,
// skip it, and leave the daemon serving the build that was just replaced.

import { isCliManaged } from '@/server/lib/lifecycle/launch-mode';

/**
 * The instances an update restarts. `all` is the `--all` flag: every live
 * instance is considered, and the caller still leaves the unmanaged ones alone.
 *
 * Without `--all`, every CLI-owned instance is a target, because every one of
 * them is serving the build the update just replaced — the command's own
 * contract is "the instances still serving the previous build (the ones the
 * CLI started)", which is plural. `--all` widens the REPORT to the instances
 * the CLI did not start; ownership, not the flag, decides what may be replaced.
 *
 * Only when nothing is owned does the first live instance fall through, so the
 * unmanaged case is still reported rather than silently ignored.
 */
export function selectRestartTargets(instances, all) {
  if (all) return instances;
  const managed = instances.filter((entry) => isCliManaged(entry.launchMode));
  return managed.length > 0 ? managed : instances.slice(0, 1);
}
