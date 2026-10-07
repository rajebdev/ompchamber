/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Identity half of the docked generating indicator.
 *
 * A fresh spawn has no identity for its first seconds: the `new-…` session has
 * no sidebar row yet, so `runModel` is null, and `seedSession` only writes the
 * resolved model once the spawn response lands. The identity slot therefore
 * rendered empty while the verb rendered beside it — `• Thinking…`, a bullet
 * with nothing in front of it. The component must name the WAIT in that state
 * instead of painting a blank identity, and must keep naming the real run the
 * moment either half arrives (a provider-only identity still says which account
 * is answering).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { GeneratingIndicator } from '@/client/components/workspace/chat-timeline/GeneratingIndicator';

let container: HTMLElement;

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event'] as const;
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

async function mount(props: Record<string, unknown>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    render(h(GeneratingIndicator, { generatingVerb: 'Thinking', ...props }), container);
  });
  return container;
}

describe('GeneratingIndicator identity', () => {
  test('an unknown identity names the wait instead of drawing a bullet with nothing in front of it', async () => {
    const el = await mount({});
    expect(el.textContent).toContain('Loading');
    // The verb belongs to a run whose identity is known: beside an empty
    // identity it read as a stray bullet.
    expect(el.textContent).not.toContain('Thinking');
    expect(el.textContent).not.toContain('•');
  });

  test('a blank model name is not an identity', async () => {
    const el = await mount({ modelName: '   ' });
    expect(el.textContent).toContain('Loading');
  });

  test('the model names the run and keeps the verb', async () => {
    const el = await mount({ modelName: 'DeepSeek V4 Flash' });
    expect(el.textContent).toContain('DeepSeek V4 Flash');
    expect(el.textContent).toContain('Thinking');
    expect(el.textContent).not.toContain('Loading');
  });

  test('a provider-only identity still names the run', async () => {
    const el = await mount({ provider: 'kenari' });
    expect(el.textContent).toContain('Kenari');
    expect(el.textContent).toContain('Thinking');
    expect(el.textContent).not.toContain('Loading');
    // The separator belongs to the PAIR: there is no model half to separate.
    expect(el.textContent).not.toContain('•');
  });
});
