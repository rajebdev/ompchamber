import { Check, Copy, Download, Eye, EyeOff, Maximize, Save, WrapText, ZoomIn, ZoomOut } from 'lucide-preact';

interface EditorToolbarProps {
  path: string;
  saveStatus: 'idle' | 'saving' | 'saved';
  wordWrap: boolean;
  isMd: boolean;
  isPreview: boolean;
  onSave: () => void;
  onTogglePreview: () => void;
  onToggleWordWrap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onToggleMaximize: () => void;
}

export function EditorToolbar({
  path,
  saveStatus,
  wordWrap,
  isMd,
  isPreview,
  onSave,
  onTogglePreview,
  onToggleWordWrap,
  onZoomIn,
  onZoomOut,
  onCopy,
  onDownload,
  onToggleMaximize,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-ink/10 bg-paper">
      {/* Left status */}
      <div className="flex items-center space-x-2 text-xs font-mono text-ink/40">
        <span className="truncate max-w-[300px]" title={path}>{path}</span>
      </div>

      {/* Right actions */}
      <div className="flex items-center space-x-3 text-ink/40">
        <div className="flex items-center pr-3 border-r border-ink/10">
          <button
            type="button"
            onClick={onSave}
            className="flex items-center justify-center rounded hover:bg-ink/5 transition-colors"
            title="Save file (Ctrl+S)"
          >
            {saveStatus === 'saving' ? (
              <Save size={14} className="text-amber-500 animate-pulse" />
            ) : saveStatus === 'saved' ? (
              <Check size={14} className="text-success" />
            ) : (
              <Save size={14} className="hover:text-ink cursor-pointer" />
            )}
          </button>
        </div>

        {isMd && (
          <div onClick={onTogglePreview} className="flex items-center pr-3 border-r border-ink/10">
            {isPreview ? (
              <EyeOff size={14} className="hover:text-ink cursor-pointer" />
            ) : (
              <Eye size={14} className="hover:text-ink cursor-pointer" />
            )}
          </div>
        )}

        <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
          <WrapText size={14} className={`cursor-pointer ${wordWrap ? 'text-ink' : 'hover:text-ink'}`} onClick={onToggleWordWrap} />
        </div>

        <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
          <ZoomOut size={14} className="hover:text-ink cursor-pointer" onClick={onZoomOut} />
          <ZoomIn size={14} className="hover:text-ink cursor-pointer" onClick={onZoomIn} />
        </div>

        <div className="flex items-center space-x-2 pr-3 border-r border-ink/10">
          <Copy size={14} className="hover:text-ink cursor-pointer" onClick={onCopy} />
          <Download size={14} className="hover:text-ink cursor-pointer" onClick={onDownload} />
        </div>

        <div className="flex items-center pl-1">
          <Maximize size={14} className="hover:text-ink cursor-pointer" onClick={onToggleMaximize} />
        </div>
      </div>
    </div>
  );
}
