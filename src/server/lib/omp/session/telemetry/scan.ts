import { readFileSync } from 'fs';
import { parseJsonlLenient } from '@/shared/lib/omp/session/jsonl';
import type { SessionEntry } from '@/server/lib/omp/session/telemetry/types';

/** Streaming JSONL pass for the telemetry builders; `visit` returns `false` to stop early. */
export function scanSessionEntries(
  filePath: string,
  visit: (entry: SessionEntry, index: number) => boolean | void,
): void {
  let body: string;
  try {
    body = readFileSync(filePath, 'utf8');
  } catch {
    return;
  }
  const records = parseJsonlLenient<SessionEntry>(body);
  for (let index = 0; index < records.length; index++) {
    const entry = records[index];
    if (!entry) continue;
    if (visit(entry, index) === false) break;
  }
}
