import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const DAILY_ACTOR = 'Daily Drop Actor';
const HISTORICAL_ACTOR = 'Historical Edition Actor';
const HISTORICAL_DATE = '2026-09-18';
const SAVED_ACTOR = 'Saved Collection Actor';

async function blockExternalAssets(page: Page): Promise<void> {
  for (const url of [
    'https://fonts.googleapis.com/**',
    'https://fonts.gstatic.com/**',
    'https://www.googletagmanager.com/**',
    'https://www.google-analytics.com/**',
    'https://region1.google-analytics.com/**',
  ]) {
    await page.route(url, route => route.abort());
  }
}

function dailyDropFixture({
  date = '2026-09-20',
  actorName = DAILY_ACTOR,
  imagePrefix = 'daily',
}: {
  date?: string;
  actorName?: string;
  imagePrefix?: string;
} = {}) {
  return {
    date,
    actorId: `${imagePrefix}-actor`,
    actorName,
    actorShortNameEn: actorName,
    actorAccentColor: '#aa3377',
    vibeEmoji: '✨',
    vibeLabel: 'Active inventory',
    vibeLabelEn: 'Active inventory',
    vibeSubtitle: 'Only today belongs here.',
    vibeSubtitleEn: 'Only today belongs here.',
    access: 'free',
    rankedBatches: [{
      query: 'daily-drop-actor active inventory',
      results: Array.from({ length: 9 }, (_, index) => ({
        title: `${actorName} inventory ${index + 1}`,
        thumbnail: `https://images.example/${imagePrefix}-${index + 1}.jpg`,
        link: `https://source.example/${imagePrefix}-${index + 1}`,
        source: 'Daily source',
      })),
    }],
    publicRecord: {
      actorPath: `/vibe-atlas/actors/${imagePrefix}-actor`,
      editionPath: `/vibe-atlas/editions/${date}/${imagePrefix}-actor`,
    },
  };
}

async function installPublicHistoricalEditionRoute(page: Page): Promise<void> {
  await page.route('**/.netlify/functions/public-archive-inventory*', route => {
    const requestedDate = new URL(route.request().url()).searchParams.get('date');
    const edition = dailyDropFixture({
      date: HISTORICAL_DATE,
      actorName: HISTORICAL_ACTOR,
      imagePrefix: 'historical',
    });
    if (!requestedDate) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          editions: [edition],
          actors: [{ id: 'historical-actor', name: HISTORICAL_ACTOR }],
          page: { nextCursor: null, hasMore: false },
        }),
      });
    }
    if (requestedDate !== HISTORICAL_DATE) {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'No published edition exists for this date.' }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(edition),
    });
  });
}

async function seedSavedCollection(page: Page): Promise<void> {
  await page.evaluate(async ({ actor }) => {
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
    const transaction = db.transaction(['cards', 'grids'], 'readwrite');
    transaction.objectStore('cards').put({
      imageUrl: 'https://images.example/saved-collection-card.jpg',
      thumbnailUrl: 'https://images.example/saved-collection-card-thumb.jpg',
      resultId: 'saved-collection-card',
      actor,
      actorEn: actor,
      actorId: 'saved-collection-actor',
      vibe: 'Saved inventory',
      vibeEn: 'Saved inventory',
      vibeEmoji: '💾',
      capturedDate: '2026-09-19',
      savedAt: '2026-09-19T12:00:00.000Z',
      sourceRoute: '/vibe-atlas',
    });
    transaction.objectStore('grids').put({
      kind: 'grid',
      schemaVersion: 1,
      rendererVersion: 'vibe-atlas-v1',
      id: 'saved-collection-grid',
      actorId: 'saved-grid-actor',
      actor: 'Saved Grid Actor',
      actorEn: 'Saved Grid Actor',
      actorAccentColor: '#3377aa',
      vibe: 'Saved grid inventory',
      vibeEn: 'Saved grid inventory',
      vibeEmoji: '▦',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      searchSpell: 'saved grid inventory',
      edition: { provider: null, misprint: false, legendary: false },
      capturedDate: '2026-09-18',
      generatedAt: '2026-09-18T12:00:00.000Z',
      savedAt: '2026-09-18T12:00:00.000Z',
      sourceRoute: '/vibe-atlas?view=collection',
      images: [{
        resultId: 'saved-grid-image',
        imageUrl: 'https://images.example/saved-collection-grid.jpg',
        sourceUrl: 'https://source.example/saved-grid',
        title: 'Saved grid image',
        gridPosition: 0,
      }],
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, { actor: SAVED_ACTOR });
}

async function assertClearBuilderState(page: Page, actor: string, count: number): Promise<void> {
  assert.equal(await page.getByLabel('Proposed Compiled 9-frame set').count(), 0);
  assert.equal(
    await page.getByRole('button', { name: new RegExp(`^${actor} ${count}`) }).getAttribute('aria-pressed'),
    'false',
    'a cold or reloaded builder must start with a clear actor lens',
  );
}

for (const engine of BROWSER_ENGINES) {
  test(`Grid Builder keeps Daily Drop and My Collection sources isolated across navigation in ${engine.name}`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await blockExternalAssets(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
      await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(dailyDropFixture()),
      }));

      await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
      await seedSavedCollection(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=daily`, { waitUntil: 'domcontentloaded' });

      await page.getByRole('heading', { name: 'Today’s Grid Builder' }).waitFor();
      await page.getByText('9 Daily Drop images match this lens').waitFor();
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);

      await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).click();
      await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
      await page.getByLabel('Proposed Compiled 9-frame set').waitFor();

      await page.getByRole('button', { name: 'Your Collection · Saved Grids and Grid Builder' }).click();
      await page.getByRole('button', { name: 'Grid Builder', exact: true }).click();
      await page.getByText('1 saved result matches this lens').waitFor();
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
      assert.equal(await page.getByLabel('Proposed Compiled 9-frame set').count(), 0, 'switching source must clear the Daily proposal');
      assert.equal(
        await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).getAttribute('aria-pressed'),
        'false',
        'switching source must clear the Daily actor lens',
      );

      await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).click();
      await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
      await page.getByLabel('Proposed Compiled 9-frame set').waitFor();

      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByRole('region', { name: 'Saved grids' }).waitFor();
      assert.equal(page.url(), `${origin}/vibe-atlas?view=collection`);

      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Today’s Grid Builder' }).waitFor();
      await page.getByText('9 Daily Drop images match this lens').waitFor();
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
      assert.equal(await page.getByLabel('Proposed Compiled 9-frame set').count(), 0, 'popstate must not retain the Collection proposal');
      assert.equal(
        await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).getAttribute('aria-pressed'),
        'false',
        'popstate must restore Daily with a clear lens',
      );

      await page.goForward({ waitUntil: 'domcontentloaded' });
      await page.getByRole('region', { name: 'Saved grids' }).waitFor();
      assert.equal(page.url(), `${origin}/vibe-atlas?view=collection`);

      await page.goForward({ waitUntil: 'domcontentloaded' });
      await page.getByText('1 saved result matches this lens').waitFor();
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
      assert.equal(await page.getByLabel('Proposed Compiled 9-frame set').count(), 0, 'Forward must not restore the Collection proposal');
      assert.equal(
        await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).getAttribute('aria-pressed'),
        'false',
        'Forward must restore Collection with a clear lens',
      );
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`Grid Builder restores the URL inventory source on cold load and reload in ${engine.name}`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
    await blockExternalAssets(page);
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
    }));
    await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
    await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(dailyDropFixture()),
    }));
    await installPublicHistoricalEditionRoute(page);

    await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
    await seedSavedCollection(page);

    const dailyUrl = `${origin}/vibe-atlas?view=builder&source=daily`;
    await gotoTestPage(page, dailyUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('9 Daily Drop images match this lens').waitFor();
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).count(), 1);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, DAILY_ACTOR, 9);

    await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).click();
    await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
    await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('9 Daily Drop images match this lens').waitFor();
    assert.equal(page.url(), dailyUrl);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, DAILY_ACTOR, 9);

    const archiveUrl = `${origin}/vibe-atlas?view=builder`;
    await gotoTestPage(page, archiveUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('9 public Archive images match this lens').waitFor();
    assert.equal(page.url(), archiveUrl, 'a source-less Builder URL should use the public Archive inventory');
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).count(), 1);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);

    await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).click();
    await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
    await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('9 public Archive images match this lens').waitFor();
    assert.equal(page.url(), archiveUrl);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);

    const collectionUrl = `${origin}/vibe-atlas?view=builder&source=collection`;
    await gotoTestPage(page, collectionUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('1 saved result matches this lens').waitFor();
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).count(), 1);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, SAVED_ACTOR, 1);

    await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).click();
    await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
    await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('1 saved result matches this lens').waitFor();
    assert.equal(page.url(), collectionUrl);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, SAVED_ACTOR, 1);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`Grid Builder opens a shared historical edition directly in a fresh ${engine.name} page`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await blockExternalAssets(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
      await page.route('**/.netlify/functions/star-of-day**', route => {
        const requestedDate = new URL(route.request().url()).searchParams.get('date');
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(requestedDate === HISTORICAL_DATE
            ? dailyDropFixture({
                date: HISTORICAL_DATE,
                actorName: HISTORICAL_ACTOR,
                imagePrefix: 'historical',
              })
            : dailyDropFixture()),
        });
      });
      await installPublicHistoricalEditionRoute(page);

      const editionUrl = `${origin}/vibe-atlas?view=builder&source=edition&date=${HISTORICAL_DATE}`;
      async function assertHistoricalInventory(): Promise<void> {
        await page.getByText(`Historical edition · ${HISTORICAL_DATE}`).waitFor();
        await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).waitFor();
        assert.equal(page.url(), editionUrl);
        assert.equal(await page.getByText('9 public Archive images match this lens').count(), 1);
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
        await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);

        // Inspect the actual candidate pool, not just the source heading and actor lens.
        await page.getByRole('tab', { name: 'Build Your Own' }).click();
        await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).click();
        const picker = page.getByRole('region', { name: 'Choose nine saved images' });
        assert.equal(await picker.getByRole('button', { name: /^Select Historical Edition Actor inventory \d+$/ }).count(), 9);
        assert.equal(await picker.getByRole('button', { name: /Daily Drop Actor|Saved Collection Actor/ }).count(), 0);
      }

      // The edition URL is the first navigation in this new browser context.
      await gotoTestPage(page, editionUrl, { waitUntil: 'domcontentloaded' });
      await assertHistoricalInventory();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await assertHistoricalInventory();
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`Grid Builder preserves a valid historical edition across browser history and reload in ${engine.name}`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await blockExternalAssets(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
      await page.route('**/.netlify/functions/star-of-day**', route => {
        const requestedDate = new URL(route.request().url()).searchParams.get('date');
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(requestedDate === HISTORICAL_DATE
            ? dailyDropFixture({
                date: HISTORICAL_DATE,
                actorName: HISTORICAL_ACTOR,
                imagePrefix: 'historical',
              })
            : dailyDropFixture()),
        });
      });
      await installPublicHistoricalEditionRoute(page);

      await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
      await seedSavedCollection(page);

      const dailyUrl = `${origin}/vibe-atlas?view=builder&source=daily`;
      const editionUrl = `${origin}/vibe-atlas?view=builder&source=edition&date=${HISTORICAL_DATE}`;
      await gotoTestPage(page, dailyUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText('9 Daily Drop images match this lens').waitFor();
      await gotoTestPage(page, editionUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText(`Historical edition · ${HISTORICAL_DATE}`).waitFor();
      await page.getByText('9 public Archive images match this lens').waitFor();
      assert.equal(page.url(), editionUrl);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
      await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);

      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByText('9 Daily Drop images match this lens').waitFor();
      assert.equal(page.url(), dailyUrl);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR}`) }).count(), 0);

      await page.goForward({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Historical edition · ${HISTORICAL_DATE}`).waitFor();
      await page.getByText('9 public Archive images match this lens').waitFor();
      assert.equal(page.url(), editionUrl);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
      await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);

      await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).click();
      await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
      await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Historical edition · ${HISTORICAL_DATE}`).waitFor();
      await page.getByText('9 public Archive images match this lens').waitFor();
      assert.equal(page.url(), editionUrl);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).count(), 1);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
      await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`Grid Builder corrects malformed source links to the public Archive inventory in ${engine.name}`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await blockExternalAssets(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
      await page.route('**/.netlify/functions/star-of-day**', route => {
        const requestedDate = new URL(route.request().url()).searchParams.get('date');
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(requestedDate
            ? dailyDropFixture({
                date: HISTORICAL_DATE,
                actorName: HISTORICAL_ACTOR,
                imagePrefix: 'historical',
              })
            : dailyDropFixture()),
        });
      });
      await installPublicHistoricalEditionRoute(page);

      await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
      await seedSavedCollection(page);

      const archiveUrl = `${origin}/vibe-atlas?view=builder&source=archive`;
      async function assertCorrectedArchive(): Promise<void> {
        await page.getByText('9 public Archive images match this lens').waitFor();
        assert.equal(page.url(), archiveUrl, 'a malformed Builder source must visibly self-correct to Archive');
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${HISTORICAL_ACTOR} 9`) }).count(), 1);
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
        assert.equal(await page.getByText(`Historical edition · ${HISTORICAL_DATE}`).count(), 0);
        await assertClearBuilderState(page, HISTORICAL_ACTOR, 9);
      }

      for (const malformedUrl of [
        `${origin}/vibe-atlas?view=builder&source=unknown`,
        `${origin}/vibe-atlas?view=builder&source=edition&date=2026-02-29`,
      ]) {
        const dailyUrl = `${origin}/vibe-atlas?view=builder&source=daily`;
        await gotoTestPage(page, dailyUrl, { waitUntil: 'domcontentloaded' });
        await page.getByText('9 Daily Drop images match this lens').waitFor();
        await gotoTestPage(page, malformedUrl, { waitUntil: 'domcontentloaded' });
        await assertCorrectedArchive();

        await page.reload({ waitUntil: 'domcontentloaded' });
        await assertCorrectedArchive();

        await page.goBack({ waitUntil: 'domcontentloaded' });
        await page.getByText('9 Daily Drop images match this lens').waitFor();
        assert.equal(page.url(), dailyUrl);
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).count(), 1);
        assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);

        await page.goForward({ waitUntil: 'domcontentloaded' });
        await assertCorrectedArchive();
      }
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`Collection restores Saved Grids and Saved Results across browser history in ${engine.name}`, { timeout: 120_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await blockExternalAssets(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());

      await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
      await seedSavedCollection(page);
      const gridsUrl = `${origin}/vibe-atlas?view=collection`;
      const resultsUrl = `${origin}/vibe-atlas?view=results`;
      await gotoTestPage(page, gridsUrl, { waitUntil: 'domcontentloaded' });

      const gridsTab = page.getByRole('button', { name: 'Grids 1' });
      const resultsTab = page.getByRole('button', { name: 'Saved results 1' });
      await page.getByRole('region', { name: 'Saved grids' }).waitFor();
      assert.equal(await gridsTab.getAttribute('aria-current'), 'true');
      assert.equal(await page.getByText('Saved Grid Actor', { exact: true }).count(), 1);
      assert.equal(page.url(), gridsUrl);

      await resultsTab.click();
      await page.getByRole('region', { name: 'Saved results' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Saved results 1' }).getAttribute('aria-current'), 'true');
      assert.equal(await page.getByText(SAVED_ACTOR, { exact: true }).count(), 1);
      assert.equal(page.url(), resultsUrl);

      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByRole('region', { name: 'Saved grids' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Grids 1' }).getAttribute('aria-current'), 'true');
      assert.equal(await page.getByText('Saved Grid Actor', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('region', { name: 'Saved results' }).count(), 0);
      assert.equal(page.url(), gridsUrl);

      await page.goForward({ waitUntil: 'domcontentloaded' });
      await page.getByRole('region', { name: 'Saved results' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Saved results 1' }).getAttribute('aria-current'), 'true');
      assert.equal(await page.getByText(SAVED_ACTOR, { exact: true }).count(), 1);
      assert.equal(await page.getByRole('region', { name: 'Saved grids' }).count(), 0);
      assert.equal(page.url(), resultsUrl);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}
