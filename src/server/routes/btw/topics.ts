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
import { isApprovalMode } from '@/shared/lib/omp/config/access-mode';
import type { AttachedTextFileData } from '@/shared/lib/chat/attachments';
import { BtwError, type BtwImages } from '@/server/lib/btw/runtime.server';
import {
  abortBtw,
  askBtw,
  getBtwState,
  promoteBtw,
  removeBtw,
  respondBtwDialog,
  setBtwApprovalMode,
  setBtwModel,
  setBtwThinkingLevel,
} from '@/server/lib/btw/service.server';

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

/**
 * Text files the client inlined for this question. Validated for shape only:
 * the payload is a string the composer produced from bytes it already read, and
 * the prompt builder escapes it into a fenced block.
 */
function readTextFiles(raw: unknown): AttachedTextFileData[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const file = entry as Partial<AttachedTextFileData>;
    if (typeof file.name !== 'string' || typeof file.content !== 'string') return [];
    return [{
      name: file.name,
      content: file.content,
      mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'text/plain',
      size: typeof file.size === 'number' ? file.size : file.content.length,
    }];
  });
}

/**
 * The response body for one dialog, in the shape omp's RPC accepts: an answer
 * value, a confirmation, or a cancellation. Anything else is refused rather
 * than forwarded — a malformed response would leave the child blocked.
 */
function readDialogResponse(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const response = raw as { value?: unknown; confirmed?: unknown; cancelled?: unknown };
  if (response.cancelled === true) return { cancelled: true };
  if (typeof response.confirmed === 'boolean') return { confirmed: response.confirmed };
  if (typeof response.value === 'string') return { value: response.value };
  return null;
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
        const provider = typeof body?.provider === 'string' ? body.provider : '';
        const modelId = typeof body?.modelId === 'string' ? body.modelId : '';
        return json({
          success: true,
          data: await askBtw(sessionId, {
            topicId,
            question,
            images: parsed.images,
            textFiles: readTextFiles(body?.textFiles),
            ...(provider && modelId ? { model: { provider, id: modelId } } : {}),
            ...(typeof body?.thinkingLevel === 'string' ? { thinkingLevel: body.thinkingLevel } : {}),
            ...(isApprovalMode(body?.accessMode) ? { approvalMode: body.accessMode } : {}),
          }),
        });
      }
      case 'abort': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        return json({ success: true, data: await abortBtw(sessionId, topicId) });
      }
      case 'set_model': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        const provider = typeof body?.provider === 'string' ? body.provider : '';
        const modelId = typeof body?.modelId === 'string' ? body.modelId : '';
        if (!provider || !modelId) return json({ error: 'provider and modelId are required', code: 'model_required' }, { status: 400 });
        return json({ success: true, data: await setBtwModel(sessionId, topicId, provider, modelId) });
      }
      case 'set_thinking_level': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        const level = typeof body?.level === 'string' ? body.level : '';
        if (!level) return json({ error: 'level is required', code: 'level_required' }, { status: 400 });
        return json({ success: true, data: await setBtwThinkingLevel(sessionId, topicId, level) });
      }
      case 'set_access_mode': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        if (!isApprovalMode(body?.accessMode)) {
          return json({ error: 'accessMode must be always-ask, write or yolo', code: 'invalid_access_mode' }, { status: 400 });
        }
        return json({ success: true, data: await setBtwApprovalMode(sessionId, topicId, body.accessMode) });
      }
      case 'dialog_response': {
        if (!topicId) return json({ error: 'topicId is required', code: 'topic_required' }, { status: 400 });
        const id = typeof body?.id === 'string' ? body.id : '';
        if (!id) return json({ error: 'id is required', code: 'dialog_required' }, { status: 400 });
        const response = readDialogResponse(body?.response);
        if (!response) return json({ error: 'a response value is required', code: 'dialog_required' }, { status: 400 });
        return json({ success: true, data: await respondBtwDialog(sessionId, topicId, id, response) });
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
