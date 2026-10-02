/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The update checker's version arithmetic.
 *
 * The doc comment says "lenient", and the tests pin exactly how lenient:
 * a leading `v` is stripped, a pre-release suffix is ignored entirely, missing
 * trailing segments read as zero (`1.2` === `1.2.0`), and a non-numeric segment
 * reads as zero. Those choices are what keep a GitHub tag like `v3.8.0-rc.1`
 * comparable to the installed `3.8.0`; the failure mode of getting them wrong is
 * a popup that never appears (or appears forever) for a release the user does
 * have. `isNewer` is strictly `> 0`, so an equal version never re-announces.
 */

import { describe, expect, test } from 'bun:test';

import { compareVersions, isNewer, normalizeVersion } from '@/shared/lib/updates/semver';

describe('normalizeVersion', () => {
  test('strips a single leading v/V and surrounding whitespace', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('V1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('  v1.2.3  ')).toBe('1.2.3');
    expect(normalizeVersion('1.2.3')).toBe('1.2.3');
  });

  test('only strips one leading marker', () => {
    expect(normalizeVersion('vv1.2.3')).toBe('v1.2.3');
    expect(normalizeVersion('v')).toBe('');
  });
});

describe('compareVersions', () => {
  test('compares numeric segments, not strings', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  test('treats missing trailing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
    expect(compareVersions('1', '1.0.1')).toBe(-1);
  });

  test('ignores the v prefix on either side', () => {
    expect(compareVersions('v1.3.0', '1.2.9')).toBe(1);
    expect(compareVersions('1.2.9', 'v1.3.0')).toBe(-1);
  });

  test('ignores a pre-release suffix', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.3-rc.1', '1.2.4')).toBe(-1);
  });

  test('reads a non-numeric segment as zero', () => {
    expect(compareVersions('1.x.3', '1.0.3')).toBe(0);
    expect(compareVersions('1.x.4', '1.0.3')).toBe(1);
  });
});

describe('isNewer', () => {
  test('is true only for a strictly greater version', () => {
    expect(isNewer('1.2.4', '1.2.3')).toBe(true);
    expect(isNewer('v1.2.4', '1.2.3')).toBe(true);
    expect(isNewer('1.2.3', '1.2.3')).toBe(false);
    expect(isNewer('1.2.3', '1.2.4')).toBe(false);
  });

  test('a pre-release of the same core version is not newer', () => {
    expect(isNewer('1.2.3-beta', '1.2.3')).toBe(false);
  });
});
