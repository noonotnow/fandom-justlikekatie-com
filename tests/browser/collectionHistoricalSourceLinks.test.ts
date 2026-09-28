import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import {
  gotoTestPage,
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACCOUNT_ID = 'collection-source-links-account';
const EDITION_DATE = '2026-09-20';
const EDITION_LABEL = 'Sep 20, 2026';
const EDITION_HREF = `/vibe-atlas?date=${EDITION_DATE}`;

async function seedCollection(page: Page): Promise<void> {
  await page.evaluate(async accountId => {
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
    const grids = transaction.objectStore('grids');
    const baseGrid = {
      kind: 'grid',
      schemaVersion: 1,
      rendererVersion: 'vibe-atlas-v1',
      actorAccentColor: '#aabbcc',
      vibe: 'Archive source test',
      vibeEn: 'Archive source test',
      vibeEmoji: '📜',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      searchSpell: 'archive source test',
      edition: { provider: null, misprint: false, legendary: false },
      sourceRoute: '/vibe-atlas',
    };
    grids.put({
      ...baseGrid,
      id: 'local-historical-source-grid',
      localId: 'historical-source-local',
      actorId: 'historical-source-actor',
      actor: 'Historical Source Actor',
      actorEn: 'Historical Source Actor',
      capturedDate: '2026-09-19',
      generatedAt: '2026-09-19T10:00:00.000Z',
      savedAt: '2026-09-19T10:00:00.000Z',
      sourceProvenance: { kind: 'edition', editionDate: '2026-09-19' },
      images: [],
    });
    grids.put({
      ...baseGrid,
      id: 'local-corrected-source-grid',
      localId: 'corrected-source-local',
      actorId: 'corrected-source-actor',
      actor: 'Corrected Source Actor',
      actorEn: 'Corrected Source Actor',
      capturedDate: '2026-09-18',
      generatedAt: '2026-09-18T10:00:00.000Z',
      savedAt: '2026-09-18T10:00:00.000Z',
      sourceProvenance: { kind: 'edition', editionDate: '2026-09-18' },
      images: [],
    });
    grids.put({
      ...baseGrid,
      id: 'local-legacy-source-grid',
      localId: 'legacy-existing-local',
      serverId: 'server-legacy-source-grid',
      actorId: 'legacy-source-actor',
      actor: 'Legacy Source Actor',
      actorEn: 'Legacy Source Actor',
      capturedDate: '2026-08-01',
      generatedAt: '2026-08-01T09:00:00.000Z',
      savedAt: '2026-08-01T09:00:00.000Z',
      images: [],
    });
    transaction.objectStore('sync').put({
      key: 'state',
      clientId: 'collection-source-links-browser-test',
      activeAccountId: accountId,
      cursors: {},
      mergeDecisions: { [accountId]: true },
      mappingsByAccount: {},
      pendingDeletesByAccount: {},
      acknowledgedUpsertsByAccount: {},
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, ACCOUNT_ID);
}

test('Collection keeps historical Daily Drop source links visible on saved grids', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  const { browser, page } = await launchPageForServer(server);
  let syncRequests = 0;
  const submittedLocalIds = new Set<string>();

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'source-links@example.test', isAdmin: false },
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
    await page.route('**/api/collection/sync', async route => {
      const request = route.request().postDataJSON() as {
        expectedAccountId: string;
        operations: Array<Record<string, unknown>>;
      };
      syncRequests += 1;
      assert.equal(request.expectedAccountId, ACCOUNT_ID);
      const operationLocalIds = request.operations.map(operation => operation.localId).sort();
      operationLocalIds.forEach(localId => submittedLocalIds.add(String(localId)));
      const grid = {
        kind: 'grid',
        schemaVersion: 1,
        rendererVersion: 'vibe-atlas-v1',
        actorId: 'historical-source-actor',
        actorEn: 'Historical Source Actor',
        actorAccentColor: '#aabbcc',
        vibe: 'Archive source test',
        vibeEn: 'Archive source test',
        vibeEmoji: '📜',
        vibeSubtitle: '',
        vibeSubtitleEn: '',
        searchSpell: 'archive source test',
        edition: { provider: null, misprint: false, legendary: false },
        capturedDate: EDITION_DATE,
        generatedAt: `${EDITION_DATE}T10:00:00.000Z`,
        savedAt: `${EDITION_DATE}T10:00:00.000Z`,
        sourceRoute: '/vibe-atlas',
        images: [{
          resultId: 'historical-source-image',
          imageUrl: 'https://images.example/historical-source.jpg',
          sourceUrl: 'https://source.example/historical-source',
          title: 'Historical source image',
          gridPosition: 0,
        }],
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cursor: 2,
          items: [{
            ...grid,
            id: 'server-historical-source-grid',
            artifactId: 'historical-source-grid',
            localId: 'historical-source-local',
            actor: 'Historical Source Actor',
            sourceProvenance: { kind: 'edition', editionDate: EDITION_DATE },
          }, {
            ...grid,
            id: 'server-legacy-source-grid',
            artifactId: 'legacy-source-grid',
            localId: 'legacy-source-local',
            actorId: 'legacy-source-actor',
            actor: 'Legacy Source Actor',
            actorEn: 'Legacy Source Actor',
            capturedDate: '2026-08-01',
            generatedAt: '2026-08-01T10:00:00.000Z',
            savedAt: '2026-08-01T10:00:00.000Z',
            images: [{
              resultId: 'legacy-source-image',
              imageUrl: 'https://images.example/legacy-source.jpg',
              sourceUrl: 'https://source.example/legacy-source',
              title: 'Legacy source image',
              gridPosition: 0,
            }],
          }, {
            ...grid,
            id: 'server-corrected-source-grid',
            artifactId: 'corrected-source-grid',
            localId: 'corrected-source-local',
            actorId: 'corrected-source-actor',
            actor: 'Corrected Source Actor',
            actorEn: 'Corrected Source Actor',
            capturedDate: '2026-09-18',
            generatedAt: '2026-09-18T10:00:00.000Z',
            savedAt: '2026-09-18T10:00:00.000Z',
            sourceProvenance: null,
            images: [{
              resultId: 'corrected-source-image',
              imageUrl: 'https://images.example/corrected-source.jpg',
              sourceUrl: 'https://source.example/corrected-source',
              title: 'Corrected source image',
              gridPosition: 0,
            }],
          }],
          tombstones: [],
          mappings: {
            'historical-source-local': 'server-historical-source-grid',
            'legacy-source-local': 'server-legacy-source-grid',
            'corrected-source-local': 'server-corrected-source-grid',
          },
          acknowledgedMutationIds: request.operations.map(operation => operation.mutationId),
        }),
      });
    });

    await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
    await seedCollection(page);
    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`, { waitUntil: 'domcontentloaded' });

    const historicalGrid = page.locator('article').filter({ hasText: 'Historical Source Actor' });
    const legacyGrid = page.locator('article').filter({ hasText: 'Legacy Source Actor' });
    const correctedGrid = page.locator('article').filter({ hasText: 'Corrected Source Actor' });
    await historicalGrid.waitFor();
    await legacyGrid.waitFor();
    await correctedGrid.waitFor();

    const cardSourceLink = historicalGrid.getByRole('link', { name: EDITION_LABEL });
    assert.equal(await cardSourceLink.getAttribute('href'), EDITION_HREF);
    await historicalGrid.getByText(`Historical Daily Drop · ${EDITION_LABEL}`).waitFor();
    assert.equal(
      await legacyGrid.getByText('Historical Daily Drop', { exact: false }).count(),
      0,
      'legacy grids without source provenance must not render an empty source label',
    );
    assert.equal(await historicalGrid.getByText('Sep 19, 2026').count(), 0);
    assert.equal(
      await correctedGrid.getByText('Historical Daily Drop', { exact: false }).count(),
      0,
      'cloud corrections must retire stale source labels on Collection cards',
    );

    await historicalGrid.getByRole('button', { name: 'View Historical Source Actor Archive source test grid larger' }).click();
    const dialog = page.getByRole('dialog', { name: '📜 Historical Source Actor' });
    const dialogSourceLink = dialog.getByRole('link', { name: EDITION_LABEL });
    await dialog.getByText(`Historical Daily Drop · ${EDITION_LABEL}`).waitFor();
    assert.equal(await dialogSourceLink.getAttribute('href'), EDITION_HREF);
    await dialog.getByRole('button', { name: 'Close enlarged view' }).click();

    await correctedGrid.getByRole('button', { name: 'View Corrected Source Actor Archive source test grid larger' }).click();
    const correctedDialog = page.getByRole('dialog', { name: '📜 Corrected Source Actor' });
    assert.equal(
      await correctedDialog.getByText('Historical Daily Drop', { exact: false }).count(),
      0,
      'cloud corrections must retire stale source links in the expanded grid',
    );
    assert.deepEqual([...submittedLocalIds].sort(), [
      'corrected-source-local',
      'historical-source-local',
      'legacy-existing-local',
    ]);
    assert.ok(syncRequests >= 3, 'the Collection should finish after acknowledging the merged grid revisions');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});