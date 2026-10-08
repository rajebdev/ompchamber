/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The collapsed card's one line.
 *
 * What this pins is the whole point of the feature: a closed card must state
 * what the call DID, from the data omp actually sends. The fixtures below are
 * verbatim `details` shapes measured off real toolResults (bash carries
 * `wallTimeMs` on 97% of results and `exitCode` on only 2%, `edit` carries the
 * excerpt diff on 99%, `grep` carries `matchCount` on 100%) — so the "no chip"
 * cases are as load-bearing as the populated ones, because a fabricated
 * `exit 0` on the 98% of bash results that report no code is the failure this
 * guards against.
 *
 * Pure function, no mounting.
 */

import { describe, expect, test } from 'bun:test';
import { formatToolBytes, formatToolMs, toolSummary } from '@/shared/lib/chat/tool/summary';
import type { ToolCallData } from '@/shared/types/chat';

function tool(partial: Partial<ToolCallData> & Pick<ToolCallData, 'type'>): ToolCallData {
  return { id: 'c1', name: partial.type, title: partial.type, ...partial } as ToolCallData;
}

describe('formatToolMs', () => {
  test('keeps sub-second calls in milliseconds', () => {
    expect(formatToolMs(28)).toBe('28ms');
  });

  test('scales to seconds and minutes', () => {
    expect(formatToolMs(1200)).toBe('1.2s');
    expect(formatToolMs(45_000)).toBe('45s');
    expect(formatToolMs(123_000)).toBe('2m 3s');
  });
});

describe('formatToolBytes', () => {
  test('labels bytes, KB and MB', () => {
    expect(formatToolBytes(512)).toBe('512 B');
    expect(formatToolBytes(4627)).toBe('4.5 KB');
    expect(formatToolBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('toolSummary — bash', () => {
  test('states the wall time omp reports', () => {
    const summary = toolSummary(tool({
      type: 'bash',
      details: { timeoutSeconds: 300, wallTimeMs: 28.18 },
      output: 'ok',
    }));
    expect(summary?.line).toBe('28ms');
  });

  test('adds the exit code only when omp actually sent one', () => {
    const summary = toolSummary(tool({ type: 'bash', details: { exitCode: 1, wallTimeMs: 500 } }));
    expect(summary?.line).toBe('exit 1 · 500ms');
  });

  test('never fabricates an exit code for the 98% that report none', () => {
    const summary = toolSummary(tool({ type: 'bash', details: { wallTimeMs: 12 }, output: 'ok' }));
    expect(summary?.line).not.toContain('exit');
  });

  test('says failed rather than showing a bare time on an error result', () => {
    const summary = toolSummary(tool({ type: 'bash', details: { wallTimeMs: 12 }, status: 'error' }));
    expect(summary?.facts[0]).toMatchObject({ kind: 'exit', label: 'failed', tone: 'error' });
  });

  test('names a background job', () => {
    const summary = toolSummary(tool({
      type: 'bash',
      details: { async: { state: 'running', jobId: 'bg_2' }, timeoutSeconds: 300 },
    }));
    expect(summary?.line).toBe('background bg_2');
  });

  test('counts the output lines of a long log', () => {
    const summary = toolSummary(tool({
      type: 'bash',
      details: { wallTimeMs: 900 },
      output: ['a', 'b', 'c'].join('\n'),
    }));
    expect(summary?.line).toBe('900ms · 3 lines');
  });
});

describe('toolSummary — edit', () => {
  const EXCERPT = [' 41|', '-43|old', '+43|new', '+44|more'].join('\n');

  test('states the change size and the first changed line', () => {
    const summary = toolSummary(tool({
      type: 'edit',
      details: { diff: EXCERPT, firstChangedLine: 43, op: 'update', path: '/x.ts' },
    }));
    expect(summary?.line).toBe('+2 \u22121 · line 43');
  });

  test('carries the language server verdict when omp sent one', () => {
    const summary = toolSummary(tool({
      type: 'edit',
      details: { diff: EXCERPT, firstChangedLine: 43, diagnostics: { summary: 'no issues', errored: false } },
    }));
    expect(summary?.facts).toContainEqual({ kind: 'note', label: 'no issues', tone: 'ok' });
  });

  test('flags a failed diagnostic run', () => {
    const summary = toolSummary(tool({
      type: 'edit',
      details: { diff: EXCERPT, diagnostics: { summary: '2 errors', errored: true } },
    }));
    expect(summary?.facts).toContainEqual({ kind: 'note', label: '2 errors', tone: 'error' });
  });

  test('falls back to the written file size for a write', () => {
    const summary = toolSummary(tool({
      type: 'write',
      input: { path: '/x.ts', content: ['a', 'b', 'c'].join('\n') },
      details: { resolvedPath: '/x.ts' },
    }));
    expect(summary?.line).toBe('3 lines');
  });
});

describe('toolSummary — read', () => {
  test('states size and line count', () => {
    const summary = toolSummary(tool({
      type: 'read',
      details: { fileSize: 4627, totalLines: 267 },
    }));
    expect(summary?.line).toBe('4.5 KB · 267 lines');
  });

  test('states the shown range when the read was truncated', () => {
    const summary = toolSummary(tool({
      type: 'read',
      details: { fileSize: 100, totalLines: 345, truncation: { truncated: true, shownRange: { start: 54, end: 103 } } },
    }));
    expect(summary?.facts).toContainEqual({ kind: 'range', label: 'shown 54\u2013103', tone: 'warn' });
  });

  test('counts directory entries', () => {
    const summary = toolSummary(tool({ type: 'read', details: { isDirectory: true, fileCount: 11 } }));
    expect(summary?.line).toBe('11 entries');
  });
});

describe('toolSummary — search', () => {
  test('names the pattern the card used to omit entirely', () => {
    const summary = toolSummary(tool({
      type: 'grep',
      input: { pattern: 'DragEvent', path: 'src' },
      details: { matchCount: 2, fileCount: 1, scopePath: 'src', truncated: false },
    }));
    expect(summary?.line).toContain('DragEvent');
    expect(summary?.line).toContain('2 matches in 1 file');
  });

  test('does not repeat the scope, which the card shows as its subtitle', () => {
    // `scopePath` is the subtitle (`src`), so a chip for it printed the same
    // string on both halves of one row.
    const summary = toolSummary(tool({
      type: 'grep',
      input: { pattern: 'DragEvent' },
      details: { matchCount: 2, fileCount: 1, scopePath: 'src' },
    }));
    expect(summary?.facts.some((fact) => fact.label === 'src')).toBe(false);
  });

  test('a glob with no pattern has no subject chip, because its path is the subject', () => {
    const summary = toolSummary(tool({
      type: 'glob',
      input: { path: 'public/**' },
      details: { fileCount: 11 },
    }));
    expect(summary?.line).toBe('11 files');
  });

  test('flags a truncated search', () => {
    const summary = toolSummary(tool({
      type: 'glob',
      input: { path: 'public/**' },
      details: { fileCount: 11, truncated: true },
    }));
    expect(summary?.facts).toContainEqual({ kind: 'warn', label: 'truncated', tone: 'warn' });
  });
});

describe('toolSummary — eval, todo, web_search, task', () => {
  test('names the eval language, its cells and the host calls', () => {
    const summary = toolSummary(tool({
      type: 'eval',
      details: {
        language: 'js',
        cells: [{ index: 0 }],
        statusEvents: [{ op: 'browser', detail: 'browser.open' }, { op: 'browser', detail: 'browser.title' }],
      },
    }));
    expect(summary?.line).toBe('js · 1 cell · browser.open · browser.title');
  });

  test('counts closed todo tasks the way omp does', () => {
    const summary = toolSummary(tool({
      type: 'todo',
      details: {
        op: 'update',
        phases: [{ tasks: [{ status: 'completed' }, { status: 'abandoned' }, { status: 'blocked' }, { status: 'pending' }] }],
      },
    }));
    expect(summary?.line).toBe('2/4 done · 1 blocked · update');
  });

  test('names the search host and query', () => {
    const summary = toolSummary(tool({
      type: 'web_search',
      input: { query: 'shiki themes' },
      details: { response: { results: [{ url: 'https://shiki.style/guide' }] } },
    }));
    expect(summary?.line).toBe('1 result · shiki.style · shiki themes');
  });

  test('counts subagents and their failures', () => {
    const summary = toolSummary(tool({
      type: 'task',
      details: { results: [{ status: 'done' }, { status: 'running' }, { status: 'failed' }] },
    }));
    expect(summary?.line).toBe('3 subagents · 1 running · 1 failed');
  });
});

describe('toolSummary — fallback and empty', () => {
  test('names the first meaningful output line for an unmapped tool', () => {
    const summary = toolSummary(tool({ type: 'wait', output: '\n\nprobe ready\nsecond' }));
    expect(summary?.facts[0]).toMatchObject({ kind: 'subject', label: 'probe ready' });
  });

  test('returns null when there is nothing to say', () => {
    expect(toolSummary(tool({ type: 'wait' }))).toBeNull();
  });
});
