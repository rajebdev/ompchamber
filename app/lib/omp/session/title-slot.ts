/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Fixed-width session-title slot writer for oh-my-pi JSONL session files.
 *
 * Faithful port of omp-web/lib/omp/session-files.ts (itself a port of
 * oh-my-pi packages/coding-agent/src/session/session-title-slot.ts). The first
 * line of a v3 session file is an optional 256-byte JSON record holding the
 * display title. Because the width is fixed, a rename can overwrite just that
 * line in place — a bounded write that never shifts the rest of the file, so
 * it cannot corrupt a session a live omp process still holds.
 *
 * Legacy files without the slot are rewritten atomically (temp + rename) with
 * a fresh slot line inserted and the header's title fields updated.
 */

import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'fs';
import * as path from 'path';
import { SESSION_TITLE_SLOT_BYTES } from '@/lib/omp/session/files';

/**
 * Ceiling for the legacy full-file rewrite path. A slot-less file larger than
 * this is refused rather than loaded into memory (matching the
 * MAX_SESSION_LOAD_BYTES ceiling in ./messages.ts).
 */
const MAX_TITLE_REWRITE_BYTES = 512 * 1024 * 1024;

export interface SessionTitleSlot {
  type: 'title';
  v: 1;
  title: string;
  source?: 'auto' | 'user';
  updatedAt: string;
  pad: string;
}

function titleSlotLine(
  title: string,
  source: 'auto' | 'user' | undefined,
  updatedAt: string,
  pad: string,
): string {
  const slot: SessionTitleSlot = source
    ? { type: 'title', v: 1, title, source, updatedAt, pad }
    : { type: 'title', v: 1, title, updatedAt, pad };
  return `${JSON.stringify(slot)}\n`;
}

/** Longest code-point prefix of `title` whose serialized line fits the slot. */
function truncateTitleForSlot(
  title: string,
  source: 'auto' | 'user' | undefined,
  updatedAt: string,
): string {
  const codePoints = [...title];
  let low = 0;
  let high = codePoints.length;
  let best = '';
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const candidate = codePoints.slice(0, mid).join('');
    if (Buffer.byteLength(titleSlotLine(candidate, source, updatedAt, ''), 'utf8') <= SESSION_TITLE_SLOT_BYTES) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return best;
}

function isSessionTitleSource(value: unknown): value is 'auto' | 'user' {
  return value === 'auto' || value === 'user';
}

/** Parse a physical title-slot JSONL line. Returns undefined for anything else. */
export function parseTitleSlotLine(line: string): SessionTitleSlot | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.type !== 'title' || record.v !== 1) return undefined;
  if (typeof record.title !== 'string' || typeof record.updatedAt !== 'string' || typeof record.pad !== 'string') {
    return undefined;
  }
  if (record.source !== undefined && !isSessionTitleSource(record.source)) return undefined;
  const slot: SessionTitleSlot = {
    type: 'title',
    v: 1,
    title: record.title,
    updatedAt: record.updatedAt,
    pad: record.pad,
  };
  if (record.source !== undefined) slot.source = record.source;
  return slot;
}

/** Serialize the title slot to exactly 256 UTF-8 bytes including the newline. */
export function serializeTitleSlot(update: { title?: string; source?: 'auto' | 'user'; updatedAt: string }): string {
  const title = truncateTitleForSlot(update.title ?? '', update.source, update.updatedAt);
  const unpadded = titleSlotLine(title, update.source, update.updatedAt, '');
  const padBytes = SESSION_TITLE_SLOT_BYTES - Buffer.byteLength(unpadded, 'utf8');
  if (padBytes < 0) throw new Error('Session title slot metadata exceeds fixed slot size');
  const line = titleSlotLine(title, update.source, update.updatedAt, ' '.repeat(padBytes));
  if (Buffer.byteLength(line, 'utf8') !== SESSION_TITLE_SLOT_BYTES) {
    throw new Error('Session title slot serialization failed to produce fixed-width output');
  }
  return line;
}

/** Read only the fixed-size head window to detect a physical title slot. */
export function readTitleSlot(filePath: string): SessionTitleSlot | undefined {
  let fd: number;
  try {
    fd = openSync(filePath, 'r');
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.allocUnsafe(SESSION_TITLE_SLOT_BYTES);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead).toString('utf8');
    const newlineIndex = head.indexOf('\n');
    if (newlineIndex < 0) return undefined;
    return parseTitleSlotLine(head.slice(0, newlineIndex));
  } finally {
    closeSync(fd);
  }
}

/** Strip control characters and collapse runs of spaces (omp's #cleanTitle). */
export function cleanSessionTitle(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

/**
 * Persist a session title. When line 1 is already a title slot the new slot is
 * rewritten IN PLACE: serializeTitleSlot always produces exactly 256 bytes
 * (title truncated by code points to fit), so the overwrite never shifts the
 * rest of the file. Fallback for legacy files without a slot: rewrite the
 * whole file atomically (temp + rename), inserting a fresh slot line and
 * updating the header's title fields.
 *
 * Note: unlike omp's SessionManager.setSessionName this does not append a
 * title_change audit entry — a bounded 256-byte write cannot corrupt a file a
 * live omp process may hold, and the display title is all callers need.
 */
export function setSessionTitle(filePath: string, title: string, source: 'auto' | 'user'): boolean {
  const cleaned = cleanSessionTitle(title);
  if (!cleaned) return false;
  const update = { title: cleaned, source, updatedAt: new Date().toISOString() };

  if (readTitleSlot(filePath)) {
    const slotLine = Buffer.from(serializeTitleSlot(update), 'utf8');
    const fd = openSync(filePath, 'r+');
    try {
      let offset = 0;
      while (offset < slotLine.length) {
        const written = writeSync(fd, slotLine, offset, slotLine.length - offset, offset);
        if (written === 0) throw new Error('Short write while updating session title slot');
        offset += written;
      }
    } finally {
      closeSync(fd);
    }
    return true;
  }

  // Legacy file without a slot: full rewrite through a temp file. Refuse to
  // materialize a file larger than the load ceiling — renaming a session
  // should never risk OOMing the server, and legacy slot-less files are rare.
  let legacySize: number;
  try {
    legacySize = statSync(filePath).size;
  } catch {
    return false;
  }
  if (legacySize > MAX_TITLE_REWRITE_BYTES) {
    return false;
  }
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const headerIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerIndex === -1) throw new Error('Cannot rename an empty session file');
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(lines[headerIndex]) as Record<string, unknown>;
  } catch {
    throw new Error('Cannot rename a session file with a malformed header');
  }
  if (header.type !== 'session') throw new Error('Not a session file');
  header.title = cleaned;
  header.titleSource = source;
  lines[headerIndex] = JSON.stringify(header);
  const body = serializeTitleSlot(update) + lines.join('\n');

  writeSessionFileAtomicSync(filePath, body, 'title');
  return true;
}

/**
 * Replace a session file's contents through a temp file in the same directory
 * plus renameSync. writeFileSync truncates before writing, so a crash or ENOSPC
 * mid-write would permanently destroy the session; rename is atomic, leaving
 * either the old or the new file. Mirrors omp's own atomic session rewrite.
 */
function writeSessionFileAtomicSync(filePath: string, body: string, tag = 'rewrite'): void {
  const dir = path.dirname(filePath);
  const tempDir = mkdtempSync(path.join(dir, `.omp-web-${tag}-`));
  const tempPath = path.join(tempDir, path.basename(filePath));
  try {
    writeFileSync(tempPath, body, 'utf8');
    renameSync(tempPath, filePath);
  } finally {
    try {
      rmdirSync(tempDir);
    } catch {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}
