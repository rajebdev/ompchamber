/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Behavior-rules → native OMP approval mapping. Parses simple line-based
 * directives from the freeform behavior editor and persists them into
 * ~/.omp/agent/config.yml tools.approval.* with an atomic read-modify-write,
 * preserving all other keys (same technique as roles.ts).
 *
 * Native field names mirror omp-web/lib/omp/settings-config.ts NativeSettings:
 *   tools.approval.{extension,bash,read,edit,webfetch}: allow | ask
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isMap, parseDocument } from 'yaml';
import { getAgentDir } from '@/lib/omp/core/paths';

export type ApprovalValue = 'allow' | 'ask';

export interface ApprovalFields {
  extension?: ApprovalValue;
  bash?: ApprovalValue;
  read?: ApprovalValue;
  edit?: ApprovalValue;
  webfetch?: ApprovalValue;
}

interface Directive {
  pattern: RegExp;
  field: keyof ApprovalFields;
  value: ApprovalValue;
}

// Ordered directives — first matching line for a field wins.
const DIRECTIVES: Directive[] = [
  { pattern: /^\s*(auto[- ]?approve|allow)\s+all\s*$/i, field: 'extension', value: 'allow' },
  { pattern: /^\s*ask\s+(for\s+)?(all|everything)\s*$/i, field: 'extension', value: 'ask' },
  { pattern: /^\s*(auto[- ]?approve|allow)\s+(bash|shell|terminal( commands)?)\s*$/i, field: 'bash', value: 'allow' },
  { pattern: /^\s*ask\s+(before\s+|for\s+)?(bash|shell|terminal( commands)?)\s*$/i, field: 'bash', value: 'ask' },
  { pattern: /^\s*(auto[- ]?approve|allow)\s+(safe\s+)?(reads?|read[- ]?only( commands)?)\s*$/i, field: 'read', value: 'allow' },
  { pattern: /^\s*ask\s+(before\s+|for\s+)?reads?\s*$/i, field: 'read', value: 'ask' },
  { pattern: /^\s*(auto[- ]?approve|allow)\s+(edits?|writes?|patches?)\s*$/i, field: 'edit', value: 'allow' },
  { pattern: /^\s*ask\s+(before\s+|for\s+)?(edits?|writes?|patches?)\s*$/i, field: 'edit', value: 'ask' },
  { pattern: /^\s*(auto[- ]?approve|allow)\s+(web(fetch)?|http|network)\s*$/i, field: 'webfetch', value: 'allow' },
  { pattern: /^\s*ask\s+(before\s+|for\s+)?(web(fetch)?|http|network)\s*$/i, field: 'webfetch', value: 'ask' },
];

/**
 * Parse freeform behavior rules into native approval fields. Returns null
 * when no recognizable directive is found (nothing to write natively).
 */
export function parseApprovalRules(text: string): ApprovalFields | null {
  const fields: ApprovalFields = {};
  for (const line of text.split(/\r?\n/)) {
    for (const directive of DIRECTIVES) {
      if (fields[directive.field] === undefined && directive.pattern.test(line)) {
        fields[directive.field] = directive.value;
      }
    }
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Merge approval fields into config.yml tools.approval atomically. Only the
 * parsed fields are touched; unrelated keys and comments are preserved.
 * Throws on invalid YAML — callers should treat this as best-effort.
 */
export function writeToolsApproval(fields: ApprovalFields): void {
  if (Object.keys(fields).length === 0) return;
  const path = join(getAgentDir(), 'config.yml');
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const doc = parseDocument(source);
  if (doc.errors.length > 0) throw new Error(`${path} is not valid YAML: ${doc.errors[0].message}`);
  if (doc.contents === null) {
    doc.set('tools', { approval: fields });
  } else {
    if (!isMap(doc.contents)) throw new Error(`${path} must contain a YAML mapping`);
    const tools = doc.get('tools');
    if (tools !== undefined && typeof tools !== 'object') {
      throw new Error(`${path} tools section must be a mapping`);
    }
    const toolsMap = isMap(tools) ? tools : undefined;
    if (toolsMap) {
      const approval = toolsMap.get('approval');
      if (approval !== undefined && !isMap(approval)) {
        throw new Error(`${path} tools.approval must be a mapping`);
      }
      const approvalMap = isMap(approval) ? approval : undefined;
      if (approvalMap) {
        for (const [key, value] of Object.entries(fields)) approvalMap.set(key, value);
      } else {
        toolsMap.set('approval', fields);
      }
    } else {
      doc.set('tools', { approval: fields });
    }
  }
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, doc.toString(), 'utf8');
  renameSync(temp, path);
}
