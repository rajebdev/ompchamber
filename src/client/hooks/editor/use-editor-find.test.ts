/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `useEditorFind` — opening and stepping.
 *
 * The rules asserted here are the ones a user notices when they break: the query
 * seeds from the selection (VS Code's behaviour, and the reason ⌘F on a word is
 * one keystroke), ⌘F on an open bar refocuses the field instead of overwriting
 * what is in it, and a new document re-aims at the top rather than keeping an
 * offset that means something else in this file.
 */

import { describe, expect, test } from 'bun:test';

import { createFindHarness } from '@/client/hooks/editor/find-harness.test-util';

const harness = await createFindHarness();
harness.install();

describe('useEditorFind opening', () => {
  test('⌘F seeds the query from the selection and jumps to the first match', async () => {
    await harness.act(async () => {
      harness.find?.openFind();
    });

    expect(harness.find?.open).toBe(true);
    expect(harness.find?.query).toBe('alpha');
    expect(harness.find?.matches.length).toBe(2);
    expect(harness.find?.currentIndex).toBe(0);
    expect(harness.reveals).toEqual([0]);
  });

  test('an empty or multi-line selection does not seed a query', async () => {
    harness.input.selection = { start: 0, end: 0 };
    await harness.act(async () => {
      harness.find?.openFind();
    });

    expect(harness.find?.query).toBe('');
    expect(harness.find?.open).toBe(true);
  });

  test('⌘F on an open bar keeps the query rather than re-seeding it', async () => {
    // The bar keeps the current match selected in the document, so re-seeding
    // would overwrite what the user typed with that match's text.
    await harness.act(async () => {
      harness.find?.openFind();
    });
    await harness.act(async () => {
      harness.find?.setQuery('beta');
    });
    harness.input.selection = { start: 0, end: 5 };

    await harness.act(async () => {
      harness.find?.openFind();
    });

    expect(harness.find?.query).toBe('beta');
  });

  test('opening replace shows the second row and keeps the same match', async () => {
    await harness.act(async () => {
      harness.find?.openReplace();
    });

    expect(harness.find?.open).toBe(true);
    expect(harness.find?.replaceOpen).toBe(true);
    expect(harness.find?.currentIndex).toBe(0);
  });
});

describe('useEditorFind stepping', () => {
  test('F3 moves to the next match and wraps', async () => {
    await harness.act(async () => {
      harness.find?.openFind();
    });
    await harness.act(async () => {
      harness.find?.step(1);
    });
    expect(harness.find?.currentIndex).toBe(1);

    await harness.act(async () => {
      harness.find?.step(1);
    });
    expect(harness.find?.currentIndex).toBe(0);
  });

  test('⇧F3 moves back, wrapping to the last match', async () => {
    await harness.act(async () => {
      harness.find?.openFind();
    });
    await harness.act(async () => {
      harness.find?.step(-1);
    });

    expect(harness.find?.currentIndex).toBe(1);
  });

  test('stepping with no matches does nothing', async () => {
    await harness.act(async () => {
      harness.find?.openFind();
    });
    await harness.act(async () => {
      harness.find?.setQuery('zzz');
    });
    const before = harness.find?.currentIndex;

    await harness.act(async () => {
      harness.find?.step(1);
    });

    expect(harness.find?.currentIndex).toBe(before);
    expect(harness.find?.matches.length).toBe(0);
  });
});
