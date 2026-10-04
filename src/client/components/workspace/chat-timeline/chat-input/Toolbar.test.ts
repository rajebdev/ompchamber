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
  /** Renders the Plan/Goal group when supplied. */
  withModes?: boolean;
}

const MODES = {
  plan: false,
  goal: false,
  goalOpen: false,
  goalRecord: null,
  goalContinuation: null,
  goalEvaluating: false,
  pending: false,
  planAvailable: true,
  error: null,
  clearError: () => {},
  onTogglePlan: () => {},
  onGoalAction: () => {},
};

/** The selectors are off: this file is about the right-hand action strip. */
async function mount({ isGenerating, chatRunning, isMobile = false, onStop, withModes = false }: MountOptions): Promise<HTMLElement> {
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
        showAccess: withModes,
        modes: withModes ? MODES : undefined,
        onOpenGoal: withModes ? () => {} : undefined,
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

/**
 * Where the Plan/Goal group is drawn. The bottom row is a single line whose
 * left cluster already fills it on a 320px phone, so a third group there
 * pushed the voice button under the model label; the attachment row above has
 * a second line of room. Desktop keeps the group where it has always been.
 */
describe('composer toolbar Plan/Goal host', () => {
  const plan = '[aria-label="Enter plan mode"]';
  const goal = '[aria-label="Set a goal"]';

  test('draws the toggles in the bottom row on a desktop', async () => {
    const el = await mount({ isGenerating: false, isMobile: false, withModes: true });
    expect(el.querySelectorAll(plan).length).toBe(1);
    expect(el.querySelectorAll(goal).length).toBe(1);
  });

  test('leaves the phone bottom row without them, for the attachment row to host', async () => {
    const el = await mount({ isGenerating: false, isMobile: true, withModes: true });
    expect(el.querySelectorAll(plan).length).toBe(0);
    expect(el.querySelectorAll(goal).length).toBe(0);
  });

  test('draws neither when the composer has no modes at all', async () => {
    const el = await mount({ isGenerating: false, withModes: false });
    expect(el.querySelectorAll(plan).length).toBe(0);
  });
});
