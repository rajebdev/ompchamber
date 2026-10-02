/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stop visibility on the composer toolbar.
 *
 * Stop follows the CHAT-level "a run is in flight" flag — the server-tracked
 * `stream` status OR this client's own run — never `isGenerating` alone. A run
 * this page did not start (another tab on the same session, a scheduled task,
 * the goal driver's continuation, a page that reattached to the stream) is
 * still running, and the sidebar spinner and the docked indicator already say
 * so; reading the local flag alone hid Stop for exactly those runs, leaving
 * the only control that ends a turn unavailable while it streamed.
 *
 * The fallback is the other half: a composer with no chat turn of its own (the
 * New Chat modal, the side-question form) passes no chat-level flag and must
 * keep behaving as it did.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { ComposerToolbar } from '@/client/components/workspace/chat-timeline/chat-input/Toolbar';

let container: HTMLElement;

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;
/** The runner's own globals, restored on teardown — deleting them would strip natives (Event/CustomEvent) every later file needs. */
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (!(key in nativeGlobals)) nativeGlobals[key] = target[key];
    target[key] = (win as unknown as Record<string, unknown>)[key];
  }
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) {
    if (nativeGlobals[key] === undefined) delete target[key];
    else target[key] = nativeGlobals[key];
  }
});

interface MountOptions {
  isGenerating: boolean;
  chatRunning?: boolean;
  isMobile?: boolean;
  onStop?: () => void;
}

/** The selectors are off: this file is about the right-hand action strip. */
async function mount({ isGenerating, chatRunning, isMobile = false, onStop }: MountOptions): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(
      h(ComposerToolbar, {
        isMobile,
        selectedModel: null,
        onSelectModel: () => {},
        thinkingLevels: [],
        currentThinking: 'auto',
        onSelectThinking: () => {},
        isGenerating,
        chatRunning,
        onStop,
        onSend: () => {},
        sendDisabled: false,
        showModel: false,
        showThinking: false,
        showAccess: false,
      }),
      container,
    );
  });
  return container;
}

const stops = '[title="Stop generation"]';

describe('composer toolbar Stop', () => {
  test('offers Stop for a run only the chat-level flag reports', async () => {
    const el = await mount({ isGenerating: false, chatRunning: true });
    expect(el.querySelectorAll(stops).length).toBe(1);
  });

  test('offers no Stop while the chat is idle', async () => {
    const el = await mount({ isGenerating: false, chatRunning: false });
    expect(el.querySelectorAll(stops).length).toBe(0);
  });

  test('falls back to the local flag for a composer with no chat turn', async () => {
    const el = await mount({ isGenerating: true });
    expect(el.querySelectorAll(stops).length).toBe(1);
  });

  test('keeps Stop off a phone composer that has no stop handler', async () => {
    const el = await mount({ isGenerating: true, chatRunning: true, isMobile: true, onStop: undefined });
    expect(el.querySelectorAll(stops).length).toBe(0);
  });
});
