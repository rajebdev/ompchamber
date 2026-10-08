/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Read panel's lazy fallback.
 *
 * A `read` whose result carries no output falls back to fetching the path it
 * named through `/api/fs/read`. An omp internal URL names no file: the route
 * refused `proc://ompchamber-dev`, and the panel printed
 * `// Loaded file: proc://ompchamber-dev` as if that were the file's contents.
 * A `read` of a process is answered by the `proc://` panel, never by this one —
 * but a legacy transcript can still hand it a virtual URL.
 *
 * Rendered with `h()` against happy-dom, following `panels/Edit.test.ts`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { Read } from '@/client/components/workspace/chat-timeline/tool-renderers/panels/Read';
import type { ToolCallData } from '@/shared/types';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'fetch'] as const;
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

let calls: string[] = [];

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
  // Stubbed reader: the panel only ever calls `.json()`, and the assertions are
  // about WHETHER it was called, never about the body it got back.
  const stub = (async (url: string) => {
    calls.push(String(url));
    return { json: async () => ({ content: 'hello' }) };
  }) as unknown as typeof globalThis.fetch;
  globalThis.fetch = stub;
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});

/** Mount and flush the effect + its fetch microtask. */
async function mount(tool: ToolCallData) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(h(Read, { tool, output: tool.output ?? '' }), container);
    await Promise.resolve();
  });
  return container;
}

function readTool(partial: Partial<ToolCallData>): ToolCallData {
  return { id: 'r1', type: 'read', name: 'read', title: 'read', output: '', status: 'success', details: {}, ...partial } as ToolCallData;
}

describe('Read panel — lazy fallback', () => {
  test('a virtual URL never reaches /api/fs/read', async () => {
    calls = [];
    const el = await mount(readTool({ target: 'proc://ompchamber-dev', input: { path: 'proc://ompchamber-dev' } }));
    expect(calls).toHaveLength(0);
    expect(el.textContent ?? '').not.toContain('Loaded file');
  });

  test('a real path still lazy-loads', async () => {
    calls = [];
    await mount(readTool({ target: 'src/x.ts', input: { path: 'src/x.ts' } }));
    expect(calls[0]).toContain('/api/fs/read?path=src%2Fx.ts');
  });
});

describe('Read panel — language and markdown', () => {
  test('a document with no language carries no language badge', async () => {
    // `read xd://eval/browser` is a device's docs — prose. It used to be badged
    // `javascript` and tokenized as code, because the language detector defaulted
    // to javascript for a path with no extension.
    const el = await mount(readTool({
      target: 'xd://eval/browser',
      input: { path: 'xd://eval/browser' },
      output: '1|Drive real Chromium tabs.',
      details: { contentType: 'text/plain', totalLines: 1, displayContent: { text: 'Drive real Chromium tabs.', startLine: 1 } },
    }));
    const text = el.textContent ?? '';
    expect(text).not.toContain('javascript');
    expect(text).not.toContain('JAVASCRIPT');
    expect(text).toContain('text');
  });

  test('a text/markdown read renders as prose, not as a code block', async () => {
    // omp draws `contentType: text/markdown` as the document it is. The panel had
    // no markdown branch, so `# Diagnose ## Steps` came out as literal syntax.
    // omp prefixes every row with its line number (`1|# Diagnose`), and the
    // renderer must strip that gutter before the markdown parse — otherwise the
    // heading is the paragraph `1|# Diagnose`.
    const text = '# Diagnose\n\n## Steps\n\n1. Reproduce';
    const el = await mount(readTool({
      target: 'skill://diagnose',
      input: { path: 'skill://diagnose' },
      output: text.split('\n').map((line, index) => `${index + 1}|${line}`).join('\n'),
      details: {
        contentType: 'text/markdown',
        totalLines: 5,
        displayContent: { text, startLine: 1, lineNumbers: [1, 2, 3, 4, 5] },
      },
    }));
    const rendered = el.textContent ?? '';
    expect(rendered).toContain('Markdown');
    // A heading is drawn as a heading, not as a `1|# Diagnose` code row.
    expect(el.querySelector('h1, h2, h3')).not.toBeNull();
    expect(rendered).not.toContain('# Diagnose');
    expect(rendered).not.toContain('1|');
  });

  test('a source file still gets its language badge and code gutter', async () => {
    const el = await mount(readTool({
      target: 'src/x.ts',
      input: { path: 'src/x.ts' },
      output: '1|const a = 1;',
      details: { fileSize: 20, totalLines: 1, displayContent: { text: 'const a = 1;', startLine: 1, lineNumbers: [1] } },
    }));
    const text = el.textContent ?? '';
    expect(text).toContain('typescript');
    expect(text).toContain('const a = 1;');
  });
});
