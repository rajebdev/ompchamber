/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The stylesheet the editor's two layers depend on.
 *
 * `CODE_EDITOR_RESET_CSS` is a rule, not a component: the transparent
 * `<textarea>` paints the caret and the selection while its glyphs must stay
 * invisible (the highlighted `<pre>` underneath supplies them), and the
 * placeholder is the one thing that must remain visible. Keeping the rule in a
 * `.ts` module rather than beside a JSX `<style>` element means a test can
 * assert it without a DOM — and there is nothing to render but this string.
 */

/**
 * The reset rule, scoped to the textarea's own class.
 *
 * `::placeholder` is deliberately excluded: an empty editor's hint has no
 * `<pre>` behind it, so it keeps the theme's ink and a readable opacity
 * instead of inheriting the transparent fill.
 */
export const CODE_EDITOR_RESET_CSS = `
.code-editor-native-textarea {
  -webkit-text-fill-color: transparent;
}
.code-editor-native-textarea::placeholder {
  -webkit-text-fill-color: var(--theme-ink);
  opacity: 0.45;
}
`;
