import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ADMIN_USER = {
  accountId: 'admin-magic-link-browser-test',
  email: 'admin@example.test',
  isAdmin: true,
};

const BROKEN_ADMIN_CALLBACKS = [
  {
    name: 'missing token',
    fragment: 'next=admin',
    notice: 'This sign-in link is incomplete. Request a new link and try again.',
  },
  {
    name: 'malformed fragment',
    fragment: 'token=%E0%A4%A&next=admin',
    notice: 'This sign-in link is damaged. Request a new link and try again.',
  },
] as const;

const BROKEN_MEMBER_CALLBACKS = [
  {
    destination: 'membership',
  },
  {
    destination: 'archive:2026-09-20',
  },
] as const;

async function mockSharedAppRequests(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
  }));
  await page.route('**/.netlify/functions/actor-audits', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      releaseInventory: {
        releaseReadyPairingCount: 0,
        unusedWithinRecentWindowPairingCount: 0,
        freshCuratorPairingCount: 0,
        rescueBackupPairingCount: 0,
        rescueBackupBoardCount: 0,
        actorPacks: [],
      },
    }),
  }));
  await page.route('**/.netlify/functions/daily-drop-operations', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ editions: [] }),
  }));
  await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Not needed by this test.' }),
  }));
}

function callbackStageError(engine: string, stage: string, error: unknown, callback = 'admin sign-in'): Error {
  return new Error(`${engine} ${callback} callback failed during ${stage}.`, { cause: error });
}

for (const engine of BROWSER_ENGINES) {
  test(`admin magic-link callback refreshes the session before rendering Operator Console in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const requestOrder: string[] = [];
    let verified = false;
    let stage = 'request mocking';

    try {
      await mockSharedAppRequests(page);
      stage = 'notification transport blocking';
      await page.addInitScript(() => {
        Reflect.deleteProperty(globalThis, 'BroadcastChannel');
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (this === localStorage && key === 'fandom-collection-notify') {
            Reflect.set(globalThis, '__notificationWriteRejected', true);
            throw new DOMException('Storage access is blocked.', 'SecurityError');
          }
          return originalSetItem.call(this, key, value);
        };
      });
      await page.route('**/api/auth/verify', async route => {
        requestOrder.push('verify');
        assert.deepEqual(route.request().postDataJSON(), { token: 'valid-admin-token' });
        verified = true;
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      });
      await page.route('**/api/auth/session', async route => {
        requestOrder.push(verified ? 'admin-session' : 'anonymous-session');
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ user: verified ? ADMIN_USER : null }),
        });
      });

      stage = 'fragment parsing and token verification';
      await gotoTestPage(page, `${origin}/auth/verify#token=valid-admin-token&next=admin`);

      stage = 'blocked notification isolation';
      assert.equal(
        await page.evaluate(() => typeof BroadcastChannel),
        'undefined',
        'BroadcastChannel must stay unavailable while the callback runs',
      );
      assert.equal(
        await page.evaluate(() => Reflect.get(globalThis, '__notificationWriteRejected')),
        true,
        'the callback must attempt the local-storage notification fallback',
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem('fandom-collection-notify')),
        null,
        'the rejected notification write must not be persisted',
      );

      stage = 'Operator Console rendering';
      await page.getByRole('heading', { name: 'Release Desk' }).waitFor();

      stage = 'history replacement';
      assert.equal(new URL(page.url()).pathname, '/vibe-atlas');
      assert.equal(new URL(page.url()).search, '?admin=true');
      assert.equal(new URL(page.url()).hash, '');

      stage = 'session refresh';
      const verifyIndex = requestOrder.indexOf('verify');
      const refreshedSessionIndex = requestOrder.indexOf('admin-session');
      assert.notEqual(verifyIndex, -1, 'the callback must verify the magic-link token');
      assert.ok(
        refreshedSessionIndex > verifyIndex,
        `the admin session must refresh after verification; observed ${requestOrder.join(' -> ')}`,
      );
      assert.equal(
        await page.getByRole('heading', { name: 'Admin sign-in required' }).count(),
        0,
        'protected content must not render through the expired-session sign-in gate',
      );
    } catch (error) {
      throw callbackStageError(engine.name, stage, error);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`failed admin magic-link callback preserves its notice and returns to Collection in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    let stage = 'request mocking';

    try {
      await mockSharedAppRequests(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/auth/verify', async route => {
        assert.deepEqual(route.request().postDataJSON(), { token: 'expired-admin-token' });
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'This admin sign-in link has expired.' }),
        });
      });

      stage = 'fragment parsing and rejected token verification';
      await gotoTestPage(page, `${origin}/auth/verify#token=expired-admin-token&next=admin`);

      stage = 'Collection fallback rendering';
      await page.getByRole('heading', { name: 'Your Collection' }).waitFor();

      stage = 'failed callback notice restoration';
      await page.getByRole('status').filter({
        hasText: 'This admin sign-in link has expired.',
      }).waitFor();

      stage = 'history replacement';
      assert.equal(new URL(page.url()).pathname, '/vibe-atlas');
      assert.equal(new URL(page.url()).search, '?admin=true');
      assert.equal(new URL(page.url()).hash, '');

      stage = 'Operator Console access prevention';
      assert.equal(
        await page.getByRole('heading', { name: 'Release Desk' }).count(),
        0,
        'a failed callback must not expose the Operator Console',
      );
    } catch (error) {
      throw callbackStageError(engine.name, stage, error);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  for (const brokenCallback of BROKEN_ADMIN_CALLBACKS) {
    test(`admin callback with ${brokenCallback.name} returns safely to Collection in ${engine.name}`, { timeout: 60_000 }, async () => {
      const { server, origin } = await startViteTestServer();
      const { browser, page } = await launchPageForServer(server, engine.type);
      let stage = 'request mocking';
      let verificationRequests = 0;

      try {
        await mockSharedAppRequests(page);
        await page.route('**/api/auth/session', route => route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ user: null }),
        }));
        await page.route('**/api/auth/verify', route => {
          verificationRequests += 1;
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'A broken callback must not be verified.' }),
          });
        });

        stage = `${brokenCallback.name} fragment rejection`;
        await gotoTestPage(page, `${origin}/auth/verify#${brokenCallback.fragment}`);

        stage = 'Collection fallback rendering';
        await page.getByRole('heading', { name: 'Your Collection' }).waitFor();

        stage = 'recovery notice restoration';
        await page.getByRole('status').filter({ hasText: brokenCallback.notice }).waitFor();

        stage = 'callback history replacement';
        const fallbackUrl = new URL(page.url());
        assert.equal(fallbackUrl.pathname, '/vibe-atlas');
        assert.equal(fallbackUrl.search, '?view=collection');
        assert.equal(fallbackUrl.hash, '');

        stage = 'verification bypass';
        assert.equal(
          verificationRequests,
          0,
          'a missing or malformed token must be rejected before contacting the verification endpoint',
        );

        stage = 'Operator Console access prevention';
        assert.equal(
          await page.getByRole('heading', { name: 'Release Desk' }).count(),
          0,
          'a broken callback must not expose the Operator Console',
        );
      } catch (error) {
        throw callbackStageError(engine.name, stage, error);
      } finally {
        await closeBrowserAndServer(browser, server);
      }
    });
  }

  for (const destination of BROKEN_MEMBER_CALLBACKS) {
    for (const brokenCallback of BROKEN_ADMIN_CALLBACKS) {
      test(`${destination.destination} callback with ${brokenCallback.name} returns safely to Collection in ${engine.name}`, { timeout: 60_000 }, async () => {
        const { server, origin } = await startViteTestServer();
        const { browser, page } = await launchPageForServer(server, engine.type);
        let stage = 'request mocking';
        let verificationRequests = 0;

        try {
          await mockSharedAppRequests(page);
          await page.route('**/api/auth/session', route => route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ user: null }),
          }));
          await page.route('**/api/auth/verify', route => {
            verificationRequests += 1;
            return route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'A broken callback must not be verified.' }),
            });
          });

          const fragment = brokenCallback.name === 'missing token'
            ? `next=${encodeURIComponent(destination.destination)}`
            : `token=%E0%A4%A&next=${encodeURIComponent(destination.destination)}`;
          stage = `${destination.destination} ${brokenCallback.name} fragment rejection`;
          await gotoTestPage(page, `${origin}/auth/verify#${fragment}`);

          stage = 'Collection fallback rendering';
          await page.getByRole('heading', { name: 'Your Collection' }).waitFor();

          stage = 'recovery notice restoration';
          await page.getByRole('status').filter({ hasText: brokenCallback.notice }).waitFor();

          stage = 'callback and destination history replacement';
          const fallbackUrl = new URL(page.url());
          assert.equal(fallbackUrl.pathname, '/vibe-atlas');
          assert.equal(fallbackUrl.search, '?view=collection');
          assert.equal(fallbackUrl.hash, '');
          assert.equal(fallbackUrl.searchParams.get('view'), 'collection');
          assert.equal(fallbackUrl.searchParams.has('date'), false);

          stage = 'verification bypass';
          assert.equal(
            verificationRequests,
            0,
            'a missing or malformed token must be rejected before contacting the verification endpoint',
          );
        } catch (error) {
          throw callbackStageError(engine.name, stage, error, destination.destination);
        } finally {
          await closeBrowserAndServer(browser, server);
        }
      });
    }
  }
}
