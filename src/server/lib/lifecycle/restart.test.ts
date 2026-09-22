import { describe, expect, test } from 'bun:test';

import { isAutoRestartable } from '@/server/lib/lifecycle/restart';

// The modal update and `ompchamber update` both decide with this predicate:
// guessing wrong here kills a `bun run dev` the user owns, or leaves a daemon
// serving the build that was just replaced.
describe('isAutoRestartable', () => {
  test('restarts the instances the CLI started', () => {
    expect(isAutoRestartable('daemon')).toBe(true);
    expect(isAutoRestartable('foreground')).toBe(true);
  });

  test('leaves every instance OMPChamber did not start alone', () => {
    // `bun run dev`, `bun run start`, a manual run, a systemd/pm2 unit.
    expect(isAutoRestartable('direct')).toBe(false);
    // A probed or unreadable record never authorises a kill either.
    expect(isAutoRestartable('unknown')).toBe(false);
    expect(isAutoRestartable(undefined)).toBe(false);
  });
});
