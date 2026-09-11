import Prism from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism.css';

/** Map file extension to Prism language key */
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
    case 'html':
    case 'svg':
    case 'xml': return 'markup';
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

/** Syntax highlight code string safely with fallback */
export function highlightCode(code: string, language = 'javascript'): string {
  if (!code) return '';
  try {
    const lang = Prism.languages[language] ? language : 'javascript';
    return Prism.highlight(code, Prism.languages[lang], lang);
  } catch {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
