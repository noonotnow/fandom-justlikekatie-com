import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from '@playwright/test';

const ACCOUNT_ID = 'collection-cleanup-account';
const GRID_ID = 'pending-unmount-grid';
const CARD_URL = 'https://images.example/pending-unmount-card.jpg';

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

async function seedCollection(page: Page): Promise<void> {
  await page.evaluate(async ({ accountId, gridId, cardUrl }) => {
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
    const transaction = db.transaction(['cards', 'grids', 'sync'], 'readwrite');
    transaction.objectStore('grids').put({
      kind: 'grid',
      schemaVersion: 1,
      rendererVersion: 'vibe-atlas-v1',
      id: gridId,
      actorId: 'cleanup-actor',
      actor: 'Grid cleanup actor',
      actorEn: 'Grid cleanup actor',
      actorAccentColor: '#aabbcc',
      vibe: 'Unmount test',
      vibeEn: 'Unmount test',
      vibeEmoji: '🧪',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      searchSpell: 'unmount test',
      edition: { provider: null, misprint: false, legendary: false },
      capturedDate: '2026-08-21',
      generatedAt: '2026-08-21T10:00:00.000Z',
      savedAt: '2026-08-21T10:00:00.000Z',
      sourceRoute: '/test',
      images: [{
        resultId: 'grid-cleanup-image',
        imageUrl: 'https://images.example/pending-unmount-grid.jpg',
        sourceUrl: 'https://source.example/grid-cleanup',
        title: 'Grid cleanup image',
        gridPosition: 0,
      }],
    });
    transaction.objectStore('cards').put({
      imageUrl: cardUrl,
      thumbnailUrl: 'https://images.example/pending-unmount-card-thumb.jpg',
      actor: 'Card cleanup actor',
      actorEn: 'Card cleanup actor',
      vibe: 'Unmount test',
      vibeEn: 'Unmount test',
      vibeEmoji: '🧪',
      capturedDate: '2026-08-21',
      savedAt: '2026-08-21T10:00:00.000Z',
      sourceRoute: '/test',
    });
    transaction.objectStore('sync').put({
      key: 'state',
      clientId: 'collection-cleanup-browser-test',
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
  }, { accountId: ACCOUNT_ID, gridId: GRID_ID, cardUrl: CARD_URL });
}

async function collectionContents(page: Page): Promise<{
  grid: unknown;
  card: unknown;
  cleanupQueue: Array<{ gridId: string; accountId: string }>;
}> {
  return page.evaluate(async ({ gridId, cardUrl }) => {
    const request = indexedDB.open('vibe-atlas-collection', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['cards', 'grids'], 'readonly');
    const gridRequest = transaction.objectStore('grids').get(gridId);
    const cardRequest = transaction.objectStore('cards').get(cardUrl);
    const [grid, card] = await Promise.all([
      new Promise<unknown>((resolve, reject) => {
        gridRequest.onsuccess = () => resolve(gridRequest.result);
        gridRequest.onerror = () => reject(gridRequest.error);
      }),
      new Promise<unknown>((resolve, reject) => {
        cardRequest.onsuccess = () => resolve(cardRequest.result);
        cardRequest.onerror = () => reject(cardRequest.error);
      }),
    ]);
    return {
      grid,
      card,
      cleanupQueue: JSON.parse(localStorage.getItem('fandom-export-cleanup-queue') || '[]'),
    };
  }, { gridId: GRID_ID, cardUrl: CARD_URL });
}

test('Collection commits pending grid and saved-result removals when navigation unmounts it', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const exportCleanupRequests: string[] = [];

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', isMember: true }),
    }));
    await page.route(
      url => new URL(url).pathname === '/.netlify/functions/grid-exports',
      async route => {
        if (route.request().method() === 'DELETE') exportCleanupRequests.push(route.request().url());
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'retry later' }) });
      },
    );

    await page.goto(origin);
    await seedCollection(page);
    await page.goto(`${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await page.getByRole('button', { name: '今日之星 · Daily' }).click();

    await page.getByRole('button', { name: 'Your Collection · Saved Grids and Grid Builder' }).click();
    await page.getByRole('button', { name: 'Saved results' }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: '今日之星 · Daily' }).click();

    await expectEventually(async () => {
      const contents = await collectionContents(page);
      assert.equal(contents.grid, undefined, 'the pending grid removal must persist during unmount');
      assert.equal(contents.card, undefined, 'the pending saved-result removal must persist during unmount');
      assert.ok(exportCleanupRequests.length >= 1, 'the pending grid removal must start export cleanup during unmount');
      assert.ok(
        exportCleanupRequests.every(url => new RegExp(`gridId=${encodeURIComponent(GRID_ID)}`).test(url)),
        'the grid export cleanup must receive the pending grid id',
      );
      assert.deepEqual(
        contents.cleanupQueue,
        [{ gridId: GRID_ID, accountId: ACCOUNT_ID }],
        'the unmount cleanup must pass the current account id to persistRemoval',
      );
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

test('Collection shows local records when account sync fails', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', isMember: true }),
    }));
    await page.route('**/api/collection/sync', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Collection sync unavailable.' }),
    }));

    await page.goto(origin);
    await seedCollection(page);
    await page.evaluate(async accountId => {
      const request = indexedDB.open('vibe-atlas-collection', 3);
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction('sync', 'readwrite');
      const store = transaction.objectStore('sync');
      const state = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const read = store.get('state');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      state.mergeDecisions = { [accountId]: true };
      store.put(state);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    }, ACCOUNT_ID);

    await page.goto(`${origin}/vibe-atlas?view=collection`);
    await page.getByText('Grid cleanup actor').first().waitFor();
    await page.getByRole('status').filter({ hasText: 'account sync failed' }).waitFor();
  } finally {
    await browser.close();
    await server.close();
  }
});

test('Grid Builder keeps saved results but does not unpack saved grids into its source pool', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', isMember: true }),
    }));

    await page.goto(origin);
    await seedCollection(page);
    await page.goto(`${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Grid Builder', exact: true }).click();
    await page.getByText('1 saved result matches this lens').waitFor();
    await page.getByRole('button', { name: /Card cleanup actor 1/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Grid cleanup actor 1/ }).count(), 0);
  } finally {
    await browser.close();
    await server.close();
  }
});

test('Collection result Misprints teach the curator before preserving the collectible receipt', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  let correctionRequest: Record<string, unknown> | null = null;
  let correctionRequestCount = 0;

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', isMember: true }),
    }));
    await page.route('**/api/collection/sync', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ cursor: 1, upserts: [], deletions: [] }),
    }));
    await page.route('**/.netlify/functions/actor-audits', async route => {
      correctionRequestCount += 1;
      correctionRequest = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          misprint: {
            receiptId: 'collection-misprint-receipt',
            reason: 'wrong_actor',
            label: 'Some Other Man™',
            correctionScope: 'actor_identity',
            actualIdentity: 'Zhang Linghe',
            note: 'A beloved collectible, but absolutely not this actor.',
            markedAt: '2026-09-06T16:12:00.000Z',
            candidate: { imageDigest: null },
          },
          calibrationStatus: 'applied',
        }),
      });
    });

    await page.goto(origin);
    await seedCollection(page);
    await page.goto(`${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Saved results' }).click();
    await page.getByText('Card cleanup actor').first().waitFor();
    await page.getByText('Mark Misprint', { exact: true }).click();
    await page.getByLabel('Who wandered in?').fill('Zhang Linghe');
    await page.getByLabel(/Curator note/).fill('A beloved collectible, but absolutely not this actor.');
    await page.getByRole('button', { name: 'Preserve & teach curator' }).click();
    await page.getByText(/Some Other Man™ preserved/).waitFor();

    assert.equal(correctionRequest?.action, 'mark_collection_misprint');
    assert.equal(correctionRequest?.actorName, 'Card cleanup actor');
    assert.equal(correctionRequest?.reason, 'wrong_actor');
    assert.equal(correctionRequest?.actualIdentity, 'Zhang Linghe');
    const stored = await collectionContents(page);
    const card = stored.card as {
      misprint?: {
        label?: string;
        markedAt?: string;
        learningScope?: string;
        calibrationStatus?: string;
        provenance?: { correctionReceiptId?: string };
      };
    };
    assert.equal(card.misprint?.label, 'Some Other Man™');
    assert.equal(card.misprint?.markedAt, '2026-09-06T16:12:00.000Z');
    assert.equal(card.misprint?.learningScope, 'actor_identity');
    assert.equal(card.misprint?.calibrationStatus, 'applied');
    assert.equal(card.misprint?.provenance?.correctionReceiptId, 'collection-misprint-receipt');

    const collectible = page.locator('article').filter({ hasText: 'Card cleanup actor' }).first();
    await collectible.getByRole('button', { name: 'Make Legendary' }).click();
    await collectible.getByRole('button', { name: 'Remove Legendary' }).waitFor();
    let promoted = (await collectionContents(page)).card as {
      misprint?: { calibrationStatus?: string };
      legendaryMisprint?: unknown;
    };
    assert.equal(promoted.misprint?.calibrationStatus, 'applied');
    assert.ok(promoted.legendaryMisprint);

    await collectible.getByRole('button', { name: 'Remove Legendary' }).click();
    await collectible.getByRole('button', { name: 'Make Legendary' }).waitFor();
    promoted = (await collectionContents(page)).card as {
      misprint?: { calibrationStatus?: string };
      legendaryMisprint?: unknown;
    };
    assert.equal(promoted.misprint?.calibrationStatus, 'applied');
    assert.equal(promoted.legendaryMisprint, undefined);

    await collectible.getByRole('button', { name: 'Move to Middle-earth' }).click();
    await page.getByText('Saved result moved to the Middle-earth Collection.').waitFor();
    const moved = (await collectionContents(page)).card as {
      collectionScope?: string;
      misprint?: { calibrationStatus?: string };
    };
    assert.equal(moved.collectionScope, 'middle-earth');
    assert.equal(moved.misprint?.calibrationStatus, 'applied');
    assert.equal(correctionRequestCount, 1);
  } finally {
    await browser.close();
    await server.close();
  }
});

test('Collection commits a pending removal after the browser page reloads', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const exportCleanupRequests: string[] = [];

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));
    await page.route(
      url => new URL(url).pathname === '/.netlify/functions/grid-exports',
      async route => {
        if (route.request().method() === 'DELETE') exportCleanupRequests.push(route.request().url());
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'retry later' }) });
      },
    );

    await page.goto(origin);
    await seedCollection(page);
    await page.goto(`${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Remove' }).first().click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem('fandom-pending-collection-removal') !== null),
      true,
      'the pending removal must be durable before the page is reloaded',
    );

    await page.reload();
    await expectEventually(async () => {
      const contents = await collectionContents(page);
      assert.equal(contents.grid, undefined, 'the pending grid removal must persist after page reload');
      assert.ok(exportCleanupRequests.length >= 1, 'reload recovery must start grid export cleanup');
      assert.deepEqual(
        contents.cleanupQueue,
        [{ gridId: GRID_ID, accountId: ACCOUNT_ID }],
        'reload recovery must preserve the owning account for export cleanup',
      );
      assert.equal(
        await page.evaluate(() => localStorage.getItem('fandom-pending-collection-removal')),
        null,
        'the durable removal intent must clear after recovery commits',
      );
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

test('Collection replays a saved-result removal left durable by a closed page', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));

    await page.goto(origin);
    await seedCollection(page);
    await page.evaluate(({ cardUrl, accountId }) => {
      localStorage.setItem('fandom-pending-collection-removal', JSON.stringify({
        token: 'closed-page-card-removal',
        kind: 'card',
        record: {
          imageUrl: cardUrl,
          thumbnailUrl: 'https://images.example/pending-unmount-card-thumb.jpg',
          actor: 'Card cleanup actor',
          actorEn: 'Card cleanup actor',
          vibe: 'Unmount test',
          vibeEn: 'Unmount test',
          vibeEmoji: '🧪',
          capturedDate: '2026-08-21',
          savedAt: '2026-08-21T10:00:00.000Z',
          sourceRoute: '/test',
        },
        accountId,
      }));
    }, { cardUrl: CARD_URL, accountId: ACCOUNT_ID });

    await page.goto(`${origin}/vibe-atlas?view=collection`);
    await expectEventually(async () => {
      const contents = await collectionContents(page);
      assert.notEqual(contents.grid, undefined, 'recovery must not remove unrelated grids');
      assert.equal(contents.card, undefined, 'the saved result must be removed when the collection reopens');
      assert.equal(
        await page.evaluate(() => localStorage.getItem('fandom-pending-collection-removal')),
        null,
        'the durable removal intent must clear only after recovery commits',
      );
    });
  } finally {
    await browser.close();
    await server.close();
  }
});

async function expectEventually(assertion: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  throw lastError;
}