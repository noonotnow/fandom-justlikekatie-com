import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import {
  closeBrowserAndServer,
  launchBrowserForServer,
} from './browserEngines.ts';

const ACTOR_ID = 'source-notes-actor';
const ACTOR_NAME = 'Source Notes Actor';
const PROTECTED_QUERY = 'private actor source query';
const AUTHORING_NOTE = 'Private authoring direction for the actor pack.';

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

async function seedActorCard(page: Page): Promise<void> {
  await page.evaluate(async ({ actorId, actorName }) => {
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
      imageUrl: 'https://images.example/source-notes-actor.jpg',
      thumbnailUrl: 'https://images.example/source-notes-actor-thumb.jpg',
      sourceUrl: 'https://publisher.example/source-notes-actor',
      publisher: 'publisher.example',
      title: 'Source notes actor still',
      actorId,
      actor: actorName,
      actorEn: actorName,
      vibe: 'Editorial confidence',
      vibeEn: 'Editorial confidence',
      vibeEmoji: '✨',
      capturedDate: '2026-09-20',
      savedAt: '2026-09-20T12:00:00.000Z',
      sourceRoute: '/vibe-atlas',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, { actorId: ACTOR_ID, actorName: ACTOR_NAME });
}

async function openBuilder(page: Page, origin: string): Promise<void> {
  await page.goto(origin);
  await seedActorCard(page);
  await page.goto(`${origin}/vibe-atlas?view=collection`);
  await page.getByRole('button', { name: 'Grid Builder', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`${ACTOR_NAME} 1`) }).click();
  await page.getByRole('region', { name: `Source notes for ${ACTOR_NAME}` }).waitFor();
}

async function mockSessionAndMembership(page: Page, collector: boolean): Promise<void> {
  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      user: collector
        ? { accountId: 'source-notes-collector', email: 'collector@example.test', isAdmin: false }
        : null,
    }),
  }));
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      state: collector ? 'active' : 'inactive',
      capabilities: collector ? ['fandom_collector'] : [],
    }),
  }));
}

test('Actor source notes stay private for free users and fail safely for Collectors', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowserForServer(server);

  try {
    const freePage = await browser.newPage();
    await mockSessionAndMembership(freePage, false);
    let freeDepthRequests = 0;
    await freePage.route('**/.netlify/functions/actor-pack-depth?*', route => {
      freeDepthRequests += 1;
      return route.fulfill({ status: 500, body: 'free users must not reach this endpoint' });
    });
    await openBuilder(freePage, origin);

    const freeNotes = freePage.getByRole('region', { name: `Source notes for ${ACTOR_NAME}` });
    await freeNotes.getByRole('button', { name: 'Preview benefit' }).click();
    await freeNotes.getByText('Protected searches and notes stay available only to active Collectors.').waitFor();
    assert.equal(freeDepthRequests, 0, 'the free preview must not request private actor-pack depth');
    assert.equal(await freePage.getByText(PROTECTED_QUERY, { exact: true }).count(), 0);
    assert.equal(await freePage.getByText(AUTHORING_NOTE, { exact: true }).count(), 0);
    await freePage.close();

    const collectorPage = await browser.newPage();
    await mockSessionAndMembership(collectorPage, true);
    const collectorRequests: Array<{ actorId: string | null; credentials: string | undefined }> = [];
    await collectorPage.route('**/.netlify/functions/actor-pack-depth?*', async route => {
      const request = route.request();
      collectorRequests.push({
        actorId: new URL(request.url()).searchParams.get('actorId'),
        credentials: request.headers().cookie,
      });
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          packs: [{
            id: ACTOR_ID,
            provenance: { attribution: 'Curated source ledger' },
            vibes: [{
              emoji: '✨',
              label_en: 'Editorial confidence',
              sourceDepth: {
                queries: [PROTECTED_QUERY],
                authoringPrompt: AUTHORING_NOTE,
              },
            }],
          }],
        }),
      });
    });
    await collectorPage.context().addCookies([{
      name: 'browser-test-session',
      value: 'collector',
      url: origin,
    }]);
    await openBuilder(collectorPage, origin);

    const collectorNotes = collectorPage.getByRole('region', { name: `Source notes for ${ACTOR_NAME}` });
    await collectorNotes.getByRole('button', { name: 'Open notes' }).click();
    await collectorNotes.getByText('Source: Curated source ledger').waitFor();
    assert.equal(collectorRequests.length, 1, 'opening notes must make one depth request');
    assert.equal(collectorRequests[0]?.actorId, ACTOR_ID, 'the depth request must include only the selected actor ID');
    assert.match(
      collectorRequests[0]?.credentials ?? '',
      /(?:^|;\s*)browser-test-session=collector(?:;|$)/,
      'the Collector request must include session credentials',
    );
    await collectorPage.close();

    const deniedPage = await browser.newPage();
    await mockSessionAndMembership(deniedPage, true);
    await deniedPage.route('**/.netlify/functions/actor-pack-depth?*', route => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Membership confirmation is delayed.' }),
    }));
    await openBuilder(deniedPage, origin);

    const deniedNotes = deniedPage.getByRole('region', { name: `Source notes for ${ACTOR_NAME}` });
    await deniedNotes.getByRole('button', { name: 'Open notes' }).click();
    await deniedNotes.getByRole('status').filter({
      hasText: 'Source notes are still syncing. You can keep building with your saved images.',
    }).waitFor();
    await deniedPage.getByRole('button', { name: /^Propose (?:Event set|Compiled 3×3)$/ }).click();
    await deniedPage.getByRole('tab', { name: 'Build Your Own' }).click();
    await deniedPage.getByRole('region', { name: 'Choose nine saved images' }).waitFor();
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
