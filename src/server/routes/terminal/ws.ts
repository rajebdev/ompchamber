/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal WebSocket: the only transport between a terminal panel and its PTY.
 *
 * Text frames are JSON control, binary frames are raw PTY bytes in both
 * directions. The client's first frame is `attach`, which also creates the
 * shell when the id is new — one round trip, and no separate create endpoint to
 * race against.
 *
 * The upgrade is origin-checked. Browsers happily open a WebSocket to
 * `localhost` from any page, and there is no preflight to stop them, so a
 * cross-origin page could otherwise drive a shell on this machine.
 *
 * Per-connection state lives on `ws.data`, not in a `WeakMap` keyed by the `ws`
 * object: Elysia hands a *different* wrapper to `message`/`close` than the one
 * `open` received (verified on 1.4.30), so a WeakMap lookup finds nothing and
 * every frame is silently dropped. `ws.data` is the same object throughout.
 */

import { Elysia, t } from 'elysia';
import {
  attachTerminal,
  closeTerminal,
  detachTerminal,
  resizeTerminalDebounced,
  writeTerminalInput,
} from '@/server/lib/terminal/runtime.server';
import { TerminalRuntimeError, type TerminalViewer } from '@/server/lib/terminal/session.server';
import {
  decodeClientFrame,
  encodeServerFrame,
  isValidTerminalId,
} from '@/shared/lib/workspace/terminal/protocol';

interface Attachment {
  id: string;
  viewer: TerminalViewer;
  /** One attach per socket; a duplicate would replay the scrollback twice. */
  attached: boolean;
}

/** Elysia's ws context, narrowed to the per-connection store this route adds. */
type TerminalWsData = { params: { terminalId: string }; terminal?: Attachment };

export const terminalWsRoutes = new Elysia({ prefix: '/api/terminal' }).ws('/:terminalId/ws', {
  params: t.Object({ terminalId: t.String() }),

  beforeHandle({ request, status }) {
    if (!isSameOriginUpgrade(request)) return status(403, 'Cross-origin terminal upgrade rejected');
  },

  open(ws) {
    const data = ws.data as unknown as TerminalWsData;
    const id = data.params.terminalId;
    if (!isValidTerminalId(id)) {
      ws.close();
      return;
    }
    data.terminal = {
      id,
      attached: false,
      viewer: {
        send(frame) {
          try {
            ws.send(frame);
          } catch {
            // Socket closed mid-send; the close handler detaches.
          }
        },
      },
    };
  },

  async message(ws, raw) {
    const attachment = (ws.data as unknown as TerminalWsData).terminal;
    if (!attachment) return;

    // Raw PTY input (keystrokes, paste, mouse reports) — never JSON-escaped.
    if (raw instanceof Uint8Array) {
      writeTerminalInput(attachment.id, raw);
      return;
    }

    const frame = decodeClientFrame(raw);
    if (!frame) return;

    if (frame.t === 'resize') {
      resizeTerminalDebounced(attachment.id, frame.cols, frame.rows);
      return;
    }

    if (frame.t === 'close') {
      closeTerminal(attachment.id);
      return;
    }

    if (attachment.attached) return;

    try {
      const { snapshot, replay } = await attachTerminal(attachment.viewer, {
        id: attachment.id,
        cols: frame.cols,
        rows: frame.rows,
        root: frame.root,
        repo: frame.repo,
        theme: frame.theme,
      });
      attachment.attached = true;
      ws.send(encodeServerFrame({ t: 'ready', ...snapshot, replayBytes: replay.length }));
      // Ordering is safe without sequence numbers: attach captured the history
      // and registered this viewer in one synchronous block, so nothing can be
      // delivered between this frame and the replay that follows it.
      if (replay.length > 0) ws.send(replay);
    } catch (error) {
      const code = error instanceof TerminalRuntimeError ? error.code : 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      ws.send(encodeServerFrame({ t: 'error', code, message }));
    }
  },

  close(ws) {
    const data = ws.data as unknown as TerminalWsData;
    const attachment = data.terminal;
    if (!attachment) return;
    data.terminal = undefined;
    detachTerminal(attachment.viewer, attachment.id);
  },
});

/**
 * A WebSocket upgrade carries the page's `Origin`, and no preflight protects
 * it. Requests without one (curl, tests) are allowed: they are not a browser
 * being tricked into dialing localhost.
 */
function isSameOriginUpgrade(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
