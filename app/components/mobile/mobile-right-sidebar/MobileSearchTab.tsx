import React, { useState, useEffect, useRef } from 'react';
import { FileIcon } from '../../common/FileIcon';
import {
  Search,
  CaseSensitive, 
  WholeWord, 
  Regex, 
  Replace, 
  ReplaceAll, 
  MoreHorizontal, 
  Check,
  ChevronDown,
  ChevronRight,
  FileCode
} from 'lucide-react';
import { useOnClickOutside } from '@/hooks/useOnClickOutside';
import { MobileFullEditor } from './MobileFullEditor';

interface SearchResultMatch {
  file: string;
  line: number | string;
  content: string;
}

export function MobileSearchTab() {
  const [query, setQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  
  const [includeFiles, setIncludeFiles] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [showIncludeField, setShowIncludeField] = useState(false);
  
  const [results, setResults] = useState<SearchResultMatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [selectedFileForEditor, setSelectedFileForEditor] = useState<{ name: string; path?: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(menuRef, () => setShowMenu(false));

  const triggerSearch = () => {
    if (query.trim().length <= 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append('q', query);
    formData.append('matchCase', String(matchCase));
    formData.append('wholeWord', String(wholeWord));
    formData.append('useRegex', String(useRegex));
    formData.append('includeFiles', showIncludeField ? includeFiles : '');

    fetch('/api/fs/search', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.results)) {
          setResults(data.results);
        } else {
          setResults([]);
        }
      })
      .catch(() => {
        setResults([]);
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      triggerSearch();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [query, matchCase, wholeWord, useRegex, includeFiles, showIncludeField]);

  // Group by file path
  const groupedResults = results.reduce((acc, curr) => {
    if (!acc[curr.file]) acc[curr.file] = [];
    acc[curr.file].push(curr);
    return acc;
  }, {} as Record<string, SearchResultMatch[]>);

  const handleReplace = (file?: string) => {
    if (!query) return;
    const targetFiles = file ? [file] : Object.keys(groupedResults);
    if (targetFiles.length === 0) return;

    setIsReplacing(true);
    const formData = new FormData();
    formData.append('q', query);
    formData.append('replaceWith', replaceQuery);
    formData.append('matchCase', String(matchCase));
    formData.append('wholeWord', String(wholeWord));
    formData.append('useRegex', String(useRegex));
    formData.append('files', JSON.stringify(targetFiles));

    fetch('/api/fs/replace', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.success) {
          triggerSearch();
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsReplacing(false);
      });
  };

  const toggleFileExpanded = (file: string) => {
    setExpandedFiles(prev => ({
      ...prev,
      [file]: prev[file] === undefined ? false : !prev[file]
    }));
  };

  const handleOpenFile = (file: string) => {
    const fileName = file.split('/').pop() || file;
    setSelectedFileForEditor({ name: fileName, path: file });
  };

  return (
    <div className="flex flex-col h-full bg-paper font-mono text-xs select-none">
      
      {/* Header Bar */}
      <div className="p-3 border-b border-ink/10 flex items-center justify-between bg-canvas flex-shrink-0">
        <h2 className="text-xs font-semibold text-ink uppercase tracking-wider">Search</h2>
        <div className="relative" ref={menuRef}>
          <button 
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className={`p-1 rounded hover:bg-ink/5 transition-colors cursor-pointer ${showMenu || showIncludeField ? 'text-ink' : 'text-ink/40'}`}
            title="Search Options"
          >
            <MoreHorizontal size={14} />
          </button>
          
          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-paper border border-ink/20 rounded shadow-lg z-50 py-1">
              <button 
                type="button"
                onClick={() => {
                  setShowIncludeField(!showIncludeField);
                  if (showIncludeField) setIncludeFiles('');
                  setShowMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-ink hover:bg-ink/5 flex items-center justify-between cursor-pointer"
              >
                <span>Files to include</span>
                {showIncludeField && <Check size={12} className="text-ink/60" />}
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Input controls: Search, Replace, Include Files */}
      <div className="p-3 flex flex-col gap-2.5 border-b border-ink/10 bg-paper flex-shrink-0">
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
                type="button"
                onClick={() => setMatchCase(!matchCase)}
                className={`p-1 rounded cursor-pointer hover:text-ink ${matchCase ? 'bg-ink/10 text-ink' : 'hover:bg-ink/5'}`} 
                title="Match Case"
              >
                <CaseSensitive size={14} />
              </button>
              <button 
                type="button"
                onClick={() => setWholeWord(!wholeWord)}
                className={`p-1 rounded cursor-pointer hover:text-ink ${wholeWord ? 'bg-ink/10 text-ink' : 'hover:bg-ink/5'}`} 
                title="Match Whole Word"
              >
                <WholeWord size={14} />
              </button>
              <button 
                type="button"
                onClick={() => setUseRegex(!useRegex)}
                className={`p-1 rounded cursor-pointer hover:text-ink ${useRegex ? 'bg-ink/10 text-ink' : 'hover:bg-ink/5'}`} 
                title="Use Regular Expression"
              >
                <Regex size={14} />
              </button>
            </div>
          </div>
        </div>
        
        {/* Replace Bar */}
        <div className="relative flex items-center space-x-1">
          <input 
            type="text" 
            placeholder="Replace"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            className="flex-1 min-w-0 bg-paper border border-ink/20 rounded text-xs px-2 py-1.5 focus:outline-none focus:border-ink/40 focus:ring-1 focus:ring-ink/10 transition-all text-ink placeholder-ink/30"
          />
          <button 
            type="button"
            onClick={() => handleReplace()}
            disabled={results.length === 0 || isReplacing}
            className="p-1.5 rounded border border-ink/20 text-ink/60 hover:text-ink hover:bg-ink/5 disabled:opacity-40 disabled:cursor-not-allowed bg-paper cursor-pointer"
            title="Replace All"
          >
            <ReplaceAll size={14} />
          </button>
        </div>

        {/* Files to include filter */}
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
      
      {/* Results List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        {isLoading && results.length === 0 ? (
          <div className="text-ink/40 italic text-center py-6">Searching...</div>
        ) : query.trim().length <= 2 ? (
          <div className="text-ink/40 italic text-center py-6">Type at least 3 characters to search.</div>
        ) : results.length === 0 ? (
          <div className="text-ink/40 italic text-center py-6">No results found.</div>
        ) : (
          <div className="space-y-3 pb-6">
            {Object.entries(groupedResults).map(([file, fileResults]) => {
              const isCollapsed = expandedFiles[file] === false;
              return (
                <div key={file} className="border border-ink/10 rounded bg-paper overflow-hidden">
                  <div className="font-semibold text-ink/80 flex items-center justify-between p-2 bg-canvas group">
                    <div 
                      onClick={() => toggleFileExpanded(file)}
                      className="flex items-center min-w-0 flex-1 cursor-pointer"
                    >
                      {isCollapsed ? <ChevronRight size={13} className="mr-1 text-ink/50" /> : <ChevronDown size={13} className="mr-1 text-ink/50" />}
                      <FileCode size={13} className="mr-1.5 text-ink/60 flex-shrink-0" />
                      <span className="truncate text-xs text-ink">{file}</span>
                      <span className="ml-2 bg-ink/10 text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0">{fileResults.length}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReplace(file);
                      }}
                      disabled={isReplacing}
                      className="p-1 text-ink/40 hover:text-ink rounded hover:bg-ink/10 disabled:opacity-40 flex-shrink-0 cursor-pointer ml-1"
                      title="Replace in this file"
                    >
                      <Replace size={13} />
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className="divide-y divide-ink/5">
                      {fileResults.map((result, i) => (
                        <div 
                          key={i} 
                          onClick={() => handleOpenFile(result.file)}
                          className="flex items-center hover:bg-ink/5 cursor-pointer px-2.5 py-1.5 transition-colors text-[11px]"
                        >
                          <span className="text-ink/40 w-7 flex-shrink-0 text-right mr-2 font-mono">{result.line}</span>
                          <span className="truncate text-ink font-mono">{result.content.trim()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Editor Modal when clicking on a file or match */}
      {selectedFileForEditor && (
        <MobileFullEditor
          file={selectedFileForEditor}
          onClose={() => setSelectedFileForEditor(null)}
        />
      )}

    </div>
  );
}
