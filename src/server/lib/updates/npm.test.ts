/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The npm registry read both update targets share, exercised against an injected
 * `fetch` (no network). What is pinned is what a wrong implementation gets wrong:
 * the URL a package name produces — the scoped one escapes its slash, which is
 * the spelling omp's own registry client sends — the `NPM_CONFIG_REGISTRY`
 * override, and the rule that every failure is a null rather than a throw.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { fetchNpmLatest, npmRegistry } from '@/server/lib/updates/npm';

/** The runner's own fetch, reached through `Bun` so a stub leaked onto the global cannot be mistaken for it. */
const originalFetch = Bun.fetch;

describe('fetchNpmLatest', () => {
  let urls: string[] = [];
  let payload: unknown = { version: '3.14.0' };
  let status = 200;

  beforeEach(() => {
    urls = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete Bun.env.NPM_CONFIG_REGISTRY;
    delete Bun.env.BUN_CONFIG_REGISTRY;
  });

  test('reads /<pkg>/latest and returns its version', async () => {
    expect(await fetchNpmLatest('ompchamber')).toBe('3.14.0');
    expect(urls[0]).toBe('https://registry.npmjs.org/ompchamber/latest');
  });

  test('escapes the slash of a scoped name, as the registry client does', async () => {
    await fetchNpmLatest('@oh-my-pi/pi-coding-agent');
    expect(urls[0]).toBe('https://registry.npmjs.org/@oh-my-pi%2fpi-coding-agent/latest');
  });

  test('honours the registry the installer was configured with', async () => {
    Bun.env.NPM_CONFIG_REGISTRY = 'https://registry.example.test';
    expect(npmRegistry()).toBe('https://registry.example.test/');
    await fetchNpmLatest('ompchamber');
    expect(urls[0]).toBe('https://registry.example.test/ompchamber/latest');
  });

  test('a trailing slash on the configured registry is not doubled', async () => {
    Bun.env.BUN_CONFIG_REGISTRY = 'https://registry.example.test/';
    await fetchNpmLatest('ompchamber');
    expect(urls[0]).toBe('https://registry.example.test/ompchamber/latest');
  });

  test('a non-OK answer and a malformed body are both null', async () => {
    status = 404;
    expect(await fetchNpmLatest('ompchamber')).toBeNull();
    status = 200;
    payload = { version: 42 };
    expect(await fetchNpmLatest('ompchamber')).toBeNull();
    payload = {};
    expect(await fetchNpmLatest('ompchamber')).toBeNull();
  });

  test('a network failure is null, never a throw', async () => {
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await fetchNpmLatest('ompchamber')).toBeNull();
  });
});
