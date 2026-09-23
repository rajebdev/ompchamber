/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OS file drag-and-drop for the chat composer.
 *
 * Three browser rules shape this module:
 *
 * 1. A `drop` is only delivered when the preceding `dragover` was cancelled, so
 *    the handlers belong on the whole composer card — a drop aimed at the
 *    textarea bubbles up to it, and cancelling there also suppresses the
 *    browser's own "insert the dropped file's path as text" default.
 * 2. A dropped DIRECTORY is not a readable File: `dataTransfer.files` carries a
 *    size-0 stub for it. Only `DataTransferItem.webkitGetAsEntry()` reveals it
 *    as a directory, so those are walked recursively and attached file by file.
 * 3. A file dropped anywhere the app does not cancel lands in the tab as
 *    `file://` navigation, which throws the chamber away. The guard below is
 *    window-wide for exactly that reason; it only ever cancels file drags, so
 *    text and URL drops keep their native behaviour.
 *
 * What counts as a file drag is decided in `drop-payload.ts`, because hosts
 * disagree: a download dragged out of a web page offers no File at all, only a
 * URL, and those references are handed back to the caller to resolve.
 *
 * The drag data store is cleared the moment the drop handler returns, so every
 * store-bound read (`getAsFile`, `webkitGetAsEntry`, `getData`) happens
 * synchronously; the entries and Files they return stay valid while the walk
 * awaits.
 */

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { TargetedDragEvent } from 'preact';
import { collectDroppedFiles, collectDroppedFileUris, hasDraggedFiles } from '@/client/hooks/chat/composer/drop-payload';

/**
 * Safety valve: a dropped tree (a repo root, `node_modules`) must not queue
 * thousands of attachments. The walk stops as soon as it is reached.
 */
export const MAX_DROPPED_FILES = 50;

/** Directory nesting limit — a symlinked cycle would otherwise never end. */
const MAX_DROP_DEPTH = 10;

/** Reason shown when a drop yielded more than the composer can take. */
export const DROP_LIMIT_NOTICE =
  `Some files were skipped — a drop is limited to ${MAX_DROPPED_FILES} files and ${MAX_DROP_DEPTH} folder levels deep.`;

function readEntryFile(entry: FileSystemFileEntry): Promise<File | null> {
  const { promise, resolve } = Promise.withResolvers<File | null>();
  entry.file(resolve, () => resolve(null));
  return promise;
}

/** `readEntries` yields at most 100 children per call; keep pulling until empty. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const { promise, resolve } = Promise.withResolvers<FileSystemEntry[]>();
  const all: FileSystemEntry[] = [];
  const readBatch = () => {
    reader.readEntries((batch) => {
      if (batch.length === 0) {
        resolve(all);
        return;
      }
      all.push(...batch);
      readBatch();
    }, () => resolve(all));
  };
  readBatch();
  return promise;
}

/** Walk one directory tree into `out`; true when a cap stopped the walk early. */
async function walkDirectory(
  directory: FileSystemDirectoryEntry,
  out: File[],
  depth: number,
): Promise<boolean> {
  if (depth >= MAX_DROP_DEPTH) return true;
  const children = await readAllEntries(directory.createReader());
  for (const child of children) {
    if (out.length >= MAX_DROPPED_FILES) return true;
    if (child.isFile) {
      const file = await readEntryFile(child as FileSystemFileEntry);
      if (file) out.push(file);
    } else if (child.isDirectory) {
      if (await walkDirectory(child as FileSystemDirectoryEntry, out, depth + 1)) return true;
    }
  }
  return false;
}

/**
 * Expand a drop into the flat file list the composer attaches: the files it
 * already carries plus every directory's contents, walked recursively.
 * `incomplete` reports that a cap cut the drop short, so the composer can say so
 * instead of silently attaching a prefix. Exported for tests.
 *
 * The `DataTransfer` is read synchronously here — the store is cleared once the
 * drop handler returns — while the returned entries stay readable during the
 * walk.
 */
export async function expandDroppedFiles(
  dt: DataTransfer,
  directFiles: File[] = collectDroppedFiles(dt),
): Promise<{ files: File[]; incomplete: boolean }> {
  const files: File[] = [];
  const directories: FileSystemDirectoryEntry[] = [];

  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry?.isDirectory) directories.push(entry as FileSystemDirectoryEntry);
  }

  // No directory in the payload: the flat list is already the answer. A host
  // that never populates `items` lands here too.
  if (directories.length === 0) {
    return { files: directFiles.slice(0, MAX_DROPPED_FILES), incomplete: directFiles.length > MAX_DROPPED_FILES };
  }

  // Directories arrive as size-0 stubs in the flat list; the walk supplies the
  // real files, so only the non-stub entries are kept from it.
  for (const file of directFiles) {
    if (file.size === 0 && file.type === '') continue;
    files.push(file);
  }

  let incomplete = false;
  for (const directory of directories) {
    if (files.length >= MAX_DROPPED_FILES) {
      incomplete = true;
      break;
    }
    if (await walkDirectory(directory, files, 0)) {
      incomplete = true;
      break;
    }
  }
  return { files: files.slice(0, MAX_DROPPED_FILES), incomplete };
}

export interface UseFileDropOptions {
  /**
   * Called once per drop with every file it resolved to (directories expanded),
   * plus any file REFERENCES the host offered instead of bytes (a download
   * dragged out of a web page) for the caller to resolve server-side.
   */
  onFiles: (files: File[], incomplete: boolean, references: string[]) => void;
  /** While true a drop is cancelled but not attached — the composer is closed. */
  disabled?: boolean;
}

/** Drag handlers to spread onto the drop target. */
export interface FileDropProps {
  onDragEnter: (e: TargetedDragEvent<HTMLElement>) => void;
  onDragOver: (e: TargetedDragEvent<HTMLElement>) => void;
  onDragLeave: (e: TargetedDragEvent<HTMLElement>) => void;
  onDrop: (e: TargetedDragEvent<HTMLElement>) => void;
}

export interface UseFileDropResult {
  /** True while a file drag hovers the bound element (drives the overlay). */
  isDragging: boolean;
  dropProps: FileDropProps;
}

export function useFileDrop({ onFiles, disabled = false }: UseFileDropOptions): UseFileDropResult {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire for every nested child the pointer crosses, so a
  // boolean flag drops to false the instant the cursor moves from the card onto
  // the textarea. Counting them keeps the overlay steady.
  const depthRef = useRef(0);
  // Latest callback and flag behind refs, so the handlers stay referentially
  // stable and the window guard sees the current `disabled`.
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const reset = useCallback(() => {
    depthRef.current = 0;
    setIsDragging(false);
  }, []);

  // A drag can end without reaching this element again — released over the
  // page, cancelled with Escape, or its source node unmounted mid-drag. The
  // composer's own handlers have already run by the time these fire, so this
  // only clears state the drop handler did not.
  useEffect(() => {
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, [reset]);

  // Files dropped anywhere else would navigate the tab to `file://` and discard
  // the chamber, so the default is cancelled app-wide. This runs after the
  // composer's own drop handler (the event bubbles up to window), by which point
  // that handler has already read the data store it needed.
  useEffect(() => {
    const guard = (e: DragEvent) => {
      if (hasDraggedFiles(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener('dragover', guard);
    window.addEventListener('drop', guard);
    return () => {
      window.removeEventListener('dragover', guard);
      window.removeEventListener('drop', guard);
    };
  }, []);

  const onDragEnter = useCallback((e: TargetedDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    if (disabledRef.current) return;
    depthRef.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: TargetedDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    // Required: without it the browser refuses the drop and navigates to the
    // file instead of handing it to the app.
    e.preventDefault();
    if (!e.dataTransfer) return;
    // `none` is the only cursor that tells the truth about a closed composer.
    e.dataTransfer.dropEffect = disabledRef.current ? 'none' : 'copy';
  }, []);

  // Not gated on the payload: `dataTransfer.types` can already be empty on
  // dragleave. The counter is the gate — a text drag never raised it.
  const onDragLeave = useCallback(() => {
    if (depthRef.current === 0) return;
    depthRef.current -= 1;
    if (depthRef.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: TargetedDragEvent<HTMLElement>) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    reset();
    if (disabledRef.current) return;
    const dt = e.dataTransfer;
    if (!dt) return;
    // Read the store-bound values synchronously: it is cleared when this
    // handler returns, so a later read yields nothing.
    const references = collectDroppedFileUris(dt);
    const files = collectDroppedFiles(dt);
    const directories = files.filter((file) => file.size === 0 && file.type === '');
    if (files.length > 0 && directories.length === files.length && references.length > 0) {
      // Host handed over path stubs, not bytes — let the server read them.
      onFilesRef.current([], false, references);
      return;
    }
    if (files.length === 0) {
      if (references.length > 0) onFilesRef.current([], false, references);
      return;
    }
    void expandDroppedFiles(dt, files).then(({ files: resolved, incomplete }) => {
      if (resolved.length > 0) onFilesRef.current(resolved, incomplete, references);
      else if (references.length > 0) onFilesRef.current([], incomplete, references);
    });
  }, [reset]);

  return { isDragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
