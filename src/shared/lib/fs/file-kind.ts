/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-kind classification shared by the server read routes and every client
 * viewer (desktop editor, mobile editor, chat tool panels).
 *
 * A raster image is not text: decoding its bytes as UTF-8 yields replacement
 * characters, so the editor used to paint a PNG as mojibake. The extension is
 * the only signal available before reading the file, and it is the same signal
 * the Files panel already uses to pick an icon — keeping it in one module means
 * the reader, the icon, and the viewer can never disagree about which files are
 * pictures.
 *
 * SVG is deliberately absent: it is editable XML text and stays on the
 * syntax-highlighted code path.
 */
export const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  apng: 'image/apng',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/** Lower-cased extension of a path or name, query/fragment/line suffix removed. */
export function getFileExtension(filePath: string | undefined | null): string {
  if (!filePath) return '';
  const clean = filePath.split('?')[0].split('#')[0].split(/[/\\]/).pop() ?? '';
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

/**
 * MIME type for a raster image path, or null when the extension is not one.
 * Null is the "treat as text" answer, so every caller branches on this single
 * check instead of re-deriving the extension list.
 */
export function getImageMimeType(filePath: string | undefined | null): string | null {
  return IMAGE_MIME_BY_EXT[getFileExtension(filePath)] ?? null;
}
