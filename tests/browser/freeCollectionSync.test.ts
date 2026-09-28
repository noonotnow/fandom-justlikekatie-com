import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

test('free account can merge a saved card without gaining Collector access', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const requests: Array<{ expectedAccountId: string; operations: Array<Record<string, unknown>> }> = [];
  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: { accountId: 'usr_free_browser', email: 'free@example.test', isAdmin: false } }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
    }));
    await page.route('**/api/collection/sync', async route => {
      const payload = route.request().postDataJSON() as typeof requests[number] & { cursor: number };
      requests.push(payload);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          schemaVersion: 1, revision: 1, cursor: 1,
          items: [], tombstones: [], mappings: {},
          acknowledgedMutationIds: payload.operations.map(operation => operation.mutationId),
        }),
      });
    });
    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Merge and sync' }).waitFor();
    await page.evaluate(async () => {
      const open = indexedDB.open('vibe-atlas-collection', 3);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const tx = db.transaction('cards', 'readwrite');
      tx.objectStore('cards').put({
        imageUrl: 'https://images.example/free-save.jpg',
        thumbnailUrl: 'https://images.example/free-save.jpg',
        actor: 'Free save actor', actorEn: 'Free save actor',
        vibe: 'Free save', vibeEn: 'Free save', vibeEmoji: '✨',
        capturedDate: '2026-09-26', savedAt: '2026-09-26T10:00:00.000Z',
        sourceRoute: '/vibe-atlas',
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });
    await page.getByRole('button', { name: 'Merge and sync' }).click();
    await page.getByText('This device is now synced.').waitFor();
    assert.ok(requests.some(request => request.operations.some(operation =>
      (operation.item as { imageUrl?: string } | undefined)?.imageUrl === 'https://images.example/free-save.jpg',
    )));
    assert.ok(requests.every(request => request.expectedAccountId === 'usr_free_browser'));
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});