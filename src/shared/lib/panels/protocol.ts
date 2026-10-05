/**
 * The wire contract between the panel host and a plugin frame.
 *
 * One `postMessage` channel carries everything in both directions: the host
 * seeds the frame with `init`, the frame asks for capabilities with `call`, and
 * the host answers with `result`. Nothing else is ever sent — a frame cannot
 * reach the chamber's API on its own (it is an opaque origin), so this channel
 * is the entire surface it has.
 */

import type { PanelCapability } from '@/shared/types';

/** Frame → host. */
export interface PanelReadyMessage {
  __ompchamber: 'ready';
}

export interface PanelCallMessage {
  __ompchamber: 'call';
  id: number;
  method: string;
  params?: unknown;
}

export type PanelToHostMessage = PanelReadyMessage | PanelCallMessage;

/** Host → frame. */
export interface PanelInitMessage {
  __ompchamber: 'init';
  /** Base URL for the plugin's own files (`/api/panels/file/<slug>/`). */
  assetBase: string;
  /** The panel's own key, so one bundle can serve several panels. */
  panelKey: string;
  title: string;
  theme: string;
  /** Capability groups the host will answer. Anything else returns an error. */
  capabilities: PanelCapability[];
  sessionId: string | null;
  /** The active workspace's absolute path, when the session has one. */
  workspacePath: string | null;
}

export interface PanelThemeMessage {
  __ompchamber: 'theme';
  theme: string;
}

/**
 * A later `init`, sent when something the frame was seeded with changes.
 *
 * `init` is sent once, on the handshake — but two of its fields are resolved
 * ASYNCHRONOUSLY by the chamber and are routinely still empty at that moment:
 * the active workspace comes from the session list, and the session id from the
 * route. A frame seeded with `workspacePath: null` would keep that null for its
 * whole life, so a panel that shows the workspace shows "none" over a real one.
 *
 * It reuses the `init` shape rather than introducing a second one: the frame's
 * handler already assigns every field, so a re-send is idempotent by
 * construction — there is no second code path to keep in step.
 */
export type PanelContextMessage = Omit<PanelInitMessage, '__ompchamber'> & { __ompchamber: 'context' };

export interface PanelResultMessage {
  __ompchamber: 'result';
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}

export type HostToPanelMessage = PanelInitMessage | PanelContextMessage | PanelThemeMessage | PanelResultMessage;

/**
 * The SDK the host injects into the frame before the plugin's own script.
 *
 * It is a source string rather than a module because it must run inside the
 * frame's opaque origin, where the chamber's bundles are unreachable. Keeping
 * it small is deliberate: every line here is a line the plugin cannot inspect
 * or replace, and the frame is untrusted by construction.
 *
 * The `ready` greeting is REPEATED until the host answers with `init`. One
 * greeting is a race that the plugin cannot see and the host cannot detect: the
 * frame's first line runs as soon as its document is parsed, which is routinely
 * before the host's effect has attached its `message` listener, and the host
 * only ever replies to a greeting it heard. The retry stops at the first `init`
 * (so a settled frame sends nothing further) and gives up after ~10s, which
 * leaves a frame whose host never mounted reporting its own timeout rather than
 * hanging forever.
 */
export function panelSdkSource(): string {
  return `(function () {
  'use strict';
  var pending = new Map();
  var seq = 0;
  var api = {
    ready: null,
    call: function (method, params) {
      var deferred = Promise.withResolvers();
      var id = ++seq;
      pending.set(id, deferred);
      parent.postMessage({ __ompchamber: 'call', id: id, method: method, params: params || null }, '*');
      return deferred.promise;
    },
    onTheme: null,
    onContext: null
  };
  var initDeferred = Promise.withResolvers();
  api.ready = initDeferred.promise;
  var greet = null;
  var settled = false;
  function stopGreeting() {
    if (greet) { clearInterval(greet); greet = null; }
  }
  window.addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var data = event.data;
    if (!data) return;
    // 'context' is a later 'init': same fields, applied the same way, so a
    // workspace the chamber resolved after the handshake still reaches a panel
    // that already rendered. Re-applying is idempotent.
    if (data.__ompchamber === 'init' || data.__ompchamber === 'context') {
      stopGreeting();
      api.assetBase = data.assetBase;
      api.panelKey = data.panelKey;
      api.title = data.title;
      api.theme = data.theme;
      api.capabilities = data.capabilities || [];
      api.sessionId = data.sessionId;
      api.workspacePath = data.workspacePath;
      // Only the first one settles 'ready'; a later 'context' has already
      // resolved it, and re-resolving is a no-op that would be misleading to
      // read as "the panel re-initialised".
      if (!settled) {
        settled = true;
        initDeferred.resolve(api);
      } else if (typeof api.onContext === 'function') {
        api.onContext(data);
      }
      return;
    }
    if (data.__ompchamber === 'theme') {
      api.theme = data.theme;
      if (typeof api.onTheme === 'function') api.onTheme(data.theme);
      return;
    }
    if (data.__ompchamber !== 'result') return;
    var entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.ok) entry.resolve(data.value);
    else entry.reject(new Error(data.error || 'Panel call failed'));
  });
  window.acquireChamberPanel = function () { return api; };
  var attempts = 0;
  greet = setInterval(function () {
    attempts += 1;
    if (attempts > 40) {
      stopGreeting();
      return;
    }
    parent.postMessage({ __ompchamber: 'ready' }, '*');
  }, 250);
  parent.postMessage({ __ompchamber: 'ready' }, '*');
})();`;
}
