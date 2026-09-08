import { useEffect, useRef, useState } from 'react';
import { FolderGit2, ChevronDown, Check, RotateCcw, Search } from 'lucide-react';

interface GitRepoDropdownProps {
  rootPath?: string;
  activeRepo: string;
  onSelectRepo: (repo: string) => void;
}

function workspaceFolderName(rootPath?: string): string {
  if (!rootPath) return 'workspace root';
  const parts = rootPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : 'workspace root';
}

export function GitRepoDropdown({ rootPath, activeRepo, onSelectRepo }: GitRepoDropdownProps) {
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<string[]>(['.']);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const rootLabel = workspaceFolderName(rootPath);

  const label = (r: string) => (r === '.' ? rootLabel : r);

  const fetchRepos = async (rescan = false) => {
    const params = new URLSearchParams({ reposOnly: '1' });
    if (rootPath) params.set('root', rootPath);
    if (rescan) params.set('rescan', '1');
    params.set('t', String(Date.now()));
    const data = await fetch(`/api/fs/git?${params.toString()}`).then(r => r.json()).catch(() => null);
    if (data && Array.isArray(data.repos)) {
      setRepos(data.repos);
      if (data.reposPending) {
        setScanning(true);
      } else {
        setScanning(false);
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    void fetchRepos();
  }, [open, rootPath]);

  useEffect(() => {
    if (!scanning) return;
    const params = new URLSearchParams({ reposOnly: '1' });
    if (rootPath) params.set('root', rootPath);
    const id = setInterval(async () => {
      const data = await fetch(`/api/fs/git?${params.toString()}`).then(r => r.json()).catch(() => null);
      if (data && !data.reposPending && Array.isArray(data.repos)) {
        setRepos(data.repos);
        setScanning(false);
      }
    }, 1500);
    return () => clearInterval(id);
  }, [scanning, rootPath]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRepos = repos.filter(r => {
    if (!query.trim()) return true;
    return label(r).toLowerCase().includes(query.toLowerCase());
  });

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Switch git project"
        className="flex items-center space-x-1.5 hover:bg-ink/5 px-2 py-1 rounded transition-colors text-xs text-ink/80 font-medium"
      >
        <FolderGit2 size={12} className="text-ink/60" />
        <span className="truncate max-w-[110px]">{activeRepo === '.' ? rootLabel : activeRepo.split('/').pop()}</span>
        <ChevronDown size={12} className="text-ink/40" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-paper border border-ink/20 rounded-md shadow-lg z-50 flex flex-col overflow-hidden text-xs">
          <div className="px-2 py-1.5 border-b border-ink/10 flex items-center space-x-1.5">
            <Search size={11} className="text-ink/40 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repos..."
              title="Search repositories"
              className="w-full bg-transparent outline-none text-xs text-ink placeholder-ink/40"
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                title="Clear search"
                className="text-ink/40 hover:text-ink flex-shrink-0"
              >
                ×
              </button>
            )}
            <button
              type="button"
              onClick={() => void fetchRepos(true)}
              title="Refresh nested repos"
              disabled={scanning}
              className="text-ink/40 hover:text-ink flex-shrink-0 transition-colors disabled:opacity-40 disabled:hover:text-ink/40"
            >
              <RotateCcw size={11} className={scanning ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filteredRepos.length === 0 ? (
              <div className="px-3 py-2 text-ink/40 italic">No repos found</div>
            ) : (
              filteredRepos.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    onSelectRepo(r);
                    setOpen(false);
                    setQuery('');
                  }}
                  title={label(r)}
                  className="w-full text-left px-3 py-2 hover:bg-ink/5 flex items-center justify-between transition-colors"
                >
                  <span className="truncate">{label(r)}</span>
                  {activeRepo === r && <Check size={12} className="text-ink" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
