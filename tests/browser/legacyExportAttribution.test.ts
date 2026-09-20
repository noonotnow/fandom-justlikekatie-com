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

test('portrait and teaser exports bound five long source credits below their grids', { timeout: 60_000 }, async () => {
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

    const rendered = await page.evaluate(async publishers => {
      const exports = await import(/* @vite-ignore */ '/src/utils/exportCanvas.ts');
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
        const calls: Array<{ text: string; x: number; y: number; width: number; color: string }> = [];
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          calls.push({
            text: String(text),
            x,
            y,
            width: this.measureText(String(text)).width,
            color: String(this.fillStyle),
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
    }, LONG_PUBLISHERS);

    for (const [variant, canvas, gridBottom, footerTop] of [
      ['portrait', rendered.portrait, 1160, 1254],
      ['teaser', rendered.teaser, 910, 996],
    ] as const) {
      const credits = canvas.calls.filter(call =>
        call.color === '#6b6b6b' && call.y > gridBottom && call.y < footerTop);
      assert.equal(credits.length, 2, `${variant} credits must wrap to exactly two lines`);
      assert.ok(credits[1].text.endsWith('…'), `${variant} overflowing credits must end with an ellipsis`);
      credits.forEach((line, index) => {
        assert.ok(line.y > gridBottom, `${variant} credit line ${index + 1} must remain below the tile grid`);
        assert.ok(line.y < footerTop, `${variant} credit line ${index + 1} must remain above the footer`);
        assert.ok(line.x - line.width / 2 >= 0, `${variant} credit line ${index + 1} must stay inside the left canvas edge`);
        assert.ok(line.x + line.width / 2 <= canvas.width, `${variant} credit line ${index + 1} must stay inside the right canvas edge`);
      });
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});