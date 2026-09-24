/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useFileEditor` revalidation contract.
 *
 * A landed write bumps the workspace refreshKey, which calls `reset()`. Reset
 * used to drop every cached buffer, so the very next render painted an empty
 * editor — and because the read effect only re-runs on a key/identity change,
 * the file never came back without a full page reload. The same window let a
 * read response that was already in flight land on top of keystrokes typed
 * after it was requested.
 *
 * These run against a real DOM (happy-dom) because the hook is a Preact hook
 * driving fetches and effects: the modules below are imported inside
 * `beforeAll`, after those globals exist, because Preact and the highlighter
 * bind their environment at evaluation time.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { h as PreactH, render as PreactRender } from 'preact';
import type { act as PreactAct } from 'preact/test-utils';
import type { UseFileEditorResult, useFileEditor as UseFileEditorHook } from '@/client/hooks/editor/use-file-editor';

const DISK = 'const a = 1;\nconst b = 2;\n';
/** Stable identity: the read effect re-runs when its target object changes. */
const TARGET = { id: 1, name: 'a.js', path: 'a.js' };

let useFileEditor: typeof UseFileEditorHook;
let h: typeof PreactH;
let render: typeof PreactRender;
let act: typeof PreactAct;

/** Latest render's result — re-read after every settle, never held across one. */
let mounted: UseFileEditorResult | null = null;
let container: HTMLElement;

interface FsState {
  reads: number;
  writes: number;
  body: string;
  /** The `eol` field of the last write — the ending the server is asked to use. */
  sentEol: string | null;
}

/** Serves `state.body` for reads and records writes, without touching the network. */
function stubFetch(state: FsState) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).startsWith('/api/fs/read')) {
      state.reads += 1;
      return { ok: true, json: async () => ({ content: state.body }) };
    }
    const form = init?.body as FormData;
    state.writes += 1;
    state.body = String(form.get('content'));
    state.sentEol = form.get('eol') === null ? null : String(form.get('eol'));
    return { ok: true, json: async () => ({ success: true }) };
  }) as unknown as typeof fetch;
}

/**
 * Lets the stub's promise chain run and the render it queues land. The chain
 * needs no timers (nothing I/O bound), and Preact's `act` only flushes queued
 * renders on its boundary, so both get a pass.
 */
async function settleEditor() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function mountEditor() {
  const Probe = () => {
    mounted = useFileEditor(TARGET);
    return null;
  };
  await act(async () => {
    render(h(Probe, {}), container);
  });
  await settleEditor();
}

/** The DOM surface this file installs for the hook and Preact to render into. */
function domGlobals(win: Window): Record<string, unknown> {
  return {
    window: win,
    document: win.document,
    navigator: win.navigator,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
  };
}

const installed: Record<string, unknown> = {};
const displaced: Record<string, unknown> = {};

beforeAll(async () => {
  const win = new Window({ url: 'http://localhost' });
  for (const [key, value] of Object.entries(domGlobals(win))) {
    displaced[key] = (globalThis as Record<string, unknown>)[key];
    installed[key] = value;
    (globalThis as Record<string, unknown>)[key] = value;
  }
  ({ useFileEditor } = await import('@/client/hooks/editor/use-file-editor'));
  ({ h, render } = await import('preact'));
  ({ act } = await import('preact/test-utils'));
});

// Every test file shares one process, so the globals go back the way they were:
// code that branches on `typeof window` (the agent-event fold, for one) would
// otherwise take its browser path for the rest of the run.
afterAll(() => {
  for (const key of Object.keys(installed)) {
    if (displaced[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = displaced[key];
  }
});

beforeEach(() => {
  mounted = null;
  container = document.createElement('div');
  document.body.appendChild(container);
});

// Unmount while the DOM globals still exist, so the hook's effect cleanups run
// here. A landed save arms a timer that returns the status to `idle`; an effect
// timer that outlived this file would fire during the next file's test and, with
// `window` already removed by `afterAll`, break its render.
afterEach(() => {
  render(null, container);
  container.remove();
});

describe('useFileEditor revalidation', () => {
  test('reset re-reads from disk without blanking the open file', async () => {
    const state: FsState = { reads: 0, writes: 0, sentEol: null, body: DISK };
    stubFetch(state);
    await mountEditor();
    expect(mounted?.content).toBe(DISK);

    // The refresh a landed write triggers, with newer bytes now on disk.
    state.body = `${DISK}const c = 3;\n`;
    await act(async () => {
      mounted?.reset();
    });
    await settleEditor();

    expect(state.reads).toBe(2);
    expect(mounted?.content).toBe(state.body);
  });

  test('a read that lands mid-typing does not replace the buffer', async () => {
    const state: FsState = { reads: 0, writes: 0, sentEol: null, body: DISK };
    stubFetch(state);
    await mountEditor();

    await act(async () => {
      mounted?.onChange('edited by hand');
      mounted?.reset();
    });
    await settleEditor();

    expect(state.reads).toBe(2);
    expect(mounted?.content).toBe('edited by hand');
  });

  // A textarea's API value drops every CR, so a CRLF file reaches the buffer as
  // LF — and multipart/form-data turns a bare LF back into CRLF, so the payload
  // cannot carry the ending. The file's own ending therefore travels as its own
  // field, and losing it rewrote every line of the file on a one-character edit.
  test('a CRLF file is saved as CRLF after an edit', async () => {
    const state: FsState = { reads: 0, writes: 0, sentEol: null, body: 'const a = 1;\r\nconst b = 2;\r\n' };
    stubFetch(state);
    await mountEditor();

    expect(mounted?.content).toBe('const a = 1;\nconst b = 2;\n');

    await act(async () => {
      mounted?.onChange('const a = 1;\nconst c = 3;\n');
    });
    await settleEditor();
    await act(async () => {
      mounted?.saveNow();
    });
    await settleEditor();

    expect(state.writes).toBe(1);
    expect(state.body).toBe('const a = 1;\nconst c = 3;\n');
    expect(state.sentEol).toBe('crlf');
  });

  test('an LF file is saved as LF', async () => {
    const state: FsState = { reads: 0, writes: 0, sentEol: null, body: DISK };
    stubFetch(state);
    await mountEditor();

    await act(async () => {
      mounted?.onChange('const a = 1;\n');
    });
    await settleEditor();
    await act(async () => {
      mounted?.saveNow();
    });
    await settleEditor();

    expect(state.body).toBe('const a = 1;\n');
    expect(state.sentEol).toBe('lf');
  });
});
