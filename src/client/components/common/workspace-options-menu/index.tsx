/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Workspace options menu body shared by the desktop category header and the
 * mobile category item: pin/unpin, delete, and the inline delete confirmation.
 *
 * Only the body is shared — each sidebar owns its own absolutely-positioned
 * container (different widths, radii, and padding) and its trigger button, so
 * the two shells stay pixel-identical while the actions and labels have one
 * source of truth.
 */

import { Pin, PinOff, Trash2 } from 'lucide-preact';

interface WorkspaceOptionsMenuProps {
  variant: 'desktop' | 'mobile';
  isPinned?: boolean;
  confirmDelete: boolean;
  onPin: () => void;
  onDelete: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
}

export function WorkspaceOptionsMenu({
  variant,
  isPinned = false,
  confirmDelete,
  onPin,
  onDelete,
  onRequestDelete,
  onCancelDelete,
}: WorkspaceOptionsMenuProps) {
  if (variant === 'mobile') {
    return confirmDelete ? (
      <>
        <div className="px-3 py-2 text-ink/80 font-medium">Delete workspace?</div>
        <button type="button" onClick={onDelete} className="w-full text-left px-3 py-2 hover:bg-error/10 text-error flex items-center space-x-2">
          <Trash2 size={13} />
          <span>Yes, delete</span>
        </button>
        <button type="button" onClick={onCancelDelete} className="w-full text-left px-3 py-2 hover:bg-ink/5 text-ink/70">
          Cancel
        </button>
      </>
    ) : (
      <>
        <button type="button" onClick={onPin} className="w-full text-left px-3 py-2 hover:bg-ink/5 text-ink/80 flex items-center space-x-2">
          {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
          <span>{isPinned ? 'Unpin Workspace' : 'Pin Workspace'}</span>
        </button>
        <button type="button" onClick={onRequestDelete} className="w-full text-left px-3 py-2 hover:bg-error/10 text-error flex items-center space-x-2">
          <Trash2 size={13} />
          <span>Delete Workspace</span>
        </button>
      </>
    );
  }

  return confirmDelete ? (
    <>
      <div className="px-3 py-1.5 text-xs text-ink/80 font-medium">Delete workspace?</div>
      <div className="px-3 py-1.5 hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-error" onClick={onDelete}>
        <Trash2 size={12} /><span>Yes, delete</span>
      </div>
      <div className="px-3 py-1.5 hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-ink/70" onClick={onCancelDelete}>
        <span>Cancel</span>
      </div>
    </>
  ) : (
    <>
      <div className="px-3 py-1.5 hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-ink/80" onClick={onPin}>
        {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
        <span>{isPinned ? 'Unpin Workspace' : 'Pin Workspace'}</span>
      </div>
      <div className="px-3 py-1.5 hover:bg-ink/5 cursor-pointer flex items-center space-x-2 text-error" onClick={onRequestDelete}>
        <Trash2 size={12} /><span>Delete Workspace</span>
      </div>
    </>
  );
}
