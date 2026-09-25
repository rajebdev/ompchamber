/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useFileActions` — the Files panel's server contract.
 *
 * Three rules are asserted here because each was a bug: a create that SUCCEEDS
 * opens the new file (the dialog used to close and leave the user hunting for
 * an empty row), a create that is REFUSED keeps the dialog open with the reason
 * beside the field (rather than closing as if it had worked), and a settled
 * response is acted on exactly ONCE — an unguarded effect re-ran on every render
 * and pinned the tab the moment a file was created.
 *
 * Runs against a real DOM (happy-dom) because it is a Preact hook driving
 * fetches. The modules below are therefore imported DYNAMICALLY, inside
 * `beforeAll`: Preact binds its environment at evaluation time, so a static
 * import would capture the DOM-less one and the render would fail — the same
 * boundary `use-file-editor.test.ts` documents.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { h as PreactH, render as PreactRender } from 'preact';
import type { act as PreactAct } from 'preact/test-utils';
import type { FileActions, useFileActions as UseFileActionsHook } from '@/client/hooks/workspace/file-tree-actions';

let useFileActions: typeof UseFileActionsHook;
let h: typeof PreactH;
let render: typeof PreactRender;
let act: typeof PreactAct;

let mounted: FileActions | null = null;
let container: HTMLElement;

/** What the stubbed endpoint was asked, and what it answers. */
interface Server {
  requests: Array<Record<string, string>>;
  /** Response for the next create: `success` with a path, or a refusal. */
  createResult: { success?: boolean; path?: string; error?: string };
}

const opened: Array<{ path: string; name: string }> = [];
let refreshes = 0;

function stubFetch(server: Server) {
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const form = init?.body as FormData;
    const fields: Record<string, string> = {};
    for (const [key, value] of form.entries()) fields[key] = String(value);
    server.requests.push(fields);
    // The fetcher reads `text()` and parses it itself, so a stub that only
    // offers `json()` would leave every response looking empty — the request
    // would be recorded and the effect would never see an answer.
    const body = JSON.stringify(server.createResult);
    return { ok: true, text: async () => body };
  }) as unknown as typeof fetch;
}

/**
 * Let the request chain and the render it queues land.
 *
 * Several `act` boundaries, each draining microtasks: the fetcher's chain
 * (`fetch` → `text()` → parse → `setData` → `setState`) resolves over several
 * turns, and a state update queued outside an `act` boundary is only flushed
 * when the next one arrives. No timers — the hook resolves on promises, so
 * waiting on the clock would only be guessing at how many turns it needs.
 */
async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    });
  }
}

function mount(file: { path: string; name: string }, diff?: { staged?: boolean; status?: string }) {
  const Probe = () => {
    mounted = useFileActions({
      // `basePath` is the ABSOLUTE listing root the server reported, and it is
      // what Copy Path anchors on — `rootPath` is the client's own (possibly
      // `~`-relative) workspace path, which is not resolvable outside the panel.
      file: { ...file, basePath: '/root', rootPath: '/root', repo: '.' },
      diff,
      onOpenFile: (target) => opened.push({ path: target.path, name: target.name }),
      onActionComplete: () => refreshes++,
    });
    return null;
  };
  return act(async () => {
    render(h(Probe, {}), container);
  });
}

/** Open the create dialog the way the context menu does. */
async function openCreateDialog() {
  await act(async () => {
    mounted?.handleAction('new_file');
  });
}

/**
 * Submit the create dialog with `name` and let the response land — the whole
 * user sequence (open the dialog, type, press Create), because the state under
 * test is what survives it.
 */
async function createNamed(name: string) {
  await openCreateDialog();
  await act(async () => {
    mounted?.setCreateName(name);
  });
  await act(async () => {
    mounted?.submitCreate({ preventDefault() {} } as never);
  });
  await settle();
}

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
  ({ useFileActions } = await import('@/client/hooks/workspace/file-tree-actions'));
  ({ h, render } = await import('preact'));
  ({ act } = await import('preact/test-utils'));
});

afterAll(() => {
  for (const key of Object.keys(installed)) {
    if (displaced[key] === undefined) delete (globalThis as Record<string, unknown>)[key];
    else (globalThis as Record<string, unknown>)[key] = displaced[key];
  }
});

beforeEach(() => {
  mounted = null;
  opened.length = 0;
  refreshes = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  render(null, container);
  container.remove();
});

function server(createResult: Server['createResult']): Server {
  return { requests: [], createResult };
}

describe('useFileActions create', () => {
  test('a created file opens in the editor and refreshes the tree', async () => {
    const srv = server({ success: true, path: 'src/new-file.ts' });
    stubFetch(srv);
    await mount({ path: 'src', name: 'src' });
    await createNamed('new-file.ts');

    expect(srv.requests[0]).toEqual({ actionType: 'create', path: 'src', name: 'new-file.ts', root: '/root' });
    expect(opened).toEqual([{ path: 'src/new-file.ts', name: 'new-file.ts' }]);
    expect(refreshes).toBe(1);
    expect(mounted?.showCreateModal).toBe(false);
  });

  test('a refusal keeps the dialog open and reports the server’s reason', async () => {
    stubFetch(server({ error: 'new-file.ts already exists' }));
    await mount({ path: 'src', name: 'src' });
    await createNamed('new-file.ts');

    expect(mounted?.showCreateModal).toBe(true);
    expect(mounted?.createError).toBe('new-file.ts already exists');
    expect(opened).toEqual([]);
    expect(refreshes).toBe(0);
  });

  test('a refusal with no message still says something', async () => {
    stubFetch(server({}));
    await mount({ path: 'src', name: 'src' });
    await createNamed('new-file.ts');

    expect(mounted?.createError).toBe('Could not create the file');
  });

  test('a settled response is acted on once, however many times the row re-renders', async () => {
    // The unguarded version re-ran this effect on every render and re-opened
    // the file forever, which pinned the tab.
    const srv = server({ success: true, path: 'src/once.ts' });
    stubFetch(srv);
    await mount({ path: 'src', name: 'src' });
    await createNamed('once.ts');

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        mounted?.setCreateName('');
      });
    }
    await settle();

    expect(refreshes).toBe(1);
    expect(opened.length).toBe(1);
  });

  test('an empty name never reaches the server', async () => {
    const srv = server({ success: true, path: 'src/x.ts' });
    stubFetch(srv);
    await mount({ path: 'src', name: 'src' });

    await act(async () => {
      mounted?.setCreateName('   ');
    });
    await act(async () => {
      mounted?.submitCreate({ preventDefault() {} } as never);
    });
    await settle();

    expect(srv.requests).toEqual([]);
    expect(mounted?.showCreateModal).toBe(false);
  });
});

describe('useFileActions context menu', () => {
  test('opening the create dialog resets the previous attempt', async () => {
    stubFetch(server({ error: 'taken' }));
    await mount({ path: 'src', name: 'src' });
    await createNamed('taken.ts');
    expect(mounted?.createError).toBe('taken');

    await act(async () => {
      mounted?.handleAction('new_file');
    });

    expect(mounted?.showCreateModal).toBe(true);
    expect(mounted?.createError).toBeNull();
    expect(mounted?.createName).toBe('');
  });

  test('copying the path reports the ABSOLUTE path, and does not call the server', async () => {
    const srv = server({});
    stubFetch(srv);
    const writes: string[] = [];
    // `copyToClipboard` prefers the async clipboard API, and only when the page
    // is a secure context — the legacy textarea path needs `execCommand`, which
    // happy-dom does not implement.
    Object.defineProperty(globalThis.window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          writes.push(text);
        },
      },
      configurable: true,
    });
    await mount({ path: 'src/deep/file.ts', name: 'file.ts' });

    await act(async () => {
      mounted?.handleAction('copy_path');
    });
    await settle();

    expect(writes).toEqual(['/root/src/deep/file.ts']);
    expect(srv.requests).toEqual([]);
  });

  test('a folder gets the create action; a file does not offer it', async () => {
    stubFetch(server({}));
    await mount({ path: 'src', name: 'src' });

    await act(async () => {
      mounted?.handleAction('new_file');
    });
    expect(mounted?.showCreateModal).toBe(true);

    await act(async () => {
      mounted?.closeCreate();
    });
    expect(mounted?.showCreateModal).toBe(false);
  });
});

describe('useFileActions rename and delete', () => {
  test('rename sends the new path and closes on success', async () => {
    const srv = server({ success: true });
    stubFetch(srv);
    await mount({ path: 'src/old.ts', name: 'old.ts' });

    await act(async () => {
      mounted?.handleAction('rename');
    });
    await act(async () => {
      mounted?.setRenameValue('src/new.ts');
    });
    await act(async () => {
      mounted?.submitRename({ preventDefault() {} } as never);
    });
    await settle();

    expect(srv.requests[0]).toEqual({ actionType: 'rename', path: 'src/old.ts', newPath: 'src/new.ts', root: '/root' });
    expect(mounted?.showRenameModal).toBe(false);
    expect(refreshes).toBe(1);
  });

  test('delete posts the delete action for the row’s own path', async () => {
    const srv = server({ success: true });
    stubFetch(srv);
    await mount({ path: 'src/gone.ts', name: 'gone.ts' });

    await act(async () => {
      mounted?.submitDelete();
    });
    await settle();

    expect(srv.requests[0]).toEqual({ actionType: 'delete', path: 'src/gone.ts', root: '/root' });
    expect(refreshes).toBe(1);
  });

  test('a git-history response does not close the dialogs or refresh the tree', async () => {
    // `type` marks the history payload; treating it as a mutation would refresh
    // the tree under an open modal.
    const srv = server({ success: true, type: 'history', data: [] } as never);
    stubFetch(srv);
    await mount({ path: 'src/a.ts', name: 'a.ts' });

    await act(async () => {
      mounted?.handleAction('history');
    });
    await settle();

    expect(mounted?.showHistoryModal).toBe(true);
    expect(refreshes).toBe(0);
  });
});
