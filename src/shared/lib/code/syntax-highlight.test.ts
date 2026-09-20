/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeAll, describe, expect, test } from 'bun:test';

import { bootSyntax } from '@/shared/lib/code/highlighter';
import { getLanguageFromPath, highlightCode } from '@/shared/lib/code/syntax-highlight';

/** Shiki emits `<span class="shiki">…` with dual-theme CSS variables per token. */
const SHIKI_RE = /<span class="shiki">/;
const SHIKI_TOKEN_RE = /--shiki-light:/;

beforeAll(async () => {
  // The isomorphic highlighter only boots with `window` present; the Bun test
  // runtime has none. Stub it, boot, then remove the stub so other test files
  // see a pristine global.
  Object.assign(globalThis, { window: globalThis });
  await bootSyntax();
  Reflect.deleteProperty(globalThis, 'window');
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
