/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, describe } from 'bun:test';
import { resolveInsideRoot } from '@/shared/lib/panels/resolve-asset';

const ROOT = '/plugins/demo';

describe('resolveInsideRoot', () => {
  test('resolves a plain relative path inside the root', () => {
    expect(resolveInsideRoot(ROOT, 'index.html')).toBe('/plugins/demo/index.html');
  });

  test('resolves a nested path', () => {
    expect(resolveInsideRoot(ROOT, 'assets/logo.svg')).toBe('/plugins/demo/assets/logo.svg');
  });

  test('allows the root itself', () => {
    expect(resolveInsideRoot(ROOT, '.')).toBe(ROOT);
  });

  test('refuses a single-level escape', () => {
    expect(resolveInsideRoot(ROOT, '../secret.html')).toBeNull();
  });

  test('refuses an escape hidden behind a legitimate prefix', () => {
    expect(resolveInsideRoot(ROOT, 'assets/../../secret.html')).toBeNull();
  });

  test('refuses an absolute path outside the root', () => {
    expect(resolveInsideRoot(ROOT, '/etc/passwd')).toBeNull();
  });

  test('refuses a sibling whose name starts with the root name', () => {
    // `/plugins/demo-evil` must not pass a naive `startsWith(root)` test.
    expect(resolveInsideRoot(ROOT, '../demo-evil/x.html')).toBeNull();
  });

  test('allows a filename that merely contains two dots', () => {
    expect(resolveInsideRoot(ROOT, 'a..b.html')).toBe('/plugins/demo/a..b.html');
  });

  test('refuses a deep escape', () => {
    expect(resolveInsideRoot(ROOT, '../../../../etc/passwd')).toBeNull();
  });
});
