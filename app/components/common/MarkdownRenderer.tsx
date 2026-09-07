/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Markdown renderer for the chat timeline and editor previews.
 *
 * Pipeline: remend (heal streaming) → marked (GFM, autolink, KaTeX) →
 * DOMPurify (sanitize). Renders as sanitized HTML. Raw HTML in the source is
 * escaped by DOMPurify (default profile) rather than executed. A single
 * delegated click handler manages the per-block "Copy" buttons.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown/marked';
import { sanitizeHtml } from '@/lib/markdown/sanitize';
import { copyToClipboard } from '@/hooks/useClipboard';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    if (!content) return '';
    const rendered = renderMarkdown(content);
    return sanitizeHtml(rendered);
  }, [content]);

  const handleContainerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button.code-copy-float');
    if (!target) return;
    const text = target.dataset.copy ?? '';
    if (!text) return;
    e.preventDefault();
    e.stopPropagation();
    void copyToClipboard(text).then((ok) => {
      if (!ok) return;
      target.setAttribute('data-copied', 'true');
      target.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      setTimeout(() => {
        target.removeAttribute('data-copied');
        target.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
      }, 2000);
    });
  }, []);

  if (!content) return null;

  return (
    <div
      ref={containerRef}
      className={`prose-content text-[13px] text-ink leading-relaxed select-text ${className}`}
      onClick={handleContainerClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
