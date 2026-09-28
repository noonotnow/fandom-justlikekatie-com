import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { Route } from '@playwright/test';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  createNativeDownloadFixture,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const GRID_ID = 'vibe-atlas-2026-09-20-history-fixture';
const MEDIA_ORIGIN = 'https://media.example.test';
const SAVED_EXPORT_FILENAME = 'saved-export.png';
const SAVED_EXPORT_PAYLOAD = Buffer.from('persisted png');

function svg(index: number): string {
  const colors = ['d1495b', 'edae49', '00798c', '30638e', '003d5b', '7a5195', 'ef5675', 'ffa600', '2f4b7c'];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#${colors[index]}"/></svg>`;
}

async function seedGrid(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async ({ gridId, mediaOrigin }) => {
    const collectionModulePath = '/src/utils/collectionDB.ts';
    const collection = await import(/* @vite-ignore */ collectionModulePath);
    const images = Array.from({ length: 9 }, (_, index) => {
      const deliveryUrl = `${mediaOrigin}/fixture-${index}.svg`;
      return {
        resultId: `fixture-${index}`,
        imageUrl: deliveryUrl,
        thumbnailUrl: deliveryUrl,
        title: `Fixture ${index + 1}`,
        publisher: `Publisher ${index + 1}`,
        sourceUrl: `https://publisher.example.test/source-${index}`,
        batchKey: 'fixture query',
        media: {
          schemaVersion: 1,
          assetId: `11111111-2222-4${String(index).padStart(3, '0')}-8444-555555555555`,
          deliveryUrl,
          thumbnailUrl: deliveryUrl,
          mimeType: 'image/png',
          sizeBytes: 1024,
          checksum: String(index + 1).repeat(64).slice(0, 64),
          dimensions: { width: 300, height: 300 },
          association: { type: 'collection', id: 'history-fixture', itemId: gridId },
        },
      };
    });
    await collection.dbSaveGrid({
      id: gridId,
      actorId: 'history-fixture',
      actor: 'History Fixture',
      actorEn: 'History Fixture',
      vibe: 'Moonlit Ink',
      vibeEn: 'Moonlit Ink',
      vibeEmoji: '🌙',
      searchSpell: 'fixture query',
      capturedDate: '2026-09-20',
      savedAt: '2026-09-20T12:00:00.000Z',
      images,
      presentation: { paletteId: 'moonlit-ink', atmosphereId: 'moonlit-ink' },
    });
  }, { gridId: GRID_ID, mediaOrigin: MEDIA_ORIGIN });
}

for (const engine of BROWSER_ENGINES) {
  test(`persisted exports refresh open history without optimistic or stale entries in ${engine.name}`, { timeout: 60_000 }, async () => {
  const reDownloadFixture = createNativeDownloadFixture({
    name: 'saved-export-download-fixture',
    path: '/.netlify/functions/grid-exports',
    headers: {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename="${SAVED_EXPORT_FILENAME}"`,
    },
    body: SAVED_EXPORT_PAYLOAD,
    identifierNames: ['gridId', 'exportId'],
    matches: url => url.searchParams.has('exportId'),
  });
  const { server, origin } = await startViteTestServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
    plugins: [reDownloadFixture.plugin],
  });
  const { browser, page } = await launchPageForServer(server, engine.type);
  const entries: Array<Record<string, unknown>> = [];
  let delayedHistoryRoute: Route | undefined;
  let failNextUpload = false;
  let uploadCount = 0;

  try {
    await page.addInitScript({ content: 'globalThis.__name = target => target;' });
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        user: { accountId: 'history-fixture', email: 'history@example.test', isAdmin: false },
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
    await page.route('**/.netlify/functions/log-engagement', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    }));
    await page.route('**/.netlify/functions/image-proxy?*', async route => {
      const source = new URL(route.request().url()).searchParams.get('url');
      const index = Number(source?.match(/fixture-(\d+)\.svg$/)?.[1]);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 9);
      await route.fulfill({
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: svg(index),
      });
    });
    await page.context().route(
      url => new URL(url).pathname === '/.netlify/functions/grid-exports',
      async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'POST') {
          uploadCount += 1;
          if (failNextUpload) {
            failNextUpload = false;
            await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"failed"}' });
            return;
          }
          entries.push({
            exportId: url.searchParams.get('exportId'),
            variant: url.searchParams.get('variant'),
            tier: url.searchParams.get('tier'),
            bytes: request.postDataBuffer()?.byteLength ?? 0,
            exportedAt: `2026-09-2${uploadCount}T12:00:00.000Z`,
          });
          await route.fulfill({ status: 201, contentType: 'application/json', body: '{"ok":true}' });
          return;
        }
        if (url.searchParams.has('exportId')) {
          await route.continue();
          return;
        }
        if (!delayedHistoryRoute) {
          delayedHistoryRoute = route;
          return;
        }
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ exports: entries }),
        });
      },
    );

    await gotoTestPage(page, origin);
    await seedGrid(page);
    await gotoTestPage(page, `${origin}/vibe-atlas?view=collection`);

    await page.getByText('Past exports').click();
    await page.getByText('Loading export history…').waitFor();

    await page.getByRole('button', { name: 'Export standard PNG' }).click();
    await page.getByText(/Standard/).waitFor();
    assert.equal(entries.length, 1, 'successful Standard persistence should trigger a history refresh');

    assert.ok(delayedHistoryRoute, 'opening history should start the deliberately delayed request');
    await delayedHistoryRoute.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ exports: [] }),
    });
    await page.waitForTimeout(50);
    assert.equal(await page.getByText(/Standard/).count(), 1, 'the slower pre-export response must not replace refreshed history');

    await page.getByRole('button', { name: 'Export Master PNG' }).click();
    const history = page.locator('details').filter({ hasText: 'Past exports' });
    await history.locator('li').filter({ hasText: 'Master' }).waitFor();
    assert.equal(entries.length, 2, 'successful Master persistence should trigger a history refresh');

    failNextUpload = true;
    await page.getByRole('button', { name: 'Export standard PNG' }).click();
    await page.waitForFunction(() => document.querySelector('button[disabled]') === null);
    await page.waitForTimeout(100);
    assert.equal(entries.length, 2);
    assert.equal(await page.locator('details li').count(), 2, 'failed persistence must not add an optimistic history entry');

    const standardId = String(entries[0].exportId);
    const reDownloadLink = page.getByRole('link', { name: 'Re-download' }).last();
    assert.equal(await reDownloadLink.getAttribute('download'), '');
    assert.equal(
      await reDownloadLink.getAttribute('href'),
      `/.netlify/functions/grid-exports?gridId=${encodeURIComponent(GRID_ID)}&exportId=${encodeURIComponent(standardId)}`,
      're-download must keep using the persisted grid-export endpoint and export id',
    );
    const downloadPromise = page.waitForEvent('download');
    const reDownloadRequestPromise = reDownloadFixture.waitForRequest();
    await reDownloadLink.click();
    const [reDownloadRequest, download] = await Promise.all([
      reDownloadRequestPromise,
      downloadPromise,
    ]);
    assert.equal(
      reDownloadRequest.identifiers.gridId,
      GRID_ID,
      're-download request must use the saved grid identifier',
    );
    assert.equal(
      reDownloadRequest.identifiers.exportId,
      standardId,
      're-download request must use the saved export identifier',
    );
    assert.equal(
      download.suggestedFilename(),
      SAVED_EXPORT_FILENAME,
      'saved export filename must come from the persisted response',
    );
    const downloadPath = await download.path();
    assert.ok(downloadPath, 'the browser should retain the saved export download');
    assert.deepEqual(
      await readFile(downloadPath),
      SAVED_EXPORT_PAYLOAD,
      'saved export bytes must match the persisted response',
    );
  } finally {
    await closeBrowserAndServer(browser, server);
  }
  });
}