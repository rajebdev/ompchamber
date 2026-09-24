import { useRef } from 'preact/hooks';
import type { ClipboardEvent, KeyboardEvent, ReactElement } from 'preact/compat';
import type { SettingsState } from '@/shared/types';
import { useComposerTrigger } from '@/client/hooks/chat/composer';
import { useOnClickOutside } from '@/client/hooks/ui/on-click-outside';
import { ComposerPicker } from '@/client/components/common/ComposerPicker';

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
  /**
   * Whether the `@` / `/` / `!` / `#` autocomplete runs. Off for a composer with
   * nothing to complete against — the side-question form has no file tree, no
   * commands and no skills, and an `@` mention left in its text would reach the
   * model as a literal no prompt builder translates.
   */
  enablePicker?: boolean;
  /**
   * `mobile` makes a bare Enter insert a newline instead of sending: phone
   * keyboards have no Shift key, so the configured Enter-to-send binding would
   * leave no way to write a multi-line prompt. Modifier bindings
   * (Ctrl/Cmd + Enter) still work with a hardware keyboard; the send button is
   * the primary affordance on touch.
   */
  variant?: 'desktop' | 'mobile';
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
  enablePicker = true,
  variant = 'desktop',
}: ComposerTextareaProps): ReactElement {
  const isMobile = variant === 'mobile';
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const composer = useComposerTrigger({ value, setValue: onChange, textareaRef, disabled, rootPath, enabled: enablePicker });

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

    // A bare Enter on touch inserts a newline (see `variant`); every modified
    // combination keeps its configured meaning.
    const bareEnter = !isShift && !isCtrlOrCmd && !e.altKey;
    if (isMobile && bareEnter) return;

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
        enterkeyhint={isMobile ? 'enter' : undefined}
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
        phase={composer.trigger?.phase ?? 'name'}
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
