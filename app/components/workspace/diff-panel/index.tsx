import { useState, useEffect, useCallback } from 'react';
import { useFetcher } from '@remix-run/react';
import { useSessionUiState } from '@/hooks/workspace/session-state';
import { parseUnifiedDiff } from '@/components/workspace/diff-panel/diff-parser';
import { DiffToolbar } from '@/components/workspace/diff-panel/Toolbar';
import { UnifiedView } from '@/components/workspace/diff-panel/UnifiedView';
import { SplitView } from '@/components/workspace/diff-panel/SplitView';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface DiffPanelProps {
  filePath: string;
  status?: string;
  isStaged?: boolean;
  root?: string;
  repo?: string;
  onOpenInEditor?: () => void;
  onFileSaved?: () => void;
  className?: string;
}

export function DiffPanel({
  filePath,
  status = 'M',
  isStaged = false,
  root,
  repo = '.',
  onOpenInEditor,
  onFileSaved,
  className = '',
}: DiffPanelProps) {
  // Read and persist view mode & whitespace preference in session_ui_state
  const [viewMode, setViewMode] = useSessionUiState<'unified' | 'split'>('diff.viewMode', 'unified');
  const [ignoreWhitespace, setIgnoreWhitespace] = useSessionUiState<boolean>('diff.ignoreWhitespace', false);

  const [rawDiff, setRawDiff] = useState<string>('');
  const [currentStatus, setCurrentStatus] = useState<string>(status);
  const [currentStaged, setCurrentStaged] = useState<boolean>(isStaged);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  const fetcher = useFetcher();

  const fetchDiff = useCallback(async () => {
    if (!filePath) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams({
        fileDiff: '1',
        file: filePath,
        staged: currentStaged ? '1' : '0',
        repo: repo || '.',
      });
      if (root) params.set('root', root);

      const res = await fetch(`/api/fs/git?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setRawDiff(data.diff || '');
        if (data.status) setCurrentStatus(data.status);
      } else {
        setErrorMessage(data.error || 'Failed to load file diff');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error fetching diff');
    } finally {
      setIsLoading(false);
    }
  }, [filePath, currentStaged, repo, root]);

  useEffect(() => {
    setCurrentStatus(status);
    setCurrentStaged(isStaged);
  }, [status, isStaged, filePath]);

  useEffect(() => {
    fetchDiff();
  }, [fetchDiff]);

  const parsed = parseUnifiedDiff(rawDiff, ignoreWhitespace);

  const handleToggleViewMode = () => {
    setViewMode(viewMode === 'unified' ? 'split' : 'unified');
  };

  const handleToggleWhitespace = () => {
    setIgnoreWhitespace(!ignoreWhitespace);
  };

  const handleCopyDiff = () => {
    if (!rawDiff) return;
    navigator.clipboard.writeText(rawDiff);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleStageUnstage = () => {
    const actionType = currentStaged ? 'unstage' : 'stage';
    const fd = new FormData();
    fd.set('actionType', actionType);
    fd.set('file', filePath);
    fd.set('repo', repo || '.');
    if (root) fd.set('root', root);

    fetcher.submit(fd, { method: 'POST', action: '/api/fs/git' });
    setCurrentStaged(!currentStaged);
    setTimeout(() => {
      fetchDiff();
      onFileSaved?.();
    }, 300);
  };

  const handleDiscard = () => {
    setShowDiscardConfirm(true);
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    const fd = new FormData();
    fd.set('actionType', 'discard');
    fd.set('file', filePath);
    fd.set('repo', repo || '.');
    if (root) fd.set('root', root);

    fetcher.submit(fd, { method: 'POST', action: '/api/fs/git' });
    setTimeout(() => {
      fetchDiff();
      onFileSaved?.();
    }, 300);
  };

  return (
    <div className={`flex flex-col h-full bg-paper select-text relative font-sans ${className}`}>
      {/* Top Diff Toolbar */}
      <DiffToolbar
        filePath={filePath}
        status={currentStatus}
        isStaged={currentStaged}
        viewMode={viewMode}
        ignoreWhitespace={ignoreWhitespace}
        additions={parsed.additions}
        deletions={parsed.deletions}
        isLoading={isLoading}
        isCopied={isCopied}
        onToggleViewMode={handleToggleViewMode}
        onToggleWhitespace={handleToggleWhitespace}
        onStageUnstage={handleStageUnstage}
        onDiscard={handleDiscard}
        onOpenInEditor={onOpenInEditor}
        onRefresh={fetchDiff}
        onCopyDiff={handleCopyDiff}
      />

      {/* Main Diff Content Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col bg-paper">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center space-x-2 text-ink/50 text-xs font-mono">
            <RefreshCw size={14} className="animate-spin" />
            <span>Loading file diff...</span>
          </div>
        ) : errorMessage ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
            <AlertCircle size={20} className="text-error" />
            <p className="text-xs text-error font-medium">{errorMessage}</p>
            <button
              onClick={fetchDiff}
              className="px-3 py-1 text-xs bg-ink/10 hover:bg-ink/15 text-ink rounded font-sans transition-colors"
            >
              Retry
            </button>
          </div>
        ) : viewMode === 'split' ? (
          <SplitView rows={parsed.splitRows} />
        ) : (
          <UnifiedView lines={parsed.lines} />
        )}
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-paper rounded-lg shadow-xl p-4 w-full max-w-sm border border-ink/15">
            <h3 className="font-semibold text-ink mb-1.5 text-sm">Discard Changes?</h3>
            <p className="text-xs text-ink/70 mb-4">
              Are you sure you want to discard all unstaged changes in <span className="font-mono font-medium text-ink">{filePath}</span>? This cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 text-xs text-ink hover:bg-ink/5 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDiscard}
                className="px-3 py-1.5 text-xs bg-error text-white rounded hover:bg-error/90 font-medium transition-colors"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
