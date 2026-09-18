import { json } from '@remix-run/node';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { getDb } from '@/db.server';
import { isMockMode } from '@/mock.server';
import { findSessionFileById } from '@/lib/omp/session/locator';
import { computeSessionContextTelemetry } from '@/data/context-data';
import { getSessionData } from '@/data/mock/chat';
import { computeRawMessagesPage, type RawMessageRole } from '@/lib/omp/session/telemetry-raw';
import type { RawMessageItem } from '@/types';

const MAX_PAGE_SIZE = 100;

function parsePage(url: URL): { page: number; pageSize: number; role: RawMessageRole } {
  const rawPage = Number(url.searchParams.get('page') ?? '1');
  const rawSize = Number(url.searchParams.get('pageSize') ?? '20');
  const roleParam = url.searchParams.get('role');
  const role: RawMessageRole = roleParam === 'assistant' || roleParam === 'user' ? roleParam : 'all';
  return {
    page: Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(rawSize) ? Math.floor(rawSize) : 20)),
    role,
  };
}

/**
 * Paged raw session messages for the context panel. Source priority mirrors
 * /api/telemetry/context: omp session JSONL on disk, then the DB copy for
 * chat-created sessions, then mock data — so both endpoints always agree.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const { page, pageSize, role } = parsePage(url);
  const mock = isMockMode();

  try {
    if (mock) {
      if (sessionId) {
        const sessionMock = getSessionData(sessionId);
        if (sessionMock && sessionMock.messages && sessionMock.messages.length > 0) {
          const telemetry = computeSessionContextTelemetry(sessionId, sessionMock.title, sessionMock.messages);
          return json(pagedFromList(telemetry.rawMessages, page, pageSize, role, telemetry.messagesCount));
        }
      }
      return json({ items: [], total: 0, filteredTotal: 0, page, pageSize, isMock: true });
    }

    // Real DB Mode — JSONL first (omp sessions live on disk).
    const db = await getDb();
    if (sessionId) {
      const filePath = findSessionFileById(sessionId);
      if (filePath) {
        const result = computeRawMessagesPage(filePath, page, pageSize, role);
        return json({ ...result, page, pageSize, isMock: false, source: 'omp-jsonl' });
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
        return json(pagedFromList(telemetry.rawMessages, page, pageSize, role, telemetry.messagesCount));
      }
    }

    return json({ items: [], total: 0, filteredTotal: 0, page, pageSize, isMock: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Raw messages loader error:', error);
    return json({ items: [], total: 0, filteredTotal: 0, page, pageSize, error: message }, { status: 200 });
  }
}

/** Page a fully-computed raw list (mock / DB paths) with the panel's newest-first ordering. */
function pagedFromList(
  items: RawMessageItem[],
  page: number,
  pageSize: number,
  role: RawMessageRole,
  total: number,
) {
  const filtered = items.filter((m) => role === 'all' || m.info.role === role);
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize).reverse(),
    total,
    filteredTotal: filtered.length,
    page,
    pageSize,
  };
}
