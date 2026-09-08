import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { computeSessionContextTelemetry, getDefaultMockTelemetry } from '@/data/contextData';
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
      const defaultMock = getDefaultMockTelemetry(sessionId || 'history-commit', 'History Commit 2026-09-06 23:00');
      return json({ telemetry: defaultMock, isMock: true });
    }

    // Real DB Mode
    const db = await getDb();
    if (sessionId) {
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

      // Real omp sessions live on disk as JSONL and have no chat_sessions row —
      // compute telemetry from the on-disk assistant usage/cost (bypass the mock).
      const { findSessionFileById } = await import('@/lib/omp/session-locator');
      const { computeRealSessionTelemetry } = await import('@/lib/omp/session-telemetry');
      const filePath = findSessionFileById(sessionId);
      if (filePath) {
        const telemetry = computeRealSessionTelemetry(filePath, sessionId);
        return json({ telemetry, isMock: false, source: 'omp-jsonl' });
      }
    }

    const defaultTelemetry = getDefaultMockTelemetry('default', 'History Commit 2026-09-06 23:00');
    return json({ telemetry: defaultTelemetry, isMock: false });
  } catch (error: any) {
    console.error('Context telemetry loader error:', error);
    const fallback = getDefaultMockTelemetry('fallback', 'History Commit 2026-09-06 23:00');
    return json({ telemetry: fallback, isMock: mock, error: error.message }, { status: 200 });
  }
}
