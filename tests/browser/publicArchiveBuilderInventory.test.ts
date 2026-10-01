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

type ArchiveActor = (typeof ACTORS)[number];

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