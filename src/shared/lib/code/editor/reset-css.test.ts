/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor's reset stylesheet.
 *
 * The rule is what makes the editor work at all: the `<textarea>` must paint the
 * caret and the selection while its glyphs stay invisible. A regression here is
 * silent in review (it is a string) and immediately visible in the app, so it is
 * asserted directly — the two selectors and the one deliberate exception.
 */

import { describe, expect, test } from 'bun:test';

import { CODE_EDITOR_RESET_CSS } from '@/shared/lib/code/editor/reset-css';

describe('CODE_EDITOR_RESET_CSS', () => {
  test('hides the textarea’s own glyphs', () => {
    expect(CODE_EDITOR_RESET_CSS).toContain('-webkit-text-fill-color: transparent');
  });

  test('keeps the placeholder visible, since no <pre> sits behind it', () => {
    // Without this exception an empty editor's hint inherits the transparent
    // fill and the field looks blank rather than empty.
    expect(CODE_EDITOR_RESET_CSS).toContain('.code-editor-native-textarea::placeholder');
    expect(CODE_EDITOR_RESET_CSS).toContain('var(--theme-ink)');
  });

  test('is scoped to the editor’s own class, not to every textarea', () => {
    expect(CODE_EDITOR_RESET_CSS).not.toMatch(/^\s*textarea\s*\{/m);
    expect(CODE_EDITOR_RESET_CSS).toContain('.code-editor-native-textarea {');
  });
});
