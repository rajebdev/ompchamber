import React, { useEffect, useState, useRef } from 'react';
import { Plus, Minus, Undo2 } from 'lucide-react';
import { useFetcher } from '@remix-run/react';
import type { GitChange } from '@/types';
import { ConfirmActionModal, BranchPromptModal, GitOutputModal } from './git-panel/GitModals';
import { GitFileItem } from './git-panel/GitFileItem';
import { GitTreeView } from './git-panel/GitTreeView';
import { GitCommitBox } from './git-panel/GitCommitBox';
import { GitBranchToolbar } from './git-panel/GitBranchToolbar';
import { GitRepoHeader } from './git-panel/GitRepoHeader';

interface GitPanelProps {
  className?: string;
  refreshKey?: number;
}

export function GitPanel({ className = '', refreshKey = 0 }: GitPanelProps) {
  const fetcher = useFetcher<{ changes: GitChange[], branch: string, branches: string[], repos: string[], activeRepo: string }>();
  const actionFetcher = useFetcher<{ success: boolean, type?: string, data?: any }>();
  
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('flat');
  
  const [showOptions, setShowOptions] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const repoRef = useRef<HTMLDivElement>(null);

  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [unstagedExpanded, setUnstagedExpanded] = useState(true);

  // Custom modal states
  const [confirmModal, setConfirmModal] = useState<{ type: string, file?: string, message: string } | null>(null);
  const [branchPrompt, setBranchPrompt] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const newBranchInputRef = useRef<HTMLInputElement>(null);
  
  // History and Graph states
  const [viewingOutput, setViewingOutput] = useState<{ title: string, data: any[] } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetcher.load('/api/fs/git');
  }, [refreshKey]);

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
        fetcher.load(`/api/fs/git?repo=${encodeURIComponent(activeRepo)}&t=${Date.now()}`);
      }
    }
  }, [actionFetcher.state, actionFetcher.data]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
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
    if (file) formData.append('file', file);
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, val]) => formData.append(key, val as string));
    }
    
    actionFetcher.submit(formData, { method: 'POST', action: '/api/fs/git' });

    if (actionType === 'commit') {
      setMessage('');
    }
  };

  const activeRepo = fetcher.data?.activeRepo || '.';
  const branch = fetcher.data?.branch || 'main';
  const branches = fetcher.data?.branches || ['main'];
  const repos = fetcher.data?.repos || ['.'];
  const changes = fetcher.data?.changes || [];
  const isLoading = fetcher.state === 'loading' || actionFetcher.state !== 'idle';

  const stagedChanges = changes.filter(c => {
    const status = c.status;
    return status && status[0] !== ' ' && status[0] !== '?';
  });

  const unstagedChanges = changes.filter(c => {
    const status = c.status;
    return (status && status[1] !== ' ' && status[1] !== '?') || status === '??';
  });

  return (
    <div className={`flex flex-col h-full bg-[#faf8f3] relative ${className}`}>
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
          />
        </>
      )}

      {/* Repo Switcher Header */}
      <GitRepoHeader 
        repoRef={repoRef}
        showRepoMenu={showRepoMenu}
        setShowRepoMenu={setShowRepoMenu}
        activeRepo={activeRepo}
        repos={repos}
        isLoading={isLoading}
        onSelectRepo={(r) => fetcher.load(`/api/fs/git?repo=${encodeURIComponent(r)}&t=${Date.now()}`)}
        onRefresh={() => fetcher.load(`/api/fs/git?repo=${encodeURIComponent(activeRepo)}&t=${Date.now()}`)}
      />
      
      {/* Branch & View Mode Toolbar */}
      <GitBranchToolbar 
        branchRef={branchRef}
        showBranchMenu={showBranchMenu}
        setShowBranchMenu={setShowBranchMenu}
        branch={branch}
        branches={branches}
        onCheckout={(b: string) => executeAction('checkout', undefined, { branch: b })}
        onOpenBranchPrompt={() => setBranchPrompt(true)}
        optionsRef={optionsRef}
        showOptions={showOptions}
        setShowOptions={setShowOptions}
        onHistory={() => executeAction('history')}
        onGraph={() => executeAction('graph')}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      {/* Commit Box */}
      <GitCommitBox 
        message={message}
        hasStagedChanges={stagedChanges.length > 0}
        onChangeMessage={setMessage}
        onCommit={() => executeAction('commit', undefined, { message })}
      />
      
      {/* Changes List / Tree */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px] text-[#141310]/80">
        {isLoading && changes.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40 italic">Loading...</div>
        ) : changes.length === 0 ? (
          <div className="p-4 text-center text-[#141310]/40 italic">No changes found.</div>
        ) : (
          <div className="py-1">
            {/* Staged Changes Section */}
            {stagedChanges.length > 0 && (
              <div className="mb-2">
                <div 
                  className="flex items-center justify-between px-3 py-1 group hover:bg-[#141310]/5 cursor-pointer transition-colors"
                  onClick={() => setStagedExpanded(!stagedExpanded)}
                >
                  <div className="flex items-center space-x-1 font-semibold text-[#141310] text-xs">
                    <span className="w-3 text-center">{stagedExpanded ? '▾' : '▸'}</span>
                    <span>Staged Changes</span>
                    <span className="text-[#141310]/40 font-normal ml-1 border border-[#141310]/20 rounded-full px-1.5 text-[9px] bg-white">
                      {stagedChanges.length}
                    </span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-[#141310]/40 flex-shrink-0">
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('unstage_all');
                      }} 
                      title="Unstage All Changes" 
                      className="w-5 h-5 flex items-center justify-center rounded hover:text-[#141310] hover:bg-[#141310]/10 cursor-pointer transition-colors"
                    >
                      <Minus size={12} />
                    </button>
                  </div>
                </div>

                {stagedExpanded && (
                  viewMode === 'tree' ? (
                    <GitTreeView 
                      changes={stagedChanges}
                      isStaged={true}
                      onAction={handleAction}
                    />
                  ) : (
                    stagedChanges.map(c => (
                      <GitFileItem 
                        key={c.file + 'staged'}
                        change={c}
                        isStaged={true}
                        onAction={handleAction}
                      />
                    ))
                  )
                )}
              </div>
            )}

            {/* Unstaged Changes Section */}
            {unstagedChanges.length > 0 && (
              <div>
                <div 
                  className="flex items-center justify-between px-3 py-1 group hover:bg-[#141310]/5 cursor-pointer transition-colors"
                  onClick={() => setUnstagedExpanded(!unstagedExpanded)}
                >
                  <div className="flex items-center space-x-1 font-semibold text-[#141310] text-xs">
                    <span className="w-3 text-center">{unstagedExpanded ? '▾' : '▸'}</span>
                    <span>Changes</span>
                    <span className="text-[#141310]/40 font-normal ml-1 border border-[#141310]/20 rounded-full px-1.5 text-[9px] bg-white">
                      {unstagedChanges.length}
                    </span>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-[#141310]/40 flex-shrink-0">
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('revert_all');
                      }} 
                      title="Discard All Changes" 
                      className="w-5 h-5 flex items-center justify-center rounded hover:text-[#c8321e] hover:bg-[#c8321e]/10 cursor-pointer transition-colors"
                    >
                      <Undo2 size={12} />
                    </button>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAction('stage_all');
                      }} 
                      title="Stage All Changes" 
                      className="w-5 h-5 flex items-center justify-center rounded hover:text-[#141310] hover:bg-[#141310]/10 cursor-pointer transition-colors"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>

                {unstagedExpanded && (
                  viewMode === 'tree' ? (
                    <GitTreeView 
                      changes={unstagedChanges}
                      isStaged={false}
                      onAction={handleAction}
                    />
                  ) : (
                    unstagedChanges.map(c => (
                      <GitFileItem 
                        key={c.file + 'unstaged'}
                        change={c}
                        isStaged={false}
                        onAction={handleAction}
                      />
                    ))
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
