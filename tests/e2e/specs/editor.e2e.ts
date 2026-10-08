/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The editor panel: open a file from the tree, edit it, save it.
 *
 * The save path is the point. It is a `POST /api/fs/write` whose outcome the
 * toolbar reports through `saveStatus` (`idle → saving → saved`, or `error`) —
 * and the failure branch is the one worth pinning, because a silent save
 * failure left the user believing the file was written. A unit test covers the
 * hook's state machine; only this shows the toolbar a person clicks going
 * through it against a real filesystem.
 *
 * The assertion is on the FILE ON DISK, not on the button. The saved state is
 * an icon swap (a check replacing the save glyph) and the control's accessible
 * name does not change, so a role-based assertion cannot see it — and "the
 * bytes landed" is the claim that matters anyway.
 *
 * The file lives in the seeded workspace, so the write lands in a temp
 * directory the harness removes — never in the repository.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, openApp } from '../fixtures/app';
import { seedWorkspace } from '../fixtures/seed';

test.describe('editor', () => {
  test('opens a file and saves an edit to disk', async ({ harness, page }) => {
    const server = await harness('real');
    const workspace = await seedWorkspace(server, 'e2e-editor');
    // The fixture file (written directly — it is the setup, not the behaviour
    // under test) lives in the temp workspace the harness owns.
    const dir = join(workspace.path, 'src');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, 'greeting.txt');
    writeFileSync(filePath, 'hello world\n');

    await openApp(page, `${server.baseURL}/?folderId=${workspace.id}`);

    // Files is the default right panel; its tree lists the workspace root.
    await page.getByText('src', { exact: true }).first().click();
    await page.getByText('greeting.txt', { exact: true }).first().click();

    // Scoped to the editor panel: the chat composer is also a `<textarea>`, and
    // an unscoped locator resolves to that one.
    const editorPanel = page.locator('[data-panel-id="editor-panel"]');
    const editor = editorPanel.locator('textarea').first();
    await expect(editor).toHaveValue(/hello world/, { timeout: 15_000 });

    // Edit, then save through the toolbar's own control — it carries the
    // `title`/`aria-label` pair every icon-only button in this app does.
    await editor.fill('hello e2e\n');
    const save = editorPanel.getByRole('button', { name: /save file/i }).first();
    await expect(save).toBeEnabled();
    const written = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname.startsWith('/api/fs'),
    );
    await save.click();
    await written;

    // The file on disk is the claim. Polled, because the write's response can
    // land a tick before the filesystem settles.
    await expect.poll(() => readFileSync(filePath, 'utf8'), { timeout: 15_000 }).toBe('hello e2e\n');

    workspace.dispose();
  });
});
