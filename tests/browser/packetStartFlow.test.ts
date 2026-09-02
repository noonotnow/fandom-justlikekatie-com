import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const ACCOUNT_ID = 'packet-start-account';
const GRID_ID = 'packet-start-grid';

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('The browser test server did not expose a TCP port.');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
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
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
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

async function mockReleaseDesk(page: Page): Promise<void> {
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
}

async function openOperatorConsole(page: Page, origin: string): Promise<void> {
  await page.goto(origin);
  await seedSavedGrid(page);
  await page.goto(`${origin}/vibe-atlas?view=collection`);
  await page.getByText('Packet flow actor').first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Make a post in Workstation' }).count(), 0);
  await page.goto(`${origin}/vibe-atlas?admin=true`);
  await page.getByRole('heading', { name: 'Release Desk' }).waitFor();
  const gridSelect = page.getByLabel('Saved FANDOM grid');
  await gridSelect.waitFor();
  assert.equal(await gridSelect.inputValue(), GRID_ID);
}

async function mockSelectedGridSync(page: Page): Promise<() => number> {
  let syncRequests = 0;
  await page.route('**/api/collection/sync', async route => {
    const request = route.request().postDataJSON() as {
      expectedAccountId: string;
      operations: Array<{
        type: string;
        mutationId: string;
        localId: string;
        item?: { kind?: string; id?: string };
      }>;
    };
    syncRequests += 1;

    assert.equal(request.expectedAccountId, ACCOUNT_ID);
    assert.equal(request.operations.length, 1, 'only the selected grid should be synced');
    const [operation] = request.operations;
    assert.equal(operation.type, 'upsert');
    assert.equal(operation.item?.kind, 'grid');
    assert.equal(operation.item?.id, GRID_ID);

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cursor: syncRequests,
        items: [{
          ...operation.item,
          id: 'packet-start-grid-server',
          localId: operation.localId,
        }],
        tombstones: [],
        mappings: { [operation.localId]: 'packet-start-grid-server' },
        acknowledgedMutationIds: [operation.mutationId],
      }),
    });
  });
  return () => syncRequests;
}

async function mockCollectionMedia(page: Page): Promise<() => number> {
  let uploads = 0;
  await page.route('**/api/collection/media?*', async route => {
    uploads += 1;
    const url = new URL(route.request().url());
    const itemId = url.searchParams.get('itemId') || '';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        media: {
          schemaVersion: 1,
          assetId: '11111111-1111-4111-8111-111111111111',
          deliveryUrl: 'https://media.justlikekatie.com/images/sha256/browser-source.png',
          thumbnailUrl: 'https://media.justlikekatie.com/images/sha256/browser-source-thumb.png',
          mimeType: 'image/png',
          sizeBytes: 68,
          checksum: 'a'.repeat(64),
          dimensions: { width: 1, height: 1 },
          association: { type: 'collection', id: 'vibe-atlas', itemId },
        },
      }),
    });
  });
  return () => uploads;
}

test('Operator Console sends one direct grid source and opens the Workstation draft', { timeout: 60_000 }, async () => {
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
    await mockReleaseDesk(page);
    const getMediaUploads = await mockCollectionMedia(page);
    const getSyncRequests = await mockSelectedGridSync(page);
    await page.route('**/api/workstation-handoff', async route => {
      assert.equal(getMediaUploads(), 1, 'the source image must be durable before Collection sync');
      assert.equal(getSyncRequests(), 1, 'the selected grid must sync before its handoff is created');
      createRequests += 1;
      const request = route.request().postDataJSON() as {
        source: { sourceId: string; sourceVersion: string; platforms: string[] };
      };
      assert.deepEqual(request.source.platforms, ['rednote', 'weibo', 'instagram']);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          source: request.source,
          receipt: {
            disposition: 'created',
            deliverableId: 'fandom:grid:packet-start-grid-server:live-grid',
            deepLink: 'https://workstation.justlikekatie.com/compose?postId=creator-draft-1',
            postId: 'creator-draft-1',
            postUrl: 'https://workstation.justlikekatie.com/drafts/creator-draft-1',
            sourceVersion: 431,
            status: 'Draft',
            workflow: 'direct',
            mediaSyncState: 'synced',
            warnings: [],
          },
        }),
      });
    });
    await page.route('https://workstation.justlikekatie.com/compose**', route => route.fulfill({
      contentType: 'text/html',
      body: '<title>Workstation draft</title>',
    }));

    await openOperatorConsole(page, origin);
    await page.getByRole('checkbox', { name: /Weibo/ }).check();
    await page.getByRole('checkbox', { name: /Instagram/ }).check();
    await page.getByText('Selected for this draft: Rednote + Weibo + Instagram').waitFor();
    const startButton = page.getByRole('button', { name: 'Make a post in Workstation' });
    await startButton.click();
    await startButton.click({ force: true }).catch(() => undefined);

    await page.waitForURL('https://workstation.justlikekatie.com/compose?postId=creator-draft-1');
    await page.waitForTimeout(600);
    assert.equal(createRequests, 1);
    assert.equal(getMediaUploads(), 1);
    assert.equal(getSyncRequests(), 1);
  } finally {
    await browser.close();
    await server.close();
  }
});

for (const failure of [
  {
    name: 'expired authorization',
    status: 401,
    responseBody: JSON.stringify({ error: 'Admin session expired. Sign in again.' }),
    contentType: 'application/json',
    visibleMessage: 'Admin session expired. Sign in again.',
  },
  {
    name: 'persistence failure',
    status: 503,
    responseBody: JSON.stringify({ error: 'Saved grid handoff is temporarily unavailable.' }),
    contentType: 'application/json',
    visibleMessage: 'Saved grid handoff is temporarily unavailable.',
  },
  {
    name: 'malformed HTML response',
    status: 502,
    responseBody: '<html><body>private upstream failure</body></html>',
    contentType: 'text/html',
    visibleMessage: 'Workstation returned an unreadable draft receipt.',
  },
]) {
  test(`Operator Console keeps results visible after ${failure.name}`, { timeout: 60_000 }, async () => {
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
      await mockReleaseDesk(page);
      const getMediaUploads = await mockCollectionMedia(page);
      const getSyncRequests = await mockSelectedGridSync(page);
      await page.route('**/api/workstation-handoff', route => {
        assert.equal(getMediaUploads(), 1, 'the source image must be durable before Collection sync');
        assert.equal(getSyncRequests(), 1, 'the selected grid must sync before its handoff is created');
        createRequests += 1;
        return route.fulfill({
          status: failure.status,
          contentType: failure.contentType,
          body: failure.responseBody,
        });
      });

      await openOperatorConsole(page, origin);
      await page.getByRole('button', { name: 'Make a post in Workstation' }).click();
      await page.getByRole('alert').filter({ hasText: failure.visibleMessage }).waitFor();
      await page.getByRole('link', { name: 'Open Your Collection' }).waitFor();
      await page.getByRole('link', { name: 'Open Workstation' }).waitFor();
      assert.equal(new URL(page.url()).search, '?admin=true');
      assert.equal(createRequests, 1);
      assert.equal(getMediaUploads(), 1);
      assert.equal(getSyncRequests(), 1);
      assert.equal(await page.getByLabel('Saved FANDOM grid').inputValue(), GRID_ID);
    } finally {
      await browser.close();
      await server.close();
    }
  });
}