import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { servePublicAsset } from '@/server/plugins/static';

// Two roots, as they exist in real life: `public/` is the source folder a
// checkout has, `dist/client` is the build output an installed package ships.
const CHECKOUT_PUBLIC = join(mkdtempSync(join(tmpdir(), 'omp-static-')), 'public');
const BUILD_OUTPUT = join(mkdtempSync(join(tmpdir(), 'omp-static-')), 'dist/client');
const ROOTS = [CHECKOUT_PUBLIC, BUILD_OUTPUT] as const;

beforeAll(() => {
  mkdirSync(CHECKOUT_PUBLIC, { recursive: true });
  mkdirSync(BUILD_OUTPUT, { recursive: true });
  writeFileSync(join(CHECKOUT_PUBLIC, 'icon.svg'), '<svg id="checkout"/>');
  writeFileSync(join(BUILD_OUTPUT, 'icon.svg'), '<svg id="build"/>');
  writeFileSync(join(BUILD_OUTPUT, 'manifest.webmanifest'), '{"name":"OMPChamber"}');
  writeFileSync(join(BUILD_OUTPUT, 'index.html'), '<!doctype html><title>shell</title>');
});

afterAll(() => {
  rmSync(CHECKOUT_PUBLIC, { recursive: true, force: true });
  rmSync(BUILD_OUTPUT, { recursive: true, force: true });
});

describe('servePublicAsset', () => {
  // The bug this guards: an installed `ompchamber` has no `public/` folder, so a
  // lookup confined to it answered the HTML shell for `/icon.svg` and the About
  // modal rendered a broken image.
  test('falls back to the build output when the source folder has no copy', async () => {
    const response = await servePublicAsset('/manifest.webmanifest', ROOTS);
    expect(response?.headers.get('content-type')).toBe('application/manifest+json');
    expect(await response?.text()).toBe('{"name":"OMPChamber"}');
  });

  test('prefers the source folder so a dev edit lands without a rebuild', async () => {
    const response = await servePublicAsset('/icon.svg', ROOTS);
    expect(response?.headers.get('content-type')).toBe('image/svg+xml');
    expect(await response?.text()).toBe('<svg id="checkout"/>');
  });

  test('leaves the HTML shell to the SSR route', async () => {
    expect(await servePublicAsset('/index.html', ROOTS)).toBeNull();
  });

  test('keeps a sibling of the root unreachable', async () => {
    const outside = join(BUILD_OUTPUT, '..', 'secret.txt');
    writeFileSync(outside, 'not an asset');
    expect(await servePublicAsset('/../secret.txt', [BUILD_OUTPUT])).toBeNull();
    expect(await servePublicAsset('/%2e%2e/secret.txt', [BUILD_OUTPUT])).toBeNull();
  });

  test('short-caches the fallback, whose filename carries no content hash', async () => {
    const response = await servePublicAsset('/manifest.webmanifest', ROOTS);
    expect(response?.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  test('returns null for a missing asset so the request reaches the app', async () => {
    expect(await servePublicAsset('/nope.svg', ROOTS)).toBeNull();
  });
});
