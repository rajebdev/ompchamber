/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A full chat turn, driven through the real spawn path with a scripted child.
 *
 * This is the spec the whole layer exists for. It exercises what no unit test
 * can: the server spawns `omp` (here the fake), the child streams delta
 * `message_update` frames, `delta-accumulator.ts` rebuilds the accumulated
 * message, the fold marks the run live, the realtime topic pushes it to the
 * browser, and the timeline renders the user bubble and the streamed answer —
 * with the run footer settling when `agent_end` arrives. Every one of those
 * steps has been a real regression; none is visible to a happy-dom mount.
 *
 * It runs in `real` mode (MOCK=false) with `OMPCHAMBER_OMP_BIN` pointed at the
 * scripted child, so there is no model and no network, but there IS a real
 * process, a real protocol, and a real stream.
 */

import { test, expect, openApp } from '../fixtures/app';
import { seedWorkspace } from '../fixtures/seed';
import { TESTID } from '../fixtures/selectors';
import type { Page } from '@playwright/test';

/**
 * Open a seeded workspace and send a prompt, waiting for the conditions the
 * send path actually needs.
 *
 * The wait on the folder's NAME is load-bearing, not cosmetic: `send.ts`
 * resolves the spawn `cwd` from the sidebar's folder list, which loads
 * asynchronously. Pressing Enter before that list contains the folder leaves
 * `cwd` undefined, the send falls to the MOCK path, and real mode refuses it
 * with a 400 — so nothing renders and the spec fails with "element not found"
 * for a reason nothing on screen names. Verified: without this wait the
 * `delay:` spec failed intermittently.
 */
async function sendPrompt(page: Page, server: { baseURL: string }, folderId: number, folderName: string, text: string) {
  await openApp(page, `${server.baseURL}/?folderId=${folderId}`);
  await expect(page.getByText(folderName).first()).toBeVisible();
  const input = page.locator(`[data-testid="${TESTID.composerInput}"]`);
  await expect(input).toBeVisible();
  await input.fill(text);
  await input.press('Enter');
}

test.describe('chat', () => {
  test('sends a prompt and renders the streamed answer', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-chat');

    await sendPrompt(page, server, workspace.id, 'e2e-chat', 'hello from the e2e spec');

    // The user turn renders immediately (optimistic), then the answer streams
    // in. Both are asserted by text, which is what a reader would see.
    await expect(page.getByText('hello from the e2e spec').first()).toBeVisible();
    await expect(page.getByText('Response to: hello from the e2e spec').first()).toBeVisible({ timeout: 30_000 });

    workspace.dispose();
  });

  test('settles the run footer once the turn ends', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-chat-settle');

    await sendPrompt(page, server, workspace.id, 'e2e-chat-settle', 'delay:300 settle me');

    await expect(page.getByText('Response to: delay:300 settle me').first()).toBeVisible({ timeout: 30_000 });
    // The generating indicator is gone once `agent_end` lands — the failure
    // this pins is a run that renders its answer and spins forever.
    await expect(page.getByText(/thinking/i)).toHaveCount(0, { timeout: 30_000 });

    workspace.dispose();
  });

  test('a tool call renders as a card in the timeline', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-chat-tool');

    await sendPrompt(page, server, workspace.id, 'e2e-chat-tool', 'tool:bash then answer');

    await expect(page.getByText(/bash/i).first()).toBeVisible({ timeout: 30_000 });

    workspace.dispose();
  });
});
