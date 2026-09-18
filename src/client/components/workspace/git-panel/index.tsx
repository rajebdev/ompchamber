
import { useEffect, useRef, useState } from 'preact/hooks';
import { useFetcher } from '@/client/lib/router/fetcher';
import type { GitChange } from '@/shared/types';
import { BranchPromptModal, ConfirmActionModal, GitOutputModal } from '@/client/components/workspace/git-panel/Modals';
import { GitCommitBox } from '@/client/components/workspace/git-panel/CommitBox';
import { GitBranchToolbar } from '@/client/components/workspace/git-panel/BranchToolbar';
import { GitRepoHeader } from '@/client/components/workspace/git-panel/RepoHeader';
import { GitChangesList } from '@/client/components/workspace/git-panel/ChangesList';
import { Toast } from '@/client/components/common/Toast';
import { useToasts } from '@/client/hooks/ui/toasts';
import { useSessionState } from '@/client/hooks/workspace/session-state';
import { usePanelRefresh } from '@/client/hooks/workspace/panel-refresh';

interface GitPanelProps {
  className?: string;
  enabled?: boolean;
  rootPath?: string;
  refreshKey?: number;
}

export function GitPanel({ className = '', enabled = true, rootPath, refreshKey = 0 }: GitPanelProps) {
  const fetcher = useFetcher<{ changes: GitChange[], branch: string, branches: string[], remoteBranches?: string[], repos: string[], reposPending?: boolean, activeRepo: string, syncCount?: { ahead: number, behind: number } }>();
  const actionFetcher = useFetcher<{ success: boolean, type?: string, data?: any, error?: string }>();

  const [storedActiveRepo, setStoredActiveRepo, activeRepoReady] = useSessionState<string>('git.activeRepo', '.');
  const activeRepo = fetcher.data?.activeRepo || storedActiveRepo || '.';

  const loadRepo = (repo?: string) => {
    if (!enabled) return;
    const targetRepo = repo !== undefined ? repo : storedActiveRepo;
    const params = new URLSearchParams();
    if (rootPath) params.set('root', rootPath);
    if (targetRepo && targetRepo !== '.') params.set('repo', targetRepo);
    params.set('t', String(Date.now()));
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

  // Background nested-repo discovery polling: the loader returns immediately
  // with the root status and `reposPending`; we poll the lightweight
  // `?reposOnly=1` endpoint until the discoverer finishes, then refresh.
  const [extraRepos, setExtraRepos] = useState<string[] | null>(null);
  const [pollingRepos, setPollingRepos] = useState(false);
  const [rescanningRepos, setRescanningRepos] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeRepoReady) return;
    loadRepo(storedActiveRepo);
  }, [refreshKey, rootPath, enabled, activeRepoReady]);

  // Auto refresh: keep the change list in step with external mutations
  // (terminal commits, agent edits) that never bump `refreshKey`. `loadRepo`
  // re-reads via `fetcher.load`, whose `t` param busts the cache; a load
  // already in flight is ignored by the loader so polls cannot pile up.
  usePanelRefresh(() => loadRepo(storedActiveRepo), enabled && activeRepoReady);

  useEffect(() => {
    if (fetcher.data?.activeRepo && fetcher.data.activeRepo !== storedActiveRepo) {
      setStoredActiveRepo(fetcher.data.activeRepo);
    }
  }, [fetcher.data?.activeRepo, storedActiveRepo, setStoredActiveRepo]);

  useEffect(() => {
    if (fetcher.data?.reposPending) setPollingRepos(true);
  }, [fetcher.data]);

  // A forced rescan may finish before the polling interval kicks in; when that
  // happens the loader returns the fresh repo list synchronously.
  useEffect(() => {
    if (
      rescanningRepos &&
      fetcher.data &&
      !fetcher.data.reposPending &&
      Array.isArray(fetcher.data.repos)
    ) {
      setExtraRepos(fetcher.data.repos);
      setRescanningRepos(false);
    }
  }, [fetcher.data, rescanningRepos]);

  useEffect(() => {
    if (!pollingRepos) return;
    const params = new URLSearchParams({ reposOnly: '1' });
    if (rootPath) params.set('root', rootPath);
    const id = setInterval(async () => {
      const data = await fetch(`/api/fs/git?${params.toString()}`).then(r => r.json()).catch(() => null);
      if (data && !data.reposPending && Array.isArray(data.repos)) {
        setExtraRepos(data.repos);
        setPollingRepos(false);
        setRescanningRepos(false);
        loadRepo(storedActiveRepo);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [pollingRepos, rootPath, storedActiveRepo]);

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
        loadRepo(activeRepo);
      } else {
        pushToast(actionFetcher.data.error || 'Git operation failed');
      }
    }
  }, [actionFetcher.state, actionFetcher.data]);

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setShowOptions(false);
      }
      if (repoRef.current && !repoRef.current.contains(event.target as Node)) {
        setShowRepoMenu(false);
      }
      if (branchRef.current && !branchRef.current.contains(event.target as Node)) {
        setShowBranchMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const branch = fetcher.data?.branch || 'main';
  const branches = fetcher.data?.branches || ['main'];
  const remoteBranches = fetcher.data?.remoteBranches || [];
  const repos = extraRepos ?? (fetcher.data?.repos || ['.']);
  const changes = fetcher.data?.changes || [];
  const isLoading = fetcher.state === 'loading' || actionFetcher.state !== 'idle';

  const stagedChanges = changes.filter(c => {
    const status = c.status;
    return status && status[0] !== ' ' && status[0] !== '?';
  });

  const refreshRepos = () => {
    if (!enabled || pollingRepos || rescanningRepos) return;
    setExtraRepos(repos);
    setRescanningRepos(true);
    const params = new URLSearchParams({ rescan: '1' });
    if (rootPath) params.set('root', rootPath);
    if (activeRepo !== '.') params.set('repo', activeRepo);
    params.set('t', String(Date.now()));
    fetcher.load(`/api/fs/git?${params.toString()}`);
  };

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

      {toasts.map(t => (
        <Toast key={t.id} toast={t} onDismiss={dismissToast} />
      ))}

      {/* Repo Switcher Header */}
      <GitRepoHeader 
        repoRef={repoRef}
        showRepoMenu={showRepoMenu}
        setShowRepoMenu={setShowRepoMenu}
        activeRepo={activeRepo}
        repos={repos}
        isLoading={isLoading}
        rootPath={rootPath}
        reposScanning={pollingRepos || rescanningRepos}
        onSelectRepo={(r) => {
          setStoredActiveRepo(r);
          loadRepo(r);
        }}
        onRefresh={() => loadRepo(activeRepo)}
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
        syncCount={fetcher.data?.syncCount}
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
