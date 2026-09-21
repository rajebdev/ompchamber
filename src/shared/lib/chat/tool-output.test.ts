/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool output is rendered as markdown, with one override: an XML wrapper that
 * opens the output is transport, not content, so it is peeled before parsing.
 * What makes the parser hard is telling that wrapper apart from markup that IS
 * the content — a tag in the middle of prose, a mismatched pair, a second
 * element after the first — and from content markdown would reflow (a log, a
 * JSON body) once the wrapper is gone.
 */

import { describe, expect, test } from 'bun:test';

import { outputMarkdown, readToolOutput } from '@/shared/lib/chat/tool-output';

describe('readToolOutput XML envelope', () => {
  test('peels a wrapper that opens the output and keeps the trailing line', () => {
    const output = readToolOutput(
      '<system-reminder reason="rule_violation" rule="ts-no-inline-cast-access">\n' +
        'MUST comply with the following instruction.\n' +
        '</system-reminder>\n' +
        'Successfully wrote 3604 bytes to src/a.ts',
    );

    expect(output.envelope?.tag).toBe('system-reminder');
    expect(output.envelope?.attributes).toEqual({
      reason: 'rule_violation',
      rule: 'ts-no-inline-cast-access',
    });
    expect(output.content).toBe(
      'MUST comply with the following instruction.\n\nSuccessfully wrote 3604 bytes to src/a.ts',
    );
  });

  test('reads single-quoted and valueless attributes', () => {
    expect(readToolOutput("<a rule='ts-x' flag>\nbody\n</a>").envelope?.attributes).toEqual({
      rule: 'ts-x',
      flag: '',
    });
  });

  test('dedents the wrapper body so markdown reads it as prose, not a code block', () => {
    const output = readToolOutput('<result>\n  # Judul\n  teks biasa\n</result>');

    expect(output.content).toBe('# Judul\nteks biasa');
    expect(output.format).toBe('markdown');
    expect(outputMarkdown(output.content, output.format)).toBe('# Judul\nteks biasa');
  });

  test('handles a `>` inside an attribute value and nested elements', () => {
    expect(readToolOutput('<a title="x > y">\n<b>1</b>\n</a>').content).toBe('<b>1</b>');
  });

  test('leaves markup that does not open the output alone', () => {
    const raw = 'Set <name> to the file, then run <cmd />';
    const output = readToolOutput(raw);

    expect(output.envelope?.tag).toBeUndefined();
    expect(output.content).toBe(raw);
  });

  test('leaves mismatched and self-closing roots alone', () => {
    expect(readToolOutput('<a>\n<b>x</a>').envelope?.tag).toBeUndefined();
    expect(readToolOutput('<hr />').envelope?.tag).toBeUndefined();
    expect(readToolOutput('<!-- note -->\nbody').envelope?.tag).toBeUndefined();
  });

  test('does not peel when a second element follows the wrapper', () => {
    expect(readToolOutput('<a>1</a><b>2</b>').envelope?.tag).toBeUndefined();
  });
});

describe('outputMarkdown', () => {
  test('fences JSON so the parser cannot reflow it', () => {
    const output = readToolOutput('{\n  "a": 1\n}');

    expect(output.format).toBe('json');
    expect(outputMarkdown(output.content, output.format)).toBe('```json\n{\n  "a": 1\n}\n```');
  });

  test('fences a plain log without a language', () => {
    expect(outputMarkdown('error: boom\n  at foo', 'text')).toBe('```\nerror: boom\n  at foo\n```');
  });

  test('outgrows a fence already present in the content', () => {
    expect(outputMarkdown('a ``` b', 'json')).toBe('````json\na ``` b\n````');
  });
});
