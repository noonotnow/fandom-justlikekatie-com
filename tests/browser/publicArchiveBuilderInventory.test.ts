import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Page } from '@playwright/test';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const ACTORS = [
  { id: 'archive-alpha', name: 'Public Archive Alpha', slug: 'archive-alpha' },
  { id: 'archive-beta', name: 'Public Archive Beta', slug: 'archive-beta' },
] as const;
const FIRST_DATE = '2026-08-22';
const EDITION_DATES = [
  FIRST_DATE,
  '2026-08-21',
  '2026-08-20',
  '2026-08-19',
  '2026-08-18',
  '2026-08-17',
] as const;

type ArchiveActor = { id: string; name: string; slug: string };

function publishedEdition(date: string, actor: ArchiveActor) {
  const appearance = `${actor.slug}-${date}`;
  return {
    actorId: actor.id,
    actorName: actor.name,
    actorShortNameEn: actor.name,
    actorAccentColor: '#c9a96e',
    vibeEmoji: '🗂️',
    vibeLabel: 'Published Archive edition',
    vibeLabelEn: 'Published Archive edition',
    vibeSubtitle: 'This exact board passed publication verification.',
    vibeSubtitleEn: 'This exact board passed publication verification.',
    rankedBatches: [{
      query: appearance,
      results: Array.from({ length: 9 }, (_, index) => ({
        title: `${actor.name} ${date} frame ${index + 1}`,
        thumbnail: `https://images.public-archive.test/${date}/${actor.id}-${index + 1}.jpg`,
        link: `https://sources.public-archive.test/${date}/${actor.id}-${index + 1}`,
        source: `Publisher ${index + 1}`,
        familyId: `batch-${appearance}`,
        familyLabel: `Appearance ${date}`,
        familyEvidence: 'batch' as const,
      })),
      count: 9,
      distinctSources: 9,
      provider: null,
    }],
    date,
    publicRecord: {
      actorPath: `/vibe-atlas/actors/${actor.slug}`,
      editionPath: `/vibe-atlas/editions/${date}/${actor.slug}`,
    },
  };
}

function archiveSummary(date: string) {
  return {
    date,
    actorName: ACTORS[0].name,
    actorShortNameEn: ACTORS[0].name,
    vibeEmoji: '🗂️',
    vibeLabel: 'Published Archive edition',
    vibeLabelEn: 'Published Archive edition',
    vibeSubtitleEn: 'This exact board passed publication verification.',
    access: 'free',
    previewThumbnails: [`https://images.public-archive.test/${date}/${ACTORS[0].id}-1.jpg`],
    publicRecord: {
      actorPath: `/vibe-atlas/actors/${ACTORS[0].slug}`,
      editionPath: `/vibe-atlas/editions/${date}/${ACTORS[0].slug}`,
    },
  };
}

const EDITIONS = [
  publishedEdition(EDITION_DATES[0], ACTORS[0]),
  publishedEdition(EDITION_DATES[1], ACTORS[1]),
  publishedEdition(EDITION_DATES[2], ACTORS[0]),
  publishedEdition(EDITION_DATES[3], ACTORS[1]),
  publishedEdition(EDITION_DATES[4], ACTORS[0]),
  publishedEdition(EDITION_DATES[5], ACTORS[1]),
];

const FIRST_PAGE = EDITIONS.slice(0, 2);
const SECOND_PAGE = EDITIONS.slice(2, 4);
const THIRD_PAGE = EDITIONS.slice(4, 6);

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU6kAAAAASUVORK5CYII=',
  'base64',
);

interface SessionUserFixture {
  accountId: string;
  email: string;
}

async function installPublicArchiveRoutes(page: Page, options: {
  inventoryError?: boolean;
  inventoryEmpty?: boolean;
  legacyEditionGateDenied?: boolean;
  sessionGate?: Promise<void>;
  shouldDeferSession?: () => boolean;
  authenticatedUser?: SessionUserFixture;
  collectorMembership?: boolean;
} = {}): Promise<{
  publicInventoryDates: string[];
  legacyGateDates: string[];
  sessionRequests: number[];
  deferredSessionRequests: number[];
  completedSessionRequests: number[];
}> {
  const publicInventoryDates: string[] = [];
  const legacyGateDates: string[] = [];
  const sessionRequests: number[] = [];
  const deferredSessionRequests: number[] = [];
  const completedSessionRequests: number[] = [];
  for (const url of [
    'https://fonts.googleapis.com/**',
    'https://fonts.gstatic.com/**',
    'https://www.googletagmanager.com/**',
    'https://www.google-analytics.com/**',
    'https://region1.google-analytics.com/**',
  ]) {
    await page.route(url, route => route.abort());
  }
  await page.route('**/api/auth/session', async route => {
    const requestId = sessionRequests.length + 1;
    sessionRequests.push(requestId);
    const shouldDefer = Boolean(options.sessionGate && (options.shouldDeferSession?.() ?? true));
    if (shouldDefer) {
      deferredSessionRequests.push(requestId);
      await options.sessionGate;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: shouldDefer ? options.authenticatedUser ?? null : null }),
    });
    completedSessionRequests.push(requestId);
  });
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(options.collectorMembership
      ? { state: 'active', isMember: true, capabilities: ['fandom_collector'] }
      : { state: 'inactive', capabilities: [] }),
  }));
  await page.route('**/.netlify/functions/image-proxy**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: ONE_PIXEL_PNG,
  }));
  await page.route('**/.netlify/functions/star-of-day*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const requestedDate = query.get('date');
    if (requestedDate && options.legacyEditionGateDenied) {
      legacyGateDates.push(requestedDate);
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          access: 'upgrade',
          error: 'The legacy Archive endpoint is gated.',
          edition: archiveSummary(requestedDate),
        }),
      });
      return;
    }
    if (query.get('archive') === '1') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ editions: [archiveSummary(FIRST_DATE)] }),
      });
      return;
    }
    const date = query.get('date') || FIRST_DATE;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(EDITIONS.find(edition => edition.date === date) || EDITIONS[0]),
    });
  });
  await page.route('**/.netlify/functions/public-archive-inventory*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const requestedDate = query.get('date');
    if (requestedDate) publicInventoryDates.push(requestedDate);
    if (options.inventoryError) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The public Archive is temporarily unavailable.' }),
      });
      return;
    }
    const date = query.get('date');
    if (date) {
      const edition = EDITIONS.find(item => item.date === date);
      await route.fulfill({
        status: edition ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(edition || { error: 'No published edition exists for this date.' }),
      });
      return;
    }
    if (query.get('directory') === 'actors') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          actors: options.inventoryEmpty ? [] : ACTORS.map(({ id, name }) => ({ id, name })),
          page: { hasMore: false, nextCursor: null },
          actorInventory: { complete: true, scope: 'verified-directory' },
        }),
      });
      return;
    }
    if (query.get('actorId')) {
      const editions = EDITIONS.filter(edition => edition.actorId === query.get('actorId')
        && (!query.get('cursor') || edition.date < query.get('cursor')!));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          editions: editions.slice(0, 1),
          actors: ACTORS.filter(actor => actor.id === query.get('actorId')),
          page: { hasMore: editions.length > 1, nextCursor: editions.length > 1 ? editions[0].date : null },
        }),
      });
      return;
    }
    const page = query.get('cursor') === 'page-2'
      ? SECOND_PAGE
      : query.get('cursor') === 'page-3'
        ? THIRD_PAGE
        : FIRST_PAGE;
    const empty = options.inventoryEmpty;
    const nextCursor = query.get('cursor') === 'page-2' ? 'page-3'
      : query.get('cursor') ? null : 'page-2';
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        editions: empty ? [] : page,
        actors: empty ? [] : ACTORS.map(({ id, name }) => ({ id, name })),
        page: {
          nextCursor: empty ? null : nextCursor,
          hasMore: !empty && nextCursor !== null,
        },
      }),
    });
  });
  return {
    publicInventoryDates,
    legacyGateDates,
    sessionRequests,
    deferredSessionRequests,
    completedSessionRequests,
  };
}

async function seedSavedCollection(page: Page): Promise<void> {
  await page.evaluate(async () => {
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
      imageUrl: 'https://images.public-archive.test/saved-collection-only.jpg',
      thumbnailUrl: 'https://images.public-archive.test/saved-collection-only-thumb.jpg',
      resultId: 'saved-collection-only',
      actor: 'Collection-Only Actor',
      actorEn: 'Collection-Only Actor',
      actorId: 'collection-only-actor',
      vibe: 'Private saved image',
      vibeEn: 'Private saved image',
      vibeEmoji: '💾',
      capturedDate: '2026-08-16',
      savedAt: '2026-08-16T12:00:00.000Z',
      sourceRoute: '/vibe-atlas?view=collection',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });
}

async function getSavedGrid(page: Page): Promise<{
  sourceUrl: string;
  archiveDate: string;
  editionPath: string;
}[]> {
  const result = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('vibe-atlas-collection', 3);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const grids = await new Promise<any[]>((resolve, reject) => {
        const transaction = db.transaction('grids', 'readonly');
        const request = transaction.objectStore('grids').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return {
        gridCount: grids.length,
        images: (grids[0]?.images || []).map((image: {
          sourceUrl: string;
          archiveSource?: { date?: string; publicRecord?: { editionPath?: string } };
        }) => ({
          sourceUrl: image.sourceUrl,
          archiveDate: image.archiveSource?.date || '',
          editionPath: image.archiveSource?.publicRecord?.editionPath || '',
        })),
      };
    } finally {
      db.close();
    }
  });
  assert.equal(result.gridCount, 1, 'exactly one finished grid should be saved');
  return result.images;
}

function createPromiseGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  message: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function readActiveAccountId(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const request = indexedDB.open('vibe-atlas-collection', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const state = await new Promise<{ activeAccountId?: string } | undefined>((resolve, reject) => {
        const transaction = db.transaction('sync', 'readonly');
        const stateRequest = transaction.objectStore('sync').get('state');
        stateRequest.onsuccess = () => resolve(stateRequest.result);
        stateRequest.onerror = () => reject(stateRequest.error);
      });
      return state?.activeAccountId || null;
    } finally {
      db.close();
    }
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`partial directory retry is localized, demand-driven and preserves selection in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    let requests = 0;
    let retryRequested = false;
    const retryGate = createPromiseGate();
    const start = Date.now();
    try {
      await page.clock.install({ time: new Date(start) });
      await page.clock.pauseAt(new Date(start));
      await installPublicArchiveRoutes(page);
      await page.route('**/.netlify/functions/public-archive-inventory*', async route => {
        const query = new URL(route.request().url()).searchParams;
        if (query.get('directory') !== 'actors') { await route.fallback(); return; }
        requests++;
        if (retryRequested) await retryGate.promise;
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          actors: retryRequested ? [ACTORS[1]] : [ACTORS[0], ACTORS[1]],
          page: { hasMore: false, nextCursor: null, partial: true, unavailableCount: 1 },
          actorInventory: {
            scope: 'verified-directory', complete: false, generation: retryRequested ? 'replacement' : 'partial',
            freshness: 'partial', source: 'snapshot', verifiedCandidates: 31, totalCandidates: 31,
            verifiedAt: new Date(start).toISOString(), expiresAt: new Date(start + 900_000).toISOString(),
            ...(retryRequested ? {} : { retryAt: new Date(start + 60_000).toISOString() }),
          },
        }) });
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=archive`, { waitUntil: 'domcontentloaded' });
      const selector = page.getByRole('combobox', { name: 'Browse published actor' });
      await selector.locator(`option[value="${ACTORS[0].id}"]`).waitFor({ state: 'attached' });
      await selector.selectOption(ACTORS[1].id);
      await page.getByText('9 public Archive images match this lens').waitFor();
      const retry = page.getByRole('button', { name: 'Retry actor directory' });
      await page.getByText(/The next verification can run at/).waitFor();
      assert.equal(await retry.isDisabled(), true);
      assert.equal(await page.getByText('2 verified published actors', { exact: true }).count(), 0);
      const before = requests;
      await page.getByLabel('Language').selectOption('zh-CN');
      await page.getByText(/下次可核验时间/).waitFor();
      assert.equal(await page.getByRole('button', { name: '重试演员目录' }).isDisabled(), true);
      await page.getByLabel('语言').selectOption('en');
      await page.clock.fastForward(59_000);
      assert.equal(await retry.isDisabled(), true);
      assert.equal(requests, before, "no polling or language-change refresh");
      await page.clock.fastForward(2_000);
      await waitForCondition(async () => retry.isEnabled(), 'local deadline reenables retry');
      assert.equal(requests, before, "deadline never fetches automatically");
      retryRequested = true;
      await retry.click();
      await waitForCondition(() => requests > before, 'explicit retry should request verification');
      assert.equal(await selector.inputValue(), ACTORS[1].id);
      assert.equal(await selector.locator(`option[value="${ACTORS[0].id}"]`).count(), 1,
        "verified choices remain while retry loads");
      retryGate.release();
      await waitForCondition(async () => (await selector.locator(`option[value="${ACTORS[0].id}"]`).count()) === 0,
        'new generation replaces rather than unions previous names');
      assert.equal(await selector.inputValue(), ACTORS[1].id);
      assert.equal(await retry.isEnabled(), true, "unclassified partial remains immediately retryable");
    } finally {
      retryGate.release();
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`invalid directory retry metadata never hides verified names or imposes a wait in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    let retryAt = 'not-a-date';
    const start = Date.now();
    try {
      await page.clock.install({ time: new Date(start) });
      await page.clock.pauseAt(new Date(start));
      await installPublicArchiveRoutes(page);
      await page.route('**/.netlify/functions/public-archive-inventory*', async route => {
        if (new URL(route.request().url()).searchParams.get('directory') !== 'actors') {
          await route.fallback(); return;
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
          actors: [ACTORS[0]], page: { hasMore: false, nextCursor: null, unavailableCount: 1 },
          actorInventory: {
            scope: 'verified-directory', complete: false, freshness: 'partial',
            verifiedAt: new Date(start).toISOString(), expiresAt: new Date(start + 30_000).toISOString(),
            retryAt, verifiedCandidates: 1, totalCandidates: 1,
          },
        }) });
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=archive`, { waitUntil: 'domcontentloaded' });
      const retry = page.getByRole('button', { name: 'Retry actor directory' });
      const selector = page.getByRole('combobox', { name: 'Browse published actor' });
      for (const value of ['not-a-date', new Date(start - 1).toISOString(),
        new Date(start + 45_000).toISOString(), new Date(start + 61_000).toISOString()]) {
        retryAt = value;
        await retry.waitFor();
        assert.equal(await retry.isEnabled(), true);
        await retry.click();
        await retry.waitFor();
        assert.equal(await retry.isEnabled(), true);
        assert.equal(await selector.locator(`option[value="${ACTORS[0].id}"]`).count(), 1);
        assert.equal(await page.getByText(/The next verification can run at/).count(), 0);
      }
    } finally { await closeBrowserAndServer(browser, server); }
  });

  test(`snapshot refresh keeps actor selection usable during discovery and retry in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const firstGate = createPromiseGate();
    const finalGate = createPromiseGate();
    const retryGate = createPromiseGate();
    let directoryRequests = 0;
    let restartedPass = false;
    let retryRequested = false;
    const queries: URLSearchParams[] = [];
    const olderActor = { id: 'older-actor', name: 'Older Published Actor', slug: 'older-actor' };
    try {
      await installPublicArchiveRoutes(page);
      await page.route('**/.netlify/functions/public-archive-inventory*', async route => {
        const query = new URL(route.request().url()).searchParams;
        queries.push(query);
        if (query.get('directory') === 'actors') {
          // StrictMode can repeat the initial request. Gate by pagination
          // stage, not request count, so a cancelled root cannot hold discovery.
          const index = query.has('cursor') ? restartedPass ? 3 : 2 : retryRequested ? 4 : 1;
          directoryRequests = index;
          if (index === 2) {
            await firstGate.promise;
            restartedPass = true;
          }
          if (index === 3) await finalGate.promise;
          if (index === 4) await retryGate.promise;
          const complete = index >= 3;
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              actors: index === 1 ? [ACTORS[0]] : complete ? [ACTORS[1], olderActor] : [ACTORS[1]],
              page: { hasMore: !complete, nextCursor: complete ? null : '2026-08-11',
                unavailableCount: index === 3 ? 1 : 0 },
              actorInventory: {
                scope: 'verified-directory', complete: index >= 4, restart: index === 2,
                generation: index === 1 ? 'expired-pass' : 'current-pass',
                source: index === 4 ? 'snapshot' : 'verification',
                freshness: index >= 4 ? 'verified' : complete ? 'partial' : 'refreshing',
                verifiedAt: '2026-10-03T00:00:00Z', expiresAt: '2026-10-03T00:15:00Z',
                verifiedCandidates: complete ? 201 : 100, totalCandidates: 201,
              },
            }),
          });
          return;
        }
        if (query.get('actorId') === olderActor.id) {
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
            editions: [publishedEdition('2026-08-10', olderActor)], actors: [olderActor],
            page: { hasMore: false, nextCursor: null },
          }) });
          return;
        }
        await route.fallback();
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=archive`, { waitUntil: 'domcontentloaded' });
      const selector = page.getByRole('combobox', { name: 'Browse published actor' });
      await selector.locator(`option[value="${ACTORS[0].id}"]`).waitFor({ state: 'attached' });
      await waitForCondition(() => directoryRequests === 2, 'second directory request should be held');
      assert.equal(await selector.isEnabled(), true);
      await selector.selectOption(ACTORS[0].id);
      await page.getByText('9 public Archive images match this lens').waitFor();
      assert.equal(directoryRequests, 2, 'selection must not restart directory discovery');
      firstGate.release();
      await selector.locator(`option[value="${ACTORS[1].id}"]`).waitFor({ state: 'attached' });
      await waitForCondition(() => directoryRequests === 3, 'new generation should resume despite a repeated date cursor');
      await selector.selectOption(ACTORS[1].id);
      await page.getByText('9 public Archive images match this lens').waitFor();
      assert.equal(await selector.locator(`option[value="${ACTORS[0].id}"]`).count(), 0,
        'the refreshed directory must not retain the previous generation actor');
      finalGate.release();
      await page.getByText('The actor directory is partial; some public actors could not be verified.').waitFor();
      await page.getByText(/Manifest verification: 201 of 201 candidates/).waitFor();
      await page.getByRole('button', { name: 'Retry actor directory' }).waitFor();
      retryRequested = true;
      await page.getByRole('button', { name: 'Retry actor directory' }).click();
      await waitForCondition(() => directoryRequests === 4, 'retry should remain pending');
      assert.equal(await selector.locator('option[value="older-actor"]').count(), 1,
        'retry must not blank already verified choices');
      await selector.selectOption(ACTORS[1].id);
      await page.getByText('9 public Archive images match this lens').waitFor();
      retryGate.release();
      await page.getByText('2 verified published actors', { exact: true }).waitFor();
      assert.equal(queries.filter(query => !query.has('directory') && query.has('cursor') && !query.has('actorId')).length, 0);
    } finally {
      firstGate.release();
      finalGate.release();
      retryGate.release();
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`Archive handoff counts only successful current-selection native sharing in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const url = `${origin}/vibe-atlas?view=builder&source=archive`;
    try {
      // Plain JS avoids injecting tsx helper references into browser callbacks.
      await page.addInitScript(`
        window.archiveDiscoveryEvents = [];
        window.umami = { track(name, data) { window.archiveDiscoveryEvents.push({ name, data }); } };
        window.shareOutcome = 'success';
        window.sharePending = false;
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {
          if (window.shareOutcome === 'cancel') throw new DOMException('cancelled', 'AbortError');
          if (window.shareOutcome === 'fail') throw new Error('share failed');
          if (window.shareOutcome === 'hold') {
            window.sharePending = true;
            await new Promise(resolve => { window.resolveShare = resolve; });
          }
        } });
      `);
      await installPublicArchiveRoutes(page);
      const completions = () => page.evaluate(() => (window as unknown as {
        archiveDiscoveryEvents: { name: string; data: Record<string, string | number | boolean> }[];
      }).archiveDiscoveryEvents.filter(event => event.name === 'archive_grid_completed'));
      const prepare = async () => {
        await gotoTestPage(page, url, { waitUntil: 'domcontentloaded' });
        const actor = page.getByRole('combobox', { name: 'Browse published actor' });
        await actor.locator(`option[value="${ACTORS[0].id}"]`).waitFor({ state: 'attached' });
        await actor.selectOption(ACTORS[0].id);
        await page.getByText('9 public Archive images match this lens').waitFor();
        await page.getByRole('button', { name: /^Propose Compiled 3×3$/ }).click();
        await page.getByRole('button', { name: 'Handoff Publishing Grid', exact: true }).click();
        await page.getByRole('button', { name: '1. Prepare RedNote Handoff', exact: true }).click();
        await page.getByText('Handoff prepared.', { exact: true }).waitFor();
        assert.equal((await completions()).length, 0, 'preparation is not a completion');
      };
      await prepare();
      const share = page.getByRole('button', { name: '2a. Share to Device', exact: true });
      for (const outcome of ['cancel', 'fail'] as const) {
        await page.evaluate(value => { Object.assign(window, { shareOutcome: value }); }, outcome);
        await share.click();
        await page.getByText(outcome === 'cancel' ? 'Share cancelled.' : 'Native sharing failed.', { exact: true }).waitFor();
        assert.equal((await completions()).length, 0);
      }
      await page.evaluate(() => { Object.assign(window, { shareOutcome: 'success' }); });
      await share.click();
      await page.getByText('Share request completed. Please verify in RedNote.', { exact: true }).waitFor();
      assert.deepEqual(await completions(), [{
        name: 'archive_grid_completed',
        data: { actor_id: ACTORS[0].id, discovery_source: 'published_actor_directory', completion: 'exported' },
      }]);

      // Fresh documents ensure each stale test starts with a currently verified context.
      for (const change of ['actor', 'source', 'unmount'] as const) {
        await prepare();
        await page.evaluate(() => { Object.assign(window, { shareOutcome: 'hold' }); });
        await share.click();
        await page.waitForFunction(() => Boolean((window as unknown as { sharePending: boolean }).sharePending));
        if (change === 'actor') {
          await page.getByRole('combobox', { name: 'Browse published actor' }).selectOption(ACTORS[1].id);
          await page.getByText('9 public Archive images match this lens').waitFor();
        } else {
          await page.evaluate(value => {
            window.history.pushState({}, '', value === 'source'
              ? '/vibe-atlas?view=builder&source=collection' : '/vibe-atlas?view=collection');
            window.dispatchEvent(new PopStateEvent('popstate'));
          }, change);
          await page.getByRole('combobox', { name: 'Browse published actor' }).waitFor({ state: 'detached' });
        }
        await page.evaluate(async () => {
          (window as unknown as { resolveShare: () => void }).resolveShare();
          // A macrotask follows the sharing promise's completion continuation.
          await new Promise(resolve => setTimeout(resolve, 0));
        });
        assert.equal((await completions()).length, 0, `${change} must invalidate a pending native-share completion`);
      }
    } finally { await closeBrowserAndServer(browser, server); }
  });

  test(`published actor directory discovers unloaded actors and isolates filtered pagination in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const requests: URLSearchParams[] = [];
    const gate = createPromiseGate();
    let holdAlpha = false;
    let failDirectory = true;
    let partialDirectory = true;
    let emptyFilteredPage = false;
    let failFilteredPage = false;
    let filteredResponseMode: 'normal' | 'empty' | 'transport' | 'wrong_actor' = 'normal';
    const olderActor = { id: 'older-actor', name: 'Older Published Actor', slug: 'older-actor' };
    const olderEditions = [
      publishedEdition('2026-08-10', olderActor),
      publishedEdition('2026-08-09', olderActor),
    ];
    try {
      await page.addInitScript(() => {
        const events: { name: string; data?: Record<string, string | number | boolean> }[] = [];
        Object.assign(window, { archiveDiscoveryEvents: events });
        Object.assign(window, { umami: { track(name: string, data?: Record<string, string | number | boolean>) { events.push({ name, data }); } } });
      });
      await installPublicArchiveRoutes(page);
      await page.route('**/.netlify/functions/public-archive-inventory*', async route => {
        const query = new URL(route.request().url()).searchParams;
        requests.push(query);
        if (query.get('directory') === 'actors') {
          if (failDirectory) {
            await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The actor directory could not be loaded.' }) });
            return;
          }
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              actors: query.has('cursor') ? [olderActor] : ACTORS,
              page: { hasMore: !query.has('cursor'), nextCursor: query.has('cursor') ? null : '2026-08-11',
                scanLimitReached: !query.has('cursor'), unavailableCount: partialDirectory && !query.has('cursor') ? 1 : 0 },
              actorInventory: { scope: 'verified-directory', complete: query.has('cursor') },
            }),
          });
          return;
        }
        if (holdAlpha && query.get('actorId') === ACTORS[0].id) {
          await gate.promise;
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
            editions: [EDITIONS[0]], actors: [ACTORS[0]], page: { hasMore: false, nextCursor: null },
          }) });
          return;
        }
        if (query.get('actorId') === olderActor.id) {
          const next = query.has('cursor');
          if (filteredResponseMode === 'transport') { await route.abort('failed'); return; }
          if (failFilteredPage) {
            failFilteredPage = false;
            await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The public Archive inventory could not be loaded.' }) });
            return;
          }
          await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              editions: filteredResponseMode === 'empty' ? []
                : filteredResponseMode === 'wrong_actor' ? [EDITIONS[0]]
                  : emptyFilteredPage && !next ? [] : [olderEditions[next ? 1 : 0]], actors: [olderActor],
              page: { hasMore: filteredResponseMode === 'empty' ? false : !next,
                nextCursor: filteredResponseMode === 'empty' || next ? null : olderEditions[0].date,
                ...(emptyFilteredPage && !next ? { partial: true, scanLimitReached: true } : {}) },
            }),
          });
          return;
        }
        await route.fallback();
      });
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=archive`, { waitUntil: 'domcontentloaded' });
      await page.getByText('18 public Archive images match this lens').waitFor();
      await seedSavedCollection(page);
      await page.getByRole('button', { name: 'Retry actor directory' }).waitFor();
      failDirectory = false;
      await page.getByRole('button', { name: 'Retry actor directory' }).click();
      const selector = page.getByRole('combobox', { name: 'Browse published actor' });
      await selector.locator('option[value="older-actor"]').waitFor({ state: 'attached' });
      await page.getByText('The actor directory is partial; some public actors could not be verified.').waitFor();
      assert.equal(await selector.locator('option[value="collection-only-actor"]').count(), 0);
      partialDirectory = false;
      await page.getByRole('button', { name: 'Retry actor directory' }).click();
      await page.getByText('3 verified published actors', { exact: true }).waitFor();
      const events = () => page.evaluate(() => (window as unknown as {
        archiveDiscoveryEvents: { name: string; data: Record<string, string | number | boolean> }[];
      }).archiveDiscoveryEvents);
      assert.deepEqual((await events()).filter(event => event.name.startsWith('archive_actor_')), [
        { name: 'archive_actor_directory_failed', data: { result: 'failed', actor_count: 0, failure: 'http' } },
        { name: 'archive_actor_directory_ready', data: { result: 'partial', actor_count: 3 } },
        { name: 'archive_actor_directory_ready', data: { result: 'verified', actor_count: 3 } },
      ], 'automatic directory pagination emits only one diagnostic per attempt, never selections or page engagement');
      assert.equal(requests.filter(query => !query.has('directory') && !query.has('actorId') && query.has('cursor')).length, 0,
        'directory discovery must not download unrelated edition pages');
      assert.equal(await page.getByRole('button', { name: /^Older Published Actor \d/ }).count(), 0,
        'older actor is not yet in the image pool');
      holdAlpha = true;
      await selector.selectOption(ACTORS[0].id);
      await waitForCondition(() => requests.some(query => query.get('actorId') === ACTORS[0].id), 'alpha request should be held');
      await selector.selectOption(olderActor.id);
      await page.getByText('9 public Archive images match this lens').waitFor();
      gate.release();
      await page.getByRole('button', { name: 'Load more editions' }).click();
      await page.getByText('18 public Archive images match this lens').waitFor();
      assert.equal(await page.getByRole('button', { name: /^Public Archive Alpha \d/ }).count(), 0, 'stale responses must not replace the selected actor');
      assert.equal(await page.getByRole('button', { name: /^Collection-Only Actor/ }).count(), 0);
      const filteredQueries = requests.filter(query => query.get('actorId') === olderActor.id);
      assert.equal(filteredQueries.length, 2);
      assert.equal(filteredQueries[0].has('cursor'), false, 'actor selection resets pagination');
      assert.equal(filteredQueries[1].get('cursor'), olderEditions[0].date);
      assert.equal((await events()).filter(event => event.name === 'archive_actor_page_verified'
        && event.data.actor_id === ACTORS[0].id).length, 0, 'cancelled responses must not report success');
      await page.getByRole('button', { name: /^Propose Compiled 3×3$/ }).click();
      assert.equal((await events()).filter(event => event.name === 'archive_grid_completed').length, 0,
        'a proposal is not a saved or exported grid');
      await page.getByRole('button', { name: 'Save grid' }).click();
      await page.getByText('Grid saved to your collection.', { exact: true }).waitFor();
      assert.deepEqual((await events()).filter(event => event.name === 'archive_grid_completed'), [
        { name: 'archive_grid_completed', data: { actor_id: olderActor.id, discovery_source: 'published_actor_directory', completion: 'saved' } },
      ]);
      await selector.selectOption('');
      await page.getByRole('button', { name: /^Public Archive Alpha 9$/ }).waitFor();
      assert.equal(requests.at(-1)?.has('actorId'), false);
      failFilteredPage = true;
      await selector.selectOption(olderActor.id);
      await page.getByRole('button', { name: 'Retry loading editions' }).waitFor();
      assert.equal(await selector.inputValue(), olderActor.id, 'actor controls remain usable after a filtered request fails');
      emptyFilteredPage = true;
      await page.getByRole('button', { name: 'Retry loading editions' }).click();
      await page.getByText('No verified editions were found for this actor on this page.').waitFor();
      await page.getByText('The safe Archive scan limit was reached; additional editions may be available on later pages.').waitFor();
      await page.getByRole('button', { name: 'Load more editions' }).click();
      await page.getByText('9 public Archive images match this lens').waitFor();
      const filteredEvents = (await events()).filter(event => event.name === 'archive_actor_page_failed'
        || event.name === 'archive_actor_page_verified');
      assert.ok(filteredEvents.some(event => event.data.result === 'failed' && event.data.failure === 'http'));
      assert.ok(filteredEvents.some(event => event.data.result === 'partial' && event.data.edition_count === 0));
      assert.ok(filteredEvents.some(event => event.data.phase === 'more' && event.data.result === 'verified'));
      emptyFilteredPage = false;
      for (const mode of ['empty', 'transport', 'wrong_actor'] as const) {
        await selector.selectOption('');
        await page.getByRole('button', { name: /^Public Archive Alpha 9$/ }).waitFor();
        filteredResponseMode = mode;
        await selector.selectOption(olderActor.id);
        if (mode === 'empty') {
          await page.getByText('No verified editions were found for this actor on this page.').waitFor();
        } else {
          await page.getByRole('button', { name: 'Retry loading editions' }).waitFor();
        }
        const last = (await events()).filter(event => event.name === 'archive_actor_page_failed'
          || event.name === 'archive_actor_page_verified').at(-1)!;
        assert.equal(last.data.result, mode === 'empty' ? 'verified_empty' : 'failed');
        if (mode !== 'empty') assert.equal(last.data.failure, mode === 'transport' ? 'transport' : 'invalid_response');
      }
      assert.equal((await events()).filter(event => event.name === 'archive_grid_completed').length, 1,
        'empty, failed, and invalid actor responses must not produce completions');
      assert.equal(await page.getByRole('button', { name: /^Collection-Only Actor/ }).count(), 0);
      await page.getByLabel('Language').selectOption('zh-CN');
      await page.getByRole('combobox', { name: '按已公开演员浏览' }).waitFor();
    } finally {
      gate.release();
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`public Archive inventory paginates through actor lenses and preserves manual and smart grids for free exports in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await installPublicArchiveRoutes(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=archive`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('region', { name: 'Public Archive inventory' }).waitFor();
      await page.getByText('18 public Archive images match this lens').waitFor();
      assert.equal(await page.getByText('Free studio').count(), 1, 'the archive builder should remain available without Collector membership');

      const alphaLens = page.getByRole('button', { name: /^Public Archive Alpha \d+$/ });
      await alphaLens.click();
      await page.getByRole('button', { name: /^Propose Compiled 3×3$/ }).click();
      const compiledGrid = page.getByRole('group', { name: 'Proposed Compiled 9-frame set' });
      await compiledGrid.waitFor();
      assert.equal(await compiledGrid.getByRole('button').count(), 9);
      await page.getByLabel('Language').selectOption('zh-CN');
      await page.getByRole('region', { name: '公开典藏素材' }).waitFor();
      const chineseGrid = page.getByRole('group', { name: '9 张风格合辑提案' });
      await chineseGrid.waitFor();
      assert.equal(await chineseGrid.getByRole('button').count(), 9, 'language switching preserves the public Archive proposal');
      assert.equal(await page.getByText('免费工作室').count(), 1, 'Chinese presentation does not add a paid Archive gate');
      await page.getByLabel('语言').selectOption('en');
      await compiledGrid.waitFor();

      await page.getByRole('button', { name: 'Load more editions' }).click();
      await page.getByText('18 public Archive images match this lens').waitFor();
      assert.equal(await compiledGrid.getByRole('button').count(), 9, 'loading another page should retain the current smart proposal');
      assert.equal(await page.getByRole('button', { name: /^Public Archive Alpha \d+$/ }).getAttribute('aria-pressed'), 'true');

      await page.getByRole('tab', { name: 'Build Your Own' }).click();
      await page.getByRole('button', { name: /^Public Archive Beta \d+$/ }).click();
      const betaCandidates = page.getByRole('region', { name: 'Choose nine saved images' });
      const firstBetaImageName = /^Select Public Archive Beta/;
      const firstSelection = betaCandidates.getByRole('button', { name: firstBetaImageName }).first();
      const firstSelectionTitle = await firstSelection.getAttribute('aria-label');
      await firstSelection.click();
      await betaCandidates.getByRole('button', { name: /^Select Public Archive Beta/ }).nth(0).click();
      await betaCandidates.getByRole('button', { name: /^Select Public Archive Beta/ }).nth(0).click();

      const customGrid = page.getByRole('group', { name: 'Custom 3×3 grid' });
      await customGrid.waitFor();
      assert.equal(await customGrid.getByRole('button').count(), 3);
      assert.ok(firstSelectionTitle, 'selected archive frame should have a stable accessible identity');
      await page.getByRole('button', { name: 'Load more editions' }).click();
      await page.getByText('27 public Archive images for this star').waitFor();
      assert.equal(await customGrid.getByRole('button').count(), 3, 'load-more must preserve the manual composition');
      const retainedFirstSelection = `Remove position 1 ${firstSelectionTitle?.replace(/^Select /, '') || ''}`;
      assert.equal(
        await betaCandidates.getByRole('button', { name: retainedFirstSelection }).getAttribute('aria-pressed'),
        'true',
        'the specific manual image selection should remain selected when the inventory grows',
      );

      const remainingBetaImages = betaCandidates.getByRole('button', { name: /^Select Public Archive Beta/ });
      for (let index = 0; index < 6; index += 1) {
        await remainingBetaImages.first().click();
      }
      await page.getByRole('group', { name: 'Custom 3×3 grid' }).getByRole('button').nth(8).waitFor();
      assert.equal(await page.getByRole('group', { name: 'Custom 3×3 grid' }).getByRole('button').count(), 9);
      assert.equal(
        await betaCandidates.getByRole('button', { name: /^Remove position/ }).count(),
        9,
      );

      const editionLink = betaCandidates.getByRole('link', { name: 'Edition record ↗' }).first();
      assert.equal(await editionLink.getAttribute('href'), `/vibe-atlas/editions/${EDITION_DATES[1]}/archive-beta`);
      await page.getByRole('button', { name: 'Save grid' }).click();
      await page.getByRole('status').getByText('Grid saved to your collection.').waitFor();

      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: /Export square PNG/ }).click();
      const download = await downloadPromise;
      assert.match(download.suggestedFilename(), /\.png$/i, 'anonymous visitors should be able to export a standard PNG');
      await page.getByRole('region', { name: 'Saved grids' }).waitFor();
      assert.equal(
        await page.getByRole('region', { name: 'Saved grids' }).locator('article').count(),
        1,
        'the finished Archive grid should be saved',
      );
      const provenance = await getSavedGrid(page);
      assert.equal(provenance.length, 9);
      assert.ok(provenance.every(image => image.sourceUrl.startsWith('https://sources.public-archive.test/')));
      assert.ok(provenance.every(image => image.archiveDate && image.editionPath === `/vibe-atlas/editions/${image.archiveDate}/archive-beta`));
      assert.ok(provenance.every(image => image.sourceUrl !== image.editionPath), 'edition links must not replace original source attribution');
      assert.equal(await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('vibe-atlas-collection', 3);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<number>((resolve, reject) => {
            const transaction = db.transaction('cards', 'readonly');
            const request = transaction.objectStore('cards').count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        } finally {
          db.close();
        }
      }), 0, 'building, exporting, and saving a finished grid must not copy its images into Saved results');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`public Archive and edition builders retain loaded inventory when Collector identity resolves in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const accountId = 'collector-account-after-public-inventory';
    const user = { accountId, email: 'collector@example.test' };

    try {
      const sources = [
        {
          page,
          url: `${origin}/vibe-atlas?view=builder&source=archive`,
          expectedCount: '18 public Archive images match this lens',
        },
        {
          page: await browser.newPage(),
          url: `${origin}/vibe-atlas?view=builder&source=edition&date=${FIRST_DATE}`,
          expectedCount: '9 public Archive images match this lens',
        },
      ];
      for (const source of sources) {
        const gate = createPromiseGate();
        let deferSession = false;
        const requests = await installPublicArchiveRoutes(source.page, {
          sessionGate: gate.promise,
          shouldDeferSession: () => deferSession,
          authenticatedUser: user,
          collectorMembership: true,
        });

        try {
          await gotoTestPage(source.page, source.url, { waitUntil: 'domcontentloaded' });
          await source.page.getByText(source.expectedCount).waitFor();
          await seedSavedCollection(source.page);
          assert.equal(await source.page.getByRole('button', { name: /^Collection-Only Actor/ }).count(), 0);
          assert.equal(await source.page.getByText('Collection-Only Actor', { exact: true }).count(), 0);

          const alphaLens = source.page.getByRole('button', { name: /^Public Archive Alpha 9$/ });
          await alphaLens.waitFor();
          await alphaLens.click();
          assert.equal(await alphaLens.getAttribute('aria-pressed'), 'true');
          await source.page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
          const proposal = source.page.getByRole('group', { name: 'Proposed Compiled 9-frame set' });
          await proposal.waitFor();
          assert.equal(await proposal.getByRole('button').count(), 9);

          await waitForCondition(
            () => requests.completedSessionRequests.length >= 2,
            'the anonymous session lookups should settle before the delayed authenticated refresh',
          );
          deferSession = true;
          await source.page.evaluate(async () => {
            const channel = new BroadcastChannel('fandom-collection');
            channel.postMessage({ type: 'session-changed' });
            await new Promise(resolve => setTimeout(resolve, 10));
            channel.close();
          });
          await waitForCondition(
            () => requests.deferredSessionRequests.length >= 2,
            'all session consumers should join the shared authenticated-session gate',
          );
          const heldRequestIds = [...requests.deferredSessionRequests];
          assert.equal(
            heldRequestIds.filter(id => requests.completedSessionRequests.includes(id)).length,
            0,
            'the authenticated session must remain held until every consumer has requested it',
          );
          gate.release();
          await waitForCondition(
            () => heldRequestIds.every(id => requests.completedSessionRequests.includes(id)),
            'every held session request should receive the same authenticated Collector response',
          );
          await waitForCondition(
            () => requests.completedSessionRequests.length === requests.sessionRequests.length,
            'all session route calls should finish after the shared gate is released',
          );
          await waitForCondition(
            async () => await readActiveAccountId(source.page) === accountId,
            'the resolved Collector account should be applied to the collection database',
          );
          await source.page.getByText('Fandom Collector', { exact: true }).waitFor();
          await waitForCondition(
            async () => await alphaLens.count() === 1 && await alphaLens.getAttribute('aria-pressed') === 'false',
            'the accountId-dependent Builder initialization should run without dropping the public actor lens controls',
          );
          assert.equal(source.page.url(), source.url);
          assert.equal(await source.page.getByRole('button', { name: /^Collection-Only Actor/ }).count(), 0);

          await alphaLens.click();
          assert.equal(await alphaLens.getAttribute('aria-pressed'), 'true', 'public actor filtering should still work after sign-in');
          await source.page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
          await proposal.waitFor();
          assert.equal(await proposal.getByRole('button').count(), 9, 'the loaded public pool should support a fresh proposal after sign-in');

          await source.page.getByRole('tab', { name: 'Build Your Own' }).click();
          const picker = source.page.getByRole('region', { name: 'Choose nine saved images' });
          await picker.getByRole('button', { name: /^Select Public Archive Alpha/ }).first().waitFor();
          assert.equal(await picker.getByRole('button', { name: /^Select Collection-Only Actor/ }).count(), 0);
          for (let index = 0; index < 9; index += 1) {
            await picker.getByRole('button', { name: /^Select Public Archive Alpha/ }).first().click();
          }
          const manualGrid = source.page.getByRole('group', { name: 'Custom 3×3 grid' });
          await manualGrid.waitFor();
          assert.equal(await manualGrid.getByRole('button').count(), 9, 'manual image selection should retain its public source pool');

          await source.page.getByRole('button', { name: 'Handoff Publishing Grid' }).click();
          // Collector downloads use the separate Master Export authorization
          // service. Here we exercise the account/source ordering; actual free
          // standard downloads are covered by the paginated inventory test.
          assert.equal(await source.page.getByRole('button', { name: 'Download PNG' }).isEnabled(), true);
        } finally {
          gate.release();
        }
      }
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`public Archive edition links support direct loads, reloads, and browser-history return paths in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const builderUrl = `${origin}/vibe-atlas?view=builder&source=edition&date=${FIRST_DATE}`;
    const archiveUrl = `${origin}/vibe-atlas/archive`;
    const editionUrl = `${origin}/vibe-atlas?date=${FIRST_DATE}`;

    try {
      const endpointRequests = await installPublicArchiveRoutes(page, { legacyEditionGateDenied: true });
      await gotoTestPage(page, builderUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      await page.getByText('9 public Archive images match this lens').waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      assert.equal(page.url(), builderUrl, 'a cold historical builder URL should survive reload');

      const backToEdition = page.getByRole('link', { name: 'Back to this edition' });
      assert.equal(await backToEdition.getAttribute('href'), `/vibe-atlas?date=${FIRST_DATE}`);
      const datedInventoryRequestCount = endpointRequests.publicInventoryDates
        .filter(date => date === FIRST_DATE).length;
      await backToEdition.click();
      await page.getByText(/Archived card drop/).waitFor();
      const editionSaveButton = page.getByRole('button', { name: /^Save item$/ }).first();
      await editionSaveButton.waitFor();
      assert.equal(await editionSaveButton.isVisible(), true, 'public dated editions must keep their individual save action visible');
      assert.ok(
        endpointRequests.publicInventoryDates.filter(date => date === FIRST_DATE).length > datedInventoryRequestCount,
        'the dated edition should load through public inventory',
      );
      assert.deepEqual(endpointRequests.legacyGateDates, [], 'a public dated edition must not fall back to the gated legacy endpoint');
      assert.equal(page.url(), editionUrl);
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      assert.equal(page.url(), builderUrl, 'browser Back should restore the exact source/date builder');

      await page.getByRole('link', { name: 'Back to the public Archive' }).click();
      await page.getByRole('heading', { name: 'The Star of the Day Archive' }).waitFor();
      assert.equal(page.url(), archiveUrl);
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      assert.equal(page.url(), builderUrl);
      await page.goForward({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'The Star of the Day Archive' }).waitFor();

      const archiveEdition = page.locator('.archive-card').filter({ hasText: ACTORS[0].name });
      const rebuildLink = archiveEdition.getByRole('link', { name: 'Rebuild this edition' });
      assert.equal(await rebuildLink.getAttribute('href'), `/vibe-atlas?view=builder&source=edition&date=${FIRST_DATE}`);
      await rebuildLink.click();
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      assert.equal(page.url(), builderUrl, 'the published Archive entry should open its one verified edition inventory');
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'The Star of the Day Archive' }).waitFor();
      await page.goForward({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(`Public edition · ${FIRST_DATE}`).waitFor();
      assert.equal(page.url(), builderUrl);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`public Archive errors and empty inventories never fall back to private Collection images in ${engine.name}`, { timeout: 150_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await installPublicArchiveRoutes(page, { inventoryError: true });
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=archive`, { waitUntil: 'domcontentloaded' });
      await seedSavedCollection(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('alert').getByText('Public Archive inventory unavailable.').waitFor();
      assert.equal(await page.getByRole('button', { name: /^Collection-Only Actor/ }).count(), 0);
      assert.equal(await page.getByText('No public Archive inventory is available yet.').count(), 0);

      await page.unroute('**/.netlify/functions/public-archive-inventory*');
      await installPublicArchiveRoutes(page, { inventoryEmpty: true });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('No public Archive inventory is available yet.').waitFor();
      assert.equal(await page.getByRole('button', { name: /^Collection-Only Actor/ }).count(), 0);
      assert.equal(await page.getByRole('group', { name: /Proposed/ }).count(), 0);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}