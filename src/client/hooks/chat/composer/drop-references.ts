/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Turning a dropped file REFERENCE into an attachable File.
 *
 * A download dragged out of a web page (WhatsApp Web, Gmail, Slack) hands the
 * composer a URL, not bytes: there is no `File` in the drag at all. The browser
 * cannot read it either — a cross-origin `file://` path and a remote URL are
 * both outside what the page may fetch. The chamber server can, so the
 * reference is resolved there and returned as text the composer attaches like
 * any other file.
 *
 * Only text is supported on this path. An image or an arbitrary binary cannot
 * round-trip through JSON as a string, and the drop's own `File` (when the host
 * provides one) is the path that carries those.
 */

/** Last path segment of a URL or path, for the attachment's display name. */
export function referenceName(reference: string): string {
  const withoutQuery = reference.split(/[?#]/)[0] ?? reference;
  const segment = withoutQuery.replace(/\/+$/, '').split('/').pop();
  if (!segment) return 'attachment';
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Read a dropped reference through the server.
 *
 * `path` is used as the filesystem root hint so a relative reference resolves
 * inside the active workspace; an absolute path or URL ignores it. Returns null
 * when the server cannot produce text — an unreadable path, a binary body, or
 * an unreachable URL — so the caller reports the omission instead of attaching
 * an empty file.
 */
export async function readDroppedReference(reference: string, rootPath: string | null): Promise<File | null> {
  const params = new URLSearchParams({ path: reference });
  if (rootPath) params.set('root', rootPath);
  try {
    const res = await fetch(`/api/fs/read-reference?${params.toString()}`);
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { content?: unknown; name?: unknown } | null;
    if (!body || typeof body.content !== 'string') return null;
    // The server reports the basename it actually read, which is more reliable
    // than re-deriving one from a percent-encoded URL.
    const name = typeof body.name === 'string' && body.name ? body.name : referenceName(reference);
    return new File([body.content], name, { type: 'text/plain' });
  } catch {
    return null;
  }
}

/** User-facing reason for files that could not be read. */
export function describeUnreadable(names: string[]): string {
  if (names.length === 1) {
    return `"${names[0]}" could not be read and was not attached.`;
  }
  return `${names.length} files could not be read and were not attached: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}.`;
}
