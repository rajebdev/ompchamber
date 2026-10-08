/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';
import { isVirtualPath } from '@/shared/lib/fs/paths';

describe('isVirtualPath', () => {
  test('recognizes an omp internal URL', () => {
    expect(isVirtualPath('proc://ompchamber-dev')).toBe(true);
    expect(isVirtualPath('xd://lsp')).toBe(true);
    expect(isVirtualPath('agent://Sleeper')).toBe(true);
    expect(isVirtualPath('skill://pr-review')).toBe(true);
    expect(isVirtualPath('artifact://17')).toBe(true);
  });

  test('leaves a real path alone', () => {
    expect(isVirtualPath('src/x.ts')).toBe(false);
    expect(isVirtualPath('/tmp/x.png')).toBe(false);
    expect(isVirtualPath('C:\\proj\\x.ts')).toBe(false);
    expect(isVirtualPath('~/x.ts')).toBe(false);
  });

  test('a bare colon is not a scheme — a Windows drive letter stays a path', () => {
    expect(isVirtualPath('C:/proj/x.ts')).toBe(false);
  });

  test('nothing is not a virtual path', () => {
    expect(isVirtualPath(undefined)).toBe(false);
    expect(isVirtualPath('')).toBe(false);
  });
});
