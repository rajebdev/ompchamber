import type { ActionFunctionArgs, LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { handleSimulatedStreaming } from '@/shared/lib/chat/stream-service';
import { createSseStream } from '@/server/lib/sse';

export async function loader({ request }: LoaderFunctionArgs) {
  return handleStreamingRequest(request);
}

export async function action({ request }: ActionFunctionArgs) {
  return handleStreamingRequest(request);
}

async function handleStreamingRequest(request: Request) {
  const url = new URL(request.url);
  let sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}`;
  let prompt = url.searchParams.get('prompt') || '';
  let modelName = url.searchParams.get('model') || 'DeepSeek V4 Pro';
  let workspaceName = url.searchParams.get('workspaceName') || 'Workspace';

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      if (body.sessionId) sessionId = body.sessionId;
      if (body.prompt) prompt = body.prompt;
      if (body.model) modelName = body.model;
      if (body.workspaceName) workspaceName = body.workspaceName;
    } catch {
      // Use fallback query params if JSON parsing fails
    }
  }

  // Real mode routes through the omp agent RPC bridge (POST /api/agent/:id +
  // SSE /api/agent/:id/events). This simulated stream is the MOCK-only
  // path — refuse it in real mode so the two never conflict.
  if (!isMockMode()) {
    return new Response(JSON.stringify({ error: 'Streaming is handled by the omp agent bridge in real mode' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = createSseStream({
    headers: { 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
    async onStart(handlers) {
      let isAborted = false;
      const abortListener = () => {
        isAborted = true;
      };
      request.signal.addEventListener('abort', abortListener);

      const sendEvent = (event: string, data: unknown): void => {
        if (isAborted) return;
        handlers.send(event, data);
        if (handlers.isClosed()) isAborted = true;
      };

      try {
        const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const messageId = `msg-${Date.now()}-ai`;

        // 1. Send initialization event
        sendEvent('init', {
          id: messageId,
          role: 'ai',
          date: `Today, ${timeStr}`,
          timestamp: timeStr,
          model: modelName,
        });

        // Simulated intelligent streaming — the MOCK-only path for OMPChamber.
        await handleSimulatedStreaming({
          prompt,
          modelName,
          workspaceName,
          sessionId,
          messageId,
          timeStr,
          sendEvent,
          isAborted: () => isAborted,
        });
      } catch (err: any) {
        if (!isAborted) {
          sendEvent('error', { error: err?.message || 'Streaming execution error' });
        }
      } finally {
        request.signal.removeEventListener('abort', abortListener);
        handlers.close();
      }
    },
  });

  return stream.response;
}
