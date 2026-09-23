/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dropped-directory resolution for the composer.
 *
 * The browser APIs this reads (`webkitGetAsEntry`, `readEntries`) are awkward
 * in ways that fail silently: a directory's `dataTransfer.files` entry is a
 * size-0 stub, and `readEntries` returns at most 100 children per call, so a
 * single call looks like a complete directory of ≤100 files. These tests pin
 * the contract those quirks break — recursive expansion, paged reads, and the
 * caps that keep a dropped repo root from queueing thousands of attachments.
 */

import { describe, expect, test } from 'bun:test';
import { expandDroppedFiles, MAX_DROPPED_FILES } from '@/client/hooks/chat/composer/file-drop';

function fileEntry(name: string, content = 'x'): FileSystemFileEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (ok: (f: File) => void) => ok(new File([content], name, { type: 'text/plain' })),
  } as unknown as FileSystemFileEntry;
}

/** Directory whose reader hands back `children` in fixed-size batches. */
function dirEntry(name: string, children: FileSystemEntry[], batchSize = 100): FileSystemDirectoryEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let cursor = 0;
      return {
        readEntries: (ok: (batch: FileSystemEntry[]) => void) => {
          const batch = children.slice(cursor, cursor + batchSize);
          cursor += batchSize;
          ok(batch);
        },
      } as unknown as FileSystemDirectoryReader;
    },
  } as unknown as FileSystemDirectoryEntry;
}

function fakeDataTransfer(
  items: { entry: FileSystemEntry | null; file?: File }[],
  files: File[] = [],
): DataTransfer {
  return {
    items: items.map(({ entry, file }) => ({
      kind: 'file',
      webkitGetAsEntry: () => entry,
      getAsFile: () => file ?? null,
    })),
    files,
  } as unknown as DataTransfer;
}

describe('collectDroppedFiles', () => {
  test('passes plain files through untouched', async () => {
    const file = new File(['a'], 'a.txt', { type: 'text/plain' });
    const { files, incomplete } = await expandDroppedFiles(
      fakeDataTransfer([{ entry: fileEntry('a.txt'), file }]),
    );
    expect(files.map((f: File) => f.name)).toEqual(['a.txt']);
    expect(incomplete).toBe(false);
  });

  test('expands a dropped directory recursively', async () => {
    const root = dirEntry('root', [
      fileEntry('a.txt'),
      dirEntry('sub', [fileEntry('b.txt'), dirEntry('deeper', [fileEntry('c.txt')])]),
    ]);
    const { files, incomplete } = await expandDroppedFiles(fakeDataTransfer([{ entry: root }]));
    expect(files.map((f: File) => f.name).sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(incomplete).toBe(false);
  });

  test('keeps paging past the 100-children-per-read limit', async () => {
    const many = Array.from({ length: 250 }, (_, i) => fileEntry(`f${i}.txt`));
    const { files, incomplete } = await expandDroppedFiles(fakeDataTransfer([{ entry: dirEntry('big', many) }]));
    expect(files.length).toBe(MAX_DROPPED_FILES);
    // More files existed than were taken, and the caller must be able to say so.
    expect(incomplete).toBe(true);
  });

  test('stops at the nesting cap instead of walking a cycle forever', async () => {
    let nested: FileSystemEntry = dirEntry('leaf', [fileEntry('deep.txt')]);
    for (let i = 0; i < 14; i += 1) nested = dirEntry(`wrap${i}`, [nested]);
    const { incomplete } = await expandDroppedFiles(fakeDataTransfer([{ entry: nested }]));
    expect(incomplete).toBe(true);
  });

  test('falls back to the flat file list when no item entries exist', async () => {
    const listed = Array.from({ length: MAX_DROPPED_FILES + 10 }, (_, i) => new File(['x'], `g${i}.txt`));
    const { files, incomplete } = await expandDroppedFiles(fakeDataTransfer([], listed));
    expect(files.length).toBe(MAX_DROPPED_FILES);
    expect(incomplete).toBe(true);
  });

  test('tolerates a directory whose read fails', async () => {
    const broken = {
      isFile: false,
      isDirectory: true,
      name: 'broken',
      createReader: () => ({
        readEntries: (_ok: unknown, err?: (e: unknown) => void) => err?.(new Error('denied')),
      }),
    } as unknown as FileSystemDirectoryEntry;
    const { files, incomplete } = await expandDroppedFiles(fakeDataTransfer([{ entry: broken }]));
    expect(files).toEqual([]);
    expect(incomplete).toBe(false);
  });
});
