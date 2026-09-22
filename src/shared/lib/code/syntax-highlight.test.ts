/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, describe, expect, test } from 'bun:test';

import { bootSyntax, onLanguageReady, requestLanguage } from '@/shared/lib/code/highlighter';
import { getLanguageFromPath, highlightCode, highlightLines } from '@/shared/lib/code/syntax-highlight';
import { highlightCodeWindow } from '@/shared/lib/code/windowed-highlight';

/** Shiki emits `<span class="shiki">…` with dual-theme CSS variables per token. */
const SHIKI_RE = /<span class="shiki">/;
const SHIKI_TOKEN_RE = /--shiki-light:/;

/**
 * Every language these tests highlight. Grammars are fetched on demand, so the
 * suite asks for them up front and waits for the last one to land instead of
 * relying on a boot-time warmup that no longer exists.
 */
const HIGHLIGHT_LANGS = [
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'css',
  'bash',
  'yaml',
  'diff',
  'python',
  'go',
  'rust',
  'sql',
  'html',
  'php',
];

beforeAll(async () => {
  // The isomorphic highlighter only boots with `window` present; the Bun test
  // runtime has none. Stub it, boot, then remove the stub so other test files
  // see a pristine global.
  Object.assign(globalThis, { window: globalThis });
  await bootSyntax();
  Reflect.deleteProperty(globalThis, 'window');

  await new Promise<void>((resolve) => {
    const settle = () => {
      if (HIGHLIGHT_LANGS.every((lang) => requestLanguage(lang))) {
        off();
        resolve();
      }
    };
    const off = onLanguageReady(settle);
    settle();
  });
});

describe('highlightCode', () => {
  // Regression guard: when the highlighter fails to boot, highlightCode falls
  // back to escaped plain text. Asserting on emitted token spans fails loudly
  // if that fallback is ever taken.
  test('emits Shiki token markup rather than falling back to escaped text', () => {
    const html = highlightCode('const x: number = 42; // hi', 'typescript');

    expect(html).toMatch(SHIKI_RE);
    expect(html).toMatch(SHIKI_TOKEN_RE);
  });

  test('emits both light and dark theme variables per token', () => {
    const html = highlightCode('const x = 1;', 'javascript');

    expect(html).toContain('--shiki-light:');
    expect(html).toContain('--shiki-dark:');
    expect(html).not.toContain('color:');
  });

  test('highlights php', () => {
    const html = highlightCode('<?php echo "hi"; ?>', 'php');

    expect(html).toMatch(SHIKI_TOKEN_RE);
  });

  test.each([
    ['typescript', 'const x: number = 42;'],
    ['python', 'def foo():\n    return "bar"'],
    ['go', 'package main\nfunc main() {}'],
    ['rust', 'fn main() { println!("x"); }'],
    ['sql', 'SELECT * FROM t WHERE a = 1'],
    ['json', '{"k": true, "n": 1}'],
    ['html', '<div class="a">x</div>'],
    ['yaml', 'key: value'],
    ['bash', 'echo "$HOME"'],
    ['css', '.a { color: red; }'],
  ])('tokenizes %s', (language, code) => {
    expect(highlightCode(code, language)).toMatch(SHIKI_TOKEN_RE);
  });

  test('returns empty string for empty input', () => {
    expect(highlightCode('', 'typescript')).toBe('');
  });

  test('falls back to javascript for an unknown language', () => {
    expect(highlightCode('const x = 1;', 'not-a-language')).toMatch(SHIKI_TOKEN_RE);
  });

  test('escapes angle brackets so highlighted output is injection-safe', () => {
    const html = highlightCode('<script>alert(1)</script>', 'html');

    expect(html).not.toContain('<script>');
    expect(html).toMatch(/&(lt|#x3C;)/);
  });
});

describe('highlightCodeWindow', () => {
  const source = Array.from({ length: 120 }, (_, index) =>
    index === 0 ? 'export const first = 1;' : `export const value${index} = ${index}; // line ${index}`,
  ).join('\n');

  /** The wrapper the app's `.shiki span` colour rule depends on. */
  const unwrap = (html: string) => html.replace(/^<span class="shiki">/, '').replace(/<\/span>$/, '');

  test('wraps the window in the class the token colours are scoped to', () => {
    const window = highlightCodeWindow(source, 'typescript', { start: 0, end: 3 });

    // Without this class no `.shiki span` rule matches, so the tokens would
    // render in the plain ink colour.
    expect(window).toMatch(SHIKI_RE);
    expect(window.endsWith('</span>')).toBe(true);
  });

  test('returns only the requested lines, joined as the editor renders them', () => {
    const window = highlightCodeWindow(source, 'typescript', { start: 10, end: 13 });
    const rows = highlightLines(source, 'typescript');

    expect(unwrap(window).split('\n')).toEqual(rows.slice(10, 13));
  });

  test('keeps multi-line grammar state from the lines above the window', () => {
    const commented = ['/*', ' * a block comment', ' * spanning several lines', ' */', 'const after = 1;'].join('\n');
    const rows = highlightLines(commented, 'typescript');
    // Line 2 sits inside the comment, whose opening line is outside the window.
    const window = highlightCodeWindow(commented, 'typescript', { start: 2, end: 4 });

    expect(unwrap(window).split('\n')).toEqual(rows.slice(2, 4));
  });

  test('renders an over-long line as plain text instead of tokenizing it', () => {
    const minified = `const bundled = "${'x'.repeat(200)}";\nconst next = 1;`;
    const window = highlightCodeWindow(minified, 'javascript', { start: 0, end: 2 }, { maxLineLength: 50 });

    expect(window).toContain('const bundled');
    expect(unwrap(window).split('\n')[0]).not.toContain('--shiki-light:');
    expect(unwrap(window).split('\n')[1]).toContain('--shiki-light:');
  });

  test('returns nothing for a window outside the document', () => {
    expect(highlightCodeWindow('const a = 1;', 'typescript', { start: 5, end: 9 })).toBe('');
    expect(highlightCodeWindow('const a = 1;', 'typescript', { start: 0, end: 0 })).toBe('');
  });
});

describe('getLanguageFromPath', () => {
  test.each([
    ['a.ts', 'typescript'],
    ['a.tsx', 'tsx'],
    ['a.js', 'javascript'],
    ['a.jsx', 'jsx'],
    ['a.json', 'json'],
    ['a.md', 'markdown'],
    ['a.css', 'css'],
    ['a.sh', 'bash'],
    ['a.yaml', 'yaml'],
    ['a.yml', 'yaml'],
    ['a.html', 'html'],
    ['a.svg', 'xml'],
    ['a.xml', 'xml'],
    ['a.py', 'python'],
    ['a.go', 'go'],
    ['a.rs', 'rust'],
    ['a.sql', 'sql'],
    ['a.toml', 'toml'],
    ['a.java', 'java'],
    ['a.php', 'php'],
    ['a.vue', 'vue'],
    ['a.svelte', 'svelte'],
    ['a.astro', 'astro'],
  ])('maps %s to %s', (path, expected) => {
    expect(getLanguageFromPath(path)).toBe(expected);
  });

  test('strips a trailing line-range suffix', () => {
    expect(getLanguageFromPath('src/a.ts:12-30')).toBe('typescript');
  });

  test('strips query and hash fragments', () => {
    expect(getLanguageFromPath('src/a.ts?x=1#L4')).toBe('typescript');
  });

  test('defaults to javascript when the path is missing', () => {
    expect(getLanguageFromPath()).toBe('javascript');
  });

  test.each([
    ['a.zig', 'zig'],
    ['a.ex', 'elixir'],
    ['a.dart', 'dart'],
    ['a.ml', 'ocaml'],
    ['a.hs', 'haskell'],
    ['a.nix', 'nix'],
    ['a.tf', 'hcl'],
    ['a.graphql', 'graphql'],
    ['a.sol', 'solidity'],
    ['a.r', 'r'],
    ['a.jl', 'julia'],
    ['a.erl', 'erlang'],
    ['a.cljs', 'clojure'],
    ['a.scm', 'scheme'],
    ['a.rkt', 'racket'],
    ['a.proto', 'protobuf'],
    ['a.ps1', 'powershell'],
    ['a.json5', 'json5'],
    ['a.less', 'less'],
    ['a.scss', 'scss'],
    ['a.sass', 'sass'],
    ['a.styl', 'stylus'],
    ['a.m', 'objective-c'],
    ['a.gradle', 'groovy'],
  ])('maps trending %s to %s', (path, expected) => {
    expect(getLanguageFromPath(path)).toBe(expected);
  });

  test('maps a bare Makefile via the lowercased last segment', () => {
    expect(getLanguageFromPath('Makefile')).toBe('makefile');
  });
});
