import React from 'react';
import { createPortal } from 'react-dom';
import { Eye, ExternalLink, Copy, History, Edit2, Trash2, X, RefreshCw, GitCompare } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  isFolder: boolean;
  hasGitStatus?: boolean;
  onAction: (actionType: string) => void;
}

export function FileContextMenu({ x, y, isFolder, hasGitStatus, onAction }: ContextMenuProps) {
  const menuWidth = 190;
  const menuHeight = isFolder ? 220 : hasGitStatus ? 285 : 255;
  
  const posX = typeof window !== 'undefined' ? Math.max(10, Math.min(x, window.innerWidth - menuWidth - 12)) : x;
  const posY = typeof window !== 'undefined' ? Math.max(10, Math.min(y, window.innerHeight - menuHeight - 12)) : y;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 bg-ink/20"
      onClick={() => onAction('close')}
      onContextMenu={(e) => { e.preventDefault(); onAction('close'); }}
    >
      <div 
        className="fixed z-50 bg-paper border border-ink/15 shadow-2xl rounded-lg py-1 min-w-[185px] text-xs text-ink font-sans"
        style={{ top: posY, left: posX }}
        onClick={e => e.stopPropagation()}
      >
        {!isFolder && (
          <>
            <button onClick={() => onAction('view')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors">
              <Eye size={13} className="text-ink/60" />
              <span>View</span>
            </button>
            {hasGitStatus && (
              <button onClick={() => onAction('diff')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors text-ink">
                <GitCompare size={13} className="text-warning" />
                <span className="font-medium">Open in Diff Panel</span>
              </button>
            )}
          </>
        )}
        <button onClick={() => onAction('explorer')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors">
          <ExternalLink size={13} className="text-ink/60" />
          <span>Go to Explorer</span>
        </button>
        <div className="my-1 border-t border-ink/10"></div>
        <button onClick={() => onAction('copy_path')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors">
          <Copy size={13} className="text-ink/60" />
          <span>Copy Path</span>
        </button>
        <button onClick={() => onAction('copy_relative')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors">
          <Copy size={13} className="text-ink/60" />
          <span>Copy Relative Path</span>
        </button>
        <div className="my-1 border-t border-ink/10"></div>
        <button onClick={() => onAction('history')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors">
          <History size={13} className="text-ink/60" />
          <span>Show Git History</span>
        </button>
        <div className="my-1 border-t border-ink/10"></div>
        <button onClick={() => onAction('rename')} className="w-full text-left px-3 py-1.5 hover:bg-ink/5 flex items-center space-x-2 transition-colors">
          <Edit2 size={13} className="text-ink/60" />
          <span>Rename</span>
        </button>
        <button onClick={() => onAction('delete')} className="w-full text-left px-3 py-1.5 hover:bg-error/10 text-error flex items-center space-x-2 transition-colors">
          <Trash2 size={13} className="text-error" />
          <span>Delete</span>
        </button>
      </div>
    </div>,
    document.body
  );
}

interface DeleteModalProps {
  fileName: string;
  isFolder: boolean;
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function FileDeleteModal({ fileName, isFolder, isLoading, onCancel, onConfirm }: DeleteModalProps) {
  return createPortal(
    <div className="fixed inset-0 bg-ink/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-paper rounded shadow-xl p-4 w-full max-w-sm border border-ink/10 font-sans">
        <h3 className="font-semibold text-ink mb-2 text-sm">Delete {isFolder ? 'Folder' : 'File'}</h3>
        <p className="text-xs text-ink/70 mb-4">Are you sure you want to delete <span className="font-mono bg-canvas px-1 rounded">{fileName}</span>? This action cannot be undone.</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-ink hover:bg-ink/5 rounded transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-error text-white rounded hover:bg-error/90 transition-colors flex items-center"
            disabled={isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface RenameModalProps {
  isFolder: boolean;
  renameValue: string;
  originalPath: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function FileRenameModal({ isFolder, renameValue, originalPath, isLoading, onChange, onCancel, onSubmit }: RenameModalProps) {
  return createPortal(
    <div className="fixed inset-0 bg-ink/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="bg-paper rounded shadow-xl p-4 w-full max-w-sm border border-ink/10 font-sans">
        <h3 className="font-semibold text-ink mb-3 text-sm">Rename {isFolder ? 'Folder' : 'File'}</h3>
        <input 
          autoFocus
          type="text" 
          value={renameValue}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-paper border border-ink/20 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-ink mb-4"
        />
        <div className="flex justify-end space-x-2">
          <button 
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-ink hover:bg-ink/5 rounded transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="px-3 py-1.5 text-xs bg-ink text-canvas rounded hover:bg-ink/90 transition-colors flex items-center"
            disabled={isLoading || !renameValue.trim() || renameValue === originalPath}
          >
            {isLoading ? 'Renaming...' : 'Rename'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

interface HistoryModalProps {
  filePath: string;
  fetcherState: string;
  fetcherData: any;
  onClose: () => void;
}

export function FileHistoryModal({ filePath, fetcherState, fetcherData, onClose }: HistoryModalProps) {
  return createPortal(
    <div className="fixed inset-0 bg-ink/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-paper rounded-lg shadow-xl w-full max-w-4xl border border-ink/10 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-ink/10">
          <h3 className="text-sm font-semibold text-ink flex items-center space-x-2">
            <History size={16} className="text-ink/60" />
            <span>Git History: <span className="font-mono font-normal opacity-80">{filePath}</span></span>
          </h3>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-ink/5 rounded text-ink/60 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className="flex-1 scrollbar-overlay-container scrollbar-overlay-static bg-paper p-2">
          {fetcherState === 'idle' ? (
            fetcherData?.type === 'history' ? (
              fetcherData.data.length > 0 ? (
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-canvas sticky top-0 z-10 border-b border-ink/10">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-ink/70 rounded-tl">Description</th>
                      <th className="px-3 py-2 font-semibold text-ink/70 w-32">Date</th>
                      <th className="px-3 py-2 font-semibold text-ink/70 w-32">Author</th>
                      <th className="px-3 py-2 font-semibold text-ink/70 w-24 text-right rounded-tr">Commit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {fetcherData.data.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-ink/[0.03] transition-colors group bg-paper">
                        <td className="px-3 py-2 text-ink">
                          {row.message ? <span className="font-medium text-ink/90 group-hover:text-ink">{row.message}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-ink/60 whitespace-nowrap font-mono text-[10.5px]">
                          {row.time}
                        </td>
                        <td className="px-3 py-2 text-ink/70 whitespace-nowrap truncate max-w-[120px]">
                          {row.author}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {row.hash ? <span className="font-mono text-ink/50 group-hover:text-ink font-semibold transition-colors bg-canvas px-1.5 py-0.5 rounded border border-ink/10">{row.hash}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-ink/40 font-mono text-xs">No commit history found for this file.</div>
              )
            ) : fetcherData?.error ? (
              <div className="p-8 text-center text-error font-mono text-xs">{fetcherData.error}</div>
            ) : (
              <div className="p-8 text-center text-ink/40 font-mono text-xs">Loading history...</div>
            )
          ) : (
            <div className="p-8 text-center text-ink/40 font-mono text-xs flex items-center justify-center space-x-2">
              <RefreshCw size={14} className="animate-spin" />
              <span>Loading history...</span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
