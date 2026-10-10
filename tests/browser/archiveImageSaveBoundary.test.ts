import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect } from '@playwright/test';
import { archiveSaveOutcomes, installArchiveSaveGate, seedUnrelatedCard } from './archiveSaveRaceFixtures.ts';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACTOR_ID = 'archive-save-boundary-actor';
const ACTOR_NAME = 'Archive Save Boundary Actor';

function shanghaiDateOffset(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts();
  const part = (type: string) => parts.find(value => value.type === type)?.value || '';
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function edition(date: string) {
  return {
    actorId: ACTOR_ID,
    actorName: ACTOR_NAME,
    actorShortNameEn: ACTOR_NAME,
    actorAccentColor: '#c9a96e',
    vibeEmoji: '🗂️',
    vibeLabel: 'Archive label',
    vibeLabelEn: 'Saved Archive',
    vibeSubtitle: 'A published edition for save-boundary coverage.',
    vibeSubtitleEn: 'A published edition for save-boundary coverage.',
    rankedBatches: [{
      query: 'archive-save-boundary',
      results: Array.from({ length: 9 }, (_, index) => ({
        title: `Archive boundary card ${index + 1}`,
        thumbnail: `https://images.archive-save.test/${date}/card-${index + 1}.jpg`,
        link: `https://sources.archive-save.test/${date}/card-${index + 1}`,
        source: 'Archive source',
      })),
      count: 9,
      distinctSources: 1,
      provider: null,
    }],
    date,
    publicRecord: {
      actorPath: `/vibe-atlas/actors/${ACTOR_ID}`,
      editionPath: `/vibe-atlas/editions/${date}/${ACTOR_ID}`,
    },
  };
}

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU6kAAAAASUVORK5CYII=',
  'base64',
);

async function seedBrowserState(page: import('@playwright/test').Page, legacyImageId?: string): Promise<void> {
  await page.addInitScript(`
    window.archiveSaveEvents = [];
    window.umami = { track(name, data) { window.archiveSaveEvents.push({ name, data }); } };
  `);
  await page.addInitScript(imageId => {
    if (imageId) {
      window.localStorage.setItem('vibe-atlas-saved-items', JSON.stringify({ [imageId]: true }));
    }
  }, legacyImageId);
}

async function installEditionRoutes(
  page: import('@playwright/test').Page,
  options: {
    isCollector?: boolean;
    nonIndexableDaily?: boolean;
    inventoryRequests?: string[];
    authorize?: (date: string, imageId: string) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
  } = {},
): Promise<Array<{ date: string; imageId: string }>> {
  const dates = [shanghaiDateOffset(-1), shanghaiDateOffset(-10)];
  const saveRequests: Array<{ date: string; imageId: string }> = [];
  for (const url of [
    'https://fonts.googleapis.com/**',
    'https://fonts.gstatic.com/**',
    'https://www.googletagmanager.com/**',
    'https://www.google-analytics.com/**',
    'https://region1.google-analytics.com/**',
  ]) {
    await page.route(url, route => route.abort());
  }
  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ user: null }),
  }));
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(options.isCollector
      ? { state: 'active', capabilities: ['fandom_collector'] }
      : { state: 'inactive', capabilities: [] }),
  }));
  await page.route('**/.netlify/functions/image-proxy**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: ONE_PIXEL_PNG,
  }));
  await page.route('**/.netlify/functions/star-of-day*', route => {
    const requested = new URL(route.request().url()).searchParams.get('date');
    const date = requested && dates.includes(requested) ? requested : dates[0];
    const data = edition(date);
    if (!requested && options.nonIndexableDaily) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...data, publicRecord: undefined }),
      });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  await page.route('**/.netlify/functions/public-archive-inventory*', route => {
    const requested = new URL(route.request().url()).searchParams.get('date');
    const date = requested && dates.includes(requested) ? requested : dates[0];
    if (requested) options.inventoryRequests?.push(requested);
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(edition(date)),
    });
  });
  await page.route('**/.netlify/functions/archive-image-save', async route => {
    const payload = route.request().postDataJSON() as { date: string; imageId: string };
    saveRequests.push(payload);
    const result = options.authorize
      ? await options.authorize(payload.date, payload.imageId)
      : {
        status: 200,
        body: {
          allowed: true,
          date: payload.date,
          imageId: `archive:${payload.date}:card-${Number(/card-(\d)\.jpg$/.exec(payload.imageId)?.[1] || 1) - 1}`,
        },
      };
    await route.fulfill({
      status: result.status,
      contentType: 'application/json',
      body: JSON.stringify(result.body),
    });
  });
  return saveRequests;
}

async function localRecordCount(
  page: import('@playwright/test').Page,
  store: 'cards' | 'grids',
): Promise<number> {
  return page.evaluate(async storeName => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vibe-atlas-collection', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }, store);
}

async function localCards(page: import('@playwright/test').Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vibe-atlas-collection', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const transaction = db.transaction('cards', 'readonly');
        const request = transaction.objectStore('cards').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function savedBookmarks(page: import('@playwright/test').Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('vibe-atlas-saved-items') || '{}'));
}

for (const engine of BROWSER_ENGINES) {
  for (const delay of ['authorization', 'IndexedDB'] as const) {
    test(`overlapping card and preview saves share one durable acquisition with delayed ${delay} in ${engine.name}`, { timeout: 120_000 }, async () => {
      const date = shanghaiDateOffset(-1);
      const imageKey = `/.netlify/functions/image-proxy?url=${encodeURIComponent(`https://images.archive-save.test/${date}/card-1.jpg`)}`;
      const { server, origin } = await startViteTestServer();
      const { browser, page } = await launchPageForServer(server, engine.type);
      let releaseAuthorization!: () => void;
      const authorizationGate = new Promise<void>(resolve => { releaseAuthorization = resolve; });
      try {
        await seedBrowserState(page);
        const requests = await installEditionRoutes(page, {
          authorize: async () => {
            if (delay === 'authorization') await authorizationGate;
            return { status: 200, body: { allowed: true, date, imageId: `archive:${date}:card-0` } };
          },
        });
        await gotoTestPage(page, `${origin}/vibe-atlas?date=${date}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
        const card = page.getByRole('button', { name: /^View Archive boundary card 1/ });
        const preview = page.getByRole('region', { name: 'Preview of Archive boundary card 1' });
        await expect(card.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
        await expect(preview.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
        await seedUnrelatedCard(page);
        const unrelated = (await localCards(page)).find(record => record.imageUrl !== imageKey);
        await installArchiveSaveGate(page, imageKey);
        if (delay === 'IndexedDB') await page.evaluate('window.archiveSaveGate.holdCommit = true');

        // Dispatch only click: a pointer mousedown on the grid intentionally
        // closes the inline preview, preventing these two mounted controls from
        // being exercised together. Both controls are visible and enabled.
        await card.getByRole('button', { name: 'Save item', exact: true }).dispatchEvent('click');
        if (delay === 'authorization') await expect.poll(() => requests.length).toBe(1);
        else await page.waitForFunction('window.archiveSaveGate.commits.length === 1');
        await preview.getByRole('button', { name: 'Save item', exact: true }).click();
        await expect(card.getByRole('button', { name: 'Save item', exact: true })).toBeDisabled();
        await expect(preview.getByRole('button', { name: 'Save item', exact: true })).toBeDisabled();
        assert.deepEqual(await archiveSaveOutcomes(page), [], 'pending authorization/commit is not an acquisition');
        assert.equal(await localRecordCount(page, 'cards'), delay === 'authorization' ? 1 : 2);
        const pendingCard = (await localCards(page)).find(record => record.imageUrl === imageKey);
        releaseAuthorization();
        if (delay === 'IndexedDB') await page.evaluate('window.archiveSaveGate.releaseCommits()');

        for (const control of [card, preview]) {
          await expect(control.getByRole('button', { name: 'Remove from saved' })).toBeEnabled();
          await expect(control.getByRole('button', { name: 'Remove from saved' })).toHaveAttribute('aria-pressed', 'true');
        }
        const records = await localCards(page);
        assert.equal(records.filter(record => record.imageUrl === imageKey).length, 1);
        if (pendingCard) assert.equal(records.find(record => record.imageUrl === imageKey)?.localId, pendingCard.localId);
        assert.equal(requests.length, 1, 'overlapping saves must share the authorization');
        assert.equal(await page.evaluate('window.archiveSaveGate.writes'), 1);
        assert.deepEqual(await archiveSaveOutcomes(page), ['saved']);
        assert.deepEqual(await savedBookmarks(page), {});

        await preview.getByRole('button', { name: 'Remove from saved' }).click();
        await expect(card.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
        await expect(preview.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
        assert.deepEqual(await localCards(page), [unrelated], 'removal leaves unrelated Collection records untouched');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('button', { name: 'Save item', exact: true }).first()).toBeEnabled();
        assert.deepEqual(await localCards(page), [unrelated], 'no delayed save resurrects the removed card after refresh');
        assert.equal(requests.length, 1, 'removal and refresh never reauthorize');
      } finally {
        releaseAuthorization();
        await closeBrowserAndServer(browser, server);
      }
    });
  }

  for (const failure of ['authorization', 'persistence'] as const) {
    test(`overlapping same-card saves report delayed ${failure} failure truthfully in ${engine.name}`, { timeout: 120_000 }, async () => {
      const date = shanghaiDateOffset(-1);
      const imageKey = `/.netlify/functions/image-proxy?url=${encodeURIComponent(`https://images.archive-save.test/${date}/card-1.jpg`)}`;
      const { server, origin } = await startViteTestServer();
      const { browser, page } = await launchPageForServer(server, engine.type);
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      let denied = failure === 'authorization';
      try {
        await seedBrowserState(page);
        const requests = await installEditionRoutes(page, {
          authorize: async () => {
            await gate;
            return denied
              ? { status: 403, body: { access: 'upgrade', error: 'Collector required.' } }
              : { status: 200, body: { allowed: true, date, imageId: `archive:${date}:card-0` } };
          },
        });
        await gotoTestPage(page, `${origin}/vibe-atlas?date=${date}`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
        const card = page.getByRole('button', { name: /^View Archive boundary card 1/ });
        const preview = page.getByRole('region', { name: 'Preview of Archive boundary card 1' });
        await expect(preview.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
        await seedUnrelatedCard(page);
        const unrelated = await localCards(page);
        await installArchiveSaveGate(page, imageKey);
        if (failure === 'persistence') await page.evaluate('window.archiveSaveGate.failWrite = true');
        await card.getByRole('button', { name: 'Save item', exact: true }).dispatchEvent('click');
        await expect.poll(() => requests.length).toBe(1);
        await preview.getByRole('button', { name: 'Save item', exact: true }).click();
        await expect(preview.getByRole('button', { name: 'Save item', exact: true })).toBeDisabled();
        release();
        for (const control of [card, preview]) {
          await expect(control.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
          await expect(control.getByRole('button', { name: 'Save item', exact: true })).toHaveAttribute('aria-pressed', 'false');
          if (failure === 'authorization') {
            await expect(control.getByRole('alert')).toContainText('Older edition card saves are a Collector benefit.');
          } else {
            await expect(control.getByRole('status')).toContainText('Could not update this save. Please try again.');
          }
        }
        assert.equal(requests.length, 1);
        assert.deepEqual(await localCards(page), unrelated);
        assert.deepEqual(await savedBookmarks(page), {});
        assert.deepEqual(await archiveSaveOutcomes(page), failure === 'authorization' ? [] : ['persistence_failed']);
        denied = false;
        await page.evaluate('window.archiveSaveGate.failWrite = false');
        await preview.getByRole('button', { name: 'Save item', exact: true }).click();
        await expect(card.getByRole('button', { name: 'Remove from saved' })).toBeEnabled();
        await expect(preview.getByRole('button', { name: 'Remove from saved' })).toBeEnabled();
        assert.equal(requests.length, 2, 'a failed shared operation must not block a genuine retry');
        assert.equal((await localCards(page)).filter(record => record.imageUrl === imageKey).length, 1);
      } finally {
        release();
        await closeBrowserAndServer(browser, server);
      }
    });
  }

  test(`Lightbox removal waits for a pending same-card commit without late resurrection in ${engine.name}`, { timeout: 120_000 }, async () => {
    const date = shanghaiDateOffset(-1);
    const imageKey = `/.netlify/functions/image-proxy?url=${encodeURIComponent(`https://images.archive-save.test/${date}/card-1.jpg`)}`;
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await seedBrowserState(page);
      const requests = await installEditionRoutes(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${date}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
      const card = page.getByRole('button', { name: /^View Archive boundary card 1/ });
      const preview = page.getByRole('region', { name: 'Preview of Archive boundary card 1' });
      await expect(card.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
      await seedUnrelatedCard(page);
      const unrelated = await localCards(page);
      await installArchiveSaveGate(page, imageKey);
      await page.evaluate('window.archiveSaveGate.holdCommit = true');
      await card.getByRole('button', { name: 'Save item', exact: true }).dispatchEvent('click');
      await page.waitForFunction('window.archiveSaveGate.commits.length === 1');
      assert.equal(await localRecordCount(page, 'cards'), 2, 'native commit completed, but its save callback is still pending');
      assert.deepEqual(await archiveSaveOutcomes(page), []);
      await preview.getByRole('button', { name: 'View Full Screen' }).click();
      const lightbox = page.getByRole('dialog', { name: /Image viewer/ });
      await expect(lightbox.getByRole('button', { name: 'Unsave' })).toBeEnabled();
      await lightbox.getByRole('button', { name: 'Unsave' }).click();
      await expect(lightbox.getByRole('button', { name: 'Unsave' })).toBeDisabled();
      assert.equal(await localRecordCount(page, 'cards'), 2, 'removal must queue behind the unfinished save');
      await page.evaluate('window.archiveSaveGate.releaseCommits()');
      await expect(lightbox.getByRole('button', { name: 'Save to collection' })).toBeEnabled();
      await expect(lightbox.getByRole('button', { name: 'Save to collection' })).toHaveAttribute('aria-pressed', 'false');
      await lightbox.getByRole('button', { name: 'Close lightbox' }).click();
      await expect(card.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
      assert.deepEqual(await localCards(page), unrelated);
      assert.deepEqual(await savedBookmarks(page), {});
      assert.equal(requests.length, 1, 'queued removal must not require authorization');
      assert.equal(await page.evaluate('window.archiveSaveGate.writes'), 1);
      assert.deepEqual(await archiveSaveOutcomes(page), ['saved']);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: 'Save item', exact: true }).first()).toBeEnabled();
      assert.deepEqual(await localCards(page), unrelated);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`Lightbox removal wins over stale same-card IndexedDB refreshes in ${engine.name}`, { timeout: 120_000 }, async () => {
    const date = shanghaiDateOffset(-1);
    const imageKey = `/.netlify/functions/image-proxy?url=${encodeURIComponent(`https://images.archive-save.test/${date}/card-1.jpg`)}`;
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await seedBrowserState(page);
      const requests = await installEditionRoutes(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${date}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
      const card = page.getByRole('button', { name: /^View Archive boundary card 1/ });
      const preview = page.getByRole('region', { name: 'Preview of Archive boundary card 1' });
      await preview.getByRole('button', { name: 'Save item', exact: true }).click();
      await expect(card.getByRole('button', { name: 'Remove from saved' })).toBeEnabled();
      await expect(preview.getByRole('button', { name: 'Remove from saved' })).toBeEnabled();
      await seedUnrelatedCard(page);
      const unrelated = (await localCards(page)).filter(record => record.imageUrl !== imageKey);
      await preview.getByRole('button', { name: 'View Full Screen' }).click();
      const lightbox = page.getByRole('dialog', { name: /Image viewer/ });
      await expect(lightbox.getByRole('button', { name: 'Unsave' })).toBeEnabled();
      await installArchiveSaveGate(page, imageKey);
      await page.evaluate(`window.archiveSaveGate.holdReads = true; window.dispatchEvent(new Event('storage'))`);
      // Fullscreen replaces the preview; the grid and lightbox remain mounted.
      await page.waitForFunction('window.archiveSaveGate.reads.length === 2');
      await page.evaluate('window.archiveSaveGate.holdReads = false');
      await lightbox.getByRole('button', { name: 'Unsave' }).click();
      await expect(lightbox.getByRole('button', { name: 'Save to collection' })).toBeEnabled();
      await expect(card.getByRole('button', { name: 'Save item', exact: true })).toHaveAttribute('aria-pressed', 'false');
      assert.deepEqual(await localCards(page), unrelated);
      await page.evaluate('window.archiveSaveGate.releaseReads()');
      // Flush the released promise continuations before asserting no resurrection.
      await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await expect(lightbox.getByRole('button', { name: 'Save to collection' })).toBeEnabled();
      await lightbox.getByRole('button', { name: 'Close lightbox' }).click();
      await card.click();
      for (const control of [card, preview]) {
        await expect(control.getByRole('button', { name: 'Save item', exact: true })).toBeEnabled();
        await expect(control.getByRole('button', { name: 'Save item', exact: true })).toHaveAttribute('aria-pressed', 'false');
      }
      await preview.getByRole('button', { name: 'View Full Screen' }).click();
      await expect(lightbox.getByRole('button', { name: 'Save to collection' })).toBeEnabled();
      assert.deepEqual(await localCards(page), unrelated);
      assert.deepEqual(await savedBookmarks(page), {});
      assert.equal(requests.length, 1);
      assert.deepEqual(await archiveSaveOutcomes(page), ['saved']);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`all nine Daily Drop cards save to Collection and survive refresh in ${engine.name}`, { timeout: 120_000 }, async () => {
    const recentDate = shanghaiDateOffset(-1);
    const historicalDate = shanghaiDateOffset(-10);
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await seedBrowserState(page);
      const inventoryRequests: string[] = [];
      const saveRequests = await installEditionRoutes(page, {
        nonIndexableDaily: true,
        inventoryRequests,
      });
      await gotoTestPage(page, `${origin}/vibe-atlas`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^Save item$/ }).first().waitFor();

      assert.equal(await localRecordCount(page, 'cards'), 0, 'showing the Daily Drop must not import cards into Collection');
      for (let index = 0; index < 9; index += 1) {
        const card = page.getByRole('button', { name: new RegExp(`^View Archive boundary card ${index + 1}`) });
        await card.getByRole('button', { name: 'Save item', exact: true }).click();
        await card.getByRole('button', { name: 'Remove from saved', exact: true }).waitFor();
      }

      assert.equal(await localRecordCount(page, 'cards'), 9);
      assert.equal(await localRecordCount(page, 'grids'), 0, 'individual card saves must not unpack or create saved grids');
      assert.equal(saveRequests.length, 9);
      assert.deepEqual(inventoryRequests, [], 'the live Daily Drop fixture has no indexable editorial inventory record');
      assert.deepEqual(
        saveRequests.map(request => request.imageId),
        Array.from({ length: 9 }, (_, index) => `https://images.archive-save.test/${recentDate}/card-${index + 1}.jpg`),
        'each exact image identity must be individually authorized',
      );
      const cards = await localCards(page);
      assert.deepEqual(cards.map(card => card.resultId), saveRequests.map(request => request.imageId));
      assert.deepEqual(cards.map(card => card.capturedDate), Array(9).fill(recentDate));
      assert.deepEqual(cards.map(card => (card.gridContext as { position: number }).position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
      assert.ok(cards.every(card => (
        card.actor === ACTOR_NAME
        && card.actorEn === ACTOR_NAME
        && card.actorId === ACTOR_ID
        && card.vibe === 'Archive label'
        && card.vibeEn === 'Saved Archive'
        && card.collectionScope === 'vibe-atlas'
        && card.searchQuery === 'archive-save-boundary'
        && card.sourceRoute === undefined
      )), 'Collection records should keep the approved card provenance without inventing an editorial link');
      assert.deepEqual(
        cards.map(card => card.title),
        Array.from({ length: 9 }, (_, index) => `Archive boundary card ${index + 1}`),
      );
      assert.deepEqual(
        cards.map(card => card.sourceUrl),
        Array.from({ length: 9 }, (_, index) => `https://sources.archive-save.test/${recentDate}/card-${index + 1}`),
      );
      assert.deepEqual(
        cards.map(card => (card.gridContext as { batchKey: string }).batchKey),
        Array(9).fill('archive-save-boundary'),
      );

      await page.getByRole('button', { name: /Your Collection/ }).click();
      await page.getByRole('button', { name: /Saved results/ }).click();
      const savedResult = page.getByRole('button', { name: `View ${ACTOR_NAME} Archive label result larger` });
      await savedResult.first().waitFor();
      assert.equal(await savedResult.count(), 9);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Saved results/ }).click();
      await savedResult.first().waitFor();
      assert.equal(await savedResult.count(), 9);
      assert.equal(await localRecordCount(page, 'cards'), 9, 'refresh must retain all individually saved Collection cards');

      await gotoTestPage(page, `${origin}/vibe-atlas?date=${historicalDate}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^View Archive boundary card 1/ }).waitFor();
      assert.ok(inventoryRequests.length > 0, 'an explicit historical edition requests public Archive inventory');
      assert.deepEqual([...new Set(inventoryRequests)], [historicalDate], 'historical requests stay on the selected edition, including development StrictMode retries');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`card, expanded preview, and Lightbox removals delete durable saves without reauthorization in ${engine.name}`, { timeout: 120_000 }, async () => {
    const recentDate = shanghaiDateOffset(-1);
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await seedBrowserState(page);
      const saveRequests = await installEditionRoutes(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${recentDate}`, { waitUntil: 'domcontentloaded' });

      const gridSaveButton = page.getByRole('button', { name: /^Save item$/ }).first();
      await gridSaveButton.click();
      await page.getByRole('button', { name: 'Remove from saved' }).first().waitFor();
      await page.getByRole('button', { name: 'Remove from saved' }).first().click();
      assert.equal(await localRecordCount(page, 'cards'), 0, 'the grid card control must remove its durable record');

      await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
      const preview = page.getByRole('region', { name: 'Preview of Archive boundary card 1' });
      await preview.getByRole('button', { name: /^Save item$/ }).click();
      await preview.getByRole('button', { name: 'Remove from saved' }).waitFor();
      await preview.getByRole('button', { name: 'Remove from saved' }).click();
      assert.equal(await localRecordCount(page, 'cards'), 0, 'the expanded preview must remove its durable record');

      await preview.getByRole('button', { name: 'View Full Screen' }).click();
      const lightbox = page.getByRole('dialog', { name: /Image viewer/ });
      const lightboxSaveButton = lightbox.getByRole('button', { name: 'Save to collection' });
      await lightboxSaveButton.waitFor();
      await lightboxSaveButton.click();
      await lightbox.getByRole('button', { name: 'Unsave' }).waitFor();
      await lightbox.getByRole('button', { name: 'Unsave' }).click();
      await lightbox.getByRole('button', { name: 'Save to collection' }).waitFor();
      assert.equal(await localRecordCount(page, 'cards'), 0, 'the Lightbox must remove its durable record');
      assert.equal(saveRequests.length, 3, 'removing a saved card must not call authorization again');
      const events = await page.evaluate(() => (window as unknown as {
        archiveSaveEvents: { name: string; data: Record<string, string | number | boolean> }[];
      }).archiveSaveEvents.filter(event => event.name.startsWith('archive_card_')));
      assert.deepEqual(events.map(event => ({ name: event.name, outcome: event.data.outcome })), [
        { name: 'archive_card_authorization', outcome: 'allowed' },
        { name: 'archive_card_save_outcome', outcome: 'saved' },
        { name: 'archive_card_authorization', outcome: 'allowed' },
        { name: 'archive_card_save_outcome', outcome: 'saved' },
        { name: 'archive_card_authorization', outcome: 'allowed' },
        { name: 'archive_card_save_outcome', outcome: 'saved' },
      ], 'each saving surface reports actual persistence once; removals do not count as acquisitions');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`authorized Archive card persistence failures never count as acquisitions in ${engine.name}`, { timeout: 120_000 }, async () => {
    const recentDate = shanghaiDateOffset(-1);
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await seedBrowserState(page);
      await installEditionRoutes(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${recentDate}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^Save item$/ }).first().waitFor();
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
          if (this.name === 'cards') throw new Error('fixture local persistence failure');
          return original.apply(this, args);
        };
      });
      await page.getByRole('button', { name: /^Save item$/ }).first().click();
      await page.waitForFunction(() => (window as unknown as {
        archiveSaveEvents: { name: string }[];
      }).archiveSaveEvents.filter(event => event.name === 'archive_card_save_outcome').length === 1);
      await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
      const preview = page.getByRole('region', { name: 'Preview of Archive boundary card 1' });
      await preview.getByRole('button', { name: /^Save item$/ }).click();
      await page.waitForFunction(() => (window as unknown as {
        archiveSaveEvents: { name: string }[];
      }).archiveSaveEvents.filter(event => event.name === 'archive_card_save_outcome').length === 2);
      await preview.getByRole('button', { name: 'View Full Screen' }).click();
      await page.getByRole('dialog', { name: /Image viewer/ }).getByRole('button', { name: 'Save to collection' }).click();
      await page.waitForFunction(() => (window as unknown as {
        archiveSaveEvents: { name: string }[];
      }).archiveSaveEvents.filter(event => event.name === 'archive_card_save_outcome').length === 3);
      const events = await page.evaluate(() => (window as unknown as {
        archiveSaveEvents: { name: string; data: Record<string, string | number | boolean> }[];
      }).archiveSaveEvents.filter(event => event.name.startsWith('archive_card_')));
      assert.deepEqual(events.map(event => event.data.outcome), [
        'allowed', 'persistence_failed', 'allowed', 'persistence_failed', 'allowed', 'persistence_failed',
      ]);
      assert.equal(await localRecordCount(page, 'cards'), 0);
      assert.equal(JSON.stringify(events).includes('fixture local'), false);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`individual public-edition saves fail closed before local writes in ${engine.name}`, { timeout: 120_000 }, async () => {
    const recentDate = shanghaiDateOffset(-1);
    const imageId = `https://images.archive-save.test/${recentDate}/card-1.jpg`;
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await seedBrowserState(page);
      const saveRequests = await installEditionRoutes(page, {
        authorize: () => ({ status: 401, body: { access: 'sign_in', error: 'Sign in required.' } }),
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${recentDate}`, { waitUntil: 'domcontentloaded' });

      const card = page.getByRole('button', { name: /^Save item$/ }).first();
      await card.waitFor();
      await card.click();
      await page.getByRole('alert').getByText('Sign in before saving this edition’s cards.').waitFor();
      assert.deepEqual(saveRequests, [{ date: recentDate, imageId }]);
      assert.deepEqual(await savedBookmarks(page), {}, 'a denied save must not add a legacy bookmark');
      assert.equal(await localRecordCount(page, 'cards'), 0, 'a denied card save must not create a local Collection record');
      assert.equal(await localRecordCount(page, 'grids'), 0, 'a denied card save must not create a grid record');
      const events = await page.evaluate(() => (window as unknown as {
        archiveSaveEvents: { name: string; data: Record<string, string | number | boolean> }[];
      }).archiveSaveEvents.filter(event => event.name.startsWith('archive_card_')));
      assert.deepEqual(events, [
        { name: 'archive_card_authorization', data: { outcome: 'sign_in', edition_date: recentDate } },
      ]);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`authorized cards stay in local Collection when signed-in account sync fails in ${engine.name}`, { timeout: 120_000 }, async () => {
    const recentDate = shanghaiDateOffset(-1);
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const syncRequests: unknown[] = [];

    try {
      await seedBrowserState(page);
      const saveRequests = await installEditionRoutes(page);
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: { accountId: 'archive-save-sync-user', email: 'reader@example.test' } }),
      }));
      await page.route('**/api/collection/sync', async route => {
        syncRequests.push(route.request().postDataJSON());
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Collection sync unavailable.' }),
        });
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${recentDate}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^Save item$/ }).first().waitFor();
      await page.evaluate(async accountId => {
        const request = indexedDB.open('vibe-atlas-collection', 3);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const transaction = db.transaction('sync', 'readwrite');
          transaction.objectStore('sync').put({ key: 'state', mergeDecisions: { [accountId]: true } });
          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
        } finally {
          db.close();
        }
      }, 'archive-save-sync-user');

      await page.getByRole('button', { name: /^Save item$/ }).first().click();
      await page.getByRole('button', { name: 'Remove from saved' }).first().waitFor();
      assert.equal(await localRecordCount(page, 'cards'), 1, 'authorized local save must complete before cloud sync');
      await page.getByRole('button', { name: /Your Collection/ }).click();
      await page.getByRole('button', { name: /Saved results/ }).click();
      await page.getByRole('button', { name: `View ${ACTOR_NAME} Archive label result larger` }).waitFor();
      await page.getByRole('status').filter({ hasText: 'account sync failed' }).waitFor();
      assert.ok(syncRequests.length > 0, 'the signed-in account sync attempt must be observable');
      assert.deepEqual(saveRequests, [{ date: recentDate, imageId: `https://images.archive-save.test/${recentDate}/card-1.jpg` }]);
      assert.equal(await localRecordCount(page, 'cards'), 1);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`a rejected legacy bookmark promotion in the Lightbox keeps the old bookmark and writes no Collection card in ${engine.name}`, { timeout: 120_000 }, async () => {
    const oldDate = shanghaiDateOffset(-10);
    const legacyImageId = `https://images.archive-save.test/${oldDate}/card-1.jpg`;
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await seedBrowserState(page, legacyImageId);
      const saveRequests = await installEditionRoutes(page, {
        authorize: () => ({ status: 403, body: { access: 'upgrade', error: 'Collector required.' } }),
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${oldDate}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /^View Archive boundary card 1/ }).click();
      await page.getByRole('button', { name: 'View Full Screen', exact: true }).click();

      const lightbox = page.getByRole('dialog', { name: /Image viewer/ });
      await lightbox.waitFor();
      await lightbox.getByRole('button', { name: 'Add to Collection' }).click();
      await lightbox.getByRole('alert').getByText('Older edition card saves are a Collector benefit.').waitFor();
      const collectorLink = lightbox.getByRole('alert').getByRole('link', { name: 'See Collector options' });
      assert.equal(await collectorLink.getAttribute('href'), '/vibe-atlas?view=membership');
      assert.deepEqual(saveRequests, [{ date: oldDate, imageId: legacyImageId }]);
      assert.equal(await localRecordCount(page, 'cards'), 0, 'a denied legacy promotion must not create a local Collection record');
      assert.deepEqual(
        await page.evaluate(() => JSON.parse(localStorage.getItem('vibe-atlas-saved-items') || '{}')),
        { [legacyImageId]: true },
        'the pre-existing bookmark must remain available when promotion is denied',
      );
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`a Collector may save one older edition card and remove it later without reauthorization in ${engine.name}`, { timeout: 120_000 }, async () => {
    const oldDate = shanghaiDateOffset(-10);
    const imageId = `https://images.archive-save.test/${oldDate}/card-1.jpg`;
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await seedBrowserState(page);
      let authorizationCalls = 0;
      const saveRequests = await installEditionRoutes(page, {
        isCollector: true,
        authorize: date => {
          authorizationCalls += 1;
          return authorizationCalls === 1
            ? { status: 200, body: { allowed: true, date, imageId: `archive:${date}:card-0` } }
            : { status: 403, body: { access: 'upgrade', error: 'Collector required.' } };
        },
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${oldDate}`, { waitUntil: 'domcontentloaded' });

      const saveButton = page.getByRole('button', { name: /^Save item$/ }).first();
      await saveButton.waitFor();
      await saveButton.click();
      await page.getByRole('button', { name: 'Remove from saved' }).waitFor();
      assert.deepEqual(saveRequests, [{ date: oldDate, imageId }]);
      assert.deepEqual(await savedBookmarks(page), {}, 'a durable Collection save must not be copied to the legacy bookmark store');

      await page.getByRole('button', { name: 'Remove from saved' }).click();
      await page.getByRole('button', { name: /^Save item$/ }).first().waitFor();
      assert.equal(authorizationCalls, 1, 'removing a saved card must not depend on current age or membership');
      assert.deepEqual(saveRequests, [{ date: oldDate, imageId }]);
      assert.deepEqual(await savedBookmarks(page), {}, 'the user should still be able to remove their previously saved card');
      const events = await page.evaluate(() => (window as unknown as {
        archiveSaveEvents: { name: string; data: Record<string, string | number | boolean> }[];
      }).archiveSaveEvents.filter(event => event.name.startsWith('archive_card_')));
      assert.deepEqual(events, [
        { name: 'archive_card_authorization', data: { outcome: 'allowed', edition_date: oldDate } },
        { name: 'archive_card_save_outcome', data: { outcome: 'saved', edition_date: oldDate } },
      ], 'authorization, actual acquisition, and removal must remain distinct');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}