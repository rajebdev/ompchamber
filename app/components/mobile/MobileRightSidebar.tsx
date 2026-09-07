import React, { useState } from 'react';
import { 
  GitBranch, 
  Files, 
  Search, 
  Terminal,
  Layers,
  X
} from 'lucide-react';
import type { GitChange } from '@/types';
import { MobileGitChangesList } from './mobile-right-sidebar/MobileGitChangesList';
import { MobileFilesTab } from './mobile-right-sidebar/MobileFilesTab';
import { MobileSearchTab } from './mobile-right-sidebar/MobileSearchTab';
import { TerminalPanel } from '@/components/workspace/TerminalPanel';
import { ContextPanel } from '@/components/workspace/ContextPanel';

interface MobileRightSidebarProps {
  changes: GitChange[];
  branch: string;
  branches: string[];
  syncCount: number;
  onBranchChange: (branch: string) => void;
  onSync: () => void;
  onGitAction: (actionType: string, file?: string) => void;
  onCommit: (message: string) => void;
  onClose: () => void;
}

export function MobileRightSidebar({
  changes,
  branch,
  branches,
  syncCount,
  onBranchChange,
  onSync,
  onGitAction,
  onCommit,
  onClose
}: MobileRightSidebarProps) {
  const [activeTab, setActiveTab] = useState<'git' | 'files' | 'search' | 'terminal' | 'context'>('files');

  return (
    <div className="flex flex-col h-full w-full bg-paper text-ink relative select-none">
      
      {/* Top Header & Tab Navigation Bar */}
      <div className="h-14 border-b border-ink/10 flex items-center justify-between px-3 flex-shrink-0 bg-canvas">
        
        {/* Horizontal Navigation Tabs: buttons display text only when selected */}
        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-1">
          
          {/* 1. Files Explorer Tab Button */}
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'files'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Files Explorer"
          >
            <Files size={14} className="flex-shrink-0" />
            {activeTab === 'files' && <span>Files</span>}
          </button>

          {/* 2. Search Tab Button */}
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'search'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Search Workspace"
          >
            <Search size={14} className="flex-shrink-0" />
            {activeTab === 'search' && <span>Search</span>}
          </button>

          {/* 3. GIT Tab Button */}
          <button
            type="button"
            onClick={() => setActiveTab('git')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'git'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="GIT"
          >
            <GitBranch size={14} className="flex-shrink-0" />
            {activeTab === 'git' && (
              <>
                <span className="tracking-wide">GIT</span>
                {changes.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-canvas/20 font-mono ml-0.5">
                    {changes.length}
                  </span>
                )}
              </>
            )}
          </button>

          {/* 4. Context Tab Button */}
          <button
            type="button"
            onClick={() => setActiveTab('context')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'context'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Context & Telemetry"
          >
            <Layers size={14} className="flex-shrink-0" />
            {activeTab === 'context' && <span>Context</span>}
          </button>

          {/* 5. Terminal Tab Button */}
          <button
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'terminal'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Bun Terminal"
          >
            <Terminal size={14} className="flex-shrink-0" />
            {activeTab === 'terminal' && <span>Terminal</span>}
          </button>

        </div>

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-ink/5 active:bg-ink/10 text-ink transition-colors flex-shrink-0 ml-2"
          title="Close right sidebar"
          aria-label="Close right sidebar"
        >
          <X size={20} strokeWidth={1.8} />
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'git' && (
          <MobileGitChangesList
            changes={changes}
            branch={branch}
            branches={branches}
            onBranchChange={onBranchChange}
            onAction={onGitAction}
            onCommit={onCommit}
          />
        )}

        {activeTab === 'files' && (
          <MobileFilesTab />
        )}

        {activeTab === 'search' && (
          <MobileSearchTab />
        )}

        {activeTab === 'context' && (
          <ContextPanel className="h-full w-full" onClose={onClose} />
        )}

        <div className={`h-full w-full ${activeTab === 'terminal' ? 'block' : 'hidden'}`}>
          <TerminalPanel className="h-full w-full" showHeader={false} />
        </div>
      </div>

    </div>
  );
}
