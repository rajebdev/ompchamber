/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The sidebar: the workspace list, the settings entry, and session switching.
 *
 * These are the surfaces every other spec builds on — a spec that cannot open
 * a session cannot test anything below the shell — and they are also where an
 * accessibility regression is invisible to a unit test: the footer's Settings
 * and Info controls were bare `<svg onClick>` glyphs until this spec needed to
 * address them, which is exactly the "unreachable by keyboard" shape AGENTS.md
 * warns about. The spec addresses them by ROLE and NAME, so the day one loses
 * its name the spec fails rather than silently clicking a different glyph.
 */

import { test, expect, openApp } from '../fixtures/app';
import { seedWorkspace } from '../fixtures/seed';
import { TESTID } from '../fixtures/selectors';

test.describe('sidebar', () => {
  test('lists a seeded workspace folder', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-sidebar-list');

    await openApp(page, server.baseURL);
    await expect(page.getByText('e2e-sidebar-list').first()).toBeVisible();

    workspace.dispose();
  });

  test('opens the settings modal from the footer', async ({ app }) => {
    // The footer's Settings control is a button with an accessible name — this
    // is the assertion that keeps it one.
    await app.getByRole('button', { name: 'Settings' }).first().click();
    await expect(app.getByRole('button', { name: 'Close settings' })).toBeVisible();
    // The modal renders the category rail; Appearance is a stable entry.
    await expect(app.getByRole('button', { name: 'Appearance' })).toBeVisible();
  });

  test('creates a new session and switches the active one', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-sidebar-switch');

    await openApp(page, `${server.baseURL}/?folderId=${workspace.id}`);
    await expect(page.getByText('e2e-sidebar-switch').first()).toBeVisible();

    // New Session opens a pending `new-…` chat; the URL carries it, which is
    // the observable the switch depends on.
    await page.getByRole('button', { name: /new session/i }).first().click();
    await expect(page).toHaveURL(/sessionId=new-/);

    workspace.dispose();
  });

  test('the app root is present and the sidebar is rendered', async ({ app }) => {
    await expect(app.locator(`[data-testid="${TESTID.appRoot}"]`)).toBeVisible();
    await expect(app.getByRole('button', { name: /new session/i }).first()).toBeVisible();
  });
});
