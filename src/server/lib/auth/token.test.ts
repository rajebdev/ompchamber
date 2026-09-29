/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session tokens and the cookie name.
 *
 * The properties pinned here are the ones a change could silently break while
 * every request still "works": a token that outlives its expiry, a token that
 * survives a password change, and a cookie name that collides across ports.
 */

import { describe, expect, test } from 'bun:test';

import {
  clearSessionCookieHeader,
  credentialFingerprint,
  issueSessionToken,
  readSessionCookie,
  sessionCookieHeader,
  sessionCookieName,
  SESSION_TTL_MS,
  verifySessionToken,
} from '@/server/lib/auth/token';

const SECRET = 'test-secret-value';
const HASH = '$argon2id$v=19$m=65536,t=2,p=1$fakehash';
const NOW = 1_700_000_000_000;

function issue(overrides: Partial<Parameters<typeof issueSessionToken>[0]> = {}): string {
  return issueSessionToken({
    sessionSecret: SECRET,
    passwordHash: HASH,
    now: NOW,
    ...overrides,
  });
}

describe('session tokens', () => {
  test('a freshly issued token verifies', () => {
    const token = issue();
    expect(verifySessionToken(token, { sessionSecret: SECRET, passwordHash: HASH, now: NOW })).toBe(true);
  });

  test('a token expires at its own deadline, not later', () => {
    const token = issue({ ttlMs: 1000 });
    expect(verifySessionToken(token, { sessionSecret: SECRET, passwordHash: HASH, now: NOW + 999 })).toBe(true);
    expect(verifySessionToken(token, { sessionSecret: SECRET, passwordHash: HASH, now: NOW + 1000 })).toBe(false);
    expect(verifySessionToken(token, { sessionSecret: SECRET, passwordHash: HASH, now: NOW + 1001 })).toBe(false);
  });

  test('a changed password revokes every token, because the fingerprint is signed', () => {
    const token = issue();
    const otherHash = '$argon2id$v=19$m=65536,t=2,p=1$differenthash';
    expect(verifySessionToken(token, { sessionSecret: SECRET, passwordHash: otherHash, now: NOW })).toBe(false);
  });

  test('a rotated secret revokes every token', () => {
    const token = issue();
    expect(verifySessionToken(token, { sessionSecret: 'rotated', passwordHash: HASH, now: NOW })).toBe(false);
  });

  test('the payload cannot be edited, because the signature covers all of it', () => {
    const token = issue({ ttlMs: 1000 });
    const [version, expiresAt, fingerprint, mac] = token.split('.');
    const extended = [version, String(Number(expiresAt) + 86_400_000), fingerprint, mac].join('.');
    expect(verifySessionToken(extended, { sessionSecret: SECRET, passwordHash: HASH, now: NOW })).toBe(false);
  });

  test('malformed input is false, never a throw', () => {
    for (const bad of ['', 'v1', 'v1.a.b', 'v1.a.b.c.d', 'v2.1.2.3', null, undefined]) {
      expect(verifySessionToken(bad as string, { sessionSecret: SECRET, passwordHash: HASH, now: NOW })).toBe(false);
    }
  });

  test('the fingerprint differs per password and per secret', () => {
    expect(credentialFingerprint(SECRET, HASH)).not.toBe(credentialFingerprint(SECRET, 'other'));
    expect(credentialFingerprint(SECRET, HASH)).not.toBe(credentialFingerprint('other', HASH));
  });

  test('default TTL is the documented 12 hours', () => {
    const token = issue();
    const expiresAt = Number(token.split('.')[1]);
    expect(expiresAt - NOW).toBe(SESSION_TTL_MS);
  });
});

describe('session cookie name', () => {
  const headersOf = (entries: Record<string, string>) => new Headers(entries);

  test('folds the request port into the name', () => {
    expect(sessionCookieName(headersOf({ host: '192.168.0.1:3000' }))).toBe('omp_session_3000');
    expect(sessionCookieName(headersOf({ host: 'localhost:3001' }))).toBe('omp_session_3001');
  });

  test('keeps the bare name when the host carries no port', () => {
    expect(sessionCookieName(headersOf({ host: '192.168.0.1' }))).toBe('omp_session');
  });

  test('handles bracketed IPv6', () => {
    expect(sessionCookieName(headersOf({ host: '[::1]:3000' }))).toBe('omp_session_3000');
    expect(sessionCookieName(headersOf({ host: '[::1]' }))).toBe('omp_session');
  });

  test('prefers the forwarded host, so a proxy keys by the browser port', () => {
    expect(sessionCookieName(headersOf({ host: '10.0.0.5:8080', 'x-forwarded-host': 'example.test:3000' })))
      .toBe('omp_session_3000');
  });

  test('reads only the slot for this request port', () => {
    const request = new Request('http://localhost:3001/api/settings', {
      headers: { host: 'localhost:3001', cookie: 'omp_session_3000=stale; omp_session_3001=fresh' },
    });
    expect(readSessionCookie(request)).toBe('fresh');
  });

  test('a cookie for another port is not found', () => {
    const request = new Request('http://localhost:3002/api/settings', {
      headers: { host: 'localhost:3002', cookie: 'omp_session_3000=stale' },
    });
    expect(readSessionCookie(request)).toBeNull();
  });
});

describe('session cookie attributes', () => {
  test('is HttpOnly and SameSite=Lax, and omits Secure over plain http', () => {
    const header = sessionCookieHeader('omp_session_3000', 'token-value', SESSION_TTL_MS, false);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
    // Secure on an http origin makes the cookie unsettable, i.e. login that
    // appears to succeed and never sticks.
    expect(header).not.toContain('Secure');
  });

  test('adds Secure when the request was https', () => {
    expect(sessionCookieHeader('omp_session_3000', 'token-value', SESSION_TTL_MS, true)).toContain('Secure');
  });

  test('clearing sets Max-Age=0 and an expired date', () => {
    const header = clearSessionCookieHeader('omp_session_3000', false);
    expect(header).toContain('Max-Age=0');
    expect(header).toContain('Expires=Thu, 01 Jan 1970');
  });
});
