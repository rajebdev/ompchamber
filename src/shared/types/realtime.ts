/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Payload shapes for the realtime topics. One file so a producer and its
 * consumer cannot disagree about what a topic carries.
 */

import type { SessionRunModel } from '@/shared/lib/omp/session/stream-state.server';
import type { WorkspaceFolderData } from '@/shared/types/workspace';

/** `sidebar` — folder structure and session identity, without volatile fields. */
export interface SidebarPayload {
  folders: WorkspaceFolderData[];
  isMock: boolean;
}

/**
 * One session's volatile sidebar fields.
 *
 * Split out of `SidebarPayload` because these change on every stream-status
 * write while the structure needs a JSONL scan to produce: shipping the whole
 * list per `agent_start` would be the same waste the poll it replaces had.
 */
export interface SidebarStatusEntry {
  streamStatus?: 'stream' | 'finish' | 'abort';
  awaitingInput?: boolean;
  runModel?: SessionRunModel;
}

/** `sidebar:status` — keyed by session id. Absent id means "no volatile fields". */
export type SidebarStatusPayload = Record<string, SidebarStatusEntry>;
