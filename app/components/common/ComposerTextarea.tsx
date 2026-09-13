import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent, ReactElement } from 'react';
import type { SettingsState } from '@/types';
import { useComposerTrigger } from '@/hooks/chat/composer';
import { useOnClickOutside } from '@/hooks/ui/on-click-outside';
import { ComposerPicker } from '@/components/common/ComposerPicker';

type KeybindingSetting = SettingsState['keybindingSend'];

export interface ComposerTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (options?: { steering?: boolean }) => void;
  disabled?: boolean;
  appSettings?: Partial<
    Pick<SettingsState, 'keybindingSend' | 'keybindingNewLine' | 'keybindingSteering'>
  >;
  placeholder?: string;
  className?: string;
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  rootPath?: string | null;
}

export function ComposerTextarea({
  value,
  onChange,
  onSend,
  disabled = false,
  appSettings,
  placeholder,
  className,
  onPaste,
  rootPath,
}: ComposerTextareaProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const composer = useComposerTrigger({ value, setValue: onChange, textareaRef, disabled, rootPath });

  useOnClickOutside(wrapperRef, composer.close);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // The autocomplete owns Arrow/Enter/Tab/Escape while it is open.
    if (composer.handleKeyDown(e)) return;
    if (e.key !== 'Enter') return;

    const sendBinding = appSettings?.keybindingSend || 'Enter';
    const newLineBinding = appSettings?.keybindingNewLine || 'Shift + Enter';
    const steeringBinding = appSettings?.keybindingSteering || 'Ctrl / Cmd + Enter';

    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
    const isShift = e.shiftKey;

    const checkBinding = (binding: KeybindingSetting) => {
      if (binding === 'Enter' && !isShift && !isCtrlOrCmd && !e.altKey) return true;
      if (binding === 'Shift + Enter' && isShift && !isCtrlOrCmd && !e.altKey) return true;
      if (binding === 'Ctrl / Cmd + Enter' && !isShift && isCtrlOrCmd && !e.altKey) return true;
      return false;
    };

    if (checkBinding(steeringBinding)) {
      e.preventDefault();
      if (!disabled) {
        onSend({ steering: true });
      }
    } else if (checkBinding(sendBinding)) {
      e.preventDefault();
      if (!disabled) onSend();
    } else if (checkBinding(newLineBinding)) {
      // Allow default behavior (new line)
    } else {
      // Prevent default for other Enter combinations to avoid unwanted new lines
      e.preventDefault();
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={composer.handleChange}
        onCompositionStart={composer.handleCompositionStart}
        onCompositionEnd={composer.handleCompositionEnd}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        aria-autocomplete="list"
        aria-expanded={composer.isOpen}
        aria-controls={composer.listboxId}
        aria-haspopup="listbox"
        aria-activedescendant={
          composer.isOpen && composer.matches.length > 0
            ? composer.optionId(composer.activeIndex)
            : undefined
        }
      />

      <ComposerPicker
        open={composer.isOpen}
        kind={composer.trigger?.kind ?? 'mention'}
        items={composer.matches}
        activeIndex={composer.activeIndex}
        loading={composer.loading}
        error={composer.error}
        listboxId={composer.listboxId}
        optionId={composer.optionId}
        onSelect={composer.selectItem}
        onHover={composer.setActiveIndex}
      />
    </div>
  );
}
