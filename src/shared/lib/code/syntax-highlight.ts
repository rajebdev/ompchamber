import type { HighlighterCore } from 'shiki/core';

import { escapeCode, getHighlighterSync, requestLanguage } from '@/shared/lib/code/highlighter';
import { SHIKI_THEMES } from '@/shared/lib/code/shiki-themes';

/** Map file extension to Shiki language id */
export function getLanguageFromPath(filePath?: string): string {
  if (!filePath) return 'javascript';
  const clean = filePath.split('?')[0].split('#')[0].replace(/:\d+(?:-\d+)?$/, '');
  const ext = clean.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': return 'typescript';
    case 'tsx': return 'tsx';
    case 'js':
    case 'mjs':
    case 'cjs': return 'javascript';
    case 'jsx': return 'jsx';
    case 'json': return 'json';
    case 'md':
    case 'markdown': return 'markdown';
    case 'css': return 'css';
    case 'sh':
    case 'bash':
    case 'zsh': return 'bash';
    case 'diff':
    case 'patch': return 'diff';
    case 'yaml':
    case 'yml': return 'yaml';
    case 'html': return 'html';
    case 'svg':
    case 'xml': return 'xml';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'sql': return 'sql';
    case 'toml': return 'toml';
    case 'java': return 'java';
    case 'c':
    case 'h': return 'c';
    case 'cpp':
    case 'cc':
    case 'hpp': return 'cpp';
    case 'cs': return 'csharp';
    case 'rb': return 'ruby';
    case 'php': return 'php';
    case 'kt':
    case 'kts': return 'kotlin';
    case 'swift': return 'swift';
    case 'scala': return 'scala';
    case 'lua': return 'lua';
    case 'pl': return 'perl';
    case 'dockerfile': return 'dockerfile';
    case 'ini':
    case 'cfg':
    case 'conf': return 'ini';
    case 'properties': return 'properties';
    case 'env': return 'bash';
    case 'zig': return 'zig';
    case 'ex':
    case 'exs': return 'elixir';
    case 'dart': return 'dart';
    case 'ml':
    case 'mli': return 'ocaml';
    case 'hs': return 'haskell';
    case 'nix': return 'nix';
    case 'tf':
    case 'tfvars':
    case 'hcl': return 'hcl';
    case 'graphql':
    case 'gql': return 'graphql';
    case 'sol': return 'solidity';
    case 'r': return 'r';
    case 'jl': return 'julia';
    case 'erl': return 'erlang';
    case 'clj':
    case 'cljs':
    case 'cljc':
    case 'edn': return 'clojure';
    case 'scm':
    case 'ss': return 'scheme';
    case 'rkt': return 'racket';
    case 'proto': return 'protobuf';
    case 'makefile':
    case 'mk': return 'makefile';
    case 'ps1':
    case 'psm1': return 'powershell';
    case 'json5': return 'json5';
    case 'less': return 'less';
    case 'scss': return 'scss';
    case 'sass': return 'sass';
    case 'styl': return 'stylus';
    case 'vue': return 'vue';
    case 'svelte': return 'svelte';
    case 'astro': return 'astro';
    // `.m` is genuinely ambiguous (Objective-C vs MATLAB); map to Objective-C,
    // the common editor default.
    case 'mm':
    case 'm': return 'objective-c';
    case 'groovy':
    case 'gvy':
    case 'gradle': return 'groovy';
    default: return 'javascript';
  }
}

/** Check if a string looks like code or structured programming text */
export function isCodeLike(text: string): boolean {
  if (!text || text.length < 5) return false;
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // not valid JSON
    }
  }

  const codePatterns = [
    /^(?:import|export)\s+.+from\s+['"][^'"]+['"]/m,
    /^(?:const|let|var|function|class|interface|type|enum)\s+[A-Za-z0-9_$]+/m,
    /(?:=>|\bconsole\.(?:log|error|warn)|return\s+|async\s+function)/,
    /^\s*\d+:\s*(?:import|const|let|function|\/\/|\/\*|<|[A-Za-z])/m,
    /^\s*\[[A-Za-z0-9_./-]+\.[a-zA-Z0-9]+\]\s*\n\d+:/m,
  ];
  return codePatterns.some((pattern) => pattern.test(trimmed));
}

/**
 * Pick a language that can be tokenized *synchronously* right now. A grammar
 * that has not arrived yet is requested here (fire-and-forget) and the caller
 * falls back to javascript for this pass — `onLanguageReady` re-runs the
 * highlight once it lands. `getLoadedLanguages()` stays the authority for
 * embedded/alias names that `LANG_LOADERS` does not list by id.
 */
function resolveReadyLang(hl: HighlighterCore, language: string): string {
  if (requestLanguage(language) || hl.getLoadedLanguages().includes(language)) return language;
  return 'javascript';
}

/** Syntax highlight code string safely with fallback */
export function highlightCode(code: string, language = 'javascript'): string {
  if (!code) return '';
  const hl = getHighlighterSync();
  if (!hl) return escapeCode(code);
  const lang = resolveReadyLang(hl, language);
  try {
    return `<span class="shiki">${hl.codeToHtml(code, {
      lang,
      themes: SHIKI_THEMES,
      defaultColor: false,
      structure: 'inline',
    })}</span>`;
  } catch {
    return escapeCode(code);
  }
}

export interface JsonDetectionResult {
  isValid: boolean;
  data?: any;
  pretty?: string;
  linesCount?: number;
}

/** Check if input is valid JSON (or object/array) and return pretty-printed string with line count */
export function tryParseJson(input: unknown): JsonDetectionResult {
  if (input === null || input === undefined) return { isValid: false };

  // 1. If already an object or array (and not primitive)
  if (typeof input === 'object') {
    try {
      const pretty = JSON.stringify(input, null, 2);
      const linesCount = pretty.split('\n').length;
      return { isValid: true, data: input, pretty, linesCount };
    } catch {
      return { isValid: false };
    }
  }

  if (typeof input !== 'string') return { isValid: false };

  let text = input.trim();
  if (!text) return { isValid: false };

  // 2. If wrapped in markdown code fence ```json ... ``` or ``` ... ```
  const codeBlockMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  // 3. Strip common prefixes like "User selected: { ... }" or "User response: { ... }"
  const prefixMatch = text.match(/^(?:user\s+(?:selected|responded|answered|response)|response|result|output):\s*([\s\S]+)$/i);
  if (prefixMatch) {
    const candidate = prefixMatch[1].trim();
    if ((candidate.startsWith('{') && candidate.endsWith('}')) || (candidate.startsWith('[') && candidate.endsWith(']'))) {
      text = candidate;
    }
  }

  // 4. Handle double-stringified / quoted JSON strings, e.g. "\"{\\\"a\\\":1}\"" or '"{...}"'
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    try {
      const unquoted = JSON.parse(text);
      if (typeof unquoted === 'object' && unquoted !== null) {
        const pretty = JSON.stringify(unquoted, null, 2);
        return { isValid: true, data: unquoted, pretty, linesCount: pretty.split('\n').length };
      }
      if (typeof unquoted === 'string') {
        const nested = tryParseJson(unquoted);
        if (nested.isValid) return nested;
      }
    } catch {
      // not double-quoted JSON, continue
    }
  }

  // 5. Check if starts with { or [
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const data = JSON.parse(text);
      if (data !== null && typeof data === 'object') {
        const pretty = JSON.stringify(data, null, 2);
        const linesCount = pretty.split('\n').length;
        return { isValid: true, data, pretty, linesCount };
      }
    } catch {
      // not direct JSON
    }
  }

  // 6. Look for embedded JSON object/array within text: e.g. "Response: {...}"
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.slice(firstBrace, lastBrace + 1);
    try {
      const data = JSON.parse(candidate);
      if (data !== null && typeof data === 'object') {
        const pretty = JSON.stringify(data, null, 2);
        return { isValid: true, data, pretty, linesCount: pretty.split('\n').length };
      }
    } catch {
      // ignore
    }
  }

  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    const candidate = text.slice(firstBracket, lastBracket + 1);
    try {
      const data = JSON.parse(candidate);
      if (Array.isArray(data)) {
        const pretty = JSON.stringify(data, null, 2);
        return { isValid: true, data, pretty, linesCount: pretty.split('\n').length };
      }
    } catch {
      // ignore
    }
  }

  return { isValid: false };
}

/** Syntax highlight JSON string */
export function highlightJson(code: string): string {
  return highlightCode(code, 'json');
}

/**
 * Highlight code and return one HTML fragment per line, aligned 1:1 with
 * `code.split('\n')`. Tokenizes the whole input at once so multi-line grammar
 * state (block comments, template literals) survives, unlike per-line calls.
 */
export function highlightLines(code: string, language = 'javascript'): string[] {
  const rawLines = code.split('\n');
  if (!code) return rawLines;
  const hl = getHighlighterSync();
  if (!hl) return rawLines.map(escapeCode);
  const lang = resolveReadyLang(hl, language);
  try {
    const { tokens } = hl.codeToTokens(code, {
      lang,
      themes: SHIKI_THEMES,
      defaultColor: false,
    });
    if (tokens.length !== rawLines.length) return rawLines.map(escapeCode);
    return tokens.map((lineTokens) =>
      lineTokens
        .map((tok) => {
          const content = escapeCode(tok.content);
          if (!tok.htmlStyle) return content;
          const style = Object.entries(tok.htmlStyle)
            .map(([key, value]) => `${key}:${value}`)
            .join(';');
          return style ? `<span style="${style}">${content}</span>` : content;
        })
        .join('')
    );
  } catch {
    return rawLines.map(escapeCode);
  }
}
