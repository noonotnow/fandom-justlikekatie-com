import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const LONG_PUBLISHERS = [
  'The International Archive of Moonlit Dramatic Arts and Performance',
  'The Independent Society for Historical Costume and Cinema Preservation',
  'The Global Journal of Contemporary Screen Culture and Visual Storytelling',
  'The Museum of East Asian Television History and Production Design',
  'The Worldwide Federation of Entertainment Photography Collections',
];
const LONG_ACTOR_NAME = 'The Exceptionally Celebrated International Star of Moonlit Historical Drama';
const LONG_VIBE_NAME = 'An Impossibly Elaborate Midnight Court Intrigue Beneath Ten Thousand Lanterns';

test('portrait and teaser exports bound long source credits and edition details below their grids', { timeout: 60_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);

  try {
    await page.addInitScript({ content: 'globalThis.__name = target => target;' });
    await page.route('**/.netlify/functions/image-proxy?*', route => route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#9f9bea"/></svg>',
    }));
    await page.goto(origin);

    const rendered = await page.evaluate(async ({ publishers, actorName, vibeName }) => {
      const exportModulePath = '/src/utils/exportCanvas.ts';
      const exports = await import(/* @vite-ignore */ exportModulePath);
      const data = {
        actorId: 'fixture-actor',
        actorName,
        actorShortNameEn: actorName,
        actorAccentColor: '#9f9bea',
        vibeEmoji: '🌙',
        vibeLabel: vibeName,
        vibeLabelEn: vibeName,
        vibeSubtitle: 'A browser-rendered export fixture',
        vibeSubtitleEn: 'A browser-rendered export fixture',
        rankedBatches: [{
          query: 'fixture query',
          results: Array.from({ length: 9 }, (_, index) => ({
            title: `Fixture ${index + 1}`,
            thumbnail: `https://media.example.test/fixture-${index}.svg`,
            link: `https://publisher.example.test/source-${index}`,
            source: index < 5 ? publishers[index] : publishers[0],
          })),
          count: 9,
          distinctSources: 5,
          provider: 'fixture',
        }],
        date: '2026-09-20',
      };

      const render = async (variant: 'full' | 'teaser') => {
        const calls: Array<{ text: string; x: number; y: number; width: number; color: string; font: string }> = [];
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          calls.push({
            text: String(text),
            x,
            y,
            width: this.measureText(String(text)).width,
            color: String(this.fillStyle),
            font: this.font,
          });
          return maxWidth === undefined
            ? originalFillText.call(this, text, x, y)
            : originalFillText.call(this, text, x, y, maxWidth);
        };
        try {
          const canvas = await exports.renderExportCanvas(data, variant);
          return { width: canvas.width, height: canvas.height, calls };
        } finally {
          CanvasRenderingContext2D.prototype.fillText = originalFillText;
        }
      };

      return { portrait: await render('full'), teaser: await render('teaser') };
    }, { publishers: LONG_PUBLISHERS, actorName: LONG_ACTOR_NAME, vibeName: LONG_VIBE_NAME });

    for (const [variant, canvas, expected] of [
      ['portrait', rendered.portrait, {
        gridBottom: 1160,
        footerTop: 1254,
        creditYs: [1190, 1212],
        creditFont: '18px Inter, "Noto Sans SC", sans-serif',
        brandY: 1254,
        brandFont: '600 20px Inter, "Noto Sans SC", sans-serif',
        editionY: 1282,
        editionFont: '17px Inter, "Noto Sans SC", sans-serif',
        microCopyY: 1310,
        microCopyFont: '15px Inter, "Noto Sans SC", sans-serif',
      }],
      ['teaser', rendered.teaser, {
        gridBottom: 910,
        footerTop: 996,
        creditYs: [938, 959],
        creditFont: '17px Inter, "Noto Sans SC", sans-serif',
        brandY: 996,
        brandFont: '600 18px Inter, "Noto Sans SC", sans-serif',
        editionY: 1020,
        editionFont: '15px Inter, "Noto Sans SC", sans-serif',
        microCopyY: 1046,
        microCopyFont: '14px Inter, "Noto Sans SC", sans-serif',
      }],
    ] as const) {
      const credits = canvas.calls.filter(call =>
        call.color === '#6b6b6b' && call.y > expected.gridBottom && call.y < expected.footerTop);
      assert.equal(credits.length, 2, `${variant} credits must wrap to exactly two lines`);
      assert.deepEqual(credits.map(call => call.y), expected.creditYs, `${variant} must preserve source-credit spacing`);
      assert.ok(credits.every(call => call.font === expected.creditFont), `${variant} must preserve source-credit typography`);
      assert.ok(credits[1].text.endsWith('…'), `${variant} overflowing credits must end with an ellipsis`);
      credits.forEach((line, index) => {
        assert.ok(line.y > expected.gridBottom, `${variant} credit line ${index + 1} must remain below the tile grid`);
        assert.ok(line.y < expected.footerTop, `${variant} credit line ${index + 1} must remain above the footer`);
        assert.ok(line.x - line.width / 2 >= 0, `${variant} credit line ${index + 1} must stay inside the left canvas edge`);
        assert.ok(line.x + line.width / 2 <= canvas.width, `${variant} credit line ${index + 1} must stay inside the right canvas edge`);
      });

      const editionDetails = canvas.calls.filter(call => call.text.startsWith('2026-09-20 · '));
      assert.equal(editionDetails.length, 1, `${variant} must draw one edition-details line`);
      const edition = editionDetails[0];
      assert.ok(edition.text.endsWith('…'), `${variant} overflowing edition details must end with an ellipsis`);
      assert.equal(edition.y, expected.editionY, `${variant} must preserve edition-detail spacing`);
      assert.equal(edition.font, expected.editionFont, `${variant} must preserve edition-detail typography`);
      assert.ok(edition.y > credits.at(-1)!.y, `${variant} edition details must remain below source credits`);
      assert.ok(edition.x - edition.width / 2 >= 0, `${variant} edition details must stay inside the left canvas edge`);
      assert.ok(edition.x + edition.width / 2 <= canvas.width, `${variant} edition details must stay inside the right canvas edge`);

      const brand = canvas.calls.find(call => call.text.startsWith('🔮 Vibe Guide ·'));
      assert.ok(brand, `${variant} must draw its footer brand line`);
      assert.equal(brand.y, expected.brandY, `${variant} must preserve brand-line spacing`);
      assert.equal(brand.font, expected.brandFont, `${variant} must preserve brand-line typography`);
      assert.ok(brand.x - brand.width / 2 >= 0, `${variant} brand line must stay inside the left canvas edge`);
      assert.ok(brand.x + brand.width / 2 <= canvas.width, `${variant} brand line must stay inside the right canvas edge`);

      const microCopy = canvas.calls.find(call =>
        call.y === expected.microCopyY && call.color.startsWith('rgba(107, 107, 107,'));
      assert.ok(microCopy, `${variant} must draw bounded micro-copy`);
      assert.equal(microCopy.font, expected.microCopyFont, `${variant} must preserve micro-copy typography`);
      assert.ok(edition.y < microCopy.y, `${variant} edition details must remain above final micro-copy`);
      assert.ok(microCopy.x - microCopy.width / 2 >= 0, `${variant} micro-copy must stay inside the left canvas edge`);
      assert.ok(microCopy.x + microCopy.width / 2 <= canvas.width, `${variant} micro-copy must stay inside the right canvas edge`);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});