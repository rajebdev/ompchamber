/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GET /api/omp/session-plan?sessionId=<uuid>[&path=local://<slug>-plan.md]
 *
 * The plan-mode artifacts of one session, plus the chosen plan's body. Read-only
 * projection of omp's own files — there is no chamber-side copy, and the review
 * popup (not this view) is what decides a plan.
 *
 * MOCK mode answers a deterministic two-plan session so the panel renders its
 * full range of states (a chosen plan, an older one to switch to) without an
 * omp install.
 */

import { json, NO_STORE_HEADERS } from '@/server/lib/remix-compat';
import type { LoaderFunctionArgs } from '@/server/lib/remix-compat';
import { isMockMode } from '@/server/mock.server';
import { readSessionPlans } from '@/server/lib/omp/session/plans';
import type { SessionPlanPayload } from '@/shared/types/plan';

/** Demo session under MOCK=true: a current plan and an older one beside it. */
const MOCK_PLAN_MD = `# Add a plan panel

## Context

The chamber has no view of the plan an omp session is working from. The review
popup covers the moment of approval, and nothing covers what the plan says
afterwards — including the case where the agent rewrites it.

## Approach

- Read the session's \`local/\` artifact directory (omp's own plan root).
- List every \`<slug>-plan.md\`, newest first, and serve the chosen one.
- Take the transcript's \`mode_change\` plan path as the default when present.

## Verification

\`\`\`bash
curl -s 'http://127.0.0.1:3000/api/omp/session-plan?sessionId=<id>' | jq '.current'
\`\`\`

Both must match; then done.
`;

const MOCK_FILES = [
  { path: 'local://plan-panel-plan.md', title: 'plan-panel', modifiedAt: 0, bytes: MOCK_PLAN_MD.length },
  { path: 'local://plan-panel-v1-plan.md', title: 'plan-panel-v1', modifiedAt: 0, bytes: 412 },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  const requested = url.searchParams.get('path');

  if (isMockMode()) {
    return json(
      {
        sessionId: sessionId ?? 'mock',
        files: MOCK_FILES,
        current: MOCK_FILES[0].path,
        content: MOCK_PLAN_MD,
        truncated: false,
        generatedAt: new Date().toISOString(),
        isMock: true,
      } satisfies SessionPlanPayload,
      { headers: NO_STORE_HEADERS },
    );
  }

  if (!sessionId) return json({ error: 'sessionId is required' }, { status: 400 });

  const state = await readSessionPlans(sessionId, requested);
  const payload: SessionPlanPayload = {
    sessionId,
    ...state,
    generatedAt: new Date().toISOString(),
    isMock: false,
  };
  return json(payload, { headers: NO_STORE_HEADERS });
}
