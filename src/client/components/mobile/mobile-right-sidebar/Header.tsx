import { ArrowLeft, Check, Copy, Download, Eye, EyeOff, WrapText, ZoomIn, ZoomOut } from 'lucide-preact';
import { FileIcon } from '@/client/components/common/file-icon';

interface EditorHeaderProps {
  fileName: string;
  /** Markdown files can toggle between source and rendered preview. */
  isMarkdown: boolean;
  isPreview: boolean;
  wordWrap: boolean;
  copied: boolean;
  onClose: () => void;
  onTogglePreview: () => void;
  onToggleWrap: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onCopy: () => void;
  onDownload: () => void;
}

/** Mobile editor top bar: back/close, file identity, and the file actions. */
export function EditorHeader({
  fileName,
  isMarkdown,
  isPreview,
  wordWrap,
  copied,
  onClose,
  onTogglePreview,
  onToggleWrap,
  onZoomOut,
  onZoomIn,
  onCopy,
  onDownload,
}: EditorHeaderProps) {
  return (
    <header
      className="bg-canvas border-b border-ink/10 flex items-center justify-between px-3 flex-shrink-0"
      style={{
        height: 'calc(3rem + env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="flex items-center space-x-2 min-w-0 pr-2">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-ink/10 text-ink transition-colors active:scale-90 flex-shrink-0 cursor-pointer"
          title="Close editor"
          aria-label="Close editor"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>

        <div className="flex items-center space-x-1.5 truncate">
          <FileIcon name={fileName} size={15} className="flex-shrink-0" />
          <span className="font-semibold text-xs text-ink truncate">{fileName}</span>
        </div>
      </div>

      <div className="flex items-center space-x-1 text-ink/70 flex-shrink-0">
        {isMarkdown && (
          <button
            type="button"
            onClick={onTogglePreview}
            className={`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer ${isPreview ? 'bg-ink text-canvas' : ''}`}
            title={isPreview ? 'View code' : 'Preview markdown'}
          >
            {isPreview ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}

        <button
          type="button"
          onClick={onToggleWrap}
          className={`p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer ${wordWrap ? 'text-ink' : ''}`}
          title="Toggle word wrap"
        >
          <WrapText size={15} />
        </button>

        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer"
          title="Decrease font size"
        >
          <ZoomOut size={15} />
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer"
          title="Increase font size"
        >
          <ZoomIn size={15} />
        </button>

        <button
          type="button"
          onClick={onCopy}
          className="p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer"
          title="Copy content"
        >
          {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
        </button>

        <button
          type="button"
          onClick={onDownload}
          className="p-1.5 rounded hover:bg-ink/10 transition-colors cursor-pointer"
          title="Download file"
        >
          <Download size={15} />
        </button>
      </div>
    </header>
  );
}
