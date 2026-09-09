import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { computeSessionContextTelemetry, emptyTelemetry } from '@/data/contextData';
import { getSessionData } from '@/data/chatMockData';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const mock = isMockMode();

  try {
    if (mock) {
      if (sessionId) {
        const sessionMock = getSessionData(sessionId);
        if (sessionMock && sessionMock.messages && sessionMock.messages.length > 0) {
          const telemetry = computeSessionContextTelemetry(sessionId, sessionMock.title, sessionMock.messages);
          return json({ telemetry, isMock: true });
        }
      }
      const defaultMock = emptyTelemetry(sessionId || 'default', 'Session not started');
      return json({ telemetry: defaultMock, isMock: true });
    }

    // Real DB Mode
    const db = await getDb();
    if (sessionId) {
      // JSONL-first: omp sessions live on disk, so the raw panel shows full entries.
      const { findSessionFileById } = await import('@/lib/omp/session-locator');
      const { computeRealSessionTelemetry } = await import('@/lib/omp/session-telemetry');
      const filePath = findSessionFileById(sessionId);
      if (filePath) {
        const telemetry = computeRealSessionTelemetry(filePath, sessionId);
        return json({ telemetry, isMock: false, source: 'omp-jsonl' });
      }

      // Chat-created sessions have no JSONL on disk — fall back to the DB copy.
      const existing = await db.get('SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);
      if (existing) {
        let parsedMessages = [];
        try {
          parsedMessages = JSON.parse(existing.messages);
        } catch {
          parsedMessages = [];
        }
        const telemetry = computeSessionContextTelemetry(sessionId, existing.title || `Session ${sessionId}`, parsedMessages);
        return json({ telemetry, isMock: false });
      }
    }

    const defaultTelemetry = emptyTelemetry('default', 'Session not started');
    return json({ telemetry: defaultTelemetry, isMock: false });
  } catch (error: any) {
    console.error('Context telemetry loader error:', error);
    const fallback = emptyTelemetry('fallback', 'Session not started');
    return json({ telemetry: fallback, isMock: mock, error: error.message }, { status: 200 });
  }
}
