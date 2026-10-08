/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A tool card is headed by its OWN intent, so the list reads
 * `title1 → card1 → title2 → card2`.
 *
 * The section used to carry ONE title — the intent of the FIRST call, because
 * `parseMessageBlocks` keeps only the first `i` field — while every later call's
 * intent was dropped entirely. With the intent chip also removed from the card
 * header, a turn with two `bash` calls rendered one label above two identical
 * cards, and the second call's purpose was unreachable without opening it.
 *
 * These pin the ORDER (heading immediately before its card) and that the
 * section-level title is not printed twice.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { ToolCallingSection } from '@/client/components/workspace/chat-timeline/ToolCallingSection';
import { SessionStateProvider } from '@/client/components/common/session-state-provider';
import type { ToolCallData } from '@/shared/types/chat';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'KeyboardEvent'] as const;
const nativeGlobals: Partial<Record<(typeof DOM_GLOBALS)[number], unknown>> = {};
let container: HTMLElement;

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

function tool(id: string, intent: string | undefined, title = 'Bash'): ToolCallData {
  return { id, type: 'bash', name: 'bash', title, intent, status: 'success', output: 'ok' } as ToolCallData;
}

async function mount(tools: ToolCallData[], title?: string) {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(
      h(SessionStateProvider, {
        sessionId: 'test',
        children: h(ToolCallingSection, { tools, title }),
      }),
      container,
    );
  });
  return container;
}

/** The section's direct children in render order: headings and cards. */
function sequence(el: HTMLElement): Array<{ kind: 'heading' | 'card'; text: string }> {
  const section = el.querySelector('div.mx-3')!;
  return Array.from(section.children).map((child) => {
    const cls = (child.className || '').toString();
    if (cls.includes('group overflow-hidden rounded-xl')) {
      const col = child.querySelector('button')!.children[1];
      return { kind: 'card' as const, text: (col.children[0]?.textContent || '').trim() };
    }
    const label = child.querySelector('span');
    return { kind: 'heading' as const, text: label ? (label.textContent || '').trim() : '' };
  }).filter((item) => item.kind === 'card' || item.text);
}

describe('ToolCallingSection per-card intent heading', () => {
  test('each card is preceded by its own intent', async () => {
    const el = await mount([
      tool('a', 'Finding PWA manifest'),
      tool('b', 'Searching standalone branches'),
    ]);
    expect(sequence(el)).toEqual([
      { kind: 'heading', text: 'Finding PWA manifest' },
      { kind: 'card', text: 'Bash' },
      { kind: 'heading', text: 'Searching standalone branches' },
      { kind: 'card', text: 'Bash' },
    ]);
  });

  test('the section title is NOT printed when the cards carry their own intents', async () => {
    const el = await mount([tool('a', 'First intent'), tool('b', 'Second intent')], 'First intent');
    // The section title equals the first call's intent, so keeping it would
    // print that sentence twice in a row.
    const texts = sequence(el).map((item) => item.text);
    expect(texts.filter((t) => t === 'First intent')).toHaveLength(1);
  });

  test('the section title survives when no card has an intent', async () => {
    const el = await mount([tool('a', undefined), tool('b', undefined)], 'Tool Executions (2 steps)');
    expect(sequence(el)[0]).toEqual({ kind: 'heading', text: 'Tool Executions (2 steps)' });
  });

  test('a card without an intent simply has no heading', async () => {
    const el = await mount([tool('a', 'Has intent'), tool('b', undefined)]);
    expect(sequence(el)).toEqual([
      { kind: 'heading', text: 'Has intent' },
      { kind: 'card', text: 'Bash' },
      { kind: 'card', text: 'Bash' },
    ]);
  });

  test('a long intent heading is clamped to one line with the full text in title', async () => {
    const long = 'x'.repeat(200);
    const el = await mount([tool('a', long)]);
    const heading = el.querySelector('div.mx-3 > div > span') as HTMLElement;
    expect(heading.className).toContain('truncate');
    expect(heading.className).toContain('min-w-0');
    expect(heading.getAttribute('title')).toBe(long);
  });
});
