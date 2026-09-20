/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';

import { getLanguageFromPath, highlightCode } from '@/shared/lib/code/syntax-highlight';

/** Prism emits `<span class="token keyword">…`; the escape-only fallback does not. */
const TOKEN_RE = /class="token [a-z-]+"/;

describe('highlightCode', () => {
  // Regression guard: a missing grammar dependency (prism-php needs
  // prism-markup-templating) made Prism.highlight throw, and highlightCode's
  // try/catch silently returned escaped plain text for EVERY language. Asserting
  // on emitted token spans fails loudly if that fallback is ever taken.
  test('emits token markup rather than falling back to escaped text', () => {
    const html = highlightCode('const x: number = 42; // hi', 'typescript');

    expect(html).toMatch(TOKEN_RE);
    expect(html).toContain('token keyword');
  });

  test('highlights php without tripping the markup-templating dependency', () => {
    const html = highlightCode('<?php echo "hi"; ?>', 'php');

    expect(html).toMatch(TOKEN_RE);
  });

  test.each([
    ['typescript', 'const x: number = 42;'],
    ['python', 'def foo():\n    return "bar"'],
    ['go', 'package main\nfunc main() {}'],
    ['rust', 'fn main() { println!("x"); }'],
    ['sql', 'SELECT * FROM t WHERE a = 1'],
    ['json', '{"k": true, "n": 1}'],
    ['markup', '<div class="a">x</div>'],
    ['yaml', 'key: value'],
    ['bash', 'echo "$HOME"'],
    ['css', '.a { color: red; }'],
  ])('tokenizes %s', (language, code) => {
    expect(highlightCode(code, language)).toMatch(TOKEN_RE);
  });

  test('returns empty string for empty input', () => {
    expect(highlightCode('', 'typescript')).toBe('');
  });

  test('falls back to javascript for an unknown language', () => {
    expect(highlightCode('const x = 1;', 'not-a-language')).toMatch(TOKEN_RE);
  });

  test('escapes angle brackets so highlighted output is injection-safe', () => {
    const html = highlightCode('<script>alert(1)</script>', 'markup');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;');
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
    ['a.html', 'markup'],
    ['a.svg', 'markup'],
    ['a.xml', 'markup'],
    ['a.py', 'python'],
    ['a.go', 'go'],
    ['a.rs', 'rust'],
    ['a.sql', 'sql'],
    ['a.toml', 'toml'],
    ['a.java', 'java'],
    ['a.php', 'php'],
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
    ['a.m', 'objectivec'],
    ['a.gradle', 'groovy'],
  ])('maps trending %s to %s', (path, expected) => {
    expect(getLanguageFromPath(path)).toBe(expected);
  });

  test('maps a bare Makefile via the lowercased last segment', () => {
    expect(getLanguageFromPath('Makefile')).toBe('makefile');
  });
});
