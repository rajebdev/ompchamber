/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The Source Control dot belongs to that panel, so it must describe the repo the
 * panel is on. It polled the workspace root instead: with `projects/a` selected
 * the dot answered for the root's repository, and it kept answering for the repo
 * the user had just left until the next poll.
 *
 * Rendered with `h()` (no JSX) against happy-dom.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { RightActivityBar } from '@/client/components/layout/RightActivityBar';
import { SessionStateProvider } from '@/client/components/common/session-state-provider/index';
import { useRepoScope } from '@/client/hooks/workspace/repo-scope';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;

const ROOT = '/ws';
const SESSION = 'new-activity-dot';

let container: HTMLElement;
const statusUrls: string[] = [];

/** The picker the panel owns: writes the slot the dot follows. */
function Picker({ repo }: { repo: string }) {
  const { setActiveRepo } = useRepoScope(ROOT);
  return h('button', { id: 'pick', onClick: () => setActiveRepo(repo) }, 'pick');
}

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) target[key] = (win as unknown as Record<string, unknown>)[key];
  target.fetch = async (input: unknown) => {
    const url = String(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.includes('/state')) {
      return json({ sessionId: SESSION, state: { 'workspace.activeRepo': { root: ROOT, repo: 'projects/a' } } });
    }
    if (url.includes('reposOnly')) return json({ repos: ['.', 'projects/a', 'projects/b'] });
    statusUrls.push(url);
    // Only the selected repo has anything to report, so the dot is a verdict.
    return json({ changes: url.includes('repo=projects%2Fa') ? [{ path: 'a.ts', status: ' M' }] : [] });
  };
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) delete target[key];
  delete target.fetch;
});

afterEach(() => {
  container?.remove();
  statusUrls.length = 0;
});

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(
      h(SessionStateProvider, {
        sessionId: SESSION,
        children: h('div', null, h(Picker, { repo: '.' }), h(RightActivityBar, {
          activePanel: 'git',
          onChangePanel: () => {},
          isPanelOpen: true,
          hasActiveContext: true,
          activeProjectPath: ROOT,
          refreshKey: 0,
        })),
      }),
      container,
    );
  });
  for (let i = 0; i < 20; i += 1) await act(async () => {});
  return container;
}

const dot = () => Boolean(container.querySelector('[title="Ada perubahan git"]'));

describe('RightActivityBar git dot', () => {
  test('reports the selected repo, and follows the picker to the root', async () => {
    await mount();

    // The stored pick is projects/a, so the dot answers for it — not for /ws.
    expect(statusUrls.some((url) => url.includes('repo=projects%2Fa'))).toBe(true);
    expect(dot()).toBe(true);

    await act(async () => {
      (container.querySelector('#pick') as HTMLButtonElement).click();
    });

    const last = statusUrls.at(-1);
    expect(last).toContain(`root=${encodeURIComponent(ROOT)}`);
    expect(last).not.toContain('repo=');
    expect(dot()).toBe(false);
  });
});
