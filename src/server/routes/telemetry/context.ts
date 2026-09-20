import { json } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { computeSessionContextTelemetry, emptyTelemetry } from '@/client/data/context-data';
import { isMockMode } from '@/server/mock.server';
import { loadSessionSource } from '@/server/lib/chat/session-store.server';
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
    const source = await loadSessionSource(sessionId);

    if (mock) {
      if (source?.kind === 'messages') {
        const telemetry = computeSessionContextTelemetry(sessionId, source.title, source.messages);
        return json({ telemetry: stripRawMessages(telemetry), isMock: true });
      }
      const defaultMock = emptyTelemetry(sessionId || 'default', 'Session not started');
      return json({ telemetry: defaultMock, isMock: true });
    }

    if (sessionId && source?.kind === 'jsonl') {
      const telemetry = await computeRealSessionTelemetry(source.filePath, sessionId);
      return json({ telemetry: stripRawMessages(telemetry), isMock: false, source: 'omp-jsonl' });
    }

    if (source?.kind === 'messages') {
      const telemetry = computeSessionContextTelemetry(sessionId, source.title, source.messages);
      return json({ telemetry: stripRawMessages(telemetry), isMock: false });
    }

    const defaultTelemetry = emptyTelemetry('default', 'Session not started');
    return json({ telemetry: defaultTelemetry, isMock: false });
  } catch (error: unknown) {
    console.error('Context telemetry loader error:', error);
    const fallback = emptyTelemetry('fallback', 'Session not started');
    return json({ telemetry: fallback, isMock: mock, error: error instanceof Error ? error.message : String(error) }, { status: 200 });
  }
}
