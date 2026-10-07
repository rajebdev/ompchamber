/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Source Control panel's change list comes from the REALTIME topic, not the
 * mount-time HTTP read.
 *
 * `fetched ?? git.data` did the opposite: the HTTP copy won unconditionally, so
 * a tool call that republished `git:` updated `git.data` while the panel kept
 * rendering the list it read at mount. Measured on a live server, the panel said
 * "No changes found." while `git status` reported the file a tool call had just
 * created. The topic is what the server pushes on every tool call, so it must
 * win; the HTTP read is only the ahead/behind supplement.
 *
 * Driven through a REAL realtime server, with the HTTP read answering an EMPTY
 * list and the topic a populated one: only a panel that reads the topic renders
 * any change, so the assertion is the precedence itself.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { GitPanel } from '@/client/components/workspace/git-panel';
import { SessionStateProvider } from '@/client/components/common/session-state-provider/index';
import { resetRealtimeClient } from '@/shared/lib/realtime/client';
import { gitTopic, reposTopic } from '@/shared/lib/realtime/protocol';
import { startRealtimeTestServer, type RealtimeTestServer } from '@/test-support/realtime-server';
import { installDomGlobals, pristineWebSocket, restoreDomGlobals } from '@/test-support/pristine-globals';
import type { TopicResolver } from '@/server/lib/realtime/hub.server';

const ROOT = '/ws';
const SESSION = 'new-git-panel';
const TOPIC = gitTopic(`${ROOT}\u0000.`);

/** The runner's own fetch, reached through `Bun` so a leaked stub cannot be mistaken for it. */
const nativeFetch = Bun.fetch;

let container: HTMLElement;
let server: RealtimeTestServer;

/** A payload the panel renders as `n` changed files. */
function statusOf(count: number): unknown {
  return {
    changes: Array.from({ length: count }, (_, i) => ({
      status: '??',
      file: `file-${i}.txt`,
      staged: false,
      additions: 1,
      deletions: 0,
    })),
    branch: 'main',
    branches: ['main'],
    remoteBranches: [],
  };
}

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

/** Mount the panel over a server whose topic answers one change and HTTP none. */
async function mount(): Promise<void> {
  server = await startRealtimeTestServer(new Map<string, TopicResolver>([
    [TOPIC, async () => statusOf(1)],
    [reposTopic(ROOT), async () => ({ repos: ['.'], reposPending: false })],
  ]));
  const win = new Window({ url: `http://127.0.0.1:${server.port}` });
  installDomGlobals(win);
  const target = globalThis as unknown as Record<string, unknown>;
  target.WebSocket = pristineWebSocket;
  target.fetch = async (input: unknown) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.includes('/state')) return json({ sessionId: SESSION, state: {} });
    if (url.includes('reposOnly')) return json({ repos: ['.'], reposPending: false });
    // The panel's own HTTP read (mount + Refresh): EMPTY, deliberately.
    return json(statusOf(0));
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(
      h(SessionStateProvider, {
        sessionId: SESSION,
        children: h(GitPanel, { rootPath: ROOT, enabled: true }),
      }),
      container,
    );
  });
  // Both reads must land before the assertion: with `fetched` still undefined
  // the old precedence would accidentally pass.
  await server.waitForTopic(TOPIC, (value) => value !== null);
  for (let i = 0; i < 20; i += 1) await act(async () => {});
}

describe('GitPanel change list', () => {
  test('renders the topic list, not the mount-time HTTP read', async () => {
    await mount();
    expect(container.textContent).toContain('file-0.txt');
  });

  test('a topic push updates the list', async () => {
    await mount();
    await act(async () => {
      server.publish(TOPIC, statusOf(2));
      await server.waitForTopic(TOPIC, (value) => (value as { changes?: unknown[] })?.changes?.length === 2);
    });
    for (let i = 0; i < 20; i += 1) await act(async () => {});
    expect(container.textContent).toContain('file-1.txt');
  });
});
