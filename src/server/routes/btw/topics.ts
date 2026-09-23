/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BTW commands: `GET /api/btw/:sessionId` returns a session's side questions,
 * `POST` runs one action against them.
 *
 * Mutating verbs stay in one handler with its own dispatch (the ported Remix
 * shape the rest of the API uses), so an unsupported action gets a named error
 * instead of a silent success.
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { toImageContents, validateAgentImages } from '@/server/lib/omp/rpc/constants';
import { BtwError, type BtwImages } from '@/server/lib/btw/runtime.server';
import { abortBtw, askBtw, getBtwState, promoteBtw, removeBtw } from '@/server/lib/btw/service.server';

/** Actions that can reject for a reason the client should show as-is. */
const STATUS_BY_CODE: Record<string, number> = {
  btw_busy: 409,
  btw_stale: 409,
  session_not_found: 404,
  btw_topic_not_found: 404,
};

function btwErrorResponse(error: unknown): Response {
  if (error instanceof BtwError) {
    return json({ error: error.message, code: error.code }, { status: STATUS_BY_CODE[error.code] ?? 400 });
  }
  return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
}

function readImages(raw: unknown): { images?: BtwImages } | { error: string } {
  const problem = validateAgentImages(raw);
  if (problem) return { error: problem };
  const images = toImageContents(raw);
  return images ? { images } : {};
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const topicId = typeof body?.topicId === 'string' ? body.topicId : undefined;
  if (!action) return json({ error: 'action is required', code: 'action_required' }, { status: 400 });

  try {
    switch (action) {
      case 'ask': {
        const question = typeof body?.question === 'string' ? body.question : '';
        const parsed = readImages(body?.images);
        if ('error' in parsed) return json({ error: parsed.error, code: 'invalid_images' }, { status: 400 });
        return json({ success: true, data: await askBtw(sessionId, { topicId, question, images: parsed.images }) });
      }
      case 'abort': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        return json({ success: true, data: await abortBtw(sessionId, topicId) });
      }
      case 'promote': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        return json({ success: true, data: await promoteBtw(sessionId, topicId) });
      }
      case 'delete': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        return json({ success: true, data: await removeBtw(sessionId, topicId) });
      }
      default:
        return json({ error: `Unknown btw action: ${action}`, code: 'unknown_action' }, { status: 400 });
    }
  } catch (error) {
    return btwErrorResponse(error);
  }
}

export async function loader({ params }: LoaderFunctionArgs) {
  const { sessionId } = params;
  if (!sessionId) return json({ error: 'session id is required' }, { status: 400 });
  try {
    return json({ success: true, data: await getBtwState(sessionId) });
  } catch (error) {
    return btwErrorResponse(error);
  }
}
