import { parseJsonlLenient } from '@/shared/lib/omp/session/jsonl';
import type { OmpMessageEntry } from '@/shared/types/omp/session';

/** Streaming JSONL pass for the telemetry builders; `visit` returns `false` to stop early. */
export async function scanSessionEntries(
  filePath: string,
  visit: (entry: OmpMessageEntry, index: number) => boolean | void,
): Promise<void> {
  let body: string;
  try {
    body = await Bun.file(filePath).text();
  } catch {
    return;
  }
  const records = parseJsonlLenient<OmpMessageEntry>(body);
  for (let index = 0; index < records.length; index++) {
    const entry = records[index];
    if (!entry) continue;
    if (visit(entry, index) === false) break;
  }
}
