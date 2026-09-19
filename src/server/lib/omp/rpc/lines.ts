/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * NDJSON line reader over a Web `ReadableStream` — Bun-native replacement for
 * `readline.createInterface({ input })` when consuming `Bun.spawn` stdout.
 * Incomplete trailing data stays buffered until the next chunk or stream end,
 * matching readline's line semantics. Per-line errors never surface: the
 * callback receiving them is the caller's boundary.
 */

export function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';
  return stream.pipeTo(
    new WritableStream({
      write(chunk) {
        buffer += decoder.decode(chunk, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          onLine(line);
          newlineIndex = buffer.indexOf('\n');
        }
      },
      close() {
        const rest = buffer + decoder.decode();
        if (rest) onLine(rest);
      },
    }),
  ).then(
    () => undefined,
    () => undefined,
  );
}
