import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from '@playwright/test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACCOUNT_ID = 'blocked-logout-account';
const ACCOUNT_CARD = 'https://images.example/account-only.jpg';
const DEVICE_CARD = 'https://images.example/device-owned.jpg';

async function seedCards(page: Page): Promise<void> {
  await page.evaluate(async ({ accountId, accountCard, deviceCard }) => {
    const request = indexedDB.open('vibe-atlas-collection', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('cards', 'readwrite');
    const cards = tx.objectStore('cards');
    for (const [imageUrl, ownerAccountId] of [
      [accountCard, accountId],
      [deviceCard, undefined],
    ]) {
      cards.put({
        imageUrl,
        ownerAccountId,
        actor: 'Logout test actor',
        actorEn: 'Logout test actor',
        vibe: 'Saved result',
        vibeEn: 'Saved result',
        vibeEmoji: '✨',
        capturedDate: '2026-09-20',
        savedAt: '2026-09-20T10:00:00.000Z',
        sourceRoute: '/vibe-atlas',
      });
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }, { accountId: ACCOUNT_ID, accountCard: ACCOUNT_CARD, deviceCard: DEVICE_CARD });
}

for (const engine of BROWSER_ENGINES) {
  test(`sign-out finishes when cross-tab notifications are blocked in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    let signedIn = true;
    let logoutRequests = 0;
    let stage = 'setup';

    try {
      await page.addInitScript(() => {
        Reflect.deleteProperty(globalThis, 'BroadcastChannel');
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (this === localStorage && key === 'fandom-collection-notify') {
            Reflect.set(globalThis, '__blockedLogoutNotificationWrites', (
              Number(Reflect.get(globalThis, '__blockedLogoutNotificationWrites') || 0) + 1
            ));
            throw new DOMException('Storage access is blocked.', 'SecurityError');
          }
          return originalSetItem.call(this, key, value);
        };
      });
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          user: signedIn ? { accountId: ACCOUNT_ID, email: 'logout@example.test', isAdmin: false } : null,
        }),
      }));
      await page.route('**/api/auth/logout', async route => {
        logoutRequests += 1;
        assert.deepEqual(route.request().postDataJSON(), {});
        signedIn = false;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      });
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));

      stage = 'signed-in Collection';
      await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
      await page.getByRole('button', { name: 'Sign out' }).waitFor();
      await seedCards(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
      await page.getByRole('button', { name: 'Sign out' }).waitFor();
      assert.equal(await page.evaluate(() => typeof BroadcastChannel), 'undefined');

      stage = 'logout and signed-out interface';
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.getByRole('status').filter({
        hasText: 'Signed out. Local saves still work on this device.',
      }).waitFor();
      await page.getByRole('button', { name: 'Email sign-in link' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Sign out' }).count(), 0);
      assert.equal(logoutRequests, 1, 'the server must accept exactly one logout');
      assert.equal(
        await page.evaluate(() => Reflect.get(globalThis, '__blockedLogoutNotificationWrites')),
        1,
        'logout must attempt the rejected notification write without interrupting completion',
      );
      assert.equal(await page.evaluate(() => localStorage.getItem('fandom-collection-notify')), null);

      stage = 'account cache cleanup and active account reset';
      const state = await page.evaluate(async ({ accountCard, deviceCard }) => {
        const request = indexedDB.open('vibe-atlas-collection', 3);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction(['cards', 'sync'], 'readonly');
        const accountRequest = tx.objectStore('cards').get(accountCard);
        const deviceRequest = tx.objectStore('cards').get(deviceCard);
        const syncRequest = tx.objectStore('sync').get('state');
        const [account, device, sync] = await Promise.all([
          new Promise<unknown>((resolve, reject) => {
            accountRequest.onsuccess = () => resolve(accountRequest.result);
            accountRequest.onerror = () => reject(accountRequest.error);
          }),
          new Promise<unknown>((resolve, reject) => {
            deviceRequest.onsuccess = () => resolve(deviceRequest.result);
            deviceRequest.onerror = () => reject(deviceRequest.error);
          }),
          new Promise<unknown>((resolve, reject) => {
            syncRequest.onsuccess = () => resolve(syncRequest.result);
            syncRequest.onerror = () => reject(syncRequest.error);
          }),
        ]);
        return { account, device, sync };
      }, { accountCard: ACCOUNT_CARD, deviceCard: DEVICE_CARD });
      assert.equal(state.account, undefined, 'account-owned cache must be removed');
      assert.ok(state.device, 'device-owned saves must remain');
      assert.equal((state.sync as { activeAccountId?: string }).activeAccountId, undefined);
    } catch (error) {
      throw new Error(`${engine.name} blocked logout failed during ${stage}.`, { cause: error });
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}