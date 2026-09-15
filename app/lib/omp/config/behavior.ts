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
 * Values must be omp's ApprovalPolicy — `allow | deny | prompt`. Anything else
 * is dropped silently by normalizePolicy, which is how `ask` became a no-op.
 * Field names must be real omp tool names, since `tools.approval.<key>` is only
 * consulted when the key matches the tool's `policyKey`.
 *
 * omp honours these per-tool overrides ahead of the approval mode in every
 * mode, so a blanket "allow everything" belongs in tools.approvalMode (the
 * composer's access control), not here.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { isMap, parseDocument } from 'yaml';
import { getAgentDir } from '@/lib/omp/core/paths';

export type ApprovalValue = 'allow' | 'deny' | 'prompt';

export interface ApprovalFields {
  bash?: ApprovalValue;
  read?: ApprovalValue;
  edit?: ApprovalValue;
  write?: ApprovalValue;
  web_search?: ApprovalValue;
}

interface Directive {
  pattern: RegExp;
  field: keyof ApprovalFields;
  value: ApprovalValue;
}

const SUBJECTS: Array<{ fields: Array<keyof ApprovalFields>; subject: string }> = [
  { fields: ['bash'], subject: 'bash|shell|terminal(?:\\s+commands)?' },
  { fields: ['read'], subject: '(?:safe\\s+)?(?:reads?|read[- ]?only(?:\\s+commands)?)' },
  // One phrasing governs both: the editor has no way to tell a patch from a
  // new file, and leaving `write` uncovered let a "writes" rule miss it.
  { fields: ['edit', 'write'], subject: 'edits?|writes?|patches?' },
  { fields: ['web_search'], subject: 'web(?:\\s*search)?|http|network' },
];

/** "ask" stays a valid phrasing but maps to omp's real `prompt` value. */
const VERBS: Array<{ value: ApprovalValue; verb: string }> = [
  { value: 'allow', verb: 'auto[- ]?approve|allow' },
  { value: 'deny', verb: 'deny|block|forbid' },
  { value: 'prompt', verb: 'ask|prompt|confirm' },
];

// Ordered directives — first matching line for a field wins.
const DIRECTIVES: Directive[] = SUBJECTS.flatMap(({ fields, subject }) =>
  fields.flatMap((field) =>
    VERBS.map(({ value, verb }) => ({
      field,
      value,
      pattern: new RegExp(`^\\s*(?:${verb})\\s+(?:(?:before|for)\\s+)?(?:${subject})\\s*$`, 'i'),
    })),
  ),
);

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
