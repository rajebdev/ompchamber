import React, { useState, useEffect, useRef } from 'react';
import { Search, CaseSensitive, WholeWord, Regex, Replace, ReplaceAll, MoreHorizontal, Check } from 'lucide-react';
import { FileIcon } from '../common/FileIcon';
import { useFetcher } from '@remix-run/react';
import { GitRepoDropdown } from './file-explorer/GitRepoDropdown';

export function SearchPanel({ className = '', enabled = true, rootPath }: { className?: string, enabled?: boolean, rootPath?: string }) {
  const [query, setQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  
  const [includeFiles, setIncludeFiles] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showIncludeField, setShowIncludeField] = useState(false);
  const [activeRepo, setActiveRepo] = useState('.');
  
  const menuRef = useRef<HTMLDivElement>(null);

  const fetcher = useFetcher<{ results: any[] }>();
  const replaceFetcher = useFetcher<{ success: boolean, results: any[] }>();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const triggerSearch = () => {
    if (!enabled) return;
    if (query.trim().length > 2) {
      fetcher.submit(
        { 
          q: query, 
          matchCase: String(matchCase), 
          wholeWord: String(wholeWord), 
          useRegex: String(useRegex),
          includeFiles: showIncludeField ? includeFiles : '',
          ...(rootPath ? { root: rootPath } : {}),
          ...(activeRepo !== '.' ? { repo: activeRepo } : {})
        },
        { method: 'POST', action: '/api/fs/search' }
      );
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      triggerSearch();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query, matchCase, wholeWord, useRegex, includeFiles, showIncludeField, rootPath, enabled, activeRepo]);

  if (!enabled) {
    return (
      <div className={`flex flex-col h-full bg-paper items-center justify-center text-ink/40 ${className}`}>
        <span className="text-xs font-mono">No session selected</span>
      </div>
    );
  }

  const handleReplace = (file?: string) => {
    if (!query) return;
    
    // If no file specified, replace all currently found files
    const targetFiles = file ? [file] : Object.keys(groupedResults);
    
    if (targetFiles.length === 0) return;

    replaceFetcher.submit(
      {
        q: query,
        replaceWith: replaceQuery,
        matchCase: String(matchCase),
        wholeWord: String(wholeWord),
        useRegex: String(useRegex),
        files: JSON.stringify(targetFiles),
        ...(rootPath ? { root: rootPath } : {}),
        ...(activeRepo !== '.' ? { repo: activeRepo } : {})
      },
      { method: 'POST', action: '/api/fs/replace' }
    );
  };

  // Trigger search again after replace completes
  useEffect(() => {
    if (replaceFetcher.state === 'idle' && replaceFetcher.data?.success) {
      triggerSearch();
    }
  }, [replaceFetcher.state, replaceFetcher.data]);

  const results = fetcher.data?.results || [];
  const isLoading = fetcher.state === 'submitting';
  
  const groupedResults = results.reduce((acc, curr) => {
    if (!acc[curr.file]) acc[curr.file] = [];
    acc[curr.file].push(curr);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className={`flex flex-col h-full bg-paper ${className}`}>
      <div className="p-3 border-b border-ink/10 flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <h2 className="text-xs font-semibold text-ink uppercase tracking-wider">Search</h2>
          <GitRepoDropdown rootPath={rootPath} activeRepo={activeRepo} onSelectRepo={setActiveRepo} />
        </div>
        <div className="relative" ref={menuRef}>
          <button 
            onClick={() => setShowMenu(!showMenu)}
            className={`p-1 rounded hover:bg-ink/5 transition-colors ${showMenu || showIncludeField ? 'text-ink' : 'text-ink/40'}`}
            title="Search Options"
          >
            <MoreHorizontal size={14} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-paper border border-ink/10 rounded shadow-lg z-10 py-1">
              <button 
                onClick={() => {
                  setShowIncludeField(!showIncludeField);
                  if (showIncludeField) setIncludeFiles('');
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-ink/5 flex items-center justify-between"
              >
                <span>Files to include</span>
                {showIncludeField && <Check size={12} className="text-ink/60" />}
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="p-3 flex flex-col gap-2.5 border-b border-ink/10">
        <div className="relative">
          <div className="flex items-center border border-ink/20 rounded bg-paper focus-within:border-ink/40 focus-within:ring-1 focus-within:ring-ink/10 transition-all">
            <Search size={14} className="ml-2 text-ink/40 flex-shrink-0" />
            <input 
              type="text" 
              placeholder="Search" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent border-none text-xs px-2 py-1.5 focus:outline-none text-ink placeholder-ink/30 min-w-0"
            />
            <div className="flex items-center space-x-0.5 pr-1 text-ink/40 flex-shrink-0">
              <button 
                onClick={() => setMatchCase(!matchCase)}
                className={`p-1 rounded hover:text-ink ${matchCase ? 'bg-ink/10 text-ink' : 'hover:bg-ink/5'}`} 
                title="Match Case"
              >
                <CaseSensitive size={14} />
              </button>
              <button 
                onClick={() => setWholeWord(!wholeWord)}
                className={`p-1 rounded hover:text-ink ${wholeWord ? 'bg-ink/10 text-ink' : 'hover:bg-ink/5'}`} 
                title="Match Whole Word"
              >
                <WholeWord size={14} />
              </button>
              <button 
                onClick={() => setUseRegex(!useRegex)}
                className={`p-1 rounded hover:text-ink ${useRegex ? 'bg-ink/10 text-ink' : 'hover:bg-ink/5'}`} 
                title="Use Regular Expression"
              >
                <Regex size={14} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="relative flex items-center space-x-1">
          <input 
            type="text" 
            placeholder="Replace"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            className="flex-1 min-w-0 bg-paper border border-ink/20 rounded text-xs px-2 py-1.5 focus:outline-none focus:border-ink/40 focus:ring-1 focus:ring-ink/10 transition-all text-ink placeholder-ink/30"
          />
          <button 
            onClick={() => handleReplace()}
            disabled={results.length === 0 || replaceFetcher.state !== 'idle'}
            className="p-1.5 rounded border border-ink/20 text-ink/60 hover:text-ink hover:bg-ink/5 disabled:opacity-50 disabled:cursor-not-allowed bg-paper"
            title="Replace All"
          >
            <ReplaceAll size={14} />
          </button>
        </div>

        {showIncludeField && (
          <div className="relative">
            <input 
              type="text" 
              value={includeFiles}
              onChange={(e) => setIncludeFiles(e.target.value)}
              placeholder="Files to include (e.g. *.js, src/*)"
              className="w-full bg-paper border border-ink/20 rounded text-xs px-2 py-1.5 focus:outline-none focus:border-ink/40 focus:ring-1 focus:ring-ink/10 transition-all text-ink placeholder-ink/40"
            />
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">

        {isLoading && results.length === 0 ? (
          <div className="text-ink/40 italic text-center py-4">Searching...</div>
        ) : query.trim().length <= 2 ? (
          <div className="text-ink/40 italic text-center py-4">Type at least 3 characters to search.</div>
        ) : results.length === 0 ? (
          <div className="text-ink/40 italic text-center py-4">No results found.</div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedResults).map(([file, fileResults]: [string, any]) => (
              <div key={file}>
                <div className="font-semibold text-ink/80 flex items-center justify-between mb-1 group">
                  <div className="flex items-center min-w-0">
                    <FileIcon name={file} size={12} className="mr-1.5 flex-shrink-0" />
                    <span className="truncate">{file}</span>
                    <span className="ml-2 bg-ink/10 text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0">{fileResults.length}</span>
                  </div>
                  <button
                    onClick={() => handleReplace(file)}
                    disabled={replaceFetcher.state !== 'idle'}
                    className="opacity-0 group-hover:opacity-100 p-1 text-ink/40 hover:text-ink rounded hover:bg-ink/5 disabled:opacity-50 flex-shrink-0"
                    title="Replace in this file"
                  >
                    <Replace size={12} />
                  </button>
                </div>
                <div className="space-y-1">
                  {fileResults.map((result: any, i: number) => (
                    <div key={i} className="flex hover:bg-ink/5 cursor-pointer rounded px-1 py-0.5">
                      <span className="text-ink/40 w-6 flex-shrink-0 text-right mr-2">{result.line}</span>
                      <span className="truncate text-ink">{result.content.trim()}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
