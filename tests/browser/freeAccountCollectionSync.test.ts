import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import {
  closeBrowserAndServer,
  launchBrowserForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACCOUNT_ID = 'free-collection-sync-account';
const GRID_ID = 'free-account-sync-grid';
const GRID_ACTOR = 'Free Account Collection Actor';

type SyncOperation = {
  type: 'upsert' | 'delete';
  mutationId: string;
  localId: string;
  serverId?: string;
  item?: Record<string, unknown>;
};

type ServerItem = Record<string, unknown> & {
  id: string;
  localId: string;
  revision: number;
};

function createCollectionSyncFixture() {
  const items = new Map<string, ServerItem>();
  const tombstones: Array<{ id: string; localId: string; revision: number }> = [];
  const requests: Array<{
    expectedAccountId: string;
    operations: SyncOperation[];
  }> = [];
  let revision = 0;

  return {
    items,
    requests,
    async handle(page: Page): Promise<void> {
      await page.route('**/api/collection/sync', async route => {
        const request = route.request().postDataJSON() as {
          schemaVersion: number;
          expectedAccountId: string;
          cursor: number;
          operations: SyncOperation[];
        };
        requests.push({
          expectedAccountId: request.expectedAccountId,
          operations: request.operations,
        });

        const mappings: Record<string, string> = {};
        for (const operation of request.operations) {
          if (operation.type === 'upsert' && operation.item) {
            const existing = [...items.values()].find(item => item.localId === operation.localId);
            const serverId = existing?.id || `server-${operation.localId}`;
            revision += 1;
            items.set(serverId, {
              ...operation.item,
              id: serverId,
              localId: operation.localId,
              revision,
              ...(operation.item.kind === 'grid' ? { artifactId: operation.item.id } : {}),
            });
            mappings[operation.localId] = serverId;
          } else if (operation.type === 'delete') {
            const existing = operation.serverId
              ? items.get(operation.serverId)
              : [...items.values()].find(item => item.localId === operation.localId);
            if (existing) {
              items.delete(existing.id);
              revision += 1;
              tombstones.push({ id: existing.id, localId: operation.localId, revision });
            }
          }
        }

        const body = {
          schemaVersion: 1,
          revision,
          cursor: revision,
          items: [...items.values()].filter(item => item.revision > request.cursor),
          tombstones: tombstones.filter(tombstone => tombstone.revision > request.cursor),
          mappings,
          acknowledgedMutationIds: request.operations.map(operation => operation.mutationId),
        };
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
      });
    },
  };
}

async function installFreeLogin(context: BrowserContext): Promise<void> {
  await context.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      user: { accountId: ACCOUNT_ID, email: 'free-collector@example.test', isAdmin: false },
    }),
  }));
  await context.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      state: 'inactive',
      isMember: false,
      capabilities: [],
    }),
  }));
}

async function seedCompleteCollectionGrid(page: Page): Promise<void> {
  await page.evaluate(async ({ accountId, gridId, actor }) => {
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
      localId: 'free-account-sync-local-grid',
      actorId: 'free-account-sync-actor',
      actor,
      actorEn: actor,
      actorAccentColor: '#aabbcc',
      vibe: 'Daily Drop sync',
      vibeEn: 'Daily Drop sync',
      vibeEmoji: '✨',
      vibeSubtitle: 'A saved Collection grid',
      vibeSubtitleEn: 'A saved Collection grid',
      searchSpell: 'free account sync test',
      edition: { provider: null, misprint: false, legendary: false },
      capturedDate: '2026-08-21',
      generatedAt: '2026-08-21T10:00:00.000Z',
      savedAt: '2026-08-21T10:00:00.000Z',
      sourceRoute: '/vibe-atlas',
      images: Array.from({ length: 9 }, (_, index) => ({
        resultId: `free-account-sync-image-${index + 1}`,
        imageUrl: `https://images.example/free-account-sync-${index + 1}.jpg`,
        sourceUrl: `https://source.example/free-account-sync-${index + 1}`,
        title: `Daily Drop image ${index + 1}`,
        gridPosition: index,
      })),
    });
    transaction.objectStore('sync').put({
      key: 'state',
      clientId: 'free-account-collection-sync-browser-test',
      activeAccountId: accountId,
      cursors: {},
      mergeDecisions: {},
      mappingsByAccount: {},
      pendingDeletesByAccount: {},
      acknowledgedUpsertsByAccount: {},
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, { accountId: ACCOUNT_ID, gridId: GRID_ID, actor: GRID_ACTOR });
}

test('authenticated free accounts sync a merged Collection grid between isolated Chromium contexts', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const browser = await launchBrowserForServer(server, chromium);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const syncBackend = createCollectionSyncFixture();
  let paidPackDepthRequests = 0;

  try {
    await Promise.all([installFreeLogin(contextA), installFreeLogin(contextB)]);
    await Promise.all([syncBackend.handle(pageA), syncBackend.handle(pageB)]);
    for (const context of [contextA, contextB]) {
      await context.route(
        url => new URL(url).pathname === '/.netlify/functions/actor-pack-depth',
        async route => {
          paidPackDepthRequests += 1;
          await route.fulfill({
            status: 403,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Paid pack depth is unavailable to free accounts.' }),
          });
        },
      );
    }

    await pageA.goto(origin);
    await seedCompleteCollectionGrid(pageA);
    await pageA.goto(`${origin}/vibe-atlas?view=collection`);
    await pageA.getByText('Merge this browser’s grids and saved results into your account?').waitFor();
    await pageA.getByRole('button', { name: 'Merge and sync' }).click();
    await pageA.getByRole('status').filter({ hasText: 'This device is now synced.' }).waitFor();
    assert.ok(
      [...syncBackend.items.values()].some(item => item.id === `server-free-account-sync-local-grid`),
      'merge consent should upload the complete Collection grid to the shared account backend',
    );

    await pageB.goto(origin);
    await pageB.goto(`${origin}/vibe-atlas?view=collection`);
    await pageB.getByText('Merge this browser’s grids and saved results into your account?').waitFor();
    await pageB.getByRole('button', { name: 'Merge and sync' }).click();
    await pageB.getByRole('article').filter({ hasText: GRID_ACTOR }).waitFor();

    assert.ok(
      syncBackend.requests.some(request => (
        request.expectedAccountId === ACCOUNT_ID
        && request.operations.some(operation => operation.type === 'upsert')
      )),
      'the free account must submit an upsert during device A merge sync',
    );
    assert.ok(
      syncBackend.requests.some(request => (
        request.expectedAccountId === ACCOUNT_ID && request.operations.length === 0
      )),
      'device B must pull the saved grid with a valid empty-operations sync request',
    );
    assert.equal(paidPackDepthRequests, 0, 'free Collection sync must not call the paid pack-depth endpoint');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});