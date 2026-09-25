/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Everything a file-tree row does that is not rendering: the context menu's
 * action dispatch, the create/rename/delete dialogs and their server calls.
 *
 * Extracted from the row component because it is a stateful cluster with one
 * shared dependency (`/api/fs/action` and the fetcher that submits to it), and
 * because the row is at the repository's line ceiling. The component keeps the
 * markup and the handlers that need its own DOM node; this keeps the behavior.
 */

import { useEffect, useRef, useState } from 'preact/hooks';
import type { FormEvent, RefObject } from 'preact/compat';
import { useFetcher } from '@/client/lib/router/fetcher';
import { toAbsolutePath } from '@/shared/lib/fs/paths';
import { copyToClipboard } from '@/client/hooks/ui/clipboard';

/** The shape `/api/fs/action` answers with, as far as a row reads it. */
interface FsActionResponse {
  success?: boolean;
  /** Present on the git-history payload, which the history modal reads. */
  type?: string;
  /** Relative path of a freshly created file. */
  path?: string;
  error?: string;
}

export interface FileActionTarget {
  path: string;
  name: string;
  /** Absolute base dir of the listing, anchoring Copy Path. */
  basePath?: string;
  rootPath?: string;
  repo?: string;
}

export interface FileActionDeps {
  file: FileActionTarget;
  /** Which diff to open, when the row is a changed file. */
  diff?: { staged?: boolean; status?: string };
  onOpenFile?: (file: { path: string; name: string; root?: string; repo?: string }) => void;
  onActionComplete: () => void;
}

export interface FileActions {
  contextMenu: { x: number; y: number } | null;
  contextMenuRef: RefObject<HTMLDivElement>;
  openContextMenu: (x: number, y: number) => void;
  closeContextMenu: () => void;
  showRenameModal: boolean;
  showDeleteModal: boolean;
  showHistoryModal: boolean;
  showCreateModal: boolean;
  /** The server's refusal for the create request, rendered inside its dialog. */
  createError: string | null;
  createName: string;
  setCreateName: (value: string) => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  /** True while a request is in flight; every dialog's buttons read it. */
  busy: boolean;
  /** The fetcher's own state/data, for the history modal. */
  fetcherState: string;
  fetcherData: FsActionResponse | undefined;
  handleAction: (actionType: string) => void;
  submitCreate: (e: FormEvent) => void;
  submitRename: (e: FormEvent) => void;
  submitDelete: () => void;
  closeCreate: () => void;
  closeDelete: () => void;
  closeRename: () => void;
  closeHistory: () => void;
}

export function useFileActions({ file, diff, onOpenFile, onActionComplete }: FileActionDeps): FileActions {
  const actionFetcher = useFetcher<FsActionResponse>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState(file.path);
  /** Which dialog the in-flight request belongs to, so its result is routed. */
  const pendingActionRef = useRef<'create' | null>(null);

  const repo = file.repo;
  const rootPath = file.rootPath;

  /**
   * The payload already acted on.
   *
   * The fetcher keeps `data` until the next request, and the callbacks below
   * (`onActionComplete` → the panel's refresh → a re-render with a fresh
   * callback identity) would otherwise re-run this effect for the SAME
   * response forever: an unguarded effect here is an infinite refresh loop that
   * pins the tab the moment a file is created.
   */
  const handledRef = useRef<FsActionResponse | null>(null);

  useEffect(() => {
    if (actionFetcher.state !== 'idle' || !actionFetcher.data) return;
    const data = actionFetcher.data;
    if (handledRef.current === data) return;
    handledRef.current = data;
    // The fetcher parses the body whatever the status, so a refusal arrives as
    // `data.error` rather than as a throw — which is what lets the create
    // dialog stay open and put the reason beside the field.
    if (pendingActionRef.current === 'create') {
      pendingActionRef.current = null;
      if (data.success && data.path) {
        // The user asked for a file to work on, so it opens: closing the dialog
        // and refreshing the tree alone would leave them hunting for the empty
        // row they just created.
        setShowCreateModal(false);
        setCreateName('');
        setCreateError(null);
        onActionComplete();
        onOpenFile?.({
          path: data.path,
          name: data.path.split('/').pop() || data.path,
          root: rootPath,
          repo: repo || '.',
        });
      } else {
        setCreateError(data.error || 'Could not create the file');
      }
      return;
    }
    if (data.success && !data.type) {
      setShowRenameModal(false);
      setShowDeleteModal(false);
      onActionComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.state, actionFetcher.data]);

  const submitAction = (formData: FormData) => {
    if (repo && repo !== '.') formData.append('repo', repo);
    if (rootPath) formData.append('root', rootPath);
    void actionFetcher.submit(formData, { method: 'post', action: '/api/fs/action' });
  };

  const openFile = () => {
    onOpenFile?.({ path: file.path, name: file.name, root: rootPath, repo: repo || '.' });
  };

  const handleAction = (actionType: string) => {
    setContextMenu(null);
    if (actionType === 'view') {
      openFile();
    } else if (actionType === 'diff') {
      window.dispatchEvent(new CustomEvent('omp:open-diff', {
        detail: {
          file: file.path,
          staged: diff?.staged,
          status: diff?.status || 'M',
          repo: repo || '.',
          root: rootPath,
        },
      }));
    } else if (actionType === 'explorer') {
      const fd = new FormData();
      fd.append('actionType', 'open_explorer');
      fd.append('path', file.path);
      submitAction(fd);
    } else if (actionType === 'copy_path') {
      void copyToClipboard(toAbsolutePath(file.basePath, file.path));
    } else if (actionType === 'copy_relative') {
      void copyToClipboard(file.path);
    } else if (actionType === 'history') {
      setShowHistoryModal(true);
      const fd = new FormData();
      fd.append('actionType', 'git_history');
      fd.append('path', file.path);
      submitAction(fd);
    } else if (actionType === 'rename') {
      setRenameValue(file.path);
      setShowRenameModal(true);
    } else if (actionType === 'new_file') {
      setCreateName('');
      setCreateError(null);
      setShowCreateModal(true);
    } else if (actionType === 'delete') {
      setShowDeleteModal(true);
    }
  };

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreateError(null);
    pendingActionRef.current = 'create';
    const fd = new FormData();
    fd.append('actionType', 'create');
    fd.append('path', file.path);
    fd.append('name', name);
    submitAction(fd);
  };

  const submitRename = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('actionType', 'rename');
    fd.append('path', file.path);
    fd.append('newPath', renameValue);
    submitAction(fd);
  };

  const submitDelete = () => {
    const fd = new FormData();
    fd.append('actionType', 'delete');
    fd.append('path', file.path);
    submitAction(fd);
  };

  return {
    contextMenu,
    contextMenuRef,
    openContextMenu: (x, y) => setContextMenu({ x, y }),
    closeContextMenu: () => setContextMenu(null),
    showRenameModal,
    showDeleteModal,
    showHistoryModal,
    showCreateModal,
    createError,
    createName,
    setCreateName,
    renameValue,
    setRenameValue,
    busy: actionFetcher.state !== 'idle',
    fetcherState: actionFetcher.state,
    fetcherData: actionFetcher.data,
    handleAction,
    submitCreate,
    submitRename,
    submitDelete,
    closeCreate: () => setShowCreateModal(false),
    closeDelete: () => setShowDeleteModal(false),
    closeRename: () => setShowRenameModal(false),
    closeHistory: () => setShowHistoryModal(false),
  };
}
