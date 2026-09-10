import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import type { GitCommit, GitCommitFile } from '@/types/git';
import { SAMPLE_GIT_COMMITS } from '@/data/mock/git-commits';
import { Header } from '@/components/workspace/git-panel/commit-modal/Header';
import { GraphCanvas } from '@/components/workspace/git-panel/commit-modal/GraphCanvas';
import { CommitRow } from '@/components/workspace/git-panel/commit-modal/CommitRow';
import { computeCommitLanes } from '@/components/workspace/git-panel/commit-modal/graph-utils';

interface GitCommitModalProps {
  output: { title: string; data: any[] } | null;
  onClose: () => void;
  onRefresh?: () => void;
  onExecuteAction?: (actionType: string, file?: string, extra?: Record<string, string>) => void;
  rootPath?: string;
  activeRepo?: string;
}

export function GitCommitModal({
  output,
  onClose,
  onRefresh,
  onExecuteAction,
  rootPath,
  activeRepo,
}: GitCommitModalProps) {
  if (!output) return null;

  const initialGraphMode = output.title.toLowerCase().includes('graph');
  const [isGraphMode, setIsGraphMode] = useState(initialGraphMode);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHash, setSelectedHash] = useState<string>('');
  const [fileDiffs, setFileDiffs] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Normalize incoming commits or fallback to sample commits
  const rawCommits: GitCommit[] = useMemo(() => {
    const raw = output.data || [];
    if (raw.length === 0) return SAMPLE_GIT_COMMITS;

    // Check if raw items already match GitCommit shape
    if (raw[0] && typeof raw[0] === 'object' && ('hash' in raw[0] || 'shortHash' in raw[0])) {
      return raw.map((c: any) => ({
        hash: c.hash || c.shortHash || 'unknown',
        shortHash: c.shortHash || (c.hash ? c.hash.slice(0, 8) : 'unknown'),
        author: c.author || 'Unknown',
        date: c.date || c.time || '',
        message: c.message || '',
        parents: Array.isArray(c.parents) ? c.parents : [],
        refs: Array.isArray(c.refs) ? c.refs : [],
        files: Array.isArray(c.files) ? c.files : [],
        lane: typeof c.lane === 'number' ? c.lane : undefined,
      }));
    }

    return SAMPLE_GIT_COMMITS;
  }, [output.data]);

  // Set initial selected commit
  useEffect(() => {
    if (rawCommits.length > 0 && !selectedHash) {
      setSelectedHash(rawCommits[0].hash);
    }
  }, [rawCommits, selectedHash]);

  // Filter commits based on search query
  const filteredCommits = useMemo(() => {
    if (!searchQuery.trim()) return rawCommits;
    const q = searchQuery.toLowerCase().trim();
    return rawCommits.filter(
      (c) =>
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.shortHash.toLowerCase().includes(q) ||
        c.hash.toLowerCase().includes(q) ||
        c.refs?.some((r) => r.toLowerCase().includes(q))
    );
  }, [rawCommits, searchQuery]);

  // Measure dynamic positions of each commit node so lines never break
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsContainerRef = useRef<HTMLDivElement>(null);
  const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [nodePositions, setNodePositions] = useState<Record<string, number>>({});
  const [totalHeight, setTotalHeight] = useState<number>(800);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

  const measurePositions = useCallback(() => {
    if (!containerRef.current || !rowsContainerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const scrollTop = containerRef.current.scrollTop;
    const newPositions: Record<string, number> = {};

    filteredCommits.forEach((commit, idx) => {
      const el = headerRefs.current[commit.hash];
      if (el) {
        // Center of the subject message text
        const rect = el.getBoundingClientRect();
        newPositions[commit.hash] = rect.top + rect.height / 2 - containerRect.top + scrollTop;
      } else {
        newPositions[commit.hash] = idx * 60 + 20;
      }
    });

    setNodePositions(newPositions);
    // Measure rows container height directly so collapsing file diff immediately reduces totalHeight
    const contentH = rowsContainerRef.current.offsetHeight;
    setTotalHeight(Math.max(contentH, containerRef.current.clientHeight, 600));
  }, [filteredCommits]);

  useLayoutEffect(() => {
    measurePositions();
    const rafId = requestAnimationFrame(() => {
      measurePositions();
    });
    return () => cancelAnimationFrame(rafId);
  }, [measurePositions, filteredCommits, fileDiffs, expandedFiles, isGraphMode]);

  useEffect(() => {
    const el = rowsContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      measurePositions();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [measurePositions]);

  // Lane calculations
  const laneMap = useMemo(() => computeCommitLanes(filteredCommits), [filteredCommits]);
  const maxLane = useMemo(() => {
    let max = 0;
    laneMap.forEach((l) => {
      if (l > max) max = l;
    });
    return max;
  }, [laneMap]);

  const laneWidth = 18;
  const paddingLeft = 16;
  const graphWidth = isGraphMode ? (maxLane + 1) * laneWidth + paddingLeft * 2 : 36;

  // Toggle expand/collapse for a file and fetch unified diff if needed
  const handleToggleFile = useCallback(
    async (commitHash: string, file: GitCommitFile) => {
      const diffKey = `${commitHash}:${file.file}`;
      let isExpanding = false;

      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(diffKey)) {
          next.delete(diffKey);
          isExpanding = false;
        } else {
          next.add(diffKey);
          isExpanding = true;
        }
        return next;
      });

      if (isExpanding && !fileDiffs[diffKey] && !file.diff) {
        setLoadingFiles((prev) => new Set(prev).add(diffKey));
        try {
          const formData = new FormData();
          formData.set('actionType', 'commit_diff');
          formData.set('hash', commitHash);
          formData.set('file', file.file);
          if (rootPath) formData.set('root', rootPath);
          if (activeRepo) formData.set('repo', activeRepo);

          const res = await fetch('/api/fs/git', { method: 'POST', body: formData });
          const json = await res.json();
          if (json && json.diff) {
            setFileDiffs((prev) => ({ ...prev, [diffKey]: json.diff }));
          }
        } catch (err) {
          console.error('Failed to load file diff:', err);
        } finally {
          setLoadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(diffKey);
            return next;
          });
        }
      }
    },
    [fileDiffs, rootPath, activeRepo]
  );

  const handleCommitAction = (action: string, commit: GitCommit) => {
    if (!onExecuteAction) return;

    if (action === 'checkout') {
      onExecuteAction('checkout', undefined, { branch: commit.hash });
    } else if (action === 'create_branch_here') {
      const name = window.prompt(`Create new branch at commit ${commit.shortHash}:`, `branch-${commit.shortHash}`);
      if (name?.trim()) {
        onExecuteAction('create_branch', undefined, { branch: name.trim() });
      }
    } else if (action === 'cherry_pick') {
      if (window.confirm(`Cherry-pick commit ${commit.shortHash} onto current branch?`)) {
        onExecuteAction('cherry_pick', undefined, { hash: commit.hash });
      }
    } else if (action === 'revert') {
      if (window.confirm(`Revert commit ${commit.shortHash}?`)) {
        onExecuteAction('revert_commit', undefined, { hash: commit.hash });
      }
    } else if (action === 'reset') {
      const mode = window.prompt(`Reset current branch to ${commit.shortHash} (soft, mixed, hard):`, 'soft');
      if (mode && ['soft', 'mixed', 'hard'].includes(mode.toLowerCase())) {
        onExecuteAction('reset_commit', undefined, { hash: commit.hash, mode: mode.toLowerCase() });
      }
    } else if (action === 'merge') {
      if (window.confirm(`Merge commit ${commit.shortHash} into current branch?`)) {
        onExecuteAction('merge_commit', undefined, { hash: commit.hash });
      }
    } else if (action === 'rebase') {
      if (window.confirm(`Rebase current branch onto commit ${commit.shortHash}?`)) {
        onExecuteAction('rebase_commit', undefined, { hash: commit.hash });
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    }
    setTimeout(() => setIsRefreshing(false), 600);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-canvas/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-paper border border-ink/20 rounded-xl shadow-2xl flex flex-col w-[min(96vw,980px)] h-[88vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <Header
          isGraphMode={isGraphMode}
          onToggleMode={setIsGraphMode}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onRefresh={handleRefresh}
          onClose={onClose}
          isRefreshing={isRefreshing}
          totalCommits={filteredCommits.length}
        />

        {/* Commits Container with Unified Continuous SVG Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-y-auto scrollbar-overlay-container relative select-text"
        >
          {filteredCommits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink/40 font-mono text-xs">
              No matching commits found.
            </div>
          ) : (
            <div className="relative min-h-full">
              {/* Continuous Graph Canvas (Single unbroken SVG spanning the whole scroll list) */}
              <GraphCanvas
                commits={filteredCommits}
                nodePositions={nodePositions}
                selectedHash={selectedHash}
                isGraphMode={isGraphMode}
                laneWidth={laneWidth}
                paddingLeft={paddingLeft}
                totalHeight={totalHeight}
              />

              {/* Commit Rows */}
              <div
                ref={rowsContainerRef}
                className="flex flex-col relative z-20"
                style={{ paddingLeft: `${graphWidth}px` }}
              >
                {filteredCommits.map((commit) => (
                  <CommitRow
                    key={commit.hash}
                    commit={commit}
                    isSelected={selectedHash === commit.hash}
                    isGraphMode={isGraphMode}
                    onSelect={(c) => setSelectedHash(c.hash)}
                    onAction={handleCommitAction}
                    onToggleFile={handleToggleFile}
                    isExpandedFile={(h, f) => expandedFiles.has(`${h}:${f}`)}
                    isLoadingFile={(h, f) => loadingFiles.has(`${h}:${f}`)}
                    fileDiffs={fileDiffs}
                    headerRef={(el) => {
                      headerRefs.current[commit.hash] = el;
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
