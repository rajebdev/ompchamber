/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace-folder mutations shared by the desktop category header and the
 * mobile category item: pin/unpin, delete, session archive, and session
 * rename. The fetchers, the `omp:workspace-updated` dispatch that follows a
 * successful folder mutation, and the delete confirmation flag all live here
 * so the two sidebars cannot drift on URLs, bodies, or event names.
 *
 * The folder expand toggle is deliberately NOT here: the desktop submits it
 * through `useFetcher` (and re-dispatches on the response), while the mobile
 * sidebar issues a raw fetch and dispatches with a `folderId` detail. Those
 * two are not the same request/event contract, so each keeps its own.
 *
 * Callers keep their own menu-open state and the optimistic expand flag — the
 * hook is about the request + refresh, not the local UI toggles.
 */

import { useEffect, useState } from 'preact/hooks';
import { useFetcher } from '@/client/lib/router/fetcher';
import type { SessionItemData } from '@/shared/types';

/** Minimal folder shape the actions touch — avoids coupling to a full row. */
export interface WorkspaceFolderLike {
  id: number | string;
  isPinned?: boolean;
}

export interface WorkspaceFolderActions {
  /** True while the delete confirmation is showing. */
  confirmDelete: boolean;
  /** Enter the delete confirmation step. */
  requestDelete: () => void;
  /** Leave the delete confirmation step without deleting. */
  cancelDelete: () => void;
  handlePin: () => void;
  handleDelete: () => void;
  handleArchive: (session: SessionItemData) => void;
  handleRename: (session: SessionItemData, name: string) => Promise<void>;
}

export function useWorkspaceFolderActions(
  folder: WorkspaceFolderLike,
  refresh: () => void,
): WorkspaceFolderActions {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pinFetcher = useFetcher<{ success?: boolean }>();
  const deleteFetcher = useFetcher<{ success?: boolean }>();
  const archiveFetcher = useFetcher();

  useEffect(() => {
    if (pinFetcher.data?.success || deleteFetcher.data?.success) {
      window.dispatchEvent(new CustomEvent('omp:workspace-updated'));
    }
  }, [deleteFetcher.data, pinFetcher.data]);

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
    window.dispatchEvent(new CustomEvent('omp:session-renamed', { detail: { sessionId: String(session.id), title: name } }));
    refresh();
  };

  return {
    confirmDelete,
    requestDelete: () => setConfirmDelete(true),
    cancelDelete: () => setConfirmDelete(false),
    handlePin,
    handleDelete,
    handleArchive,
    handleRename,
  };
}
