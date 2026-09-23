/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Attachment lifecycle for the composer: accept a batch of files (picker,
 * paste, or OS drop), gate the text ones against the inline budget, hold blob
 * previews, and read the bytes into the attachment.
 *
 * Bytes are read AT ATTACH TIME, not at send time. A `File` handed over by a
 * drop or a paste is a live handle onto the drag data store, and reading it
 * later — after the composer has re-rendered, or after the drag that produced
 * it has ended — is what made a dropped file arrive with an empty body while
 * its chip still rendered. Reading once, here, means every later step (send,
 * queue, retry) works from the persisted copy.
 *
 * Extracted from ChatInput so the component stays a layout shell and the
 * composer keeps room under the repo's per-file size ceiling.
 */

import { useCallback, useRef } from 'preact/hooks';
import type { SetStateAction } from 'preact/compat';
import type { Attachment } from '@/shared/types';
import { applyTextAttachmentBudget, isTextAttachment } from '@/shared/lib/chat/attachments';

export interface UseComposerAttachmentsOptions {
  /** Current attachments; the text budget is measured against them. */
  attachments: Attachment[];
  setAttachments: (updater: SetStateAction<Attachment[]>) => void;
}

export interface AddFilesOutcome {
  /** How many files were attached. */
  added: number;
  /** Files refused by the inline text budget, for the caller to report. */
  skipped: File[];
  /** Files whose contents could not be read, for the caller to report. */
  unreadable: string[];
}

export interface ComposerAttachments {
  addFiles: (files: File[]) => AddFilesOutcome;
  removeAttachment: (id: string) => void;
  /**
   * Resolve once every pending read has settled. Sends call this first so an
   * image or a text file is complete before the prompt goes out.
   */
  readyForSend: () => Promise<void>;
}

/** Read a File as a base64 data URL, or null when the read fails. */
function readAsDataUrl(file: File): Promise<string | null> {
  const { promise, resolve } = Promise.withResolvers<string | null>();
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    resolve(result.split(',')[1] ?? null);
  };
  reader.onerror = () => resolve(null);
  reader.onabort = () => resolve(null);
  reader.readAsDataURL(file);
  return promise;
}

export function useComposerAttachments({
  attachments,
  setAttachments,
}: UseComposerAttachmentsOptions): ComposerAttachments {
  // In-flight reads, so a send can wait for one it needs.
  const pendingReadsRef = useRef(new Set<Promise<void>>());

  const addFiles = useCallback((files: File[]): AddFilesOutcome => {
    const { accepted, skipped } = applyTextAttachmentBudget(files, attachments);
    if (accepted.length === 0) return { added: 0, skipped, unreadable: [] };

    // Display fields are captured at creation: a File does not survive the
    // queue's JSON round trip or committed history, and every replay path reads
    // these instead of `file`.
    const newAttachments: Attachment[] = accepted.map((file) => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      type: file.type,
      size: file.size,
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);

    const unreadable: string[] = [];
    for (const att of newAttachments) {
      const file = att.file;
      if (!file) continue;
      const wantsImage = file.type.startsWith('image/');
      const wantsText = !wantsImage && isTextAttachment(att);
      if (!wantsImage && !wantsText) continue;

      const { promise: read, resolve } = Promise.withResolvers<void>();
      const settle = () => {
        pendingReadsRef.current.delete(read);
        resolve();
      };
      // The read resolves after this call returns, so it addresses the entry by
      // id — a captured `newAttachments` array would be a pre-update snapshot.
      const store = (patch: Partial<Attachment>) => {
        setAttachments((prev) => prev.map((a) => (a.id === att.id ? { ...a, ...patch } : a)));
      };

      if (wantsImage) {
        void readAsDataUrl(file)
          .then((base64) => {
            if (base64) store({ dataBase64: base64 });
            else unreadable.push(att.name ?? file.name);
          })
          .then(settle);
      } else {
        void file.text()
          .then(
            (content) => store({ content }),
            () => {
              // A text file whose bytes cannot be read is reported instead of
              // attaching silently: the prompt would otherwise claim a file it
              // never carried.
              unreadable.push(att.name ?? file.name);
            },
          )
          .then(settle);
      }
      pendingReadsRef.current.add(read);
    }

    return { added: newAttachments.length, skipped, unreadable };
  }, [attachments, setAttachments]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((p) => p.id === id);
      if (att?.preview.startsWith('blob:')) URL.revokeObjectURL(att.preview);
      return prev.filter((p) => p.id !== id);
    });
  }, [setAttachments]);

  const readyForSend = useCallback(async () => {
    // A read that finishes during this loop is removed from the set, so the
    // snapshot below is the complete in-flight set at the time of the call.
    while (pendingReadsRef.current.size > 0) {
      await Promise.all([...pendingReadsRef.current]);
    }
  }, []);

  return { addFiles, removeAttachment, readyForSend };
}
