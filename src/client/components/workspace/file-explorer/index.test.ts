/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Files panel's two load-bearing behaviours, both driven through a REAL
 * realtime server and the panel's own HTTP reads.
 *
 * 1. **A refresh re-reads the open folders.** The root listing never carries a
 *    folder's children, so a panel that re-read only the root kept rendering
 *    the children it had cached when the folder was expanded: a file or folder
 *    deleted inside one stayed on screen — the panel's own Refresh included.
 *    Measured on a real workspace: deleting a nested folder left it listed under
 *    its open parent, and no amount of refreshing the root could remove it.
 *
 * 2. **An empty folder is LOADED, not "not loaded yet".** `children: null` means
 *    "fetch me"; `children: []` means the folder was read and is empty. Reading
 *    both as the former made every render of an open empty folder fire another
 *    request (the answer is a fresh array, so the tree always re-renders), and
 *    the row flickered between "Loading…" and nothing — measured as a continuous
 *    loop while an empty folder was expanded.
 *
 * The HTTP stub is a real directory model: the tests mutate it between reads,
 * which is what makes the refresh assertion fail on the old code (the cached
 * children would answer from memory, never from the model).
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { FileExplorer } from '@/client/components/workspace/file-explorer/index';
import { SessionStateProvider } from '@/client/components/common/session-state-provider/index';
import { resetRealtimeClient } from '@/shared/lib/realtime/client';
import { fsTopic, reposTopic } from '@/shared/lib/realtime/protocol';
import { startRealtimeTestServer, type RealtimeTestServer } from '@/test-support/realtime-server';
import { installDomGlobals, pristineWebSocket, restoreDomGlobals } from '@/test-support/pristine-globals';
import type { TopicResolver } from '@/server/lib/realtime/hub.server';
import type { GitStatusPayload } from '@/server/lib/fs/git-status-read';

const ROOT = '/ws';
const SESSION = 'new-files-panel';
const TOPIC = fsTopic(`${ROOT}\u0000.`);

/** The runner's own fetch, reached through `Bun` so a leaked stub cannot be mistaken for it. */
const nativeFetch = Bun.fetch;

/**
 * The fake disk: `path -> child -> (null for a folder, 'file' for a file)`.
 * `.` is the listed root; `src/x.ts` is a file inside the folder `src`.
 */
type Disk = Record<string, Record<string, null | 'file'> | undefined>;

let disk: Disk;
/** Every `/api/fs/dir` request, in order, as `path` (`.` for the root). */
let dirReads: string[];
/** Paths whose NEXT read is answered with a non-JSON 500 (a transport failure,
 *  not a refusal — the folder still exists). */
let failNext: Set<string>;

let container: HTMLElement;
let server: RealtimeTestServer;

beforeAll(() => {
  installDomGlobals(new Window({ url: 'http://localhost' }));
});

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
  resetRealtimeClient();
  server?.stop();
});

afterAll(() => {
  (globalThis as unknown as Record<string, unknown>).fetch = nativeFetch;
  restoreDomGlobals();
});

const GIT_STATUS: GitStatusPayload = { changes: [], branch: 'main', branches: [], remoteBranches: [] };

/** One directory's entries as the server emits them: folders with `children: null`. */
function entriesOf(path: string): unknown[] {
  const dir = disk[path] ?? {};
  return Object.keys(dir).map((child) => {
    const rel = path === '.' ? child : `${path}/${child}`;
    return dir[child] === null
      ? { id: rel, name: child, type: 'folder', path: rel, children: null, ignored: false }
      : { id: rel, name: child, type: 'file', path: rel, ignored: false };
  });
}

async function mount(): Promise<void> {
  failNext = new Set();
  server = await startRealtimeTestServer(new Map<string, TopicResolver>([
    // The root listing rides the topic; the panel's own reads go over HTTP.
    [TOPIC, async () => ({ files: entriesOf('.'), root: ROOT })],
    [reposTopic(ROOT), async () => ({ repos: ['.'], reposPending: false })],
  ]));
  const win = new Window({ url: `http://127.0.0.1:${server.port}` });
  installDomGlobals(win);
  const target = globalThis as unknown as Record<string, unknown>;
  target.WebSocket = pristineWebSocket;
  target.fetch = async (input: unknown) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    if (url.includes('/state')) return json({ sessionId: SESSION, state: {} });
    if (url.includes('reposOnly')) return json({ repos: ['.'], reposPending: false });
    if (url.includes('/api/fs/git')) return json(GIT_STATUS);
    if (url.includes('/api/fs/dir')) {
      const path = new URL(url, 'http://127.0.0.1').searchParams.get('path') ?? '.';
      dirReads.push(path);
      // A transport failure: the folder is fine, the answer is not JSON.
      if (failNext.delete(path)) return new Response('gateway blew up', { status: 500 });
      const dir = disk[path];
      if (!dir) return json({ error: 'Failed to read directory' });
      return json({ files: entriesOf(path), root: ROOT, path });
    }
    return json({});
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(
      h(SessionStateProvider, {
        sessionId: SESSION,
        children: h(FileExplorer, { rootPath: ROOT, enabled: true }),
      }),
      container,
    );
  });
  for (let i = 0; i < 10; i += 1) await act(async () => {});
}

/** Click the deepest element whose trimmed text is exactly `name`. */
async function clickRow(name: string): Promise<void> {
  const rows = [...container.querySelectorAll('div')].filter((el) => el.textContent?.trim() === name);
  const row = rows[rows.length - 1];
  if (!row) throw new Error(`no row named ${name}`);
  await act(async () => {
    row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  for (let i = 0; i < 10; i += 1) await act(async () => {});
}

async function clickRefresh(): Promise<void> {
  const button = [...container.querySelectorAll('button')].find((el) => el.getAttribute('title') === 'Refresh');
  if (!button) throw new Error('no Refresh button');
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  for (let i = 0; i < 20; i += 1) await act(async () => {});
}

describe('Files panel listing', () => {
  test('a refresh re-reads an open folder, so an entry deleted inside it disappears', async () => {
    disk = { '.': { src: null }, src: { 'keep.ts': 'file', 'gone.ts': 'file' } };
    dirReads = [];
    await mount();
    await clickRow('src');
    expect(container.textContent).toContain('gone.ts');

    // Removed from disk — the panel can only know by reading the folder again.
    delete disk['src']!['gone.ts'];
    await clickRefresh();

    expect(dirReads.filter((path) => path === 'src').length).toBeGreaterThan(1);
    expect(container.textContent).not.toContain('gone.ts');
    expect(container.textContent).toContain('keep.ts');
  });

  test('an expanded empty folder is read once, and expanding a sibling does not re-read it', async () => {
    disk = { '.': { empty: null, keep: null }, empty: {}, keep: { 'a.ts': 'file' } };
    dirReads = [];
    await mount();
    const emptyReads = () => dirReads.filter((path) => path === 'empty').length;

    await clickRow('empty');
    expect(emptyReads()).toBe(1);
    expect(container.textContent).not.toContain('a.ts');

    // Expanding a DIFFERENT folder re-renders every row, the empty one
    // included. `children: []` is the server's answer for a folder that was
    // read, so the empty row has nothing left to ask for. Measured on the
    // pre-fix code, the empty array read as "not loaded yet" and this expand
    // produced another read of `empty` (as did every later re-render — one git
    // or fs frame per tool call).
    await clickRow('keep');
    expect(container.textContent).toContain('a.ts');
    expect(emptyReads()).toBe(1);
    // The sibling itself is read once, not once per render of the tree.
    expect(dirReads.filter((path) => path === 'keep').length).toBe(1);
  });

  test('a refresh drops an expanded folder that no longer exists, and stops asking for it', async () => {
    disk = { '.': { nested: null, keep: null }, nested: { 'a.ts': 'file' }, keep: {} };
    dirReads = [];
    await mount();
    await clickRow('nested');
    expect(container.textContent).toContain('a.ts');

    // The whole folder goes. The root listing no longer names it, so the tree
    // drops the row; its CACHED children must go with it, and the expansion set
    // must forget it — otherwise every later refresh keeps asking the server
    // about a directory that is not there.
    delete disk['nested'];
    delete disk['.']?.nested;
    await clickRefresh();

    expect(container.textContent).not.toContain('a.ts');
    const afterDelete = dirReads.filter((path) => path === 'nested').length;
    expect(afterDelete).toBeGreaterThan(0);

    // A second refresh must not ask again: the folder left the expansion set.
    await clickRefresh();
    expect(dirReads.filter((path) => path === 'nested').length).toBe(afterDelete);
  });

  test('a read that fails leaves the row alone and is not retried until it is re-expanded', async () => {
    disk = { '.': { src: null }, src: { 'a.ts': 'file' } };
    dirReads = [];
    await mount();
    const srcReads = () => dirReads.filter((path) => path === 'src').length;

    // The first expand fails at the transport: `children` stays null, which the
    // row must NOT read as "try again" — an unreadable folder would otherwise
    // re-ask on every render, forever.
    failNext.add('src');
    await clickRow('src');
    expect(srcReads()).toBe(1);
    expect(container.textContent).not.toContain('a.ts');

    // A sibling expand re-renders the tree; the failed row must stay quiet.
    await clickRow('src'); // collapse (clears the latch)
    await clickRow('src');
    expect(srcReads()).toBe(2);
    expect(container.textContent).toContain('a.ts');
  });
});
