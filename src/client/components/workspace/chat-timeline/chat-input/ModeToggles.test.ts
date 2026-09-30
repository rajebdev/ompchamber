/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The two mode buttons.
 *
 * What these pin is the accessibility contract the editor and diff toolbars
 * already follow: a control that exists only as an `<svg onClick>` is
 * unreachable by keyboard and invisible to a screen reader, and a toggle whose
 * pressed state is carried only by colour cannot be read at all.
 *
 * Rendered with `h()` (no JSX) against happy-dom, the same way
 * `RightActivityBar.test.ts` does.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { h, render } from 'preact';
import { ModeToggles, type ModeTogglesProps } from '@/client/components/workspace/chat-timeline/chat-input/ModeToggles';
import type { GoalRecord } from '@/shared/lib/omp/mode/types';

const DOM_GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Event'] as const;

let container: HTMLElement;

beforeAll(() => {
  const win = new Window({ url: 'http://localhost' });
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) target[key] = (win as unknown as Record<string, unknown>)[key];
  container = (globalThis as unknown as { document: Document }).document.createElement('div');
  (globalThis as unknown as { document: Document }).document.body.appendChild(container);
});

afterAll(() => {
  const target = globalThis as unknown as Record<string, unknown>;
  for (const key of DOM_GLOBALS) delete target[key];
});

function paint(overrides: Partial<ModeTogglesProps> = {}): HTMLElement {
  const props: ModeTogglesProps = {
    plan: false,
    goal: false,
    goalRecord: null,
    pending: false,
    onTogglePlan: () => {},
    onOpenGoal: () => {},
    planAvailable: true,
    ...overrides,
  };
  render(null, container);
  render(h(ModeToggles, props), container);
  return container;
}

const goalRecord: GoalRecord = {
  id: 'g1',
  objective: 'x',
  status: 'active',
  tokenBudget: 200000,
  tokensUsed: 50000,
  timeUsedSeconds: 10,
  createdAt: 0,
  updatedAt: 0,
};

describe('ModeToggles', () => {
  test('both buttons carry a label, a title and a pressed state', () => {
    const el = paint({ plan: true });
    const plan = el.querySelector('[aria-label="Leave plan mode"]');
    expect(plan).not.toBeNull();
    expect(plan?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[aria-label="Set a goal"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  test('Plan is hidden while Goal is on, because omp refuses both at once', () => {
    const el = paint({ planAvailable: false, goal: true });
    expect(el.querySelector('[aria-label="Enter plan mode"]')).toBeNull();
    expect(el.querySelector('[aria-label="Leave plan mode"]')).toBeNull();
    expect(el.querySelector('[aria-label="Manage the active goal"]')).not.toBeNull();
  });

  test('the goal button reports budget remaining when there is one', () => {
    const el = paint({ goal: true, goalRecord });
    expect(el.textContent).toContain('150k left');
  });

  test('no budget means no leftover figure', () => {
    const el = paint({ goal: true, goalRecord: { ...goalRecord, tokenBudget: undefined } });
    expect(el.textContent).not.toContain('left');
  });
});
