/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A git-status read belongs to the tree it was asked for.
 *
 * The hook kept whatever the last response said in state, so after the scope
 * moved (a repo switch in the picker, a workspace switch) the previous tree's
 * changes were rendered as the new one's — the Source Control dot described the
 * repository the user had just left — and a response landing late overwrote the
 * fresher one that had already arrived.
 *
 * Rendered with `h()` (no JSX) against happy-dom; responses are resolved by hand
 * so every ordering is exercised without a timer.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useGitStatus } from '@/client/hooks/workspace/git-status';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;
/** The runner's own globals, restored on teardown — deleting them would strip natives (Event/CustomEvent) every later file needs. */const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

const ROOT = '/ws';

let container: HTMLElement | undefined;
const pending: { url: string; respond: (changes: unknown[]) => void }[] = [];

/** Renders the change count for one scope. */
function Harness({ repo }: { repo: string }) {
  const { changes } = useGitStatus(ROOT, repo, 0, true);
  return h('span', { id: 'count' }, String(changes.length));
}

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
  target.fetch = (input: unknown) => {
    const { promise, resolve } = Promise.withResolvers<Response>();
    pending.push({
      url: String(input),
      respond: (changes) =>
        resolve(new Response(JSON.stringify({ changes }), { status: 200, headers: { 'content-type': 'application/json' } })),
    });
    return promise;
  };
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
  delete target.fetch;
});

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  pending.length = 0;
});

/** Shows the hook at `repo`, keeping the component instance across calls. */
async function show(repo: string) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
  }
  await act(async () => {
    render(h(Harness, { repo }), container as HTMLElement);
  });
  return container;
}

/** Answers a pending read and drains the promise chain it feeds. */
async function answer(index: number, changes: unknown[]) {
  await act(async () => {
    pending[index].respond(changes);
  });
  for (let i = 0; i < 5; i += 1) await act(async () => {});
}

const count = () => Number(container?.querySelector('#count')?.textContent);

describe('useGitStatus scope', () => {
  test('never renders one scope\'s changes under another, or an earlier visit\'s', async () => {
    await show('projects/a');
    expect(pending).toHaveLength(1);
    expect(pending[0].url).toContain('repo=projects%2Fa');
    await answer(0, [{ path: 'a.ts', status: ' M' }, { path: 'b.ts', status: '??' }]);
    expect(count()).toBe(2);

    // The picker moves to the workspace root: the old repo's two changes are not
    // the root's, so nothing is shown while its read is in flight.
    await show('.');
    expect(pending).toHaveLength(2);
    expect(pending[1].url).not.toContain('repo=');
    expect(count()).toBe(0);

    await answer(1, [{ path: 'c.ts', status: ' M' }]);
    expect(count()).toBe(1);

    // Back to the first repo: the scope string matches again, and its changes
    // from the earlier visit are not rendered as this visit's.
    await show('projects/a');
    expect(count()).toBe(0);

    await answer(2, [{ path: 'a.ts', status: ' M' }]);
    expect(count()).toBe(1);
  });

  test('ignores a response that lands after a newer read answered', async () => {
    await show('projects/a');
    await show('projects/b');
    await show('.');
    expect(pending).toHaveLength(3);

    await answer(2, [{ path: 'c.ts', status: ' M' }]);
    expect(count()).toBe(1);

    // The slow `projects/b` read answers last: it must not wipe the root's
    // already-rendered answer.
    await answer(1, [{ path: 'b.ts', status: ' M' }, { path: 'b2.ts', status: ' M' }]);
    expect(count()).toBe(1);
  });
});
