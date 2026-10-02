import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const LONG_PUBLISHERS = [
  // CJK must occur before truncation; the English "Sources:" label no longer
  // supplies Chinese glyphs as the old bilingual footer did.
  '月下档案馆 · The International Cafe\u0301 Cafe\u0301 Cafe\u0301 Cafe\u0301 Cafe\u0301 Archive of Dramatic Arts',
  'أرشيف الفنون السينمائية الدولي للتراث البصري',
  'The Independent Moonlit Dramatic Arts Society 👩‍🎨 👩‍🎨 👩‍🎨 👩‍🎨 and Performance Archive',
  'The Museum of East Asian Television History 月下档案馆',
  'The Global Journal of Contemporary Screen Culture and Visual Storytelling',
];
const LONG_ACTOR_NAME = 'The Exceptionally Celebrated International Star of Moonlit Historical Drama';
const LONG_VIBE_NAME = 'An Impossibly Elaborate Midnight Court Intrigue Beneath Ten Thousand Lanterns';
const MIN_SOURCE_CREDIT_CONTRAST = 4.5;
// Keep these expectations independent of the renderer and the benefit's display surface.
// A newly advertised palette must be added here rather than passing on default colors.
const EXPECTED_SQUARE_PALETTE_COLORS: Record<string, { background: string; credit: string }> = {
  default: { background: '#0e0e12', credit: '#a3a3ad' },
  'moonlit-ink': { background: '#17182b', credit: '#c9a96e' },
};

function normalizeCanvasFont(font: string): string {
  // Canvas canonicalizes family quoting differently across Chromium, Firefox, and WebKit.
  return font.replaceAll('"', '').replace(/^400 /, '');
}

function parseCanvasColor(color: string): [number, number, number] {
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (hex) return [Number.parseInt(hex[1], 16), Number.parseInt(hex[2], 16), Number.parseInt(hex[3], 16)];
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  assert.ok(rgb, `unsupported canvas color ${color}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = parseCanvasColor(color).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function assertCreditContrast(
  variant: string,
  palette: string,
  credits: Array<{ color: string }>,
  footerBackground: string,
): void {
  for (const credit of credits) {
    const ratio = contrastRatio(credit.color, footerBackground);
    assert.ok(
      ratio >= MIN_SOURCE_CREDIT_CONTRAST,
      `${variant} ${palette} source-credit contrast ${ratio.toFixed(2)}:1 is below ${MIN_SOURCE_CREDIT_CONTRAST}:1 `
        + `for ${credit.color} on ${footerBackground}`,
    );
  }
}

function assertCreditGraphemes(variant: string, credits: Array<{ text: string }>): void {
  for (const credit of credits) {
    assert.doesNotMatch(
      credit.text,
      /Cafe(?!\u0301)\s*…$/u,
      `${variant} truncated credits must not drop a combining accent`,
    );
    assert.doesNotMatch(
      credit.text,
      /(?:👩|\u200d)\s*…$/u,
      `${variant} truncated credits must not split a joined emoji`,
    );
  }
}

for (const browserEngine of BROWSER_ENGINES) {
  test(`${browserEngine.name} bounds long source credits in every export size`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, browserEngine.type);

    try {
      await page.addInitScript({ content: 'globalThis.__name = target => target;' });
      await page.route('**/.netlify/functions/image-proxy?*', route => route.fulfill({
      contentType: 'image/svg+xml',
      headers: { 'access-control-allow-origin': '*' },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#9f9bea"/></svg>',
    }));
    await gotoTestPage(page, origin);

    const rendered = await page.evaluate(async ({ publishers, actorName, vibeName }) => {
      const exportModulePath = '/src/utils/exportCanvas.ts';
      const exports = await import(/* @vite-ignore */ exportModulePath);
      const benefitsModulePath = '/src/utils/collectorBenefits.ts';
      const { COLLECTOR_PALETTES } = await import(/* @vite-ignore */ benefitsModulePath);
      const probeContext = document.createElement('canvas').getContext('2d')!;
      probeContext.font = '18px "Inter", "Noto Sans SC", sans-serif';
      const combiningText = 'Sources: Archive Cafe\u0301 continuation';
      const emojiText = 'Sources: Artists 👩‍🎨 continuation';
      const graphemeTruncations = {
        combining: exports.truncateCanvasText(
          probeContext,
          combiningText,
          probeContext.measureText('Sources: Archive Cafe\u0301…').width,
        ),
        emoji: exports.truncateCanvasText(
          probeContext,
          emojiText,
          probeContext.measureText('Sources: Artists 👩‍🎨…').width,
        ),
      };
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

      const render = async (
        variant: 'full' | 'teaser' | 'standard' | 'master',
        presentation?: { paletteId?: string; atmosphereId?: string },
      ) => {
        type InkBounds = {
          left: number;
          right: number;
          top: number;
          bottom: number;
        };
        const calls: Array<{
          text: string;
          x: number;
          y: number;
          width: number;
          color: string;
          font: string;
          ink: InkBounds | null;
        }> = [];
        const originalFillText = CanvasRenderingContext2D.prototype.fillText;
        const rasterizedInkBounds = (
          context: CanvasRenderingContext2D,
          text: string,
          x: number,
          y: number,
          maxWidth?: number,
        ): InkBounds | null => {
          const probe = document.createElement('canvas');
          probe.width = Math.max(4096, Math.ceil(context.measureText(text).width) + 512);
          probe.height = 512;
          const probeContext = probe.getContext('2d', { willReadFrequently: true })!;
          probeContext.font = context.font;
          probeContext.textAlign = context.textAlign;
          probeContext.textBaseline = context.textBaseline;
          probeContext.direction = context.direction;
          probeContext.fillStyle = '#ffffff';
          const probeX = probe.width / 2;
          const probeY = probe.height / 2;
          if (maxWidth === undefined) {
            originalFillText.call(probeContext, text, probeX, probeY);
          } else {
            originalFillText.call(probeContext, text, probeX, probeY, maxWidth);
          }
          const pixels = probeContext.getImageData(0, 0, probe.width, probe.height);
          let left = probe.width;
          let right = -1;
          let top = probe.height;
          let bottom = -1;
          for (let pixelY = 0; pixelY < probe.height; pixelY += 1) {
            for (let pixelX = 0; pixelX < probe.width; pixelX += 1) {
              if (pixels.data[(pixelY * probe.width + pixelX) * 4 + 3] === 0) continue;
              left = Math.min(left, pixelX);
              right = Math.max(right, pixelX);
              top = Math.min(top, pixelY);
              bottom = Math.max(bottom, pixelY);
            }
          }
          return right < left
            ? null
            : {
                left: x + left - probeX,
                right: x + right + 1 - probeX,
                top: y + top - probeY,
                bottom: y + bottom + 1 - probeY,
              };
        };
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          const textValue = String(text);
          const color = String(this.fillStyle);
          const isSourceCredit = color === '#6b6b6b'
            || color === '#a3a3ad'
            || textValue.startsWith('来源：')
            || textValue.startsWith('Sources:')
            || textValue.endsWith('Vibe Atlas · sRGB');
          calls.push({
            text: textValue,
            x,
            y,
            width: this.measureText(textValue).width,
            color,
            font: this.font,
            ink: isSourceCredit ? rasterizedInkBounds(this, textValue, x, y, maxWidth) : null,
          });
          return maxWidth === undefined
            ? originalFillText.call(this, text, x, y)
            : originalFillText.call(this, text, x, y, maxWidth);
        };
        try {
          const canvas = await exports.renderExportCanvas({
            ...data,
            ...(presentation ? { presentation } : {}),
          }, variant);
          const footerPixel = canvas.getContext('2d', { willReadFrequently: true })!
            .getImageData(0, canvas.height - 1, 1, 1).data;
          const footerBackground = `rgb(${footerPixel[0]}, ${footerPixel[1]}, ${footerPixel[2]})`;
          return { width: canvas.width, height: canvas.height, calls, footerBackground };
        } finally {
          CanvasRenderingContext2D.prototype.fillText = originalFillText;
        }
      };

      const square = [];
      for (const variant of ['standard', 'master'] as const) {
        for (const palette of [{ id: 'default' }, ...COLLECTOR_PALETTES]) {
          square.push({
            variant,
            palette: palette.id,
            source: palette.id === 'default' ? 'no presentation' : 'both fields',
            canvas: await render(
              variant,
              palette.id === 'default'
                ? undefined
                : { paletteId: palette.id, atmosphereId: palette.id },
            ),
          });
        }
        square.push({
          variant,
          palette: 'moonlit-ink',
          source: 'atmosphereId only',
          canvas: await render(variant, { atmosphereId: 'moonlit-ink' }),
        });
      }
      const portrait = await render('full');
      const teaser = await render('teaser');
      probeContext.font = '400 18px "Inter", "Noto Sans SC", sans-serif';
      const localeModulePath = '/shared/locale.js';
      const { getLocale } = await import(/* @vite-ignore */ localeModulePath);
      const sourceLabel = getLocale() === 'zh-CN'
        ? '来源（原始记录）：'
        : 'Sources: ';
      let boundaryPrefix = sourceLabel;
      while (probeContext.measureText(boundaryPrefix + '文界\u0301').width <= 1080 - 64 * 2) {
        boundaryPrefix += '文';
      }
      data.rankedBatches[0].results[0].source = boundaryPrefix.slice(sourceLabel.length)
        + '界\u0301' + 'Archive'.repeat(15);
      const boundaryCanvas = await render('full');
      return {
        graphemeTruncations,
        paletteIds: COLLECTOR_PALETTES.map((palette: { id: string }) => palette.id),
        boundaryCredits: boundaryCanvas.calls.filter(call => call.y === 1190 || call.y === 1212)
          .map(call => call.text),
        portrait,
        teaser,
        square,
      };
    }, { publishers: LONG_PUBLISHERS, actorName: LONG_ACTOR_NAME, vibeName: LONG_VIBE_NAME });

    assert.equal(
      rendered.graphemeTruncations.combining,
      'Sources: Archive Cafe\u0301…',
      `${browserEngine.name} must keep combining accents attached when truncating`,
    );
    assert.equal(
      rendered.graphemeTruncations.emoji,
      'Sources: Artists 👩‍🎨…',
      `${browserEngine.name} must keep joined emoji attached when truncating`,
    );
    assert.equal(rendered.boundaryCredits.length, 2, `${browserEngine.name} boundary fixture must wrap`);
    assert.match(
      rendered.boundaryCredits[0],
      /界\u0301$/u,
      `${browserEngine.name} must keep a decomposed CJK grapheme on the first credit line`,
    );
    assert.doesNotMatch(
      rendered.boundaryCredits[1],
      /^\p{M}/u,
      `${browserEngine.name} must not start the next credit line with its combining mark`,
    );

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
        call.ink && call.y > expected.gridBottom && call.y < expected.footerTop);
      assert.equal(credits.length, 2, `${variant} credits must wrap to exactly two lines`);
      assertCreditContrast(variant, 'default', credits, canvas.footerBackground);
      assertCreditGraphemes(variant, credits);
      assert.deepEqual(credits.map(call => call.y), expected.creditYs, `${variant} must preserve source-credit spacing`);
      assert.ok(
        credits.every(call => normalizeCanvasFont(call.font) === normalizeCanvasFont(expected.creditFont)),
        `${variant} must preserve source-credit typography`,
      );
      assert.ok(credits[1].text.endsWith('…'), `${variant} overflowing credits must end with an ellipsis`);
      assert.ok(
        credits.some(line => /[\u3400-\u9fff]/u.test(line.text)),
        `${variant} credits must exercise CJK fallback glyphs`,
      );
      assert.ok(
        credits.some(line => /\p{Extended_Pictographic}/u.test(line.text)),
        `${variant} credits must exercise emoji fallback glyphs`,
      );
      assert.ok(
        credits.some(line => /\p{M}/u.test(line.text)),
        `${variant} credits must exercise combining-accent glyphs`,
      );
      assert.ok(
        credits.some(line => /\p{Script=Arabic}/u.test(line.text)),
        `${variant} credits must exercise right-to-left shaping`,
      );
      credits.forEach((line, index) => {
        assert.ok(line.ink, `${variant} credit line ${index + 1} must rasterize visible pixels`);
        assert.ok(line.y > expected.gridBottom, `${variant} credit line ${index + 1} must remain below the tile grid`);
        assert.ok(line.y < expected.footerTop, `${variant} credit line ${index + 1} must remain above the footer`);
        assert.ok(line.x - line.width / 2 >= 0, `${variant} credit line ${index + 1} must stay inside the left canvas edge`);
        assert.ok(line.x + line.width / 2 <= canvas.width, `${variant} credit line ${index + 1} must stay inside the right canvas edge`);
        assert.ok(line.ink!.left >= 0, `${variant} credit line ${index + 1} visible pixels must stay inside the left canvas edge`);
        assert.ok(line.ink!.right <= canvas.width, `${variant} credit line ${index + 1} visible pixels must stay inside the right canvas edge`);
        assert.ok(line.ink!.top > expected.gridBottom, `${variant} credit line ${index + 1} visible pixels must stay below the tile grid`);
        assert.ok(line.ink!.bottom < expected.footerTop, `${variant} credit line ${index + 1} visible pixels must stay above the footer`);
      });

      const editionDetails = canvas.calls.filter(call => call.text.startsWith('2026-09-20 · '));
      assert.equal(editionDetails.length, 1, `${variant} must draw one edition-details line`);
      const edition = editionDetails[0];
      assert.equal(edition.y, expected.editionY, `${variant} must preserve edition-detail spacing`);
      assert.equal(normalizeCanvasFont(edition.font), normalizeCanvasFont(expected.editionFont), `${variant} must preserve edition-detail typography`);
      assert.ok(edition.y > credits.at(-1)!.y, `${variant} edition details must remain below source credits`);
      assert.ok(edition.x - edition.width / 2 >= 0, `${variant} edition details must stay inside the left canvas edge`);
      assert.ok(edition.x + edition.width / 2 <= canvas.width, `${variant} edition details must stay inside the right canvas edge`);

      const brand = canvas.calls.find(call => call.text.startsWith('🔮 Vibe Guide ·'));
      assert.ok(brand, `${variant} must draw its footer brand line`);
      assert.equal(brand.y, expected.brandY, `${variant} must preserve brand-line spacing`);
      assert.equal(normalizeCanvasFont(brand.font), normalizeCanvasFont(expected.brandFont), `${variant} must preserve brand-line typography`);
      assert.ok(brand.x - brand.width / 2 >= 0, `${variant} brand line must stay inside the left canvas edge`);
      assert.ok(brand.x + brand.width / 2 <= canvas.width, `${variant} brand line must stay inside the right canvas edge`);

      const microCopy = canvas.calls.find(call =>
        call.y === expected.microCopyY && call.color.startsWith('rgba(107, 107, 107,'));
      assert.ok(microCopy, `${variant} must draw bounded micro-copy`);
      assert.equal(normalizeCanvasFont(microCopy.font), normalizeCanvasFont(expected.microCopyFont), `${variant} must preserve micro-copy typography`);
      assert.ok(edition.y < microCopy.y, `${variant} edition details must remain above final micro-copy`);
      assert.ok(microCopy.x - microCopy.width / 2 >= 0, `${variant} micro-copy must stay inside the left canvas edge`);
      assert.ok(microCopy.x + microCopy.width / 2 <= canvas.width, `${variant} micro-copy must stay inside the right canvas edge`);
    }

    const squareExpectations = {
      standard: {
        gridBottom: 1024.08,
        creditYs: [1037, 1052],
        creditFont: '11px Inter, "Noto Sans SC", sans-serif',
      },
      master: {
        gridBottom: 2048.16,
        creditYs: [2074, 2104],
        creditFont: '23px Inter, "Noto Sans SC", sans-serif',
      },
    } as const;
    assert.deepEqual(
      ['default', ...rendered.paletteIds].sort(),
      Object.keys(EXPECTED_SQUARE_PALETTE_COLORS).sort(),
      `${browserEngine.name} every named Collector palette needs explicit export background and source-credit expectations`,
    );
    for (const { variant, palette, source, canvas } of rendered.square) {
      const context = `${browserEngine.name} ${variant} ${palette} (${source})`;
      const expected = squareExpectations[variant as keyof typeof squareExpectations];
      const credits = canvas.calls.filter(call => call.text.startsWith('Sources:') || call.text.endsWith('Vibe Atlas · sRGB'));
      assert.equal(credits.length, 2, `${context} credits must wrap to exactly two lines`);
      const paletteColors = EXPECTED_SQUARE_PALETTE_COLORS[palette];
      assert.ok(paletteColors, `${context} is missing expected export colors`);
      assert.deepEqual(
        parseCanvasColor(canvas.footerBackground),
        parseCanvasColor(paletteColors.background),
        `${context} must render its own export background, not the default background`,
      );
      credits.forEach((credit, index) => assert.deepEqual(
        parseCanvasColor(credit.color),
        parseCanvasColor(paletteColors.credit),
        `${context} source-credit line ${index + 1} must use its palette color, not the default credit color`,
      ));
      assertCreditContrast(variant, palette, credits, canvas.footerBackground);
      assertCreditGraphemes(variant, credits);
      assert.deepEqual(credits.map(call => call.y), expected.creditYs, `${context} must preserve source-credit spacing`);
      assert.ok(
        credits.every(call => normalizeCanvasFont(call.font) === normalizeCanvasFont(expected.creditFont)),
        `${context} must preserve source-credit typography`,
      );
      assert.ok(credits[1].text.endsWith('Vibe Atlas · sRGB'), `${context} credits must retain the attribution suffix`);
      assert.ok(
        credits.some(line => /[\u3400-\u9fff]/u.test(line.text)),
        `${variant} credits must exercise CJK fallback glyphs`,
      );
      assert.ok(
        credits.some(line => /\p{Extended_Pictographic}/u.test(line.text)),
        `${variant} credits must exercise emoji fallback glyphs`,
      );
      assert.ok(
        credits.some(line => /\p{M}/u.test(line.text)),
        `${variant} credits must exercise combining-accent glyphs`,
      );
      assert.ok(
        credits.some(line => /\p{Script=Arabic}/u.test(line.text)),
        `${variant} credits must exercise right-to-left shaping`,
      );
      credits.forEach((line, index) => {
        assert.ok(line.ink, `${variant} credit line ${index + 1} must rasterize visible pixels`);
        assert.ok(line.y > expected.gridBottom, `${variant} credit line ${index + 1} must remain below the tile grid`);
        assert.ok(line.y <= canvas.height, `${variant} credit line ${index + 1} must stay inside the canvas bottom`);
        assert.ok(line.x - line.width / 2 >= 0, `${variant} credit line ${index + 1} must stay inside the left canvas edge`);
        assert.ok(line.x + line.width / 2 <= canvas.width, `${variant} credit line ${index + 1} must stay inside the right canvas edge`);
        assert.ok(line.ink!.left >= 0, `${variant} credit line ${index + 1} visible pixels must stay inside the left canvas edge`);
        assert.ok(line.ink!.right <= canvas.width, `${variant} credit line ${index + 1} visible pixels must stay inside the right canvas edge`);
        assert.ok(line.ink!.top > expected.gridBottom, `${variant} credit line ${index + 1} visible pixels must stay below the tile grid`);
        assert.ok(line.ink!.bottom <= canvas.height, `${variant} credit line ${index + 1} visible pixels must stay inside the canvas bottom`);
      });
    }
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}
