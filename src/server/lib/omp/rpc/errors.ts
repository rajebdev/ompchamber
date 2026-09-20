/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared HTTP mapping for errors thrown by the omp RPC layer. Every agent
 * route that awaits an RPC command answers the same way: a 400 carrying a
 * `{ error, code }` envelope, with the code falling back per error class.
 */

import { json } from '@/server/lib/remix-compat';
import { WebRpcError } from '@/server/lib/omp/rpc/constants';
import { RpcCommandError, RpcCommandTimeoutError } from '@/server/lib/omp/rpc/process';

export function rpcErrorResponse(error: unknown): Response {
  if (error instanceof WebRpcError) {
    return json({ error: error.message, code: error.code }, { status: 400 });
  }
  if (error instanceof RpcCommandTimeoutError) {
    return json({ error: error.message, code: 'rpc_command_timeout' }, { status: 400 });
  }
  if (error instanceof RpcCommandError) {
    return json({ error: error.message, code: error.code ?? 'rpc_command_failed' }, { status: 400 });
  }
  return json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
}
