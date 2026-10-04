import { useRef } from 'preact/hooks';
import type { ChangeEvent } from 'preact/compat';
import { File as FileIcon, Paperclip, X } from 'lucide-preact';
import type { Attachment } from '@/shared/types';
import { attachmentName } from '@/shared/lib/chat/attachments';
import { ModeToggles } from '@/client/components/workspace/chat-timeline/chat-input/ModeToggles';
import type { ComposerModes } from '@/client/components/workspace/chat-timeline/chat-input/modes-props';

interface AttachmentToolbarProps {
  attachments: Attachment[];
  onFilesSelected: (files: File[]) => void;
  onRemove: (id: string) => void;
  /**
   * Plan/Goal toggles, hosted HERE on a phone and in the bottom toolbar on a
   * desktop. Both are supplied together or not at all: the row owns the
   * toggles only when it was handed the slice AND a way to open the modal.
   */
  modes?: ComposerModes;
  onOpenGoal?: () => void;
}

export function AttachmentToolbar({ attachments, onFilesSelected, onRemove, modes, onOpenGoal }: AttachmentToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.files && e.currentTarget.files.length > 0) {
      onFilesSelected(Array.from(e.currentTarget.files));
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
            <span className="truncate max-w-[120px] font-mono text-[10px] text-ink/80">{attachmentName(att)}</span>
            <button
              onClick={() => onRemove(att.id)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 text-ink/40 hover:text-error hover:bg-error/10 rounded transition-colors"
              title="Remove attachment"
            >
              <X size={10} />
            </button>
          </div>
        ))}

        {/* Plan/Goal sit HERE on a phone, not in the bottom row: that row is a
            single line whose left cluster (model, thinking, access) already
            fills it, so a third group pushed the voice button under the model
            label. `ml-auto` keeps them on the row's trailing edge, away from
            the paperclip and any attachment chips. */}
        {modes && onOpenGoal && (
          <div className="ml-auto flex-shrink-0">
            <ModeToggles
              plan={modes.plan}
              goal={modes.goalOpen}
              goalRecord={modes.goalRecord}
              pending={modes.pending}
              onTogglePlan={modes.onTogglePlan}
              onOpenGoal={onOpenGoal}
              planAvailable={modes.planAvailable}
            />
          </div>
        )}
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
