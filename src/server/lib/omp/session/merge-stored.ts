/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Merge the chamber's own copy of a conversation onto the messages loaded from
 * an omp JSONL file.
 *
 * The JSONL is authoritative for what the model received, but it is not a
 * complete record of the chamber's UI: omp rewrites raw composer input
 * (`@agent` → a task-tool delegation prompt, `/skill:a b` → `/skill:a`) and
 * writes no user entry at all for `/command` turns. The chamber DB keeps the
 * turn as the user typed it, which is what this restores.
 *
 * Attachments are UNIONED rather than picked from one side. The two sources see
 * different halves of the same attachment:
 *
 * - The JSONL recovers a text file's NAME from the delivered prompt (the
 *   composer inlines the file as `Attached file: <name>` plus a fenced block)
 *   and carries an image's bytes, but has no preview and no stored content.
 * - The chamber row has the display fields — a text file's name and content, an
 *   image's name and preview — but nothing about what omp actually received.
 *
 * Choosing one list over the other is what made a dropped `.md`/`.py`/`.json`
 * vanish from a reloaded session: the JSONL had an image, so its list won, and
 * the text file only ever existed in the chamber row.
 */

export interface StoredAttachment {
  name?: string;
  preview?: string;
  type?: string;
  size?: number;
  content?: string;
}

export interface StoredMessage {
  id?: string;
  role: string;
  content: string;
  date?: string;
  timestamp?: string;
  attachments?: StoredAttachment[];
}

function isRawComposerInput(content: string): boolean {
  return /^\s*\//.test(content) || /(^|\s)@[A-Za-z0-9_-]+/.test(content);
}

/** Whether a JSONL-derived user turn (a) and a stored one (b) are the same
 *  request despite omp rewriting the delivered prompt. */
function userTurnsRelate(a: string, b: string): boolean {
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  // `@agent` is delivered to omp as a task-tool delegation prompt.
  if (a.startsWith('Use the task tool to delegate this request') && /(^|\s)@[A-Za-z0-9_-]+/.test(b)) {
    return true;
  }
  // `/skill:<name> <args>`: the JSONL only records a synthesized `/skill:<name>`.
  const token = a.split(' ')[0];
  return a.startsWith('/skill:') && Boolean(token) && b.startsWith(token);
}

/**
 * Union two attachment lists by name.
 *
 * The JSONL entry comes first, so the order the model received wins; a stored
 * entry with the same name fills in the fields the JSONL could not carry.
 */
function mergeAttachmentLists(
  fromJsonl: StoredAttachment[] | undefined,
  fromStore: StoredAttachment[] | undefined,
): StoredAttachment[] {
  const jsonl = Array.isArray(fromJsonl) ? fromJsonl : [];
  const stored = Array.isArray(fromStore) ? fromStore : [];
  if (jsonl.length === 0) return stored;
  if (stored.length === 0) return jsonl;
  const remaining = [...stored];
  const merged = jsonl.map((attachment) => {
    const index = remaining.findIndex((candidate) => candidate.name === attachment.name);
    if (index === -1) return attachment;
    const [match] = remaining.splice(index, 1);
    return {
      ...match,
      ...attachment,
      content: attachment.content ?? match.content,
      preview: attachment.preview || match.preview,
    };
  });
  // Anything the JSONL could not see (an attachment omp dropped before the
  // prompt was persisted) is still shown rather than silently discarded.
  return [...merged, ...remaining];
}

/** Merge user turns and attachments from the chamber DB copy onto the
 *  JSONL-loaded messages. */
export function mergeOmpAttachments(
  messages: StoredMessage[],
  storedMessagesJson: string | undefined,
): StoredMessage[] {
  if (!storedMessagesJson) return messages;
  let stored: StoredMessage[] = [];
  try {
    stored = JSON.parse(storedMessagesJson);
  } catch {
    return messages;
  }
  if (!Array.isArray(stored)) return messages;
  const storedUsers = stored.filter((m) => m?.role === 'user' && typeof m.content === 'string');

  const jsonlIndex = new Map<string, number>();
  messages.forEach((m, index) => {
    if (m.id) jsonlIndex.set(m.id, index);
  });

  const used = new Set<number>();
  const merged = messages.map((m) => {
    if (m.role !== 'user') return m;
    const storedIndex = storedUsers.findIndex((s, i) => !used.has(i) && userTurnsRelate(m.content, s.content));
    if (storedIndex === -1) return m;
    used.add(storedIndex);
    const storedMsg = storedUsers[storedIndex];
    const content = storedMsg.content !== m.content && isRawComposerInput(storedMsg.content)
      ? storedMsg.content
      : m.content;
    const attachments = mergeAttachmentLists(m.attachments, storedMsg.attachments);
    const next = { ...m, content };
    return attachments.length ? { ...next, attachments } : next;
  });

  // Unmatched raw turns are anchored before the next stored message the JSONL
  // still carries; splice highest-anchor-first so earlier indices stay valid.
  const insertions = new Map<number, StoredMessage[]>();
  storedUsers.forEach((storedMsg, userIndex) => {
    if (used.has(userIndex) || !isRawComposerInput(storedMsg.content)) return;
    if (storedMsg.id && jsonlIndex.has(storedMsg.id)) return;
    let anchor = merged.length;
    for (let i = stored.indexOf(storedMsg) + 1; i < stored.length; i += 1) {
      const id = stored[i]?.id;
      const found = typeof id === 'string' ? jsonlIndex.get(id) : undefined;
      if (found !== undefined) {
        anchor = found;
        break;
      }
    }
    const group = insertions.get(anchor);
    if (group) group.push(storedMsg);
    else insertions.set(anchor, [storedMsg]);
  });
  for (const anchor of [...insertions.keys()].sort((a, b) => b - a)) {
    const group = insertions.get(anchor);
    if (group) merged.splice(anchor, 0, ...group);
  }

  const byContent = new Map<string, StoredAttachment[]>();
  for (const m of stored) {
    if (m?.role === 'user' && Array.isArray(m.attachments) && m.attachments.length > 0) {
      byContent.set(m.content, m.attachments);
    }
  }
  return merged.map((m) => {
    if (m.role !== 'user' || m.attachments?.length) return m;
    // The JSONL content may carry inlined text-file blocks appended to the
    // original prompt, so match by prefix instead of exact equality.
    const atts = byContent.get(m.content)
      ?? [...byContent.entries()].find(([storedContent]) =>
          m.content.startsWith(storedContent) || storedContent.startsWith(m.content)
        )?.[1];
    return atts ? { ...m, attachments: atts } : m;
  });
}
