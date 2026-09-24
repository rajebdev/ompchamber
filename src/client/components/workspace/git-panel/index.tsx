
import { useEffect, useRef, useState } from 'preact/hooks';
import { useFetcher } from '@/client/lib/router/fetcher';
import type { GitChange } from '@/shared/types';
import { BranchPromptModal, ConfirmActionModal, GitOutputModal } from '@/client/components/workspace/git-panel/Modals';
import { GitCommitBox } from '@/client/components/workspace/git-panel/CommitBox';
import { GitBranchToolbar } from '@/client/components/workspace/git-panel/BranchToolbar';
import { GitRepoHeader } from '@/client/components/workspace/git-panel/RepoHeader';
import { GitChangesList } from '@/client/components/workspace/git-panel/ChangesList';
import { ToastStack } from '@/client/components/common/ToastStack';
import { useToasts } from '@/client/hooks/ui/toasts';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { resolveRepoForPanel, useRepoList, useRepoScope } from '@/client/hooks/workspace/repo-scope';
import { usePanelRefresh, useFileMutationRefresh } from '@/client/hooks/workspace/panel-refresh';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';

interface GitPanelProps {
  className?: string;
  enabled?: boolean;
  rootPath?: string;
  refreshKey?: number;
}

export function GitPanel({ className = '', enabled = true, rootPath, refreshKey = 0 }: GitPanelProps) {
  const fetcher = useFetcher<{ changes: GitChange[], branch: string, branches: string[], remoteBranches?: string[], syncCount?: { ahead: number, behind: number } }>();
  const actionFetcher = useFetcher<{ success: boolean, type?: string, data?: any, error?: string }>();

  const { activeRepo: pickedRepo, setActiveRepo, ready: activeRepoReady } = useRepoScope(rootPath, 'git.activeRepo');
  const { repos, scanning: reposScanning, rescan: refreshRepos } = useRepoList(rootPath, enabled);
  // When the user has picked nothing and the workspace root is not itself a
  // repo, git falls back to the first repo discovery found — the same choice
  // the loader makes for a request that names no repo. Resolving it here rather
  // than reading it back from the response is what keeps the header label, the
  // picker's checkmark and the requests describing one repo: the response
  // arrives a render later, and by then it may belong to a workspace the user
  // has already left.
  const activeRepo = resolveRepoForPanel(pickedRepo, repos);
  const activeRepoRef = useRef(activeRepo);
  activeRepoRef.current = activeRepo;

  // `root\0repo` — the working tree the panel is showing right now.
  const scopeRef = useRef('');
  scopeRef.current = `${rootPath ?? ''}\u0000${activeRepo}`;
  // The scope the in-flight read was asked for, and the scope the payload
  // currently in `fetcher.data` was asked for. Only one read is ever in flight
  // (the fetcher aborts its predecessor), so the former is what the latter
  // becomes when a new payload arrives.
  const requestedScopeRef = useRef('');
  const payloadScopeRef = useRef('');
  const lastPayloadRef = useRef<unknown>(undefined);
  if (fetcher.data !== lastPayloadRef.current) {
    lastPayloadRef.current = fetcher.data;
    payloadScopeRef.current = requestedScopeRef.current;
  }
  // A switch leaves the previous repo's branch, changes and branch list in
  // `fetcher.data` until the new read lands. Rendering those under the new
  // repo's header would claim the new working tree is on the old branch with
  // the old changes, so the payload is used only while it describes the scope
  // on screen.
  const data = payloadScopeRef.current === scopeRef.current ? fetcher.data : undefined;

  const loadRepo = (repo?: string) => {
    if (!enabled) return;
    const targetRepo = repo ?? activeRepoRef.current;
    const params = new URLSearchParams();
    if (rootPath) params.set('root', rootPath);
    if (targetRepo && targetRepo !== '.') params.set('repo', targetRepo);
    // The toolbar's ↑ahead ↓behind badge is what this asks for; it makes the
    // loader refresh the branch's remote-tracking ref before counting, so the
    // numbers describe origin rather than the last fetch.
    params.set('sync', '1');
    params.set('t', String(Date.now()));
    // Tag the response with the scope it was asked for: a switch leaves the
    // previous repo's branch, changes and branch list in `fetcher.data` until
    // the new read lands, and rendering those under the new repo's header
    // claims the new working tree is on the old branch with the old changes.
    requestedScopeRef.current = scopeRef.current;
    fetcher.load(`/api/fs/git?${params.toString()}`);
  };
  
  const [message, setMessage] = useSessionState<string>('git.commitDraft', '');
  const [viewMode, setViewMode] = useSessionState<'flat' | 'tree'>('git.viewMode', 'flat');
  
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const repoRef = useRef<HTMLDivElement>(null);

  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  // Custom modal states
  const [confirmModal, setConfirmModal] = useState<{ type: string, file?: string, message: string } | null>(null);
  const [branchPrompt, setBranchPrompt] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const newBranchInputRef = useRef<HTMLInputElement>(null);
  
  // History and Graph states
  const [viewingOutput, setViewingOutput] = useState<{ title: string, data: any[] } | null>(null);
  const [mounted, setMounted] = useState(false);

  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(() => {
    setMounted(true);
  }, []);

  // `activeRepo` is a dependency, not just the root: the repo list that
  // resolves the root-level fallback arrives after the first render, and a
  // workspace switch re-resolves it to '.'.
  useEffect(() => {
    if (!activeRepoReady) return;
    loadRepo();
  }, [refreshKey, rootPath, enabled, activeRepoReady, activeRepo]);

  // Auto refresh: keep the change list in step with external mutations
  // (terminal commits, agent edits) that never bump `refreshKey`. `loadRepo`
  // re-reads via `fetcher.load`, whose `t` param busts the cache; a load
  // already in flight is ignored by the loader so polls cannot pile up.
  usePanelRefresh(() => loadRepo(), enabled && activeRepoReady);
  // Agent edits/commits land between poll ticks: re-read right after a
  // file-mutating tool finishes so the change list tracks the AI's work.
  useFileMutationRefresh(() => loadRepo(), enabled && activeRepoReady);

  // Focus input when branch prompt opens
  useEffect(() => {
    if (branchPrompt && newBranchInputRef.current) {
      newBranchInputRef.current.focus();
    }
  }, [branchPrompt]);

  // Reload after action completes
  useEffect(() => {
    if (actionFetcher.state === 'idle' && actionFetcher.data) {
      if (actionFetcher.data.type === 'history') {
        setViewingOutput({ title: 'Commit History', data: actionFetcher.data.data || [] });
      } else if (actionFetcher.data.type === 'graph') {
        setViewingOutput({ title: 'Git Graph', data: actionFetcher.data.data || [] });
      } else if (actionFetcher.data.success) {
        loadRepo();
      } else {
        pushToast(actionFetcher.data.error || 'Git operation failed');
      }
    }
  }, [actionFetcher.state, actionFetcher.data]);

  useOnClickOutside(optionsRef, () => setShowOptions(false));
  useOnClickOutside(repoRef, () => setShowRepoMenu(false));
  useOnClickOutside(branchRef, () => setShowBranchMenu(false));

  const handleAction = (actionType: string, file?: string, additionalData?: any) => {
    if (actionType === 'revert') {
      setConfirmModal({ type: actionType, file, message: `Are you sure you want to discard changes in ${file}?` });
      return;
    }
    
    if (actionType === 'revert_all') {
      setConfirmModal({ type: actionType, message: 'Are you sure you want to discard ALL unstaged changes? This cannot be undone.' });
      return;
    }

    executeAction(actionType, file, additionalData);
  };

  const executeAction = (actionType: string, file?: string, additionalData?: any) => {
    const formData = new FormData();
    formData.append('actionType', actionType);
    formData.append('repo', activeRepo);
    if (rootPath) formData.append('root', rootPath);
    if (file) formData.append('file', file);
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, val]) => formData.append(key, val as string));
    }
    
    actionFetcher.submit(formData, { method: 'POST', action: '/api/fs/git' });

    if (actionType === 'commit') {
      setMessage('');
    }
  };

  const branch = data?.branch || 'main';
  const branches = data?.branches || ['main'];
  const remoteBranches = data?.remoteBranches || [];
  const changes = data?.changes || [];
  const isLoading = fetcher.state === 'loading' || actionFetcher.state !== 'idle';

  const stagedChanges = changes.filter(c => {
    const status = c.status;
    return status && status[0] !== ' ' && status[0] !== '?';
  });

  if (!enabled) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">No session selected</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-paper relative ${className}`}>
      {mounted && (
        <>
          <ConfirmActionModal 
            modal={confirmModal}
            onClose={() => setConfirmModal(null)}
            onConfirm={() => {
              if (confirmModal) {
                executeAction(confirmModal.type, confirmModal.file);
                setConfirmModal(null);
              }
            }}
          />
          <BranchPromptModal 
            isOpen={branchPrompt}
            branchName={newBranchName}
            inputRef={newBranchInputRef}
            onChange={setNewBranchName}
            onClose={() => {
              setBranchPrompt(false);
              setNewBranchName('');
            }}
            onCreate={() => {
              if (newBranchName.trim()) {
                executeAction('create_branch', undefined, { branch: newBranchName.trim() });
                setBranchPrompt(false);
                setNewBranchName('');
              }
            }}
          />
          <GitOutputModal 
            output={viewingOutput}
            onClose={() => setViewingOutput(null)}
            onRefresh={() => {
              if (viewingOutput) {
                executeAction(viewingOutput.title.toLowerCase().includes('graph') ? 'graph' : 'history');
              }
            }}
            onExecuteAction={(actionType, file, extra) => executeAction(actionType, file, extra)}
            rootPath={rootPath}
            activeRepo={activeRepo}
          />
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Repo Switcher Header */}
      <GitRepoHeader 
        repoRef={repoRef}
        showRepoMenu={showRepoMenu}
        setShowRepoMenu={setShowRepoMenu}
        activeRepo={activeRepo}
        repos={repos}
        isLoading={isLoading}
        rootPath={rootPath}
        reposScanning={reposScanning}
        onSelectRepo={(r) => {
          // The reload is the scope effect's job: it fires on the resolved
          // `activeRepo` change, so selecting here would fetch the same repo
          // twice.
          if (r !== activeRepo) setActiveRepo(r);
        }}
        onRefresh={() => loadRepo()}
        onRefreshRepos={refreshRepos}
      />
      
      {/* Branch & View Mode Toolbar */}
      <GitBranchToolbar 
        branchRef={branchRef}
        showBranchMenu={showBranchMenu}
        setShowBranchMenu={setShowBranchMenu}
        branch={branch}
        branches={branches}
        remoteBranches={remoteBranches}
        onCheckout={(b: string) => executeAction('checkout', undefined, { branch: b })}
        onOpenBranchPrompt={() => setBranchPrompt(true)}
        optionsRef={optionsRef}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        onHistory={() => executeAction('history')}
        onGraph={() => executeAction('graph')}
        viewMode={viewMode}
        setViewMode={setViewMode}
        isBusy={isLoading}
        syncCount={data?.syncCount}
        onSync={() => executeAction('sync')}
      />

      {/* Commit Box */}
      <GitCommitBox 
        message={message}
        hasStagedChanges={stagedChanges.length > 0}
        isBusy={isLoading}
        onChangeMessage={setMessage}
        onCommit={() => executeAction('commit', undefined, { message })}
      />
      
      {/* Changes List / Tree */}
      <GitChangesList
        changes={changes}
        isLoading={isLoading}
        viewMode={viewMode}
        repo={activeRepo}
        rootPath={rootPath}
        onAction={handleAction}
      />
    </div>
  );
}
