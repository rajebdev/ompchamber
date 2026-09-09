export type OutputFormat = 'markdown' | 'html' | 'json' | 'text';

const MARKDOWN_RE = /(^|\n)\s*(#{1,6}\s|```|`[^`\n]+`|>|[-*+]\s|\d+\.\s|\[[^\]]+\]\([^)]+\)|\|.*\|)/;

/** Deteksi format output tool: markdown / json / html / plain text.
 *  Urutan penting: fenced code block (```) SELALU markdown — HTML/JSON di
 *  dalamnya tidak boleh di-detect sebagai html/json mentah. */
export function detectOutputFormat(text: string): OutputFormat {
  if (!text) return 'text';
  const trimmed = text.trim();
  if (!trimmed) return 'text';

  // 1. Fenced code block → markdown, apapun isinya (HTML/JSON di dalamnya aman)
  if (trimmed.includes('```')) return 'markdown';

  // 2. Markdown: heading, inline code, blockquote, list, link, table
  if (MARKDOWN_RE.test(trimmed)) return 'markdown';

  // 3. JSON: object/array valid (bukan string/number primitif)
  if (trimmed.length < 100_000 && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === 'object') return 'json';
    } catch {
      // bukan JSON valid — lanjut
    }
  }

  // 4. HTML: tag pembuka lengkap di awal, atau pasangan tag lengkap
  if (/^<(?:!doctype|html|div|section|article|table|ul|ol|h[1-6]|p|pre|code|span|a|b|strong|em|i|blockquote|form|button|input|img|nav|header|footer|main|aside|figure|figcaption|details|summary|label|select|option|textarea|video|audio|iframe|script|style|link|meta|title|body|head)\b/i.test(trimmed)) {
    return 'html';
  }
  if (/<[a-z][a-z0-9-]*\s[^>]*>[\s\S]*<\/[a-z][a-z0-9-]*>/i.test(trimmed) && /<\/[a-z][a-z0-9-]*>/i.test(trimmed)) {
    return 'html';
  }

  return 'text';
}
