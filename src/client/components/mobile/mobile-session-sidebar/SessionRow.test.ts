/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The mobile session row's status slot.
 *
 * The phone must draw the same cue the desktop row does: a session whose agent
 * is blocked on a question shows the question mark, NOT the run spinner. The
 * child is still mid-run while it waits (`streamStatus` stays `stream`), so a
 * row that only knew the stream state drew a spinner over a turn that was
 * actually waiting for the user — the bug this pins.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { MobileSessionRow } from '@/client/components/mobile/mobile-session-sidebar/SessionRow';
import type { MobileSessionRowProps } from '@/client/components/mobile/mobile-session-sidebar/SessionRow';
import type { SessionItemData } from '@/shared/types';

let container: HTMLElement;

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) target[key] = (win as unknown as Record<string, unknown>)[key];
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) delete target[key];
});

const session: SessionItemData = { id: 's1', folder_id: 1, title: 'hello world' };

async function mount(overrides: Partial<MobileSessionRowProps>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(h(MobileSessionRow, {
      session,
      isActive: false,
      timeAgo: '1m',
      onSelect: () => {},
      onArchive: () => {},
      ...overrides,
    }), container);
  });
  return container;
}

function svgClasses(el: HTMLElement) {
  return Array.from(el.querySelectorAll('svg')).map((s) => s.getAttribute('class') ?? '').join('|');
}

describe('mobile session row status slot', () => {
  test('awaiting input beats the stream spinner', async () => {
    const el = await mount({ status: 'stream', awaitingInput: true });
    expect(svgClasses(el)).toContain('circle-question-mark');
    expect(svgClasses(el)).not.toContain('animate-spin');
  });

  test('stream alone still spins', async () => {
    const el = await mount({ status: 'stream' });
    expect(svgClasses(el)).toContain('animate-spin');
    expect(svgClasses(el)).not.toContain('circle-question-mark');
  });

  test('terminal badge draws the check', async () => {
    const el = await mount({ status: 'finish' });
    expect(svgClasses(el)).toContain('lucide-check');
  });

  test('no status draws no glyph', async () => {
    const el = await mount({});
    const slot = el.querySelector('span.w-4');
    expect(slot?.querySelector('svg')).toBeNull();
  });
});
