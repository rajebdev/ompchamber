/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace-folder mutations shared by the desktop category header and the
 * mobile category item: pin/unpin, delete, session archive, and session
 * rename. The fetchers and the delete confirmation flag all live here so the
 * two sidebars cannot drift on URLs or bodies; a successful mutation is
 * announced by the server (the `sidebar` topic) or on the client signal bus.
 *
 * The folder expand toggle is deliberately NOT here: the desktop submits it
 * through `useFetcher` (and re-dispatches on the response), while the mobile
 * sidebar issues a raw fetch and dispatches with a `folderId` detail. Those
 * two are not the same request/event contract, so each keeps its own.
 *
 * Callers keep their own menu-open state and the optimistic expand flag — the
 * hook is about the request + refresh, not the local UI toggles.
 */

import { useState } from 'preact/hooks';
import { publishClientSignal } from '@/client/lib/signals';
import { useFetcher } from '@/client/lib/router/fetcher';
import type { SessionItemData } from '@/shared/types';

/** Minimal folder shape the actions touch — avoids coupling to a full row. */
export interface WorkspaceFolderLike {
  id: number | string;
  isPinned?: boolean;
  project_path?: string | null;
}

export interface WorkspaceFolderActions {
  /** True while the delete confirmation is showing. */
  confirmDelete: boolean;
  /** Enter the delete confirmation step. */
  requestDelete: () => void;
  /** Leave the delete confirmation step without deleting. */
  cancelDelete: () => void;
  handlePin: () => void;
  /**
   * Reveal the workspace directory in the platform file manager.
   *
   * Present only when the folder is bound to a directory — an unbound folder
   * is a grouping with no path, and the menu omits the item rather than
   * offering one that can only fail.
   */
  handleOpenFolder?: () => void;
  handleDelete: () => void;
  handleArchive: (session: SessionItemData) => void;
  handleRename: (session: SessionItemData, name: string) => Promise<void>;
  /** Ask omp to name the session from its transcript, reporting the outcome. */
  handleRenameWithAi: (session: SessionItemData) => Promise<void>;
}

/**
 * What the reveal endpoint answers, and what the caller is told when the
 * request itself fails. The message is the server's own — a directory that no
 * longer exists and a machine with no opener are different problems, and the
 * old fire-and-forget call could not report either.
 */
export type ReportFolderError = (message: string) => void;

export function useWorkspaceFolderActions(
  folder: WorkspaceFolderLike,
  refresh: () => void,
  reportError?: ReportFolderError,
): WorkspaceFolderActions {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pinFetcher = useFetcher<{ success?: boolean }>();
  const deleteFetcher = useFetcher<{ success?: boolean }>();
  const archiveFetcher = useFetcher();

  const handlePin = () => {
    if (typeof folder.id !== 'number') return;
    pinFetcher.submit(
      { isPinned: String(!folder.isPinned) },
      { method: 'POST', action: `/api/folders/${folder.id}/pin` }
    );
    refresh();
  };

  const handleDelete = () => {
    if (typeof folder.id !== 'number') return;
    deleteFetcher.submit(
      {},
      { method: 'POST', action: `/api/folders/${folder.id}/delete` }
    );
    setConfirmDelete(false);
    refresh();
  };

  // Reveal is a plain await rather than a fetcher: there is no follow-up state
  // to render, and the answer is a verdict the user has to be told either way.
  const handleOpenFolder = folder.project_path
    ? () => {
        void (async () => {
          try {
            const res = await fetch(`/api/folders/${encodeURIComponent(String(folder.id))}/open`, { method: 'POST' });
            const data = await res.json().catch(() => ({})) as { error?: string };
            if (!res.ok) reportError?.(data.error || `Could not open the folder (HTTP ${res.status})`);
          } catch (error) {
            reportError?.(error instanceof Error ? error.message : String(error));
          }
        })();
      }
    : undefined;

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

  return {
    confirmDelete,
    requestDelete: () => setConfirmDelete(true),
    cancelDelete: () => setConfirmDelete(false),
    handlePin,
    handleOpenFolder,
    handleDelete,
    handleArchive,
    handleRename,
    handleRenameWithAi,
  };
}
