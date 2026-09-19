import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { computeSessionContextTelemetry, emptyTelemetry } from '@/client/data/context-data';
import { getSessionData } from '@/client/data/mock/chat';
import { getDb } from '@/server/db.server';
import { isMockMode } from '@/server/mock.server';
import { findSessionFileById } from '@/server/lib/omp/session/locator';
import { computeRealSessionTelemetry } from '@/server/lib/omp/session/telemetry';
import type { SessionContextTelemetry } from '@/shared/types';

/**
 * Raw message items never ride on the telemetry response: the panel fetches
 * its pages from /api/telemetry/raw-messages, so the summary stays light even
 * for very long sessions.
 */
function stripRawMessages(telemetry: SessionContextTelemetry): SessionContextTelemetry {
  return { ...telemetry, rawMessages: [] };
}

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
          return json({ telemetry: stripRawMessages(telemetry), isMock: true });
        }
      }
      const defaultMock = emptyTelemetry(sessionId || 'default', 'Session not started');
      return json({ telemetry: defaultMock, isMock: true });
    }

    // Real DB Mode
    const db = await getDb();
    if (sessionId) {
      // JSONL-first: omp sessions live on disk, so the raw panel shows full entries.
      const filePath = findSessionFileById(sessionId);
      if (filePath) {
        const telemetry = await computeRealSessionTelemetry(filePath, sessionId);
        return json({ telemetry: stripRawMessages(telemetry), isMock: false, source: 'omp-jsonl' });
      }

      // Chat-created sessions have no JSONL on disk — fall back to the DB copy.
      const existing = await db.get('SELECT * FROM chat_sessions WHERE session_id = ?', [sessionId]);
      if (existing) {
        let parsedMessages: unknown[] = [];
        try {
          const parsed: unknown = JSON.parse(existing.messages);
          if (Array.isArray(parsed)) parsedMessages = parsed;
        } catch {
          parsedMessages = [];
        }
        const telemetry = computeSessionContextTelemetry(sessionId, existing.title || `Session ${sessionId}`, parsedMessages);
        return json({ telemetry: stripRawMessages(telemetry), isMock: false });
      }
    }

    const defaultTelemetry = emptyTelemetry('default', 'Session not started');
    return json({ telemetry: defaultTelemetry, isMock: false });
  } catch (error: unknown) {
    console.error('Context telemetry loader error:', error);
    const fallback = emptyTelemetry('fallback', 'Session not started');
    return json({ telemetry: fallback, isMock: mock, error: error instanceof Error ? error.message : String(error) }, { status: 200 });
  }
}
