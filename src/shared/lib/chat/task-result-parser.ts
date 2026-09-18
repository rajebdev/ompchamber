export interface TaskResultMeta {
  lines?: string;
  size?: string;
}

export interface TaskResultFileItem {
  path: string;
  description?: string;
}

export interface TaskResultStructuredOutput {
  summary?: string;
  files?: TaskResultFileItem[];
  architecture?: string;
  report?: string;
  [key: string]: unknown;
}

export interface ParsedTaskNotice {
  intro: string;
  id?: string;
  agent?: string;
  status?: string;
  duration?: string;
  meta?: TaskResultMeta;
  rawOutput: string;
  formattedJson?: string;
  structuredOutput?: TaskResultStructuredOutput;
  outro?: string;
}

/** Scan a JSON document prefix for bracket balance and string state. */
function jsonScanState(text: string): { stack: string[]; inString: boolean; escaped: boolean } {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return { stack, inString, escaped };
}

/** Best-effort repair for a JSON payload truncated by the preview size limit:
 *  seal the open string, drop dangling separators/keys, and append the missing
 *  closing brackets. Returns null when the document cannot be repaired. */
function healTruncatedJson(text: string): string | null {
  let healed = text;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { stack, inString, escaped } = jsonScanState(healed);
    let candidate = healed;
    if (inString) {
      if (escaped) candidate = candidate.slice(0, -1);
      candidate += '"';
    }
    candidate = candidate
      .replace(/,\s*"[^"]*"\s*:\s*$/, '')
      .replace(/"[^"]*"\s*:\s*$/, '')
      .replace(/,\s*$/, '');
    candidate += [...stack].reverse().join('');
    candidate = candidate.replace(/,\s*(?=[}\]])/g, '');
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      const cut = healed.lastIndexOf(',');
      if (cut <= 0) return null;
      healed = healed.slice(0, cut);
    }
  }
  return null;
}

/**
 * Parses XML-style <task-result> embedded inside system notices.
 * Handles metadata, <output>...</output>, and <preview full-output="agent://...">...</preview> payloads.
 * The full-output URI remains inert metadata; preview content is rendered locally.
 * Truncated preview JSON is healed so the structured view still renders.
 */
export function parseTaskNotice(text: string): ParsedTaskNotice | null {
  if (!text) return null;
  const match = text.match(/([\s\S]*?)<task-result\b([^>]*)>([\s\S]*?)<\/task-result>([\s\S]*)/i);
  if (!match) return null;

  const intro = match[1].trim();
  const attrs = match[2];
  const innerBody = match[3].trim();
  const outro = match[4].trim();

  const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1];
  const agent = attrs.match(/\bagent=["']([^"']+)["']/i)?.[1];
  const status = attrs.match(/\bstatus=["']([^"']+)["']/i)?.[1];
  const duration = attrs.match(/\bduration=["']([^"']+)["']/i)?.[1];

  // Extract <meta ... />
  let meta: TaskResultMeta | undefined;
  const metaMatch = innerBody.match(/<meta\b([^>]*)\/?>/i);
  if (metaMatch) {
    const metaAttrs = metaMatch[1];
    const lines = metaAttrs.match(/\blines=["']([^"']+)["']/i)?.[1];
    const size = metaAttrs.match(/\bsize=["']([^"']+)["']/i)?.[1];
    if (lines || size) {
      meta = { lines, size };
    }
  }

  let rawOutput = '';
  const outputMatch = innerBody.match(/<output\b[^>]*>([\s\S]*?)<\/output>/i);
  if (outputMatch) {
    rawOutput = outputMatch[1].trim();
  } else {
    const previewMatch = innerBody.match(/<preview\b[^>]*>([\s\S]*?)<\/preview>/i);
    const previewPayload = previewMatch?.[1].trim();
    if (previewPayload) {
      rawOutput = previewPayload;
    } else {
      rawOutput = innerBody
        .replace(/<meta\b[^>]*\/?>(?:\s*<\/meta>)?|<\/?preview\b[^>]*>/gi, '')
        .trim();
    }
  }

  // Attempt JSON parsing
  let structuredOutput: TaskResultStructuredOutput | undefined;
  let formattedJson: string | undefined;

  if (rawOutput.startsWith('{') || rawOutput.startsWith('[')) {
    try {
      const parsed = JSON.parse(rawOutput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        structuredOutput = parsed as TaskResultStructuredOutput;
        formattedJson = JSON.stringify(parsed, null, 2);
      }
    } catch {
      const healed = healTruncatedJson(rawOutput);
      if (healed) {
        const parsed: unknown = JSON.parse(healed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          structuredOutput = parsed as TaskResultStructuredOutput;
          formattedJson = JSON.stringify(parsed, null, 2);
          rawOutput = healed;
        }
      }
    }
  }

  return {
    intro: intro || (id ? `Background job ${id} completed` : 'System notice'),
    id,
    agent,
    status,
    duration,
    meta,
    rawOutput,
    formattedJson,
    structuredOutput,
    outro: outro || undefined,
  };
}
