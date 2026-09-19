/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';

import { dirnameOf, homeDir, joinPath, resolvePath } from '@/cli/lib/path-utils.js';

describe('homeDir', () => {
  // The CLI must resolve the same data directory as the server (which uses
  // os.homedir()). Reading Bun.env.HOME yields '' without a shell (cron,
  // launchd, GUI launcher), which silently made every derived path relative to
  // the cwd — `stop`/`status` then missed the running instance.
  test('is absolute even when HOME is absent from the environment', () => {
    const saved = Bun.env.HOME;
    try {
      delete Bun.env.HOME;
      expect(homeDir()).toBe(homedir());
      expect(homeDir().startsWith('/')).toBe(true);
    } finally {
      if (saved !== undefined) Bun.env.HOME = saved;
    }
  });

  test('agrees with os.homedir()', () => {
    expect(homeDir()).toBe(homedir());
  });
});

describe('joinPath', () => {
  test('keeps a single separator between segments', () => {
    expect(joinPath('/a', 'b', 'c')).toBe('/a/b/c');
    expect(joinPath('/a/', '/b')).toBe('/a/b');
    expect(joinPath('/a//', '//b')).toBe('/a/b');
  });

  test('skips empty segments', () => {
    expect(joinPath('/a', '', 'b')).toBe('/a/b');
  });
});

describe('resolvePath', () => {
  test('returns an absolute path for an absolute input', () => {
    expect(resolvePath('/tmp/x')).toBe('/tmp/x');
    expect(resolvePath('/tmp/x/')).toBe('/tmp/x');
  });

  test('resolves relative input against the cwd', () => {
    expect(resolvePath('rel/dir')).toBe(joinPath(process.cwd(), 'rel/dir'));
  });

  test('the data dir derived from homeDir is always absolute', () => {
    const saved = Bun.env.HOME;
    try {
      delete Bun.env.HOME;
      expect(joinPath(homeDir(), '.ompchamber').startsWith('/')).toBe(true);
    } finally {
      if (saved !== undefined) Bun.env.HOME = saved;
    }
  });
});

describe('dirnameOf', () => {
  test('returns the parent of an absolute path', () => {
    expect(dirnameOf('/a/b/c')).toBe('/a/b');
    expect(dirnameOf('/a')).toBe('/');
    expect(dirnameOf('/')).toBe('/');
  });
});
