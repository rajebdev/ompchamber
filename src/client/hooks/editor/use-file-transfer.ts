/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Getting bytes *out* of an editor tab: copy to the clipboard and download.
 *
 * Split from `useFileEditor` because the two paths genuinely differ by kind —
 * text is copied from the in-memory buffer and written to a Blob, an image has
 * no buffer at all and is fetched at the moment of the action — and because
 * that difference was pushing the editor hook past the file ceiling.
 */

import { useCallback, useState } from 'preact/hooks';
import { copyImageToClipboard, downloadUrl, saveBlob } from '@/client/hooks/editor/file-actions';

interface FileTransferTarget {
  name: string;
  path?: string;
}

interface UseFileTransferOptions {
  /** The active file, or null when the surface has no tab. */
  target: FileTransferTarget | null;
  /** Current text buffer for `target`; ignored for images. */
  content: string;
  /** Raw-byte URL of the active image, else null. */
  imageUrl: string | null;
  /** MIME type used for the text Blob. */
  downloadMimeType: string;
}

export interface UseFileTransferResult {
  /** True for the 1.5s after a successful copy, so the button can confirm it. */
  copied: boolean;
  copy: () => void;
  download: () => void;
}

export function useFileTransfer({
  target,
  content,
  imageUrl,
  downloadMimeType,
}: UseFileTransferOptions): UseFileTransferResult {
  const [copied, setCopied] = useState(false);

  /** Confirmation flash shared by both copy paths. */
  const flashCopied = useCallback(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, []);

  const copy = useCallback(() => {
    if (!target) return;
    // An image goes to the clipboard as a picture; a text file as its text.
    if (imageUrl) {
      void copyImageToClipboard(imageUrl).then(flashCopied).catch(() => {});
      return;
    }
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(content).then(flashCopied).catch(() => {});
  }, [target, content, imageUrl, flashCopied]);

  const download = useCallback(() => {
    if (!target) return;
    // An image's bytes are fetched at download time, so a large picture costs
    // nothing while its tab merely sits open.
    if (imageUrl) {
      void downloadUrl(imageUrl, target.name).catch(() => {});
      return;
    }
    saveBlob(new Blob([content], { type: downloadMimeType }), target.name);
  }, [target, content, downloadMimeType, imageUrl]);

  return { copied, copy, download };
}
