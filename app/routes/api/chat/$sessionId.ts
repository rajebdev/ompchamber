import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { getSessionData } from '@/data/mock/chat';
import { isMockMode } from '@/mock.server';

interface StoredAttachment {
  name?: string;
  preview?: string;
  type?: string;
  size?: number;
  content?: string;
}

/** Merge attachment metadata from the chamber DB copy onto the JSONL-loaded
 *  messages. omp's JSONL only records image blocks, so text/pdf attachments
 *  are matched back by user content (the DB copy is written by the chat
 *  timeline and carries the full attachment list). */
function mergeOmpAttachments(
  messages: { role: string; content: string; attachments?: StoredAttachment[] }[],
  storedMessagesJson: string | undefined,
): typeof messages {
  if (!storedMessagesJson) return messages;
  let stored: { role: string; content: string; attachments?: StoredAttachment[] }[] = [];
  try {
    stored = JSON.parse(storedMessagesJson);
  } catch {
    return messages;
  }
  const byContent = new Map<string, StoredAttachment[]>();
  for (const m of stored) {
    if (m.role === 'user' && Array.isArray(m.attachments) && m.attachments.length > 0) {
      byContent.set(m.content, m.attachments);
    }
  }
  return messages.map((m) => {
    if (m.role !== 'user' || m.attachments?.length) return m;
    // The JSONL content may carry the inlined text-file blocks appended to the
    // original prompt, so match by prefix instead of exact equality.
    const atts = byContent.get(m.content)
      ?? [...byContent.entries()].find(([storedContent]) =>
          m.content.startsWith(storedContent) || storedContent.startsWith(m.content)
        )?.[1];
    return atts ? { ...m, attachments: atts } : m;
  });
}

export async function loader({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  const mock = isMockMode();

  try {
    // Real mode: an omp session UUID found on disk is authoritative — load its
    // messages straight from the session JSONL file (rich timeline). The
    // chat_sessions overlay is only for chamber-created sessions (mock or
    // synthetic ids).
    if (!mock) {
      const { findSessionFileById } = await import('@/lib/omp/session/locator');
      const { loadSessionMessages, loadSessionTitle, loadSessionModel, loadSessionThinkingLevel } = await import('@/lib/omp/session/messages');
      const filePath = findSessionFileById(sessionId);
      if (filePath) {
        const messages = loadSessionMessages(filePath);
        const title = loadSessionTitle(filePath)
          || messages.find((m) => m.role === 'user')?.content?.slice(0, 120)
          || `Session ${sessionId}`;
        // Real omp JSONL only records image blocks — text/pdf attachments
        // never reach the file. The chamber's DB copy (written by the chat
        // timeline) carries the full attachment metadata, so merge it back
        // onto the matching user messages by content.
        const db = await getDb();
        const overlay = await db.get('SELECT messages FROM chat_sessions WHERE session_id = ?', [sessionId]);
        const overlaid = mergeOmpAttachments(messages, overlay?.messages);
        return json({
          session: {
            id: sessionId,
            title,
            messages: overlaid,
            model: loadSessionModel(filePath),
            thinkingLevel: loadSessionThinkingLevel(filePath),
          },
          isMock: false,
          source: 'omp-jsonl',
        });
      }
    }

    const db = await getDb();
    const existing = await db.get('SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);

    if (existing) {
      let parsedMessages = [];
      try {
        parsedMessages = JSON.parse(existing.messages);
      } catch {
        parsedMessages = [];
      }
      return json({
        session: {
          id: existing.session_id,
          title: existing.title || `Session ${sessionId}`,
          messages: parsedMessages,
        },
        isMock: mock,
      });
    }

    // Seed from default session data if mock mode, otherwise clean empty session
    const initial = (mock ? getSessionData(sessionId) : null) || {
      id: sessionId,
      title: `Session ${sessionId}`,
      messages: [],
    };

    await db.run(
      'INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [sessionId, initial.title, JSON.stringify(initial.messages)]
    );

    return json({ session: initial, isMock: mock });
  } catch (error: any) {
    console.error('Chat session loader error:', error);
    return json({ error: error.message, isMock: mock }, { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) {
    return json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    const db = await getDb();

    if (request.method === 'DELETE') {
      await db.run('DELETE FROM chat_sessions WHERE session_id = ?', [sessionId]);
      return json({ success: true });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const data = await request.json();
      const existing = await db.get('SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);
      
      let currentMessages: any[] = [];
      let title = data.title || (existing ? existing.title : `Session ${sessionId}`);

      if (existing) {
        try {
          currentMessages = JSON.parse(existing.messages);
        } catch {
          currentMessages = [];
        }
      }

      let updatedMessages = currentMessages;

      if (data.action === 'reset') {
        const defaultData = getSessionData(sessionId);
        updatedMessages = defaultData?.messages || [];
      } else if (Array.isArray(data.messages)) {
        // Direct overwrite with new messages array
        updatedMessages = data.messages;
      } else if (data.message) {
        // Append single message
        updatedMessages = [...currentMessages, data.message];
      }

      await db.run(
        'INSERT OR REPLACE INTO chat_sessions (session_id, title, messages, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [sessionId, title, JSON.stringify(updatedMessages)]
      );

      return json({
        success: true,
        session: {
          id: sessionId,
          title,
          messages: updatedMessages,
        },
      });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: any) {
    console.error('Chat session action error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
