/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-level mutations — rename, rename-with-AI, archive — shared by the
 * sidebar rows and the navbar's session menu.
 *
 * Split out of `useWorkspaceFolderActions`, which had grown both nouns: the
 * FOLDER's own actions (pin, delete, reveal) and the actions on the SESSIONS
 * inside it. The two callers need different halves, and the session half names
 * the same endpoints wherever it runs — the navbar menu must not grow a second
 * implementation that drifts on the URL or on the signal it publishes.
 */

import { publishClientSignal } from '@/client/lib/signals';
import { useFetcher } from '@/client/lib/router/fetcher';
import type { SessionItemData } from '@/shared/types';

/** Surfaces a refusal to the user; omitted callers stay silent. */
export type ReportSessionError = (message: string) => void;

export interface SessionActions {
  handleArchive: (session: SessionItemData) => void;
  handleRename: (session: SessionItemData, name: string) => Promise<void>;
  /** Ask omp to name the session from its transcript, reporting the outcome. */
  handleRenameWithAi: (session: SessionItemData) => Promise<void>;
}

export function useSessionActions(refresh: () => void, reportError?: ReportSessionError): SessionActions {
  const archiveFetcher = useFetcher();

  const handleArchive = (session: SessionItemData) => {
    const nextArchived = session.is_archived !== 1;
    archiveFetcher.submit(
      { archived: String(nextArchived) },
      { method: 'POST', action: `/api/sessions/${session.id}/archive` }
    );
    refresh();
  };

  const handleRename = async (session: SessionItemData, name: string) => {
    try {
      const body = new FormData();
      body.set('name', name);
      const res = await fetch(`/api/sessions/${encodeURIComponent(String(session.id))}/rename`, { method: 'POST', body });
      if (!res.ok) return;
    } catch {
      return;
    }
    publishClientSignal('session-renamed', { sessionId: String(session.id), title: name });
    refresh();
  };

  /**
   * "Rename with AI": omp names the session from its own transcript.
   *
   * Unlike `handleRename` this one has a wait in it (a model call, a few
   * seconds) and can legitimately be refused — a mid-run session, a transcript
   * too thin to title — so the outcome is reported rather than assumed, and
   * the title it produces is announced on the same `session-renamed` signal a
   * manual rename uses, so the navbar follows it without a refetch.
   */
  const handleRenameWithAi = async (session: SessionItemData) => {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(String(session.id))}/rename-with-ai`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!res.ok || !data.name) {
        reportError?.(data.error || `Could not generate a name (HTTP ${res.status}).`);
        return;
      }
      publishClientSignal('session-renamed', { sessionId: String(session.id), title: data.name });
      refresh();
    } catch (error) {
      reportError?.(error instanceof Error ? error.message : String(error));
    }
  };

  return { handleArchive, handleRename, handleRenameWithAi };
}
