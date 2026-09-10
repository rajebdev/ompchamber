import { History, GitMerge, RotateCw, X, Search } from 'lucide-react';

interface HeaderProps {
  isGraphMode: boolean;
  onToggleMode: (graph: boolean) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onClose: () => void;
  isRefreshing?: boolean;
  totalCommits: number;
  totalCount?: number;
}

export function Header({
  isGraphMode,
  onToggleMode,
  searchQuery,
  onSearchChange,
  onRefresh,
  onClose,
  isRefreshing,
  totalCommits,
  totalCount,
}: HeaderProps) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 border-b border-ink/10 bg-paper select-none">
      <div className="flex items-center justify-between gap-4">
        {/* Title and Subtitle */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-ink tracking-tight">
              {isGraphMode ? 'Graph' : 'History'}
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-ink/5 text-ink/50 border border-ink/10">
              {totalCount && totalCount > totalCommits
                ? `${totalCommits} of ${totalCount} commits`
                : `${totalCommits} commits`}
            </span>
          </div>
          <p className="text-xs text-ink/50 mt-0.5">
            Browse recent commits and inspect changed files.
          </p>
        </div>

        {/* Action Controls on the Right */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-ink/5 p-0.5 rounded-lg border border-ink/10 text-xs">
            <button
              type="button"
              onClick={() => onToggleMode(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                !isGraphMode
                  ? 'bg-paper text-ink shadow-xs'
                  : 'text-ink/60 hover:text-ink hover:bg-ink/5'
              }`}
            >
              <History size={13} />
              <span>History</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleMode(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                isGraphMode
                  ? 'bg-paper text-ink shadow-xs'
                  : 'text-ink/60 hover:text-ink hover:bg-ink/5'
              }`}
            >
              <GitMerge size={13} />
              <span>Graph</span>
            </button>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-ink/15 hover:bg-ink/5 text-ink/70 hover:text-ink transition-colors cursor-pointer text-xs disabled:opacity-40"
            title="Refresh commit history"
          >
            <RotateCw size={13} className={isRefreshing ? 'animate-spin text-ink' : ''} />
            <span>refresh</span>
          </button>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-ink/5 text-ink/60 hover:text-ink transition-colors cursor-pointer"
            title="Close modal"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Search Input Filter */}
      <div className="relative mt-1">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter commits by message, author, or hash..."
          className="w-full bg-ink/[0.03] border border-ink/15 rounded-md pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink/40 focus:outline-none focus:border-ink/40 transition-colors font-mono"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink cursor-pointer"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
