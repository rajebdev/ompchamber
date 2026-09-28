import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { SPAWN_CLIFF, countOpenFileDescriptors, describeSpawnFailure } from '@/server/lib/lifecycle/fd-pressure';

describe('countOpenFileDescriptors', () => {
  test('sweeps this process own descriptors on a POSIX host', () => {
    const pressure = countOpenFileDescriptors();
    if (process.platform === 'win32') {
      expect(pressure).toBeNull();
      return;
    }
    expect(pressure).not.toBeNull();
    // Stdio is always open, and the sweep never walks past Darwin's OPEN_MAX —
    // a descriptor above it cannot be opened, which is the whole point.
    expect(pressure?.open).toBeGreaterThanOrEqual(3);
    expect(pressure?.highest).toBeGreaterThanOrEqual(2);
    expect(pressure?.limit).toBeLessThanOrEqual(SPAWN_CLIFF);
    expect(pressure?.nearCliff).toBe(false);
  });

  test('counts descriptors opened and closed around it', () => {
    const before = countOpenFileDescriptors();
    if (!before) return; // Host cannot answer; nothing to assert.
    const opened = [0, 1, 2, 3, 4].map(() => fs.openSync('/dev/null', 'r'));
    try {
      const during = countOpenFileDescriptors();
      expect(during!.open - before.open).toBeGreaterThanOrEqual(opened.length);
      expect(during!.highest).toBeGreaterThanOrEqual(Math.max(...opened));
    } finally {
      for (const fd of opened) fs.closeSync(fd);
    }
  });
});

describe('describeSpawnFailure', () => {
  test('passes an unrelated failure through untouched', () => {
    // The helper must not relabel a genuine bad-descriptor or ENOENT bug as
    // resource pressure; only an observable full table earns the extra text.
    expect(describeSpawnFailure(new Error('spawn ENOENT'))).toBe('spawn ENOENT');
    expect(describeSpawnFailure('boom')).toBe('boom');
  });

  test('names exhaustion only when the table really is full', () => {
    const opened: number[] = [];
    try {
      while (opened.length < SPAWN_CLIFF + 16) {
        try {
          opened.push(fs.openSync('/dev/null', 'r'));
        } catch {
          break; // Host limit is lower than the cliff; the gate is untestable here.
        }
      }
      if (!countOpenFileDescriptors()?.nearCliff) return;

      const raw = "EBADF: bad file descriptor, posix_spawn '/bin/sh'";
      const described = describeSpawnFailure(new Error(raw));
      expect(described.startsWith(raw)).toBe(true);
      expect(described).toContain('out of file descriptors');
      // The symptom gate still holds under pressure: an unrelated failure keeps
      // its own message instead of being blamed on the descriptor table.
      expect(describeSpawnFailure(new Error('spawn ENOENT'))).toBe('spawn ENOENT');
    } finally {
      for (const fd of opened) fs.closeSync(fd);
    }
  });
});
