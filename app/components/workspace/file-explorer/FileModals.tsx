import React from 'react';
import { createPortal } from 'react-dom';
import { Eye, ExternalLink, Copy, History, Edit2, Trash2, X, RefreshCw } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  isFolder: boolean;
  onAction: (actionType: string) => void;
}

export function FileContextMenu({ x, y, isFolder, onAction }: ContextMenuProps) {
  const menuWidth = 190;
  const menuHeight = isFolder ? 220 : 255;
  
  const posX = typeof window !== 'undefined' ? Math.max(10, Math.min(x, window.innerWidth - menuWidth - 12)) : x;
  const posY = typeof window !== 'undefined' ? Math.max(10, Math.min(y, window.innerHeight - menuHeight - 12)) : y;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 bg-black/5"
      onClick={() => onAction('close')}
      onContextMenu={(e) => { e.preventDefault(); onAction('close'); }}
    >
      <div 
        className="fixed z-50 bg-white border border-[#141310]/15 shadow-2xl rounded-lg py-1 min-w-[185px] text-xs text-[#141310] font-sans"
        style={{ top: posY, left: posX }}
        onClick={e => e.stopPropagation()}
      >
        {!isFolder && (
          <button onClick={() => onAction('view')} className="w-full text-left px-3 py-1.5 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors">
            <Eye size={13} className="text-[#141310]/60" />
            <span>View</span>
          </button>
        )}
        <button onClick={() => onAction('explorer')} className="w-full text-left px-3 py-1.5 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors">
          <ExternalLink size={13} className="text-[#141310]/60" />
          <span>Go to Explorer</span>
        </button>
        <div className="my-1 border-t border-[#141310]/10"></div>
        <button onClick={() => onAction('copy_path')} className="w-full text-left px-3 py-1.5 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors">
          <Copy size={13} className="text-[#141310]/60" />
          <span>Copy Path</span>
        </button>
        <button onClick={() => onAction('copy_relative')} className="w-full text-left px-3 py-1.5 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors">
          <Copy size={13} className="text-[#141310]/60" />
          <span>Copy Relative Path</span>
        </button>
        <div className="my-1 border-t border-[#141310]/10"></div>
        <button onClick={() => onAction('history')} className="w-full text-left px-3 py-1.5 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors">
          <History size={13} className="text-[#141310]/60" />
          <span>Show Git History</span>
        </button>
        <div className="my-1 border-t border-[#141310]/10"></div>
        <button onClick={() => onAction('rename')} className="w-full text-left px-3 py-1.5 hover:bg-[#141310]/5 flex items-center space-x-2 transition-colors">
          <Edit2 size={13} className="text-[#141310]/60" />
          <span>Rename</span>
        </button>
        <button onClick={() => onAction('delete')} className="w-full text-left px-3 py-1.5 hover:bg-[#c8321e]/10 text-[#c8321e] flex items-center space-x-2 transition-colors">
          <Trash2 size={13} className="text-[#c8321e]" />
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
    <div className="fixed inset-0 bg-[#141310]/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded shadow-xl p-4 w-full max-w-sm border border-[#141310]/10 font-sans">
        <h3 className="font-semibold text-[#141310] mb-2 text-sm">Delete {isFolder ? 'Folder' : 'File'}</h3>
        <p className="text-xs text-[#141310]/70 mb-4">Are you sure you want to delete <span className="font-mono bg-[#f4f1ea] px-1 rounded">{fileName}</span>? This action cannot be undone.</p>
        <div className="flex justify-end space-x-2">
          <button 
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-[#141310] hover:bg-[#141310]/5 rounded transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="px-3 py-1.5 text-xs bg-[#c8321e] text-white rounded hover:bg-[#c8321e]/90 transition-colors flex items-center"
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
    <div className="fixed inset-0 bg-[#141310]/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <form onSubmit={onSubmit} className="bg-white rounded shadow-xl p-4 w-full max-w-sm border border-[#141310]/10 font-sans">
        <h3 className="font-semibold text-[#141310] mb-3 text-sm">Rename {isFolder ? 'Folder' : 'File'}</h3>
        <input 
          autoFocus
          type="text" 
          value={renameValue}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-[#faf8f3] border border-[#141310]/20 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-[#141310] mb-4"
        />
        <div className="flex justify-end space-x-2">
          <button 
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-[#141310] hover:bg-[#141310]/5 rounded transition-colors"
            disabled={isLoading}
          >
            Cancel
          </button>
          <button 
            type="submit"
            className="px-3 py-1.5 text-xs bg-[#141310] text-white rounded hover:bg-[#141310]/90 transition-colors flex items-center"
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
    <div className="fixed inset-0 bg-[#141310]/20 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl border border-[#141310]/10 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-[#141310]/10">
          <h3 className="text-sm font-semibold text-[#141310] flex items-center space-x-2">
            <History size={16} className="text-[#141310]/60" />
            <span>Git History: <span className="font-mono font-normal opacity-80">{filePath}</span></span>
          </h3>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-[#141310]/5 rounded text-[#141310]/60 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto bg-[#faf8f3] p-2">
          {fetcherState === 'idle' ? (
            fetcherData?.type === 'history' ? (
              fetcherData.data.length > 0 ? (
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="bg-[#f4f1ea] sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-[#141310]/60 rounded-tl">Description</th>
                      <th className="px-3 py-2 font-semibold text-[#141310]/60 w-32">Date</th>
                      <th className="px-3 py-2 font-semibold text-[#141310]/60 w-32">Author</th>
                      <th className="px-3 py-2 font-semibold text-[#141310]/60 w-24 text-right rounded-tr">Commit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#141310]/5">
                    {fetcherData.data.map((row: any, i: number) => (
                      <tr key={i} className="hover:bg-white transition-colors group bg-[#faf8f3]">
                        <td className="px-3 py-1.5 text-[#141310]">
                          {row.message ? <span className="font-medium">{row.message}</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-[#141310]/50 whitespace-nowrap">
                          {row.time}
                        </td>
                        <td className="px-3 py-1.5 text-[#141310]/70 whitespace-nowrap truncate max-w-[120px]">
                          {row.author}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {row.hash ? <span className="font-mono text-[#141310]/40 group-hover:text-[#141310] transition-colors">{row.hash}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-[#141310]/40 font-mono text-xs">No commit history found for this file.</div>
              )
            ) : fetcherData?.error ? (
              <div className="p-8 text-center text-[#c8321e] font-mono text-xs">{fetcherData.error}</div>
            ) : (
              <div className="p-8 text-center text-[#141310]/40 font-mono text-xs">Loading history...</div>
            )
          ) : (
            <div className="p-8 text-center text-[#141310]/40 font-mono text-xs flex items-center justify-center space-x-2">
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
