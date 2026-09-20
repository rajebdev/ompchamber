/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Atomic file write: a sibling temp file is fully written, then renamed over
 * the target. rename(2) is atomic on POSIX, so a crash mid-write leaves either
 * the old file or the new one — never a truncated file. The temp file is
 * removed (best-effort) when the write or rename fails.
 */

import fs from 'fs';
import { dirname } from 'path';

/** Writes `data` to `targetPath` via a sibling temp file then rename (atomic on POSIX). */
export async function writeFileAtomic(targetPath: string, data: string): Promise<void> {
  await fs.promises.mkdir(dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await Bun.write(tempPath, data);
    await fs.promises.rename(tempPath, targetPath);
  } catch (error) {
    await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}
