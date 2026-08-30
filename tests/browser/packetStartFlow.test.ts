import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { test } from 'node:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const ACCOUNT_ID = 'packet-start-account';
const GRID_ID = 'packet-start-grid';

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createTcpServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not reserve a test port.')));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (defaultLaunchError) {
    const executablePath = process.env.PATH
      ?.split(':')
      .map(directory => `${directory}/chromium`)
      .find(existsSync);
    if (!executablePath) throw defaultLaunchError;
    return chromium.launch({ executablePath, args: ['--no-sandbox'] });
  }
}

async function seedSavedGrid(page: Page): Promise<void> {
  await page.evaluate(async ({ accountId, gridId }) => {
    const request = indexedDB.open('vibe-atlas-collection', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'imageUrl' });
      if (!db.objectStoreNames.contains('grids')) db.createObjectStore('grids', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sync')) db.createObjectStore('sync', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['grids', 'sync'], 'readwrite');
    transaction.objectStore('grids').put({
      kind: 'grid',
      schemaVersion: 1,
      rendererVersion: 'vibe-atlas-v1',
      id: gridId,
      actorId: 'packet-actor',
      actor: 'Packet flow actor',
      actorEn: 'Packet flow actor',
      actorAccentColor: '#aabbcc',
      vibe: 'Visible source grid',
      vibeEn: 'Visible source grid',
      vibeEmoji: '✨',
      vibeSubtitle: 'Packet start regression',
      vibeSubtitleEn: 'Packet start regression',
      searchSpell: 'packet start regression',
      edition: { provider: null, misprint: false, legendary: false },
      capturedDate: '2026-08-28',
      generatedAt: '2026-08-28T12:00:00.000Z',
      savedAt: '2026-08-28T12:00:00.000Z',
      sourceRoute: '/vibe-atlas?view=collection',
      images: [{
        resultId: 'packet-grid-image',
        imageUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        sourceUrl: 'https://source.example/packet-grid',
        title: 'Packet grid image',
        gridPosition: 0,
      }],
    });
    transaction.objectStore('sync').put({
      key: 'state',
      clientId: 'packet-start-browser-test',
      activeAccountId: accountId,
      cursors: {},
      mergeDecisions: { [accountId]: false },
      mappingsByAccount: {},
      pendingDeletesByAccount: {},
      acknowledgedUpsertsByAccount: {},
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, { accountId: ACCOUNT_ID, gridId: GRID_ID });
}

async function openSavedGrid(page: Page, origin: string): Promise<void> {
  await page.goto(origin);
  await seedSavedGrid(page);
  await page.goto(`${origin}/vibe-atlas?view=collection`);
  await page.getByText('Packet flow actor').first().waitFor();
}

test('Make a post sends one direct grid source and opens the Creator OS draft', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  let createRequests = 0;
  let packetReads = 0;

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'packet@example.test', isAdmin: true },
      }),
    }));
    await page.route('**/api/idea-packets', async route => {
      if (route.request().method() === 'GET') {
        packetReads += 1;
        if (packetReads === 1) await new Promise(resolve => setTimeout(resolve, 500));
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ packets: [] }),
        });
        return;
      }
      await route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'archive is read-only' }) });
    });
    await page.route('**/api/create-handoff', async route => {
      createRequests += 1;
      const request = route.request().postDataJSON() as { source: { sourceId: string; sourceVersion: string } };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          source: request.source,
          receipt: {
            disposition: 'created',
            createUrl: 'https://create.justlikekatie.com/compose?postId=creator-draft-1',
            postId: 'creator-draft-1',
            sourceId: request.source.sourceId,
            sourceVersion: request.source.sourceVersion,
            status: 'Draft',
            workflow: 'creator-draft',
            mediaSyncState: 'synced',
          },
        }),
      });
    });
    await page.route('https://create.justlikekatie.com/compose**', route => route.fulfill({
      contentType: 'text/html',
      body: '<title>Creator OS draft</title>',
    }));

    await openSavedGrid(page, origin);
    const startButton = page.getByRole('button', { name: 'Make a post in Creator OS' });
    await startButton.click();
    await startButton.click({ force: true }).catch(() => undefined);

    await page.waitForURL('https://create.justlikekatie.com/compose?postId=creator-draft-1');
    await page.waitForTimeout(600);
    assert.equal(createRequests, 1);
  } finally {
    await browser.close();
    await server.close();
  }
});

for (const failure of [
  { name: 'expired authorization', status: 401, message: 'Admin session expired. Sign in again.' },
  { name: 'persistence failure', status: 503, message: 'Saved grid handoff is temporarily unavailable.' },
]) {
  test(`Make a post keeps results visible after ${failure.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startApp();
    const browser = await launchBrowser();
    const page = await browser.newPage();
    let createRequests = 0;

    try {
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          user: { accountId: ACCOUNT_ID, email: 'packet@example.test', isAdmin: true },
        }),
      }));
      await page.route('**/api/idea-packets', route => {
        if (route.request().method() === 'GET') {
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ packets: [] }) });
        }
        return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'archive is read-only' }) });
      });
      await page.route('**/api/create-handoff', route => {
        createRequests += 1;
        return route.fulfill({
          status: failure.status,
          contentType: 'application/json',
          body: JSON.stringify({ error: failure.message }),
        });
      });

      await openSavedGrid(page, origin);
      await page.getByRole('button', { name: 'Make a post in Creator OS' }).click();
      await page.getByRole('status').filter({ hasText: failure.message }).waitFor();
      assert.equal(new URL(page.url()).search, '?view=collection');
      assert.equal(createRequests, 1);
      await page.getByText('Packet flow actor').first().waitFor();
    } finally {
      await browser.close();
      await server.close();
    }
  });
}