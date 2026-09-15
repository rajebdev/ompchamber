/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Production server entry: serves the built Remix app (hashed client assets,
 * `public/`, SSR handler) and attaches the agent event WebSocket transport to
 * the same HTTP server.
 *
 * The stock `remix-serve` CLI owns its HTTP server and exposes no upgrade hook,
 * so the WebSocket endpoint used by the chat stream needs this entry instead.
 * The middleware stack below mirrors remix-serve: compression, immutable
 * hashed assets, `public/` at 1h, then the Remix request handler.
 *
 * Started by `npm start` and by `ompchamber serve --prod` (bin/lib/runtime.js).
 */

import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRequestHandler } from '@remix-run/express';
import { installGlobals } from '@remix-run/node';
import compression from 'compression';
import express from 'express';

import { attachAgentStreamWebSocket } from './agent-stream-websocket.js';

process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || undefined;

const build = await import(new URL('../build/server/index.js', import.meta.url).href);
installGlobals({ nativeFetch: build.future?.v3_singleFetch === true });

const app = express();
app.disable('x-powered-by');
// Long-lived `text/event-stream` responses must not be gzip-buffered: zlib holds
// small frames until its buffer fills, so the SSE transports would deliver
// nothing until the stream ends. Streams opt out; everything else compresses.
const shouldCompress = (req, res) => {
  const contentType = res.getHeader('Content-Type');
  if (typeof contentType === 'string' && contentType.includes('text/event-stream')) return false;
  return compression.filter(req, res);
};
app.use(compression({ filter: shouldCompress }));
app.use(build.publicPath, express.static(path.resolve(pkgRoot, build.assetsBuildDirectory), {
  immutable: true,
  maxAge: '1y',
}));
app.use(express.static(path.join(pkgRoot, 'public'), { maxAge: '1h' }));
app.all('*', createRequestHandler({ build, mode: process.env.NODE_ENV }));

const server = createServer(app);
attachAgentStreamWebSocket(server);

const onListen = () => {
  process.stdout.write(`[ompchamber] listening on http://${host ?? 'localhost'}:${port}\n`);
};

if (host) server.listen(port, host, onListen);
else server.listen(port, onListen);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => server.close());
}
