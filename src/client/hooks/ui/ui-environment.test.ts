/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Visibility-driven polling, the clipboard, and the open-file event.
 *
 * `useVisibilityRefresh` must never tick while the tab is hidden, and must
 * re-read once on the way back: a background poll is wasted work, and a missing
 * catch-up leaves the UI stale until the next interval. Its `guardInFlight` arm
 * must also release its lock on the rejection arm — a poller that only unlocked
 * on resolve would freeze forever after one failed read.
 *
 * Clipboard has two paths — the async API only in a secure context, otherwise
 * the `execCommand` textarea — and neither may silently report success.
 */

import { afterAll, afterEach, beforeAll, describe, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import { copyToClipboard, readClipboardText } from '@/client/hooks/ui/clipboard';
import { openFileInEditor } from '@/client/hooks/ui/open-file';
import type { OpenFilePayload } from '@/client/hooks/ui/open-file';
import { useVisibilityRefresh } from '@/client/hooks/ui/visibility-refresh';
import type { VisibilityRefreshOptions } from '@/client/hooks/ui/visibility-refresh';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event', 'CustomEvent'] as const;
/** The runner's own globals, restored on teardown (see the matching afterAll at the end of this file) so later files still see native Event/CustomEvent/window. */
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

let win: Window;
let container: HTMLElement;

beforeAll(() => {
  win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
});

afterEach(() => {
  if (container) render(null, container);
  container?.remove();
  document.body.innerHTML = '';
  jest.useRealTimers();
});

function mount(vnode: Parameters<typeof render>[0]) {
  container ??= document.body.appendChild(document.createElement('div'));
  act(() => {
    render(vnode, container as HTMLElement);
  });
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

interface RefreshProbeProps {
  options: VisibilityRefreshOptions;
  calls: string[];
}

function RefreshProbe({ options, calls }: RefreshProbeProps) {
  useVisibilityRefresh(() => {
    calls.push('tick');
  }, options);
  return h('span', null, String(calls.length));
}

/** Mounts a poller and returns its call log. */
function mountPoller(options: VisibilityRefreshOptions) {
  const calls: string[] = [];
  mount(h(RefreshProbe, { options, calls }));
  return calls;
}

describe('useVisibilityRefresh', () => {
  test('does not fire on mount and ticks on each interval while visible', () => {
    jest.useFakeTimers();
    setVisibility('visible');
    const calls = mountPoller({ enabled: true, intervalMs: 100 });
    expect(calls).toEqual([]);

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(calls).toEqual(['tick']);
    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(calls).toEqual(['tick', 'tick', 'tick']);
  });

  test('skips every tick while the document is hidden', () => {
    jest.useFakeTimers();
    setVisibility('hidden');
    const calls = mountPoller({ enabled: true, intervalMs: 100 });

    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(calls).toEqual([]);
  });

  test('re-reads exactly once on the transition back to visible', () => {
    jest.useFakeTimers();
    setVisibility('hidden');
    const calls = mountPoller({ enabled: true, intervalMs: 100 });

    act(() => {
      setVisibility('visible');
      document.dispatchEvent(new (win.Event as unknown as typeof Event)('visibilitychange'));
    });
    expect(calls).toEqual(['tick']);

    // A second visible->visible notification is not another read.
    act(() => {
      document.dispatchEvent(new (win.Event as unknown as typeof Event)('visibilitychange'));
    });
    expect(calls).toEqual(['tick']);
  });

  test('a disabled hook binds neither an interval nor a listener', () => {
    jest.useFakeTimers();
    setVisibility('hidden');
    const calls = mountPoller({ enabled: false, intervalMs: 100 });

    act(() => {
      jest.advanceTimersByTime(500);
      setVisibility('visible');
      document.dispatchEvent(new (win.Event as unknown as typeof Event)('visibilitychange'));
    });
    expect(calls).toEqual([]);
  });

  test('a non-positive interval disables polling', () => {
    jest.useFakeTimers();
    setVisibility('visible');
    const calls = mountPoller({ enabled: true, intervalMs: 0 });

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(calls).toEqual([]);
  });

  test('unmounting stops the interval', () => {
    jest.useFakeTimers();
    setVisibility('visible');
    const calls = mountPoller({ enabled: true, intervalMs: 100 });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(calls).toEqual(['tick']);

    render(null, container as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(calls).toEqual(['tick']);
  });

  test('guardInFlight skips ticks until the previous call settles, and unlocks on rejection', async () => {
    jest.useFakeTimers();
    setVisibility('visible');
    let reject!: (error: Error) => void;
    const gate = new Promise<void>((_resolve, rejectFn) => {
      reject = rejectFn;
    });
    const guarded: string[] = [];
    function GuardedProbe() {
      useVisibilityRefresh(() => {
        guarded.push('tick');
        return gate;
      }, { enabled: true, intervalMs: 100, guardInFlight: true });
      return h('span', null, String(guarded.length));
    }
    const node = document.body.appendChild(document.createElement('div'));
    act(() => {
      render(h(GuardedProbe, {}), node);
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(guarded).toEqual(['tick']);
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(guarded).toEqual(['tick']);

    // The callback owns its error surface, so a rejection must still unlock.
    // Awaiting is load-bearing: `inFlight` is cleared on the promise's
    // rejection callback, which only runs once this test yields.
    await act(async () => {
      reject(new Error('poll failed'));
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(guarded).toEqual(['tick', 'tick']);
    render(null, node);
    node.remove();
  });
});

function setSecureContext(value: boolean) {
  Object.defineProperty(win, 'isSecureContext', { configurable: true, value });
}

function setClipboard(api: Partial<Clipboard> | undefined) {
  Object.defineProperty(win.navigator, 'clipboard', { configurable: true, value: api });
}

describe('copyToClipboard', () => {
  test('empty text is refused before touching the clipboard', async () => {
    const writes: string[] = [];
    setSecureContext(true);
    setClipboard({ writeText: async (text: string) => void writes.push(text) } as unknown as Clipboard);

    expect(await copyToClipboard('')).toBe(false);
    expect(writes).toEqual([]);
  });

  test('a secure context with the async API returns true and writes the text', async () => {
    const writes: string[] = [];
    setSecureContext(true);
    setClipboard({ writeText: async (text: string) => void writes.push(text) } as unknown as Clipboard);

    expect(await copyToClipboard('hello')).toBe(true);
    expect(writes).toEqual(['hello']);
  });

  test('an insecure context skips the async API and uses the textarea fallback', async () => {
    const writes: string[] = [];
    setSecureContext(false);
    setClipboard({ writeText: async (text: string) => void writes.push(text) } as unknown as Clipboard);
    const commands: string[] = [];
    document.execCommand = ((command: string) => {
      commands.push(command);
      return true;
    }) as typeof document.execCommand;

    expect(await copyToClipboard('hello')).toBe(true);
    expect(writes).toEqual([]);
    expect(commands).toEqual(['copy']);
    // The scratch textarea never outlives the call on the success path.
    expect(document.body.querySelector('textarea')).toBeNull();
  });

  test('a rejected writeText falls back to the textarea', async () => {
    setSecureContext(true);
    setClipboard({ writeText: async () => Promise.reject(new Error('denied')) } as unknown as Clipboard);
    document.execCommand = (() => true) as typeof document.execCommand;

    expect(await copyToClipboard('hello')).toBe(true);
  });

  test('a refused or throwing execCommand reports false', async () => {
    setSecureContext(false);
    setClipboard(undefined);
    document.execCommand = (() => false) as typeof document.execCommand;
    expect(await copyToClipboard('hello')).toBe(false);

    document.execCommand = (() => {
      throw new Error('blocked');
    }) as typeof document.execCommand;
    expect(await copyToClipboard('hello')).toBe(false);
  });
});

describe('readClipboardText', () => {
  test('returns null without the async API', async () => {
    setSecureContext(true);
    setClipboard(undefined);
    expect(await readClipboardText()).toBeNull();
  });

  test('returns null in an insecure context even when the API exists', async () => {
    setSecureContext(false);
    setClipboard({ readText: async () => 'secret' } as unknown as Clipboard);
    expect(await readClipboardText()).toBeNull();
  });

  test('returns the text, and null when the read is refused', async () => {
    setSecureContext(true);
    setClipboard({ readText: async () => 'pasted' } as unknown as Clipboard);
    expect(await readClipboardText()).toBe('pasted');

    setClipboard({ readText: async () => Promise.reject(new Error('denied')) } as unknown as Clipboard);
    expect(await readClipboardText()).toBeNull();
  });
});

describe('openFileInEditor', () => {
  function capture(): OpenFilePayload[] {
    const seen: OpenFilePayload[] = [];
    window.addEventListener('omp:open-file', (event) => {
      seen.push((event as CustomEvent<OpenFilePayload>).detail);
    });
    return seen;
  }

  test('a bare path is cleaned and its basename becomes the name', () => {
    const seen = capture();
    openFileInEditor('/src/client/App.tsx');

    expect(seen).toEqual([
      { path: 'src/client/App.tsx', name: 'App.tsx', id: undefined, content: undefined, root: undefined, repo: undefined },
    ]);
  });

  test('an explicit name wins over the basename, and the payload is forwarded', () => {
    const seen = capture();
    openFileInEditor({ path: '/repo/src/b.ts', name: 'Renamed', id: 7, content: 'x', root: '/repo', repo: 'sub' });

    expect(seen).toEqual([
      { path: 'repo/src/b.ts', name: 'Renamed', id: 7, content: 'x', root: '/repo', repo: 'sub' },
    ]);
  });

  test('a path with no slash keeps the whole path as the name', () => {
    const seen = capture();
    openFileInEditor('README.md');
    expect(seen[0].name).toBe('README.md');
    expect(seen[0].path).toBe('README.md');
  });
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});
