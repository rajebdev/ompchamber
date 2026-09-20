import type { FunctionComponent } from 'preact/compat';
import type { ComponentChildren } from 'preact';

interface LoadingStateProps {
  /**
   * `full` fills a whole pane (screens that own the viewport);
   * `fill` flexes inside an already-split column (the behavior editor).
   */
  variant?: 'full' | 'fill';
  children: ComponentChildren;
}

const VARIANT_CLASSES: Record<'full' | 'fill', string> = {
  full: 'flex h-full w-full items-center justify-center text-xs text-ink/40',
  fill: 'flex-1 flex items-center justify-center text-xs text-ink/40',
};

/** Shared loading placeholder for the settings screens. */
export const LoadingState: FunctionComponent<LoadingStateProps> = ({
  variant = 'full',
  children,
}) => <div className={VARIANT_CLASSES[variant]}>{children}</div>;
