/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Attachment handling for the side composer.
 *
 * A side question reaches the model with images only — no text files and no
 * tools (the prompt says so, and the child runs `--no-tools`), so an
 * attachment that cannot be an image payload is not offered in the first
 * place. The file picker is `accept="image/*"`; this reads what it returns.
 */

import type { AgentImage } from '@/shared/types';

/** An attachment held by the side composer until it is sent. */
export interface BtwAttachment {
  id: string;
  name: string;
  size: number;
  dataBase64?: string;
}

function readImage(file: File): Promise<string | undefined> {
  const { promise, resolve } = Promise.withResolvers<string | undefined>();
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    const comma = result.indexOf(',');
    resolve(comma >= 0 ? result.slice(comma + 1) : undefined);
  };
  reader.onerror = () => resolve(undefined);
  reader.readAsDataURL(file);
  return promise;
}

/** Read picked files into attachments, keeping only images. */
export async function readBtwAttachments(files: File[]): Promise<BtwAttachment[]> {
  const images = files.filter((file) => file.type.startsWith('image/'));
  return Promise.all(
    images.map(async (file) => {
      const dataBase64 = await readImage(file);
      return {
        id: `btw-${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        ...(dataBase64 ? { dataBase64 } : {}),
      };
    }),
  );
}

/** The model payload for an ask — images only, base64 already read. */
export function btwImagesFrom(attachments: BtwAttachment[]): AgentImage[] {
  return attachments
    .filter((attachment): attachment is BtwAttachment & { dataBase64: string } => typeof attachment.dataBase64 === 'string')
    .map((attachment) => ({
      type: 'image' as const,
      data: attachment.dataBase64,
      mimeType: mimeTypeOf(attachment.name),
    }));
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

function mimeTypeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  return MIME_BY_EXTENSION[extension] ?? 'image/png';
}
