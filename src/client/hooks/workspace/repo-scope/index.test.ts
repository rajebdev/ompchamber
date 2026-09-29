/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The repo pick is SHARED, not private per component.
 *
 * The panel that owns the picker is not always the component that must follow
 * the choice — the activity bar's Source Control dot and the phone's tab bar
 * read the same slot — and `useSessionState` hands each caller its own copy, so
 * a follower kept the previous repo until something unrelated re-mounted it.
 *
 * Rendered with `h()` (no JSX) against happy-dom.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { SessionStateProvider } from '@/client/components/common/session-state-provider/index';
import { useRepoScope } from '@/client/hooks/workspace/repo-scope';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;

const ROOT = '/ws';
const OTHER_ROOT = '/other';
const SESSION = 'new-repo-scope';

let container: HTMLElement;

/**
 * Reads the slot at `rootPath`, and — when `repo` is given — owns a button that
 * writes it, the way a panel's picker does.
 */
function Consumer({ id, rootPath, repo }: { id: string; rootPath: string; repo?: string }) {
  const { activeRepo, setActiveRepo } = useRepoScope(rootPath, 'git.activeRepo');
  return h(
    'div',
    { id },
    h('span', null, activeRepo),
    repo === undefined ? null : h('button', { onClick: () => setActiveRepo(repo) }, 'pick'),
  );
}

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) target[key] = (win as unknown as Record<string, unknown>)[key];
  target.fetch = async () =>
    new Response(JSON.stringify({ sessionId: 'x', state: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) delete target[key];
  delete target.fetch;
});

afterEach(() => {
  container?.remove();
});

/** Mounts one session's consumers and drains the session-state load. */
async function mount(children: ReturnType<typeof h>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(h(SessionStateProvider, { sessionId: SESSION, children }), container);
  });
  for (let i = 0; i < 20; i += 1) await act(async () => {});
  return container;
}

const read = (id: string) => container.querySelector(`#${id} span`)?.textContent;

/** Clicks the picker button inside `#owner`'s consumer. */
async function clickPicker() {
  await act(async () => {
    const button = container.querySelector('#owner button') as HTMLButtonElement;
    button.click();
  });
}

describe('useRepoScope', () => {
  test('a write by one consumer reaches another consumer of the same slot', async () => {
    await mount(
      h('div', null, h(Consumer, { id: 'owner', rootPath: ROOT, repo: 'projects/shared' }), h(Consumer, { id: 'follower', rootPath: ROOT })),
    );
    expect(read('follower')).toBe('.');

    await clickPicker();

    expect(read('owner')).toBe('projects/shared');
    expect(read('follower')).toBe('projects/shared');
  });

  test('a pick made under another root does not name a directory of this one', async () => {
    await mount(
      h('div', null, h(Consumer, { id: 'owner', rootPath: ROOT, repo: 'projects/shared' }), h(Consumer, { id: 'elsewhere', rootPath: OTHER_ROOT })),
    );

    await clickPicker();

    expect(read('owner')).toBe('projects/shared');
    expect(read('elsewhere')).toBe('.');
  });
});
