/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import cssPlugin from '@/server/lib/bundler/css';

/**
 * Build one stylesheet through the REAL plugin with the options the client
 * build uses (`target: 'bun'`, `minify: true`), and return the emitted CSS.
 *
 * This is the end-to-end gate for the nesting bug: Bun's minifier re-nests a
 * rule's nested at-rule as `@supports (…) { & { … } }` for a non-browser
 * target, and Chrome then drops it whenever the parent selector names a
 * pseudo-element. Asserting on the flattener's own output cannot catch that —
 * only the bundle the browser is actually served can.
 */
async function buildThroughPlugin(css: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ompchamber-css-'));
  try {
    await Bun.write(join(dir, 'probe.css'), css);
    const result = await Bun.build({
      entrypoints: [join(dir, 'probe.css')],
      outdir: join(dir, 'out'),
      target: 'bun',
      minify: true,
      plugins: [cssPlugin],
    });
    if (!result.success) throw new Error(result.logs.map((log) => log.message).join('\n'));
    return await Bun.file(join(dir, 'out', 'probe.css')).text();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('css plugin — nested at-rules reach the browser flattened', () => {
  test('a placeholder colour refinement survives as a top-level @supports', async () => {
    const out = await buildThroughPlugin(`.probe::placeholder {
  color: var(--color-ink);
  @supports (color: color-mix(in lab, red, red)) {
    color: color-mix(in oklab, var(--color-ink) 40%, transparent);
  }
}
`);

    // No `&` anywhere: a nested rule under `::placeholder` is inert in Chrome,
    // which leaves the rule's full-opacity fallback as the final colour.
    expect(out).not.toMatch(/(?<!\\)&/);
    expect(out).toContain('@supports');
    expect(out).toContain('::placeholder');
    expect(out).toContain('40%');
  });

  test('a scrollbar thumb keeps its translucent refinement', async () => {
    const out = await buildThroughPlugin(`::-webkit-scrollbar-thumb {
  background: var(--theme-ink);
  @supports (color: color-mix(in lab, red, red)) {
    background: color-mix(in srgb, var(--theme-ink) 20%, transparent);
  }
}
`);

    expect(out).not.toMatch(/(?<!\\)&/);
    expect(out).toContain('20%');
  });

  test('declarations written after the at-rule keep their order in the bundle', async () => {
    const out = await buildThroughPlugin(`.probe {
  background: var(--theme-ink);
  @supports (color: color-mix(in lab, red, red)) {
    background: color-mix(in srgb, var(--theme-ink) 20%, transparent);
  }
  border-radius: 3px;
}
`);

    // The trailing declaration must not be hoisted above the at-rule: that
    // would let the at-rule's `background` win over a later one.
    expect(out.indexOf('border-radius')).toBeGreaterThan(out.indexOf('@supports'));
    expect(out).not.toMatch(/(?<!\\)&/);
  });
});
