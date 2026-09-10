import { useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Paperclip, X, File as FileIcon } from 'lucide-react';
import type { Attachment } from '@/types';

interface AttachmentToolbarProps {
  attachments: Attachment[];
  onFilesSelected: (files: File[]) => void;
  onRemove: (id: string) => void;
}

export function AttachmentToolbar({ attachments, onFilesSelected, onRemove }: AttachmentToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <div className="flex items-center flex-wrap gap-1.5 px-3 py-2 border-b border-ink/5 text-ink/60">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center hover:bg-ink/5 p-1 rounded transition-colors text-ink/60 hover:text-ink shrink-0"
          title="Attach file or image"
        >
          <Paperclip size={14} />
        </button>

        {attachments.map(att => (
          <div key={att.id} className="relative flex items-center bg-canvas border border-ink/10 rounded-md p-0.5 pr-6 text-xs shadow-sm group">
            {att.preview ? (
              <img src={att.preview} alt="preview" className="w-6 h-6 object-cover rounded-sm mr-1.5 border border-ink/5" />
            ) : (
              <div className="w-6 h-6 flex items-center justify-center bg-ink/5 rounded-sm mr-1.5 text-ink/60">
                <FileIcon size={12} />
              </div>
            )}
            <span className="truncate max-w-[120px] font-mono text-[10px] text-ink/80">{att.file.name}</span>
            <button
              onClick={() => onRemove(att.id)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-ink/40 hover:text-error hover:bg-error/10 rounded transition-colors"
              title="Remove attachment"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      <input
        type="file"
        multiple
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileSelect}
      />
    </>
  );
}
