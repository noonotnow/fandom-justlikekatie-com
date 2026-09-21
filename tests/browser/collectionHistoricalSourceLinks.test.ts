import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import {
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACCOUNT_ID = 'collection-source-links-account';
const EDITION_DATE = '2026-09-20';
const EDITION_LABEL = 'Sep 20, 2026';
const EDITION_HREF = `/vibe-atlas?date=${EDITION_DATE}`;

async function seedCollection(page: Page): Promise<void> {
  await page.evaluate(async ({ accountId, editionDate }) => {
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
    const gridStore = transaction.objectStore('grids');
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
      capturedDate: editionDate,
      generatedAt: `${editionDate}T10:00:00.000Z`,
      savedAt: `${editionDate}T10:00:00.000Z`,
      sourceRoute: '/vibe-atlas',
      images: [{
        resultId: 'historical-source-image',
        imageUrl: 'https://images.example/historical-source.jpg',
        sourceUrl: 'https://source.example/historical-source',
        title: 'Historical source image',
        gridPosition: 0,
      }],
    };
    gridStore.put({
      ...grid,
      id: 'historical-source-grid',
      actor: 'Historical Source Actor',
      sourceProvenance: { kind: 'edition', editionDate },
    });
    gridStore.put({
      ...grid,
      id: 'legacy-source-grid',
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
    });
    transaction.objectStore('sync').put({
      key: 'state',
      clientId: 'collection-source-links-browser-test',
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
  }, { accountId: ACCOUNT_ID, editionDate: EDITION_DATE });
}

test('Collection keeps historical Daily Drop source links visible on saved grids', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);

  try {
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: ACCOUNT_ID, email: 'source-links@example.test', isAdmin: false },
      }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', isMember: true }),
    }));

    await page.goto(origin);
    await seedCollection(page);
    await page.goto(`${origin}/vibe-atlas?view=collection`);

    const historicalGrid = page.locator('article').filter({ hasText: 'Historical Source Actor' });
    const legacyGrid = page.locator('article').filter({ hasText: 'Legacy Source Actor' });
    await historicalGrid.waitFor();
    await legacyGrid.waitFor();

    const cardSourceLink = historicalGrid.getByRole('link', { name: EDITION_LABEL });
    assert.equal(await cardSourceLink.getAttribute('href'), EDITION_HREF);
    await historicalGrid.getByText(`Historical Daily Drop · ${EDITION_LABEL}`).waitFor();
    assert.equal(
      await legacyGrid.getByText('Historical Daily Drop', { exact: false }).count(),
      0,
      'legacy grids without source provenance must not render an empty source label',
    );

    await historicalGrid.getByRole('button', { name: 'View Historical Source Actor Archive source test grid larger' }).click();
    const dialog = page.getByRole('dialog', { name: '📜 Historical Source Actor' });
    const dialogSourceLink = dialog.getByRole('link', { name: EDITION_LABEL });
    await dialog.getByText(`Historical Daily Drop · ${EDITION_LABEL}`).waitFor();
    assert.equal(await dialogSourceLink.getAttribute('href'), EDITION_HREF);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});