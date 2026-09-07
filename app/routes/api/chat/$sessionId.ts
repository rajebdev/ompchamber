import { json } from '@remix-run/node';
import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { getSessionData } from '@/data/chatMockData';
import { isMockMode } from '@/mock.server';

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
      const { findSessionFileById } = await import('@/lib/omp/session-locator');
      const { loadSessionMessages, loadSessionTitle } = await import('@/lib/omp/session-messages');
      const filePath = findSessionFileById(sessionId);
      if (filePath) {
        const messages = loadSessionMessages(filePath);
        const title = loadSessionTitle(filePath)
          || messages.find((m) => m.role === 'user')?.content?.slice(0, 120)
          || `Session ${sessionId}`;
        return json({
          session: {
            id: sessionId,
            title,
            messages,
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
