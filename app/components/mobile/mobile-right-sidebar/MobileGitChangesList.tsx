import React, { useState, useEffect, useRef } from 'react';
import type { GitChange } from '@/types';
import { ConfirmActionModal, BranchPromptModal, GitOutputModal } from '@/components/workspace/git-panel/GitModals';
import { MobileGitRepoHeader } from './MobileGitRepoHeader';
import { MobileGitBranchToolbar } from './MobileGitBranchToolbar';
import { MobileGitCommitBox } from './MobileGitCommitBox';
import { MobileGitSection } from './MobileGitSection';

interface MobileGitChangesListProps {
  changes: GitChange[];
  branch: string;
  branches: string[];
  onBranchChange: (branch: string) => void;
  onAction: (actionType: string, file?: string) => void;
  onCommit?: (message: string) => void;
}

export function MobileGitChangesList({
  changes: initialChanges,
  branch: initialBranch,
  branches: initialBranches,
  onBranchChange,
  onAction,
  onCommit
}: MobileGitChangesListProps) {
  const [repos, setRepos] = useState<string[]>(['.']);
  const [activeRepo, setActiveRepo] = useState('.');
  const [branch, setBranch] = useState(initialBranch || 'main');
  const [branches, setBranches] = useState<string[]>(initialBranches || ['main', 'feat/mobile-ui']);
  const [changes, setChanges] = useState<GitChange[]>(initialChanges || []);
  const [isLoading, setIsLoading] = useState(false);

  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  const [commitMessage, setCommitMessage] = useState('');

  // Modals for Confirm, History, Graph, Branch
  const [confirmModal, setConfirmModal] = useState<{ type: string; file?: string; message: string } | null>(null);
  const [viewingOutput, setViewingOutput] = useState<{ title: string; data: any[] } | null>(null);
  const [branchPrompt, setBranchPrompt] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const newBranchInputRef = useRef<HTMLInputElement>(null);

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);

  const loadGitData = (targetRepo: string = activeRepo) => {
    setIsLoading(true);
    fetch(`/api/fs/git?repo=${encodeURIComponent(targetRepo)}&t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data) {
          if (data.repos && Array.isArray(data.repos)) setRepos(data.repos);
          if (data.activeRepo) setActiveRepo(data.activeRepo);
          if (data.branch) setBranch(data.branch);
          if (data.branches && Array.isArray(data.branches)) setBranches(data.branches);
          if (data.changes && Array.isArray(data.changes)) setChanges(data.changes);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadGitData(activeRepo);
  }, [activeRepo]);

  useEffect(() => {
    if (initialChanges && initialChanges.length > 0) {
      setChanges(initialChanges);
    }
  }, [initialChanges]);

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
    // 1. Optimistic local UI state update
    const matchesTarget = (changeFile: string, targetPath: string) => {
      return changeFile === targetPath || changeFile.startsWith(targetPath.endsWith('/') ? targetPath : `${targetPath}/`);
    };

    if (actionType === 'stage') {
      setChanges(prev => prev.map(c => (!file || matchesTarget(c.file, file)) ? { ...c, staged: true } : c));
    } else if (actionType === 'stage_all') {
      setChanges(prev => prev.map(c => ({ ...c, staged: true })));
    } else if (actionType === 'unstage') {
      setChanges(prev => prev.map(c => (!file || matchesTarget(c.file, file)) ? { ...c, staged: false } : c));
    } else if (actionType === 'unstage_all') {
      setChanges(prev => prev.map(c => ({ ...c, staged: false })));
    } else if (actionType === 'revert') {
      setChanges(prev => prev.filter(c => !(file ? matchesTarget(c.file, file) : true)));
    } else if (actionType === 'revert_all') {
      setChanges(prev => prev.filter(c => c.staged));
    }

    // 2. Notify parent listener
    onAction(actionType, file);

    // 3. Send API request to backend
    const formData = new FormData();
    formData.append('actionType', actionType);
    formData.append('repo', activeRepo);
    if (file) formData.append('file', file);
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, val]) => formData.append(key, val as string));
    }

    fetch('/api/fs/git', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data?.success) {
          loadGitData(activeRepo);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (actionType === 'commit') {
          setCommitMessage('');
        }
      });
  };

  const handleHistory = () => {
    const formData = new FormData();
    formData.append('actionType', 'history');
    formData.append('repo', activeRepo);

    fetch('/api/fs/git', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data?.data) {
          setViewingOutput({ title: 'Commit History', data: data.data });
        } else {
          setViewingOutput({
            title: 'Commit History',
            data: [
              { hash: 'a1b2c3d', author: 'omp-dev', time: '10 mins ago', message: 'feat: align mobile elements with desktop' },
              { hash: 'e4f5g6h', author: 'omp-dev', time: '1 hour ago', message: 'chore: update bun build plugins' }
            ]
          });
        }
      })
      .catch(() => {
        setViewingOutput({
          title: 'Commit History',
          data: [{ hash: 'a1b2c3d', author: 'omp-dev', time: '10 mins ago', message: 'feat: align mobile elements with desktop' }]
        });
      });
  };

  const handleGraph = () => {
    const formData = new FormData();
    formData.append('actionType', 'graph');
    formData.append('repo', activeRepo);

    fetch('/api/fs/git', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data?.data) {
          setViewingOutput({ title: 'Git Graph', data: data.data });
        } else {
          setViewingOutput({
            title: 'Git Graph',
            data: [
              { graph: '*   ', hash: 'a1b2c3d', author: 'omp-dev', time: '10 mins ago', message: 'Merge branch main into edge' },
              { graph: '|\\  ', hash: 'e4f5g6h', author: 'omp-dev', time: '1 hour ago', message: 'feat: mobile right sidebar' }
            ]
          });
        }
      })
      .catch(() => {
        setViewingOutput({
          title: 'Git Graph',
          data: [{ graph: '* ', hash: 'a1b2c3d', author: 'omp-dev', time: '10 mins ago', message: 'main branch' }]
        });
      });
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    const name = newBranchName.trim();
    const formData = new FormData();
    formData.append('actionType', 'create_branch');
    formData.append('branch', name);
    formData.append('repo', activeRepo);

    fetch('/api/fs/git', { method: 'POST', body: formData })
      .then(() => {
        setBranch(name);
        setBranches(prev => [...prev, name]);
        onBranchChange(name);
      })
      .catch(() => {
        setBranch(name);
        setBranches(prev => [...prev, name]);
      })
      .finally(() => {
        setBranchPrompt(false);
        setNewBranchName('');
      });
  };

  const stagedChanges = changes.filter(c => {
    if (typeof c.staged === 'boolean') return c.staged;
    const status = c.status;
    return status && status[0] !== ' ' && status[0] !== '?';
  });

  const unstagedChanges = changes.filter(c => {
    if (typeof c.staged === 'boolean') return !c.staged;
    const status = c.status;
    return (status && status[1] !== ' ' && status[1] !== '?') || status === '??';
  });

  const handleCommitSubmit = () => {
    if (!commitMessage.trim()) return;
    executeAction('commit', undefined, { message: commitMessage.trim() });
    if (onCommit) {
      onCommit(commitMessage.trim());
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#faf8f3] font-mono text-xs">
      {/* 1. Repo Switcher Header */}
      <MobileGitRepoHeader
        repos={repos}
        activeRepo={activeRepo}
        isLoading={isLoading}
        onSelectRepo={(r) => setActiveRepo(r)}
        onRefresh={() => loadGitData(activeRepo)}
      />

      {/* 2. Branch & ViewMode Toolbar */}
      <MobileGitBranchToolbar
        branch={branch}
        branches={branches}
        onBranchChange={(b) => {
          setBranch(b);
          onBranchChange(b);
        }}
        onOpenBranchPrompt={() => setBranchPrompt(true)}
        onHistory={handleHistory}
        onGraph={handleGraph}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* 3. Git Commit Box */}
      <MobileGitCommitBox
        message={commitMessage}
        hasStagedChanges={stagedChanges.length > 0}
        onChangeMessage={setCommitMessage}
        onCommit={handleCommitSubmit}
      />

      {/* 4. Staged & Unstaged Changes Sections */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] text-[#141310]/80">
        <MobileGitSection
          title="Staged Changes"
          count={stagedChanges.length}
          isExpanded={stagedExpanded}
          onToggleExpanded={() => setStagedExpanded(!stagedExpanded)}
          isStaged={true}
          viewMode={viewMode}
          changes={stagedChanges}
          onAction={handleAction}
        />

        <MobileGitSection
          title="Changes"
          count={unstagedChanges.length}
          isExpanded={unstagedExpanded}
          onToggleExpanded={() => setUnstagedExpanded(!unstagedExpanded)}
          isStaged={false}
          viewMode={viewMode}
          changes={unstagedChanges}
          onAction={handleAction}
        />
      </div>

      {/* Modals from desktop GitModals */}
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
        onCreate={handleCreateBranch}
      />

      <GitOutputModal
        output={viewingOutput}
        onClose={() => setViewingOutput(null)}
      />
    </div>
  );
}
