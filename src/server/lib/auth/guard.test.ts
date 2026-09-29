/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The public-path rule.
 *
 * A wrong answer here is either a broken login (something the page needs is
 * gated) or an open door (something that carries data is exempted). Both are
 * silent at runtime — the first looks like a broken build, the second looks like
 * nothing at all — so the list is pinned deliberately.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { authGate, initAuth, isAuthEnabled, isPublicPath, loadAuthConfig, revokeAllSessions } from '@/server/lib/auth/guard';
import { issueSessionToken, SESSION_TTL_MS } from '@/server/lib/auth/token';

describe('public paths', () => {
  test('the endpoints the login flow needs are public', () => {
    expect(isPublicPath('/api/health')).toBe(true);
    expect(isPublicPath('/api/auth/state')).toBe(true);
    expect(isPublicPath('/api/auth/login')).toBe(true);
    expect(isPublicPath('/api/auth/logout')).toBe(true);
    expect(isPublicPath('/login')).toBe(true);
  });

  test('the assets the login screen is built from are public', () => {
    for (const path of [
      '/_dev-assets/client/index-abc.js',
      '/_dev-assets/asset/abc.css',
      '/_bun/client/index.js',
      '/fonts.css',
      '/fonts/fira-code.woff2',
      '/static/chunk-abc.js',
      '/icon.svg',
      '/apple-touch-icon.png',
      '/sw.js',
      '/robots.txt',
      '/.well-known/appspecific/com.chrome.devtools.json',
      '/_shell',
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  test('everything that reads or writes this machine is gated', () => {
    for (const path of [
      '/api/settings',
      '/api/settings/providers',
      '/api/sessions/list',
      '/api/sessions/abc/queue',
      '/api/chat',
      '/api/agent/abc',
      '/api/btw/abc',
      '/api/fs/git',
      '/api/fs/search',
      '/api/files/abc',
      '/api/terminal/sessions',
      '/api/telemetry/tokens',
      '/api/updates/apply',
      '/api/omp/sidebar',
      '/api/auth/password',
    ]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  test('the shell and document routes are NOT public — they are redirected to /login', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/some/deep/link')).toBe(false);
  });

  test('a path that merely starts with a public name is not public', () => {
    // `/api/healthcheck` is not `/api/health`, and `/logins` is not `/login`.
    expect(isPublicPath('/api/healthcheck')).toBe(false);
    expect(isPublicPath('/logins')).toBe(false);
    expect(isPublicPath('/icons-secret')).toBe(false);
  });
});

describe('authentication is per run, never inherited from disk', () => {
  // The behaviour these tests exist for: a file on disk must not be able to make
  // a server demand a password its operator never supplied. So each test writes a
  // REAL file into a throwaway data directory and asserts that the gate ignores
  // it — a stubbed file reader would prove nothing about that.
  let tempDir: string | null = null;

  afterEach(async () => {
    // `initAuth(null)` is the reset: the module slot is process-wide, so a test
    // that armed a password would otherwise leak it into the next one.
    await initAuth(null);
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    delete Bun.env.OMPCHAMBER_DATA_DIR;
  });

  function useTempDataDir(): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ompchamber-guard-test-'));
    Bun.env.OMPCHAMBER_DATA_DIR = tempDir;
    return tempDir;
  }

  test('no password means the gate lets everything through', () => {
    expect(isAuthEnabled()).toBe(false);
    const request = new Request('http://localhost/api/settings');
    expect(authGate(request)).toBeUndefined();
  });

  test('a stored secret alone does NOT enable authentication', async () => {
    // The retired v1 shape, which carried a passwordHash. It is still readable
    // for its session secret, and that must not be mistaken for a password.
    const dir = useTempDataDir();
    fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({
      version: 1,
      passwordHash: '$argon2id$v=19$m=65536,t=2,p=1$fixture$fixture',
      sessionSecret: 'fixture-secret',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    expect(isAuthEnabled()).toBe(false);
    expect(authGate(new Request('http://localhost/api/settings'))).toBeUndefined();
  });

  test('initAuth turns the gate on, and it rejects a request with no cookie', async () => {
    useTempDataDir();
    await initAuth('correct-horse');

    expect(isAuthEnabled()).toBe(true);
    const response = authGate(new Request('http://localhost/api/settings'));
    expect(response?.status).toBe(401);
  });

  test('a document request is redirected to the login screen, not answered 401', async () => {
    useTempDataDir();
    await initAuth('correct-horse');

    const response = authGate(new Request('http://localhost/', { headers: { accept: 'text/html' } }));
    // A document has no body to render an error into, so it is sent to the
    // screen that can ask for the password.
    expect(response?.status).toBe(302);
    expect(response?.headers.get('location')).toBe('/login');
  });

  test('an empty password is treated as none at all', async () => {
    useTempDataDir();
    await initAuth('   ');
    expect(isAuthEnabled()).toBe(false);
  });

  test('the session secret is persisted so a restart keeps its sessions', async () => {
    const dir = useTempDataDir();
    await initAuth('correct-horse');
    expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(true);

    const stored: unknown = JSON.parse(fs.readFileSync(path.join(dir, 'auth.json'), 'utf8'));
    // The file must carry a signing secret and NOTHING that could enable auth.
    expect(Object.keys(stored as Record<string, unknown>).sort()).toEqual(['sessionSecret', 'updatedAt', 'version']);
    expect((stored as { passwordHash?: string }).passwordHash).toBeUndefined();
  });

  test('revoking every session invalidates tokens signed with the old secret', async () => {
    const dir = useTempDataDir();
    await initAuth('correct-horse');

    const before = loadAuthConfig()!;
    const token = issueSessionToken({
      sessionSecret: before.sessionSecret,
      passwordHash: before.passwordHash,
      ttlMs: SESSION_TTL_MS,
    });
    const withCookie = () => new Request('http://localhost/api/settings', {
      headers: { cookie: `omp_session=${token}` },
    });

    // The token is good before the revocation…
    expect(authGate(withCookie())).toBeUndefined();

    const result = await revokeAllSessions();
    expect(result.revoked).toBe(true);

    // …and dead after it, without the password having changed. This is the only
    // revocation a stateless token admits, and it is what makes "sign out
    // everywhere" possible at all.
    expect(authGate(withCookie())?.status).toBe(401);

    // The new secret is persisted, so the revocation survives a restart rather
    // than being undone by the old secret being read back from disk.
    const stored = JSON.parse(fs.readFileSync(path.join(dir, 'auth.json'), 'utf8'));
    expect(stored.sessionSecret).toBe(loadAuthConfig()!.sessionSecret);
    expect(stored.sessionSecret).not.toBe(before.sessionSecret);
  });

  test('a token minted after the revocation works', async () => {
    useTempDataDir();
    await initAuth('correct-horse');
    await revokeAllSessions();

    const after = loadAuthConfig()!;
    const fresh = issueSessionToken({
      sessionSecret: after.sessionSecret,
      passwordHash: after.passwordHash,
      ttlMs: SESSION_TTL_MS,
    });
    const request = new Request('http://localhost/api/settings', {
      headers: { cookie: `omp_session=${fresh}` },
    });
    // Revoking everywhere must not lock out the browser that asked for it.
    expect(authGate(request)).toBeUndefined();
  });
});
