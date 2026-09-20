import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const FIXTURE_MEDIA_ORIGIN = 'https://media.example.test';
const FIXTURE_COLORS = [
  '#d1495b', '#edae49', '#00798c',
  '#30638e', '#003d5b', '#7a5195',
  '#ef5675', '#ffa600', '#2f4b7c',
];
const FIXTURE_PUBLISHERS = [
  'The International Archive of Moonlit Dramatic Arts and Performance',
  'The Independent Society for Historical Costume and Cinema Preservation',
  'The Global Journal of Contemporary Screen Culture and Visual Storytelling',
  'The Museum of East Asian Television History and Production Design',
  'The Worldwide Federation of Entertainment Photography Collections',
];

async function startApp() {
  return startViteTestServer();
}

function solidSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${color}"/></svg>`;
}

test('square PNG exports preserve layout, attribution, MEDIA provenance, and Moonlit Ink', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);
  const requestedMediaUrls: string[] = [];

  try {
    await page.addInitScript({ content: 'globalThis.__name = target => target;' });
    await page.route('**/.netlify/functions/image-proxy?*', async route => {
      const proxiedUrl = new URL(route.request().url()).searchParams.get('url');
      assert.ok(proxiedUrl, 'the image proxy request must name its source');
      requestedMediaUrls.push(proxiedUrl);
      const index = Number(new URL(proxiedUrl).pathname.match(/fixture-(\d+)\.svg$/)?.[1]);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 9, `unexpected fixture URL: ${proxiedUrl}`);
      await route.fulfill({
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: solidSvg(FIXTURE_COLORS[index]),
      });
    });
    await page.goto(origin);

    const result = await page.evaluate(async ({ mediaOrigin, fixtureColors, fixturePublishers }) => {
      const modulePath = '/src/utils/exportCanvas.ts';
      const exports = await import(/* @vite-ignore */ modulePath);
      const deliveryUrls = fixtureColors.map((_, index) => `${mediaOrigin}/fixture-${index}.svg`);
      const data = {
        actorId: 'fixture-actor',
        actorName: 'Fixture Actor',
        actorShortNameEn: 'Fixture Actor',
        actorAccentColor: '#9f9bea',
        vibeEmoji: '🌙',
        vibeLabel: 'Moonlit Ink',
        vibeLabelEn: 'Moonlit Ink',
        vibeSubtitle: 'A browser-rendered export fixture',
        vibeSubtitleEn: 'A browser-rendered export fixture',
        rankedBatches: [{
          query: 'fixture query',
          results: deliveryUrls.map((deliveryUrl, index) => ({
            title: `Fixture ${index + 1}`,
            thumbnail: deliveryUrl,
            link: `https://publisher.example.test/source-${index}`,
            source: index < 5 ? fixturePublishers[index] : fixturePublishers[0],
          })),
          count: 9,
          distinctSources: 5,
          provider: 'fixture',
        }],
        date: '2026-09-20',
        presentation: { paletteId: 'moonlit-ink', atmosphereId: 'moonlit-ink' },
      };
      const assets = deliveryUrls.map((deliveryUrl, index) => ({
        assetId: `11111111-2222-4${String(index).padStart(3, '0')}-8444-555555555555`,
        checksum: String(index + 1).repeat(64).slice(0, 64),
        deliveryUrl,
        permitted: true,
      }));
      const manifest = exports.buildMasterExportManifest(
        'fixture-grid',
        'fixture-board-hash',
        assets,
        '2026-09-20T12:00:00.000Z',
      );

      const render = async (variant: 'standard' | 'master') => {
        const textCalls: Array<{ text: string; x: number; y: number; color: string; width: number }> = [];
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          textCalls.push({
            text: String(text),
            x,
            y,
            color: String(this.fillStyle),
            width: this.measureText(String(text)).width,
          });
          return maxWidth === undefined
            ? originalFillText.call(this, text, x, y)
            : originalFillText.call(this, text, x, y, maxWidth);
        };
        try {
          const canvas = await exports.renderExportCanvas(data, variant);
          const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
            (blob: Blob | null) => blob ? resolve(blob) : reject(new Error('PNG encoding failed')),
            'image/png',
          ));
          const context = canvas.getContext('2d')!;
          const pixels = fixtureColors.map((_, index) => {
            const width = canvas.width;
            const pad = Math.round(width * 0.026);
            const header = Math.round(width * 0.045);
            const footer = Math.round(width * 0.052);
            const gap = Math.round(width * 0.009);
            const tile = (width - pad * 2 - gap * 2 - header - footer) / 3;
            const x = Math.round(pad + (index % 3) * (tile + gap) + tile / 2);
            const y = Math.round(pad + header + Math.floor(index / 3) * (tile + gap) + tile / 2);
            return Array.from(context.getImageData(x, y, 1, 1).data);
          });
          return {
            width: canvas.width,
            height: canvas.height,
            pngType: png.type,
            pngSize: png.size,
            background: Array.from(context.getImageData(1, 1, 1, 1).data),
            pixels,
            textCalls,
          };
        } finally {
          CanvasRenderingContext2D.prototype.fillText = originalFillText;
        }
      };

      return {
        standard: await render('standard'),
        master: await render('master'),
        manifest,
        deliveryUrls,
      };
    }, {
      mediaOrigin: FIXTURE_MEDIA_ORIGIN,
      fixtureColors: FIXTURE_COLORS,
      fixturePublishers: FIXTURE_PUBLISHERS,
    });

    for (const [variant, rendered, dimension] of [
      ['standard', result.standard, 1080],
      ['master', result.master, 2160],
    ] as const) {
      assert.equal(rendered.width, dimension, `${variant} width`);
      assert.equal(rendered.height, dimension, `${variant} height`);
      assert.equal(rendered.pngType, 'image/png');
      assert.ok(rendered.pngSize > 10_000, `${variant} should encode a substantive browser PNG`);
      assert.deepEqual(rendered.background, [23, 24, 43, 255], `${variant} must use the Moonlit Ink surface`);
      rendered.pixels.forEach((pixel, index) => {
        const expected = FIXTURE_COLORS[index].match(/[a-f\d]{2}/gi)!.map(value => Number.parseInt(value, 16));
        assert.deepEqual(pixel, [...expected, 255], `${variant} tile ${index + 1} should occupy its own grid cell`);
      });
      const heading = rendered.textCalls.find(call => call.text === 'Fixture Actor · Moonlit Ink');
      assert.ok(heading && heading.y < dimension * 0.1, `${variant} heading must stay above the tile grid`);
      assert.equal(heading.color, '#9f9bea', `${variant} heading must use the approved Moonlit Ink accent`);
      const attribution = rendered.textCalls.filter(call =>
        call.text.startsWith('Sources:') || call.text.includes('Vibe Atlas · sRGB'));
      assert.equal(attribution.length, 2, `${variant} must wrap five long source credits deterministically`);
      attribution.forEach((line, index) => {
        assert.ok(line.y > dimension * 0.9 && line.y < dimension, `${variant} attribution line ${index + 1} must remain below the tiles`);
        assert.ok(line.x - line.width / 2 >= dimension * 0.026, `${variant} attribution line ${index + 1} must stay inside the left canvas bound`);
        assert.ok(line.x + line.width / 2 <= dimension * 0.974, `${variant} attribution line ${index + 1} must stay inside the right canvas bound`);
        assert.equal(line.color, '#c9a96e', `${variant} attribution must use the approved Moonlit Ink gold`);
      });
      assert.ok(attribution[1].text.includes('…'), `${variant} must truncate overflowing credits with an ellipsis`);
      assert.ok(attribution[1].text.endsWith('Vibe Atlas · sRGB'), `${variant} must preserve the export provenance suffix`);
    }

    assert.equal(result.manifest.colorProfile, 'sRGB');
    assert.equal(result.manifest.rendererVersion, 'vibe-atlas-export-v2');
    assert.deepEqual(
      result.manifest.assets.map((asset: { deliveryUrl: string }) => asset.deliveryUrl),
      result.deliveryUrls,
    );
    assert.equal(
      result.manifest.assets.every((asset: { deliveryUrl: string }) =>
        asset.deliveryUrl.startsWith(`${FIXTURE_MEDIA_ORIGIN}/`)),
      true,
    );
    assert.deepEqual(
      [...new Set(requestedMediaUrls)],
      result.deliveryUrls,
      'both exports must load only the nine fixture MEDIA delivery URLs',
    );
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
test('Collection re-export preserves a saved Moonlit Ink palette, dimensions, and attribution', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const { browser, page } = await launchPageForServer(server);

  try {
    await page.addInitScript({ content: 'globalThis.__name = target => target;' });
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/.netlify/functions/image-proxy?*', async route => {
      const proxiedUrl = new URL(route.request().url()).searchParams.get('url');
      assert.ok(proxiedUrl, 'the image proxy request must name its source');
      const index = Number(new URL(proxiedUrl).pathname.match(/fixture-(\d+)\.svg$/)?.[1]);
      assert.ok(Number.isInteger(index) && index >= 0 && index < 9, `unexpected fixture URL: ${proxiedUrl}`);
      await route.fulfill({
        contentType: 'image/svg+xml',
        headers: { 'access-control-allow-origin': '*' },
        body: solidSvg(FIXTURE_COLORS[index]),
      });
    });
    await page.goto(origin);

    const rendered = await page.evaluate(async ({ mediaOrigin, fixtureColors }) => {
      const historyModulePath = '/src/utils/collectionHistoryModel.ts';
      const collectionModulePath = '/src/utils/collectionDB.ts';
      const exportModulePath = '/src/utils/exportCanvas.ts';
      const history = await import(/* @vite-ignore */ historyModulePath);
      const collection = await import(/* @vite-ignore */ collectionModulePath);
      const exports = await import(/* @vite-ignore */ exportModulePath);
      const deliveryUrls = fixtureColors.map((_: string, index: number) => `${mediaOrigin}/fixture-${index}.svg`);
      const savedAt = '2026-09-20T12:00:00.000Z';
      const data = {
        actorId: 'fixture-actor',
        actorName: 'Fixture Actor',
        actorShortNameEn: 'Fixture Actor',
        actorAccentColor: '#9f9bea',
        vibeEmoji: '🌙',
        vibeLabel: 'Moonlit Ink',
        vibeLabelEn: 'Moonlit Ink',
        vibeSubtitle: 'A saved Collection export fixture',
        vibeSubtitleEn: 'A saved Collection export fixture',
        rankedBatches: [{
          query: 'fixture query',
          results: deliveryUrls.map((thumbnail: string, index: number) => ({
            title: `Fixture ${index + 1}`,
            thumbnail,
            link: `https://publisher.example.test/source-${index}`,
            source: `Publisher ${index + 1}`,
          })),
          count: 9,
          distinctSources: 9,
          provider: 'fixture',
        }],
        date: '2026-09-20',
        presentation: { paletteId: 'moonlit-ink', atmosphereId: 'moonlit-ink' },
      };

      const savedGrid = history.collectionGridFromStar(data, '/vibe-atlas?view=collection', savedAt);
      await collection.dbSaveGrid(savedGrid);
      const restoredGrid = (await collection.dbGetAllGrids())
        .find((grid: { id: string }) => grid.id === savedGrid.id);
      if (!restoredGrid) throw new Error('Saved Collection grid was not restored.');

      const textCalls: Array<{ text: string; color: string }> = [];
      const originalFillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
        textCalls.push({ text: String(text), color: String(this.fillStyle) });
        return maxWidth === undefined
          ? originalFillText.call(this, text, x, y)
          : originalFillText.call(this, text, x, y, maxWidth);
      };
      try {
        const canvas = await exports.renderExportCanvas(
          history.starDataFromCollectionGrid(restoredGrid),
          'standard',
        );
        const context = canvas.getContext('2d')!;
        return {
          width: canvas.width,
          height: canvas.height,
          background: Array.from(context.getImageData(1, 1, 1, 1).data),
          textCalls,
        };
      } finally {
        CanvasRenderingContext2D.prototype.fillText = originalFillText;
      }
    }, { mediaOrigin: FIXTURE_MEDIA_ORIGIN, fixtureColors: FIXTURE_COLORS });

    assert.equal(rendered.width, 1080);
    assert.equal(rendered.height, 1080);
    assert.deepEqual(rendered.background, [23, 24, 43, 255]);
    assert.equal(
      rendered.textCalls.find(call => call.text === 'Fixture Actor · Moonlit Ink')?.color,
      '#9f9bea',
      'the restored heading must retain the Moonlit Ink indigo',
    );
    const attribution = rendered.textCalls.find(call => call.text.startsWith('Sources: Fixture Actor · Publisher 1'));
    assert.ok(attribution, 'the restored export must retain saved source attribution');
    assert.equal(attribution.color, '#c9a96e', 'the restored attribution must retain the Moonlit Ink gold');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
