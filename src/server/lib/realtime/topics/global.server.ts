/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The GLOBAL topics: `usage`, `schedule`, `panels` and `models`.
 *
 * None is scoped to a session or a workspace, and all four describe state the
 * chamber reads from a library the HTTP routes already call — so each resolver
 * here is a direct call, with no route extraction needed.
 *
 * `panels` and `models` are large payloads produced on demand, so their
 * publishers re-snapshot the topic rather than streaming every intermediate
 * state.
 */

import {
  TOPIC_MODELS,
  TOPIC_PANELS,
  TOPIC_SCHEDULE,
  TOPIC_USAGE,
} from '@/shared/lib/realtime/protocol';
import { type TopicDescriptor } from '@/server/lib/realtime/hub.server';
import { listScheduledTasks } from '@/server/lib/schedule/store.server';
import { buildUsageProviders } from '@/server/lib/usage/providers.server';
import { discoverPanelPlugins } from '@/server/lib/panels/registry.server';
import { loadModelsWithCache } from '@/server/lib/models/registry.server';

/** Scheduled tasks, as the scheduler modal and its badge render them. */
function scheduleResolve(): Promise<unknown> {
  return listScheduledTasks();
}

/** Provider usage and quota — the same rows both usage surfaces derive from. */
function usageResolve(): Promise<unknown> {
  return buildUsageProviders();
}

/** The installed panel plugins and their catalog. */
function panelsResolve(): Promise<unknown> {
  return discoverPanelPlugins();
}

/** The model catalog, through the cache the HTTP route also reads. */
function modelsResolve(): Promise<unknown> {
  return loadModelsWithCache();
}

const RESOLVERS: Record<string, () => Promise<unknown>> = {
  [TOPIC_SCHEDULE]: scheduleResolve,
  [TOPIC_USAGE]: usageResolve,
  [TOPIC_PANELS]: panelsResolve,
  [TOPIC_MODELS]: modelsResolve,
};

/**
 * A descriptor for one global topic. The resolver is picked by topic name, so a
 * name with no resolver is a topic the hub does not serve.
 */
export function globalDescriptor(topic: string): TopicDescriptor {
  const resolve = RESOLVERS[topic];
  if (!resolve) throw new Error(`No global resolver for ${topic}`);
  return { resolve };
}
