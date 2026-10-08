/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The phone layout at a real phone viewport.
 *
 * `App` picks the mobile tree from a narrow viewport, a coarse pointer or a
 * mobile UA — and that decision is made once per load and can be overridden by
 * hand, which is exactly the kind of logic a unit test can call but cannot
 * prove renders. The bugs this class of spec catches are layout ones: a control
 * that only exists on the desktop tree, a drawer that opens behind the content,
 * a composer that cannot send without a hardware Enter key.
 *
 * Run under the `mobile-chromium` project (Pixel 7), so the viewport and the
 * `(pointer: coarse)` media query are the device's, not a resized desktop.
 */

import { test, expect, openApp } from '../fixtures/app';
import { seedWorkspace } from '../fixtures/seed';
import { TESTID } from '../fixtures/selectors';

test.describe('mobile layout', () => {
  test('renders the mobile tree with its header controls', async ({ app }) => {
    // The header's own controls are the marker that the MOBILE tree mounted —
    // "Open Sessions" and "Open Right Panel" do not exist on the desktop tree.
    await expect(app.getByRole('button', { name: 'Open Sessions' })).toBeVisible();
    await expect(app.getByRole('button', { name: 'Open Right Panel' })).toBeVisible();
  });

  test('opens the sessions drawer', async ({ app }) => {
    await app.getByRole('button', { name: 'Open Sessions' }).click();
    // The drawer is the sidebar at phone width; the seeded demo folders are its
    // content, so their presence is the drawer being open and populated.
    await expect(app.getByRole('button', { name: /new session/i }).first()).toBeVisible();
  });

  test('sends a prompt from the phone composer', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-mobile');

    await openApp(page, `${server.baseURL}/?folderId=${workspace.id}`);
    await expect(page.getByText('e2e-mobile').first()).toBeVisible();

    const input = page.locator(`[data-testid="${TESTID.composerInput}"]`);
    await expect(input).toBeVisible();
    await input.fill('hello from the phone');
    // The phone variant makes a bare Enter insert a newline (no Shift key on a
    // soft keyboard), so the send control is the affordance a phone has.
    await page.getByRole('button', { name: /send message/i }).first().click();

    await expect(page.getByText('Response to: hello from the phone').first()).toBeVisible({ timeout: 30_000 });
    workspace.dispose();
  });
});
