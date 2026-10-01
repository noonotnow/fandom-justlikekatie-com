import assert from 'node:assert/strict';
import { test } from 'node:test';
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
    vibeLabel: 'Saved Archive',
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
    authorize?: (date: string, imageId: string) => { status: number; body: unknown };
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
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(edition(date)),
    });
  });
  await page.route('**/.netlify/functions/public-archive-inventory*', route => {
    const requested = new URL(route.request().url()).searchParams.get('date');
    const date = requested && dates.includes(requested) ? requested : dates[0];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(edition(date)),
    });
  });
  await page.route('**/.netlify/functions/archive-image-save', async route => {
    const payload = route.request().postDataJSON() as { date: string; imageId: string };
    saveRequests.push(payload);
    const result = options.authorize
      ? options.authorize(payload.date, payload.imageId)
      : {
        status: 200,
        body: { allowed: true, date: payload.date, imageId: `archive:${payload.date}:card-1` },
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

async function savedBookmarks(page: import('@playwright/test').Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('vibe-atlas-saved-items') || '{}'));
}

for (const engine of BROWSER_ENGINES) {
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

      await page.getByRole('dialog', { name: /Image viewer/ }).waitFor();
      await page.getByRole('button', { name: 'Add to Collection' }).click();
      await page.getByRole('alert').getByText('Older edition card saves are a Collector benefit.').waitFor();
      const collectorLink = page.getByRole('alert').getByRole('link', { name: 'See Collector options' });
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
            ? { status: 200, body: { allowed: true, date, imageId: `archive:${date}:card-1` } }
            : { status: 403, body: { access: 'upgrade', error: 'Collector required.' } };
        },
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?date=${oldDate}`, { waitUntil: 'domcontentloaded' });

      const saveButton = page.getByRole('button', { name: /^Save item$/ }).first();
      await saveButton.waitFor();
      await saveButton.click();
      await page.getByRole('button', { name: 'Remove from saved' }).waitFor();
      assert.deepEqual(saveRequests, [{ date: oldDate, imageId }]);
      assert.deepEqual(await savedBookmarks(page), { [imageId]: true }, 'authorized individual save should be marked saved');

      await page.getByRole('button', { name: 'Remove from saved' }).click();
      await page.getByRole('button', { name: /^Save item$/ }).first().waitFor();
      assert.equal(authorizationCalls, 1, 'removing a saved card must not depend on current age or membership');
      assert.deepEqual(saveRequests, [{ date: oldDate, imageId }]);
      assert.deepEqual(await savedBookmarks(page), {}, 'the user should still be able to remove their previously saved card');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}