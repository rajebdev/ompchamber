/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The provider-models client is the write path into `models.yml`. Its two
 * failure modes are both destructive: the add-only merge must NEVER drop or
 * modify an existing entry (the user's hand-edited visibility/config lives
 * there), and the fetch/add requests must turn a broken server response into a
 * `{ ok: false }`/`{ success: false }` envelope instead of a rejected promise —
 * a thrown error would leave the settings dialog stuck with no message. The
 * catalog sync's defaults are pinned too, because a model registered without a
 * context label silently renders as the wrong size in the picker.
 */

import { afterAll, beforeEach, describe, expect, test } from 'bun:test';

import {
  addProviderModel,
  fetchProviderModelsRemote,
  mergeProviderModels,
  syncProviderModelsToCatalog,
} from '@/shared/lib/models/provider/models';
import type { ProviderModel } from '@/shared/types';

/** The runner's own fetch, reached through `Bun` so a stub leaked onto the global cannot be mistaken for it. */
const realFetch = Bun.fetch;

// Bun has no `window`; the module under test dispatches a CustomEvent on it, so
// the test installs a stub through this single named handle.
const globalScope = globalThis as unknown as { window?: unknown };
const realWindow = globalScope.window;

let calls: Array<{ url: string; init: RequestInit }> = [];
let events: string[] = [];

function stubWindow(): void {
  events = [];
  globalScope.window = {
    dispatchEvent: (event: { type?: string }) => {
      events.push(String(event?.type ?? event));
      return true;
    },
  };
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): void {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init: init ?? {} });
    return handler(url, init ?? {});
  }) as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function model(overrides: Partial<ProviderModel> & { id: string }): ProviderModel {
  return {
    name: overrides.id,
    contextWindow: '',
    hasTools: true,
    hasVision: false,
    isVisible: true,
    ...overrides,
  };
}

beforeEach(() => {
  stubWindow();
});

afterAll(() => {
  globalThis.fetch = realFetch;
  globalScope.window = realWindow;
});

describe('mergeProviderModels', () => {
  test('appends unknown ids in incoming order and reports the count', () => {
    const existing = [model({ id: 'a' })];
    const result = mergeProviderModels(existing, [model({ id: 'b' }), model({ id: 'c' })]);

    expect(result.merged.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(result.added.map((m) => m.id)).toEqual(['b', 'c']);
    expect(result.addedCount).toBe(2);
  });

  test('existing entries pass through by reference, untouched', () => {
    // The overlay (visibility + sampling config) lives on these objects; a
    // rebuilt copy would silently reset the user's edits.
    const existing = [model({ id: 'a', isVisible: false })];
    const result = mergeProviderModels(existing, [model({ id: 'b' })]);

    expect(result.merged[0]).toBe(existing[0]);
    expect(result.merged[0].isVisible).toBe(false);
  });

  test('added entries are clones, so a later mutation cannot alias the input', () => {
    const incoming = model({ id: 'b' });
    const result = mergeProviderModels([], [incoming]);

    expect(result.added[0]).toEqual(incoming);
    expect(result.added[0]).not.toBe(incoming);
  });

  test('skips ids already known and duplicates inside the incoming list', () => {
    const result = mergeProviderModels([model({ id: 'a' })], [model({ id: 'a' }), model({ id: 'b' }), model({ id: 'b' })]);

    expect(result.merged.map((m) => m.id)).toEqual(['a', 'b']);
    expect(result.addedCount).toBe(1);
  });

  test('skips entries with no id', () => {
    const result = mergeProviderModels([], [model({ id: '' }), model({ id: 'b' })]);

    expect(result.merged.map((m) => m.id)).toEqual(['b']);
    expect(result.addedCount).toBe(1);
  });

  test('an empty incoming list changes nothing', () => {
    const existing = [model({ id: 'a' })];
    const result = mergeProviderModels(existing, []);

    expect(result.merged).toEqual(existing);
    expect(result.added).toEqual([]);
    expect(result.addedCount).toBe(0);
  });
});

describe('fetchProviderModelsRemote', () => {
  test('POSTs the request verbatim and returns the parsed result', async () => {
    const payload = { ok: true, models: [model({ id: 'x' })] };
    stubFetch(() => jsonResponse(payload));

    const request = { baseUrl: 'https://api.example/v1', apiKey: 'sk-1', api: 'anthropic-messages' as const };
    const result = await fetchProviderModelsRemote(request);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/settings/provider-models');
    expect(calls[0].init.method).toBe('POST');
    expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init.body))).toEqual(request);
    expect(result).toEqual(payload);
  });

  test('a non-ok response carries the server error', async () => {
    stubFetch(() => jsonResponse({ ok: false, error: 'bad key' }, 401));

    expect(await fetchProviderModelsRemote({ baseUrl: 'x' })).toEqual({ ok: false, error: 'bad key' });
  });

  test('a non-ok response without an error falls back to the HTTP status', async () => {
    stubFetch(() => jsonResponse({}, 502));

    expect(await fetchProviderModelsRemote({ baseUrl: 'x' })).toEqual({
      ok: false,
      error: 'Request failed (HTTP 502)',
    });
  });

  test('a transport failure becomes an error envelope, not a rejection', async () => {
    stubFetch(() => {
      throw new Error('offline');
    });

    expect(await fetchProviderModelsRemote({ baseUrl: 'x' })).toEqual({ ok: false, error: 'offline' });
  });

  test('a non-Error rejection uses the generic network message', async () => {
    stubFetch(() => {
      throw 'boom';
    });

    expect(await fetchProviderModelsRemote({ baseUrl: 'x' })).toEqual({
      ok: false,
      error: 'Network error while fetching models',
    });
  });
});

describe('addProviderModel', () => {
  test('notifies the picker only after a successful write', async () => {
    stubFetch(() => jsonResponse({ success: true, written: true, addedModels: ['m1'] }));

    const result = await addProviderModel({ provider: 'p', id: 'm1' });

    expect(calls[0].url).toBe('/api/settings/provider-model');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ provider: 'p', id: 'm1' });
    expect(result).toEqual({ success: true, written: true, addedModels: ['m1'] });
    expect(events).toEqual(['omp:models-updated']);
  });

  test('a non-ok response is downgraded to success:false without notifying', async () => {
    stubFetch(() => jsonResponse({ success: true, written: true, error: 'nope' }, 400));

    const result = await addProviderModel({ provider: 'p', id: 'm1' });

    expect(result).toEqual({ success: false, written: false, error: 'nope' });
    expect(events).toEqual([]);
  });

  test('a rejection reason is surfaced as the error when no error field exists', async () => {
    stubFetch(() => jsonResponse({ success: false, written: false, reason: 'already known' }, 409));

    expect(await addProviderModel({ provider: 'p', id: 'm1' })).toEqual({
      success: false,
      written: false,
      reason: 'already known',
      error: 'already known',
    });
  });

  test('a transport failure becomes success:false with the message', async () => {
    stubFetch(() => {
      throw new Error('socket closed');
    });

    expect(await addProviderModel({ provider: 'p', id: 'm1' })).toEqual({
      success: false,
      written: false,
      error: 'socket closed',
    });
  });

  test('a non-Error rejection uses the generic add message', async () => {
    stubFetch(() => {
      throw 42;
    });

    expect(await addProviderModel({ provider: 'p', id: 'm1' })).toEqual({
      success: false,
      written: false,
      error: 'Network error while adding the model',
    });
  });
});

describe('syncProviderModelsToCatalog', () => {
  test('registers each model with the catalog defaults', async () => {
    stubFetch(() => jsonResponse({ ok: true }));

    await syncProviderModelsToCatalog('kenari', [
      model({ id: 'm1', name: 'Model One', contextWindow: '128K ctx · 32K out' }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/models');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      actionType: 'addModel',
      model: {
        id: 'm1',
        name: 'Model One',
        provider: 'kenari',
        contextWindow: '128K',
        thinkingLevel: 'Default',
        capabilities: ['Tool calling', 'Reasoning'],
        inputFormats: ['text'],
        outputFormats: ['text'],
      },
    });
    expect(events).toEqual(['omp:models-updated']);
  });

  test('a missing context label falls back to 128K', async () => {
    stubFetch(() => jsonResponse({ ok: true }));

    await syncProviderModelsToCatalog('p', [model({ id: 'm1', contextWindow: '' })]);

    expect(JSON.parse(String(calls[0].init.body)).model.contextWindow).toBe('128K');
  });

  test('one POST per model', async () => {
    stubFetch(() => jsonResponse({ ok: true }));

    await syncProviderModelsToCatalog('p', [model({ id: 'a' }), model({ id: 'b' })]);

    expect(calls.map((call) => JSON.parse(String(call.init.body)).model.id).sort()).toEqual(['a', 'b']);
  });

  test('a failed sync is swallowed so the caller still completes', async () => {
    // The module logs the failure; silence it so the suite output stays clean.
    const realError = console.error;
    console.error = () => {};
    try {
      stubFetch(() => {
        throw new Error('down');
      });

      await syncProviderModelsToCatalog('p', [model({ id: 'm1' })]);
    } finally {
      console.error = realError;
    }

    // No notify: the catalog was not actually updated.
    expect(events).toEqual([]);
  });
});
