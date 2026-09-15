import { useState } from 'react';
import { GitBranch, Files, Search, Terminal, Layers, Globe, Bot, BarChart3, X } from 'lucide-react';
import { FileExplorer } from '@/components/workspace/file-explorer/index';
import { SearchPanel } from '@/components/workspace/SearchPanel';
import { GitPanel } from '@/components/workspace/git-panel/index';
import { TerminalPanel } from '@/components/workspace/terminal-panel/index';
import { ContextPanel } from '@/components/workspace/context-panel/index';
import { BrowserPanel } from '@/components/workspace/browser-panel/index';
import { UserBrowserPanel } from '@/components/workspace/user-browser-panel/index';
import { UsagePanel } from '@/components/workspace/usage-panel/index';

interface MobileRightSidebarProps {
  enabled?: boolean;
  rootPath?: string;
  onOpenFile?: (file: any) => void;
  onClose: () => void;
}

type MobileTab = 'git' | 'files' | 'search' | 'context' | 'terminal' | 'user-browser' | 'browser' | 'usage';

export function MobileRightSidebar({
  enabled = true,
  rootPath,
  onOpenFile,
  onClose
}: MobileRightSidebarProps) {
  const [activeTab, setActiveTab] = useState<MobileTab>('files');

  return (
    <div className="flex flex-col h-full w-full bg-paper text-ink relative select-none">

      {/* Top Header & Tab Navigation Bar */}
      <div
        className="border-b border-ink/10 flex items-center justify-between px-3 flex-shrink-0 bg-canvas"
        style={{
          height: 'calc(3.5rem + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
        }}
      >

        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-1">
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
            {activeTab === 'git' && <span className="tracking-wide">GIT</span>}
          </button>

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

          <button
            type="button"
            onClick={() => setActiveTab('user-browser')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'user-browser'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Browser (Anda)"
          >
            <Globe size={14} className="flex-shrink-0" />
            {activeTab === 'user-browser' && <span>Browser</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'browser'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Browser Agent"
          >
            <Bot size={14} className="flex-shrink-0" />
            {activeTab === 'browser' && <span>Agent</span>}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('usage')}
            className={`flex items-center transition-all cursor-pointer ${
              activeTab === 'usage'
                ? 'space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-ink text-canvas shadow-sm'
                : 'p-2 rounded-lg text-ink/70 hover:bg-ink/5'
            }`}
            title="Usage"
          >
            <BarChart3 size={14} className="flex-shrink-0" />
            {activeTab === 'usage' && <span>Usage</span>}
          </button>
        </div>

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

      {/* Main Tab Content — shared components so mobile == desktop features */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {!enabled ? (
          <div className="h-full flex items-center justify-center text-ink/40">
            <span className="text-xs font-mono">No session selected</span>
          </div>
        ) : (
          <>
            {activeTab === 'files' && (
              <FileExplorer className="h-full w-full" enabled={enabled} rootPath={rootPath} onOpenFile={onOpenFile} />
            )}
            {activeTab === 'search' && (
              <SearchPanel className="h-full w-full" enabled={enabled} rootPath={rootPath} />
            )}
            {activeTab === 'git' && (
              <GitPanel className="h-full w-full" enabled={enabled} rootPath={rootPath} />
            )}
            {activeTab === 'context' && (
              <ContextPanel className="h-full w-full" enabled={enabled} onClose={onClose} />
            )}
            <div className={`h-full w-full ${activeTab === 'terminal' ? 'block' : 'hidden'}`}>
              <TerminalPanel className="h-full w-full" enabled={enabled} rootPath={rootPath} showHeader={false} />
            </div>
            <div className={`h-full w-full ${activeTab === 'user-browser' ? 'block' : 'hidden'}`}>
              <UserBrowserPanel className="h-full w-full" />
            </div>
            <div className={`h-full w-full ${activeTab === 'browser' ? 'block' : 'hidden'}`}>
              <BrowserPanel className="h-full w-full" active={activeTab === 'browser'} />
            </div>
            {activeTab === 'usage' && <UsagePanel className="h-full w-full" />}
          </>
        )}
      </div>

    </div>
  );
}
