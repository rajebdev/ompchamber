// node:zlib stays for brotli only — Bun has no brotli API (Bun.brotliCompressSync is undefined).
import { brotliCompressSync, constants } from 'node:zlib';

/**
 * Compresses a response body, except `text/event-stream`.
 *
 * SSE must never be compressed: zlib holds small frames until its buffer
 * fills, so a compressed event stream delivers nothing until it ends. This
 * mirrors the Express `compression({ filter })` it replaces.
 *
 * The incoming body is buffered and a fresh `Response` is returned, because a
 * `Response` body can only be read once — reading it here would otherwise
 * leave Elysia nothing to send.
 */
const MIN_BYTES = 1024;

const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|wasm|svg))/;

function compress(body: Uint8Array<ArrayBuffer>, encoding: 'br' | 'gzip'): Uint8Array {
  return encoding === 'br'
    ? brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    : Bun.gzipSync(body, { level: 6 });
}

export async function maybeCompress(response: Response, acceptEncoding: string | null): Promise<Response> {
  if (!acceptEncoding) return response;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) return response;
  if (!COMPRESSIBLE.test(contentType)) return response;
  if (response.status === 204 || response.status === 304) return response;

  const encoding = acceptEncoding.includes('br') ? 'br' : acceptEncoding.includes('gzip') ? 'gzip' : null;
  if (!encoding) return response;

  const buffer = new Uint8Array(await response.arrayBuffer()) as Uint8Array<ArrayBuffer>;
  if (buffer.byteLength < MIN_BYTES) {
    // Body already consumed — hand back a rebuilt Response over the same bytes.
    return rebuild(response, buffer);
  }

  const compressed = compress(buffer, encoding);
  const headers = new Headers(response.headers);
  headers.set('content-encoding', encoding);
  headers.set('content-length', String(compressed.byteLength));
  headers.append('vary', 'accept-encoding');
  return new Response(compressed, { status: response.status, headers });
}

function rebuild(response: Response, buffer: Uint8Array): Response {
  return new Response(buffer, { status: response.status, headers: response.headers });
}
