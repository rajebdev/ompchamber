/**
 * The once-per-version latch for the update popup.
 *
 * It decides something the user sees: whether the dialog interrupts at all. The
 * range math it used to pin lives beside the parser it belongs to — see
 * `@/server/lib/updates/changelog.test.ts`.
 */

import { describe, expect, test } from 'bun:test';

import { shouldAnnounce } from '@/shared/lib/updates/popup-state';

describe('shouldAnnounce', () => {
  test('announces a version that has never been shown', () => {
    expect(shouldAnnounce('3.8.0', null)).toBe(true);
  });

  test('does not re-announce the version already shown', () => {
    expect(shouldAnnounce('3.8.0', '3.8.0')).toBe(false);
  });

  test('announces the next release after one was shown', () => {
    expect(shouldAnnounce('3.9.0', '3.8.0')).toBe(true);
  });

  test('never announces without a version to name', () => {
    expect(shouldAnnounce(null, null)).toBe(false);
    expect(shouldAnnounce('', '3.8.0')).toBe(false);
  });
});
