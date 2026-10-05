/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The panel UI kit.
 *
 * Components a panel draws with, styled by the CSS variables the host's palette
 * drives. They exist so panels look like the chamber and like each other without
 * each one re-deriving the same markup — a second copy of a labelled field is
 * the first place two panels drift apart.
 *
 * Class names are prefixed `oc-` and the stylesheet ships from the same package
 * (`@ompchamber/ui/styles.css`), so a plugin imports one thing and gets both.
 * Colours come from `var(--oc-*)`, which the host does NOT set: the frame has an
 * opaque origin, so the palette arrives as `data-theme` on `<html>` and the
 * stylesheet maps it. That is why this package carries CSS rather than reading
 * the app's.
 */

import type { ComponentChildren } from 'preact';

interface PanelProps {
  title: string;
  children: ComponentChildren;
}

/** A panel's outer chrome: a title bar over a scrolling body. */
export function Panel({ title, children }: PanelProps) {
  return (
    <div class="oc-panel">
      <header class="oc-panel-header">
        <h1 class="oc-panel-title">{title}</h1>
      </header>
      <div class="oc-panel-body">{children}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  /** Shown under the value, for a path or an id that would otherwise wrap badly. */
  hint?: string;
}

/** One labelled fact. The label is a micro-header, the value is machine text. */
export function Field({ label, value, hint }: FieldProps) {
  return (
    <div class="oc-field">
      <span class="oc-label">{label}</span>
      <span class="oc-value" title={value}>
        {value}
      </span>
      {hint ? <span class="oc-hint">{hint}</span> : null}
    </div>
  );
}

/** A stack of `Field`s. */
export function FieldList({ children }: { children: ComponentChildren }) {
  return <div class="oc-fields">{children}</div>;
}

interface TextAreaFieldProps {
  id?: string;
  label: string;
  placeholder?: string;
  /** `null` while the stored value has not been read yet. */
  value: string | null;
  hint?: string;
  onInput: (next: string) => void;
}

/**
 * A labelled textarea.
 *
 * Disabled while `value` is null — that is "the read has not answered yet", and
 * an editable box there would let the user type into a field whose contents are
 * about to be replaced by the stored value.
 */
export function TextAreaField({ id, label, placeholder, value, hint, onInput }: TextAreaFieldProps) {
  return (
    <div class="oc-textarea-field">
      <label class="oc-label" for={id}>
        {label}
      </label>
      <textarea
        id={id}
        class="oc-textarea"
        placeholder={placeholder}
        value={value ?? ''}
        disabled={value === null}
        onInput={(event) => onInput(event.currentTarget.value)}
      />
      {hint ? <span class="oc-hint">{hint}</span> : null}
    </div>
  );
}

interface ButtonProps {
  children: ComponentChildren;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary';
}

/** A button. `primary` is the one action a panel wants the user to take. */
export function Button({ children, onClick, disabled, variant = 'default' }: ButtonProps) {
  return (
    <button type="button" class={`oc-button oc-button-${variant}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Centred placeholder for a panel with nothing to show. */
export function Empty({ children }: { children: ComponentChildren }) {
  return <p class="oc-empty">{children}</p>;
}

/** A message. `error` is the only chroma a panel should use. */
export function Note({ children, tone = 'default' }: { children: ComponentChildren; tone?: 'default' | 'error' }) {
  return <p class={`oc-note oc-note-${tone}`}>{children}</p>;
}
