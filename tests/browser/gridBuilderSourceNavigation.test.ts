import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import {
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const DAILY_ACTOR = 'Daily Drop Actor';
const SAVED_ACTOR = 'Saved Collection Actor';

function dailyDropFixture() {
  return {
    date: '2026-09-20',
    actorId: 'daily-drop-actor',
    actorName: DAILY_ACTOR,
    actorShortNameEn: DAILY_ACTOR,
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
        title: `Daily inventory ${index + 1}`,
        thumbnail: `https://images.example/daily-${index + 1}.jpg`,
        link: `https://source.example/daily-${index + 1}`,
        source: 'Daily source',
      })),
    }],
  };
}

async function seedSavedCard(page: Page): Promise<void> {
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
    const transaction = db.transaction('cards', 'readwrite');
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

test('Grid Builder keeps Daily Drop and My Collection sources isolated across navigation', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);

  try {
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

    await page.goto(origin);
    await seedSavedCard(page);
    await page.goto(`${origin}/vibe-atlas?view=builder&source=daily`);

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

    await page.goBack();
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

    await page.goForward();
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

test('Grid Builder restores the URL inventory source on cold load and reload', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);

  try {
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

    await page.goto(origin);
    await seedSavedCard(page);

    const dailyUrl = `${origin}/vibe-atlas?view=builder&source=daily`;
    await page.goto(dailyUrl);
    await page.getByText('9 Daily Drop images match this lens').waitFor();
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).count(), 1);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, DAILY_ACTOR, 9);

    await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR} 9`) }).click();
    await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
    await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
    await page.reload();
    await page.getByText('9 Daily Drop images match this lens').waitFor();
    assert.equal(page.url(), dailyUrl);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, DAILY_ACTOR, 9);

    const collectionUrl = `${origin}/vibe-atlas?view=builder`;
    await page.goto(collectionUrl);
    await page.getByText('1 saved result matches this lens').waitFor();
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).count(), 1);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, SAVED_ACTOR, 1);

    await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).click();
    await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
    await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
    await page.reload();
    await page.getByText('1 saved result matches this lens').waitFor();
    assert.equal(page.url(), collectionUrl);
    assert.equal(await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(), 0);
    await assertClearBuilderState(page, SAVED_ACTOR, 1);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('Grid Builder falls back to Collection inventory for malformed source links', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);

  try {
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

    await page.goto(origin);
    await seedSavedCard(page);

    for (const malformedUrl of [
      `${origin}/vibe-atlas?view=builder&source=unknown`,
      `${origin}/vibe-atlas?view=builder&source=edition&date=2026-02-29`,
    ]) {
      await page.goto(malformedUrl);
      await page.getByText('1 saved result matches this lens').waitFor();
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${SAVED_ACTOR} 1`) }).count(), 1);
      assert.equal(
        await page.getByRole('button', { name: new RegExp(`^${DAILY_ACTOR}`) }).count(),
        0,
        'a malformed Builder source must not expose Daily Drop or edition inventory',
      );
      await assertClearBuilderState(page, SAVED_ACTOR, 1);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
