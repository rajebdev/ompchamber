/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const SHIKI_LIGHT = 'one-light';
export const SHIKI_DARK = 'one-dark-pro';

export const SHIKI_THEMES = { light: SHIKI_LIGHT, dark: SHIKI_DARK } as const;

/** Collapse any app theme id to the syntax theme key it uses. */
export function resolveSyntaxThemeKey(theme?: string): 'light' | 'dark' {
  return theme === 'noir' || theme === 'one-dark-pro-soft' ? 'dark' : 'light';
}
