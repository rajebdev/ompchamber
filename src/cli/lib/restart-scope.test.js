/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import { selectRestartTargets } from '@/cli/lib/restart-scope.js';

const devOn3000 = { port: 3000, pid: 11, launchMode: 'direct' };
const daemonOn3001 = { port: 3001, pid: 12, launchMode: 'daemon' };
const foregroundOn3002 = { port: 3002, pid: 13, launchMode: 'foreground' };

describe('selectRestartTargets', () => {
  // The reported bug: the lowest port won, which was a `bun run dev` the update
  // must not touch — so the daemon holding the replaced build was never
  // restarted and kept serving it.
  test('picks the CLI-owned instance over a lower-port unmanaged one', () => {
    expect(selectRestartTargets([devOn3000, daemonOn3001], false)).toEqual([daemonOn3001]);
  });

  // With no owned instance there is still something to report, so the command
  // says why it is skipping rather than claiming nothing is running.
  test('falls back to the first live instance when none is owned', () => {
    expect(selectRestartTargets([devOn3000], false)).toEqual([devOn3000]);
    expect(selectRestartTargets([], false)).toEqual([]);
  });

  test('takes every owned instance, since each one serves the replaced build', () => {
    expect(selectRestartTargets([daemonOn3001, foregroundOn3002], false)).toEqual([daemonOn3001, foregroundOn3002]);
  });

  test('--all considers every instance, leaving the caller to skip the unmanaged', () => {
    const all = [devOn3000, daemonOn3001, foregroundOn3002];
    expect(selectRestartTargets(all, true)).toEqual(all);
  });

  test('an unreadable launch mode is not owned', () => {
    const unknown = { port: 4000, pid: 99, launchMode: undefined };
    expect(selectRestartTargets([unknown, daemonOn3001], false)).toEqual([daemonOn3001]);
  });
});
