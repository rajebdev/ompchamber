import type { TargetedMouseEvent } from 'preact';
import { Check, Copy } from 'lucide-preact';
import { copyToClipboard } from '@/client/hooks/ui/clipboard';
import { useCopyFlag } from '@/client/hooks/ui/copy-flag';

export interface CopyButtonProps {
  /** Text written to the clipboard. */
  text: string;
  /** Full button className. Defaults to the shared compact toolbar style. */
  className?: string;
  /** Copy (idle) icon size. Default 10. */
  iconSize?: number;
  /** Optional className applied to the idle Copy icon (e.g. a colour). */
  iconClassName?: string;
  /** Optional className applied to the success Check icon (default text-success). */
  copiedIconClassName?: string;
  /** Visible idle label. Omit for an icon-only button. */
  label?: string;
  /** Visible label while copied. Default 'Copied'. */
  copiedLabel?: string;
  /** Wrap the label text in a <span> (call sites that style the label). */
  wrapLabel?: boolean;
  /** className for the copied label span (requires wrapLabel). */
  copiedLabelClassName?: string;
  /** Native title / tooltip. */
  title?: string;
  /** Extra click handler run before copying (e.g. stopPropagation). */
  onClick?: (event: TargetedMouseEvent<HTMLButtonElement>) => void;
  /** Copied-state reset delay in ms. Default 2000. */
  resetMs?: number;
}

const DEFAULT_CLASSNAME =
  'flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink/45 transition-colors hover:bg-ink/5 hover:text-ink';

/** Clipboard copy control: idle Copy icon → success Check, with a timed revert. */
export function CopyButton({
  text,
  className = DEFAULT_CLASSNAME,
  iconSize = 10,
  iconClassName,
  copiedIconClassName = 'text-success',
  label,
  copiedLabel = 'Copied',
  wrapLabel = false,
  copiedLabelClassName,
  title,
  onClick,
  resetMs = 2000,
}: CopyButtonProps) {
  const { copied, flagCopied } = useCopyFlag(resetMs);

  const handleClick = async (event: TargetedMouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) flagCopied();
  };

  const labelText = copied ? copiedLabel : label;

  return (
    <button type="button" onClick={handleClick} className={className} title={title}>
      {copied ? (
        <Check size={iconSize} className={copiedIconClassName} />
      ) : (
        <Copy size={iconSize} className={iconClassName} />
      )}
      {labelText !== undefined &&
        (wrapLabel ? <span className={copied ? copiedLabelClassName : undefined}>{labelText}</span> : labelText)}
    </button>
  );
}
