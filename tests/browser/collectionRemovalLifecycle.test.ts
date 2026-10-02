import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type BrowserContext, type Page } from '@playwright/test';
// @ts-expect-error The Netlify handler is JavaScript without TypeScript declarations.
import { createCollectionHandlers } from '../../netlify/functions/lib/collection-api.js';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  launchBrowserForServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACCOUNT_ID = 'collection-cleanup-account';
const GRID_ID = 'pending-unmount-grid';
const CARD_URL = 'https://images.example/pending-unmount-card.jpg';

async function startApp() {
  return startViteTestServer();
}

async function seedCollection(page: Page, merge = false): Promise<void> {
  await page.evaluate(async ({ accountId, gridId, cardUrl, merge }) => {
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
      ...(merge ? { localId: 'published-grid' } : {}),
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
      ...(merge ? { localId: 'published-card' } : {}),
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
      mergeDecisions: { [accountId]: merge },
      mappingsByAccount: {},
      pendingDeletesByAccount: {},
      acknowledgedUpsertsByAccount: {},
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, { accountId: ACCOUNT_ID, gridId: GRID_ID, cardUrl: CARD_URL, merge });
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

for (const [discardKind, restoreKind] of [
  ['card', 'grid'],
  ['grid', 'card'],
] as const) {
  test(`Collection ${discardKind} discard and ${restoreKind} restore follow remote deletion across browser sessions`, { timeout: 90_000 }, async () => {
    const { server, origin } = await startApp();
    const browser = await launchBrowserForServer(server);
    const deletingContext = await browser.newContext();
    const staleContext = await browser.newContext();
    const deletingPage = await deletingContext.newPage();
    const stalePage = await staleContext.newPage();
    const entries = new Map<string, { data: unknown; etag: string }>();
    let version = 0;
    const store = {
      async get(key: string) { return structuredClone(entries.get(key)?.data ?? null); },
      async getWithMetadata(key: string) {
        const entry = entries.get(key);
        return entry ? structuredClone(entry) : null;
      },
      async setJSON(key: string, data: unknown, options: { onlyIfNew?: boolean; onlyIfMatch?: string } = {}) {
        const previous = entries.get(key);
        if ((options.onlyIfNew && previous) || (options.onlyIfMatch && options.onlyIfMatch !== previous?.etag)) {
          return { modified: false };
        }
        entries.set(key, { data: structuredClone(data), etag: `etag-${++version}` });
        return { modified: true };
      },
    };
    const handlers = createCollectionHandlers({
      auth: {
        authenticate: async () => ({ user: { accountId: ACCOUNT_ID } }),
        authenticateAdmin: async () => ({ user: { accountId: ACCOUNT_ID } }),
      },
      getStore: () => store,
    });
    const calls: Array<{ device: string; operations: Array<{ type: string; item?: { kind: string } }> }> = [];
    const installRoutes = async (context: BrowserContext, device: string) => {
      await context.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: { accountId: ACCOUNT_ID, email: 'reader@example.test' } }),
      }));
      await context.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'active', isMember: true, capabilities: ['fandom_collector'] }),
      }));
      await context.route('**/api/collection/sync', async route => {
        const payload = route.request().postDataJSON() as { operations: Array<{ type: string; item?: { kind: string } }> };
        calls.push({ device, operations: payload.operations });
        const request = new Request(`${origin}/api/collection/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: route.request().postData()!,
        });
        const response = await handlers.sync(request);
        await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
      });
    };
    try {
      await Promise.all([installRoutes(deletingContext, 'deleting'), installRoutes(staleContext, 'stale')]);
      await gotoTestPage(deletingPage, origin);
      await seedCollection(deletingPage, true);
      await gotoTestPage(deletingPage, `${origin}/vibe-atlas?view=collection`);
      await expectEventually(async () => {
        assert.equal(calls.filter(call => call.device === 'deleting').flatMap(call => call.operations).filter(op => op.type === 'upsert').length, 2);
      });

      await gotoTestPage(stalePage, `${origin}/vibe-atlas?view=collection`);
      await stalePage.getByRole('button', { name: 'Merge and sync' }).click();
      await stalePage.getByRole('article').filter({ hasText: 'Grid cleanup actor' }).waitFor();
      await stalePage.getByRole('button', { name: 'Saved results' }).click();
      await stalePage.getByRole('article').filter({ hasText: 'Card cleanup actor' }).waitFor();
      // Model a device that downloaded the records before fingerprint baselines existed.
      // Its real server identities and cursor remain intact.
      await stalePage.evaluate(async accountId => {
        const request = indexedDB.open('vibe-atlas-collection', 3);
        const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
        const tx = db.transaction('sync', 'readwrite');
        const store = tx.objectStore('sync');
        const read = store.get('state');
        read.onsuccess = () => {
          const state = read.result;
          state.remoteUpsertFingerprintsByAccount = { ...state.remoteUpsertFingerprintsByAccount, [accountId]: {} };
          store.put(state);
        };
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }, ACCOUNT_ID);
      await gotoTestPage(stalePage, 'about:blank'); // Device is offline while the other session deletes.

      await deletingPage.getByRole('button', { name: 'Remove' }).first().click();
      await deletingPage.getByRole('button', { name: 'Daily drop' }).click();
      await gotoTestPage(deletingPage, `${origin}/vibe-atlas?view=collection`);
      await deletingPage.getByRole('button', { name: 'Saved results' }).click();
      await deletingPage.getByRole('button', { name: 'Remove' }).click();
      await deletingPage.getByRole('button', { name: 'Daily drop' }).click();
      await expectEventually(async () => {
        assert.equal(calls.filter(call => call.device === 'deleting').flatMap(call => call.operations).filter(op => op.type === 'delete').length, 2);
        const serverData = entries.get(`users/${ACCOUNT_ID}`)?.data as { items: Record<string, unknown> } | undefined;
        assert.ok(serverData);
        assert.equal(Object.keys(serverData.items).length, 0);
      });

      const reconnectAt = calls.length;
      await gotoTestPage(stalePage, `${origin}/vibe-atlas?view=collection`);
      await stalePage.getByRole('status').filter({ hasText: 'Deleted on another device' }).first().waitFor();
      await stalePage.getByRole('button', { name: 'Saved results' }).click();
      await stalePage.getByRole('status').filter({ hasText: 'Deleted on another device' }).first().waitFor();
      assert.deepEqual(calls.slice(reconnectAt).filter(call => call.device === 'stale').flatMap(call => call.operations), [],
        'reconnect must not upload either stale copy');

      const choice = async (kind: 'card' | 'grid', name: string) => {
        if (kind === 'grid') await stalePage.getByRole('button', { name: 'Saved grids' }).click();
        else await stalePage.getByRole('button', { name: 'Saved results' }).click();
        return stalePage.getByRole('article').filter({ hasText: kind === 'card' ? 'Card cleanup actor' : 'Grid cleanup actor' })
          .getByRole('button', { name });
      };
      await (await choice(discardKind, 'Discard this copy')).click();
      await expectEventually(async () => {
        const contents = await collectionContents(stalePage);
        assert.equal(contents[discardKind], undefined);
        assert.notEqual(contents[restoreKind], undefined);
      });
      const afterDiscard = entries.get(`users/${ACCOUNT_ID}`)?.data as { items: Record<string, unknown> } | undefined;
      assert.ok(afterDiscard);
      assert.equal(Object.keys(afterDiscard.items).length, 0,
        'discard must not revive either record');
      await (await choice(restoreKind, 'Keep & restore')).click();
      await expectEventually(async () => {
        const serverData = entries.get(`users/${ACCOUNT_ID}`)?.data as { items: Record<string, { kind: string }> } | undefined;
        assert.ok(serverData);
        const items = Object.values(serverData.items);
        assert.deepEqual(items.map(item => item.kind), [restoreKind]);
      });
      const contents = await collectionContents(stalePage);
      assert.equal(contents[discardKind], undefined);
      assert.notEqual(contents[restoreKind], undefined);
      assert.deepEqual(calls.slice(reconnectAt).filter(call => call.device === 'stale').flatMap(call => call.operations)
        .map(op => [op.type, op.item?.kind]), [['upsert', restoreKind]],
      'only the explicit restore may publish a new record');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

test('Collection commits pending grid and saved-result removals when navigation unmounts it', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);
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
      body: JSON.stringify({
        state: 'active',
        isMember: true,
        capabilities: ['fandom_collector'],
      }),
    }));
    await page.route(
      url => new URL(url).pathname === '/.netlify/functions/grid-exports',
      async route => {
        if (route.request().method() === 'DELETE') exportCleanupRequests.push(route.request().url());
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'retry later' }) });
      },
    );

    await gotoTestPage(page, origin);
    await seedCollection(page);
    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Remove' }).first().click();
    await page.getByRole('button', { name: 'Daily drop' }).click();

    await page.getByRole('button', { name: /^Your Collection/ }).click();
    await page.getByRole('button', { name: 'Saved results' }).click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await page.getByRole('button', { name: 'Daily drop' }).click();

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
    await closeBrowserAndServer(browser, server);
  }
});

test('Collection shows local records when account sync fails', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        state: 'active',
        isMember: true,
        capabilities: ['fandom_collector'],
      }),
    }));
    await page.route('**/api/collection/sync', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Collection sync unavailable.' }),
    }));

    await gotoTestPage(page, origin);
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

    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
    await page.getByText('Grid cleanup actor').first().waitFor();
    await page.getByRole('status').filter({ hasText: 'account sync failed' }).waitFor();
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('Grid Builder keeps saved results but does not unpack saved grids into its source pool', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);

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

    await gotoTestPage(page, origin);
    await seedCollection(page);
    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Grid Builder', exact: true }).click();
    await page.getByText('1 saved result matches this lens').waitFor();
    await page.getByRole('button', { name: /Card cleanup actor 1/ }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Grid cleanup actor 1/ }).count(), 0);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('Collection result Misprints teach the curator before preserving the collectible receipt', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);
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

    await gotoTestPage(page, origin);
    await seedCollection(page);
    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
    await page.getByRole('button', { name: 'Saved results' }).click();
    await page.getByText('Card cleanup actor').first().waitFor();
    await page.getByText('Mark Misprint', { exact: true }).click();
    await page.getByLabel('Who wandered in?').fill('Zhang Linghe');
    await page.getByLabel(/Curator note/).fill('A beloved collectible, but absolutely not this actor.');
    await page.getByRole('button', { name: 'Preserve & teach curator' }).click();
    await page.getByText(/Some Other Man™ preserved/).waitFor();

    const submittedCorrection = correctionRequest as Record<string, unknown> | null;
    assert.equal(submittedCorrection?.action, 'mark_collection_misprint');
    assert.equal(submittedCorrection?.actorName, 'Card cleanup actor');
    assert.equal(submittedCorrection?.reason, 'wrong_actor');
    assert.equal(submittedCorrection?.actualIdentity, 'Zhang Linghe');
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

    assert.equal(await collectible.getByRole('button', { name: /Move to Middle-earth|Move to Vibe Atlas/ }).count(), 0);
    const saved = (await collectionContents(page)).card as {
      collectionScope?: string;
      misprint?: { calibrationStatus?: string };
    };
    assert.notEqual(saved.collectionScope, 'middle-earth');
    assert.equal(saved.misprint?.calibrationStatus, 'applied');
    assert.equal(correctionRequestCount, 1);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

for (const engine of BROWSER_ENGINES) {
  test(`Collection commits a pending removal after the browser page reloads in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startApp();
    const { browser, page } = await launchPageForServer(server, engine.type);
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
        body: JSON.stringify({
          state: 'active',
          isMember: true,
          capabilities: ['fandom_collector'],
        }),
      }));
      await page.route(
        url => new URL(url).pathname === '/.netlify/functions/grid-exports',
        async route => {
          if (route.request().method() === 'DELETE') exportCleanupRequests.push(route.request().url());
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'retry later' }) });
        },
      );

      await gotoTestPage(page, origin);
      await seedCollection(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
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
      await closeBrowserAndServer(browser, server);
    }
  });
}

test('Collection replays a saved-result removal left durable by a closed page', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'cleanup@example.test', isAdmin: false },
      }),
    }));

    await gotoTestPage(page, origin);
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

    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);
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
    await closeBrowserAndServer(browser, server);
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
