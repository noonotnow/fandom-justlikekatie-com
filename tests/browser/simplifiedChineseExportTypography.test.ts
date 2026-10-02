import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES,
  gotoTestPage,
  closeBrowserAndServer,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const MEDIA_ORIGIN = 'https://cjk-export.example.test';
const PROVIDERS = [
  '月光剧照档案馆 Moonlit Drama Archive',
  '独立影视研究社 Independent Screen Research Society',
  '服装与影像博物馆 Costume and Image Museum',
];

function solidSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${color}"/></svg>`;
}

for (const engine of BROWSER_ENGINES) {
  test(`Simplified Chinese export font, punctuation, and share copy work in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    const fontRequests: number[] = [];
    const mediaRequests: string[] = [];

    try {
      await page.addInitScript({ content: 'globalThis.__name = target => target;' });
      await page.route('**/fonts/vibe-atlas-cjk.woff2', async route => {
        fontRequests.push(route.request().url().length);
        await route.continue();
      });
      await page.route('**/.netlify/functions/image-proxy?*', async route => {
        const source = new URL(route.request().url()).searchParams.get('url') || '';
        mediaRequests.push(source);
        const index = Number(source.match(/fixture-(\d+)\.svg$/)?.[1]);
        assert.ok(Number.isInteger(index) && index >= 0 && index < 9, `unexpected fixture media ${source}`);
        await route.fulfill({
          contentType: 'image/svg+xml',
          headers: { 'access-control-allow-origin': '*' },
          body: solidSvg(['#d1495b', '#edae49', '#00798c', '#30638e', '#003d5b', '#7a5195', '#ef5675', '#ffa600', '#2f4b7c'][index]),
        });
      });
      const cjkFontResponse = page.waitForResponse(response => response.url().includes('/fonts/vibe-atlas-cjk.woff2'));
      await gotoTestPage(page, `${origin}/zh-cn/`);
      assert.equal((await cjkFontResponse).status(), 200, 'the locally hosted CJK font is served without a third-party request');

      const result = await page.evaluate(async ({ mediaOrigin, providers }) => {
        const modulePath = '/src/utils/exportCanvas.ts';
        const exports = await import(/* @vite-ignore */ modulePath) as {
          loadExportCardFonts: () => Promise<void>;
          renderExportCanvas: (data: unknown, variant: string) => Promise<HTMLCanvasElement>;
          wrapCanvasText: (context: CanvasRenderingContext2D, text: string, maxWidth: number) => string[];
          exportShareCard: (data: unknown, variant: string) => Promise<{ outcome: string }>;
        };
        await exports.loadExportCardFonts();
        const deliveryUrls = Array.from({ length: 9 }, (_, index) => `${mediaOrigin}/fixture-${index}.svg`);
        const data = {
          actorId: 'fixture-actor',
          actorName: '刘宇宁',
          actorShortNameEn: 'Liu Yuning',
          actorAccentColor: '#9f9bea',
          vibeEmoji: '🌙',
          vibeLabel: '冷面护短',
          vibeLabelEn: 'Cold-faced but protective',
          vibeSubtitle: '嘴上不说，行动已经把人护在身后。',
          vibeSubtitleEn: 'He never says it outright, but his actions put someone behind his guard.',
          rankedBatches: [{
            query: '刘宇宁 冷面护短',
            results: deliveryUrls.map((thumbnail, index) => ({
              title: `原始剧照 ${index + 1}`,
              thumbnail,
              link: `https://publisher.example.test/source-${index}`,
              source: providers[index % providers.length],
            })),
            count: 9,
            distinctSources: 3,
            provider: 'fixture',
          }],
          date: '2026-09-20',
          presentation: { paletteId: 'moonlit-ink', atmosphereId: 'moonlit-ink' },
        };

        const textCalls: Array<{
          text: string;
          width: number;
          left: number;
          right: number;
          y: number;
          inkPixels: number;
        }> = [];
        const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
          const width = Math.min(this.measureText(String(text)).width, maxWidth ?? Number.POSITIVE_INFINITY);
          const left = this.textAlign === 'center' ? x - width / 2 : this.textAlign === 'right' ? x - width : x;
          const nativeResult = maxWidth === undefined
            ? nativeFillText.call(this, text, x, y)
            : nativeFillText.call(this, text, x, y, maxWidth);
          let inkPixels = 0;
          if (/\p{Script=Han}/u.test(String(text))) {
            const fontSize = Number.parseFloat(this.font.match(/(\d+(?:\.\d+)?)px/u)?.[1] || '16');
            const sampleLeft = Math.max(0, Math.floor(left - 3));
            const sampleTop = Math.max(0, Math.floor(y - fontSize * 1.25));
            const sampleRight = Math.min(this.canvas.width, Math.ceil(left + width + 3));
            const sampleBottom = Math.min(this.canvas.height, Math.ceil(y + fontSize * 0.3));
            const pixels = this.getImageData(
              sampleLeft, sampleTop, sampleRight - sampleLeft, sampleBottom - sampleTop,
            ).data;
            for (let index = 0; index < pixels.length; index += 4) {
              if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 180) inkPixels += 1;
            }
          }
          textCalls.push({ text: String(text), width, left, right: left + width, y, inkPixels });
          return nativeResult;
        };
        try {
          const render = async (variant: 'full' | 'teaser' | 'standard') => {
            const canvas = await exports.renderExportCanvas(data, variant);
            const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
              blob => blob ? resolve(blob) : reject(new Error(`${variant} PNG encoding failed`)),
              'image/png',
            ));
            const pngHeader = Array.from(new Uint8Array(await png.slice(0, 8).arrayBuffer()));
            return {
              width: canvas.width,
              height: canvas.height,
              pngType: png.type,
              pngSize: png.size,
              pngHeader,
              canvas,
            };
          };
          const full = await render('full');
          const teaser = await render('teaser');
          const standard = await render('standard');
          const fontFaces = await document.fonts.load('400 32px "Noto Sans SC"', '氛围图鉴刘宇宁爱情，。？！');
          const glyphCanvas = document.createElement('canvas');
          glyphCanvas.width = 500;
          glyphCanvas.height = 80;
          const glyphContext = glyphCanvas.getContext('2d')!;
          glyphContext.font = '400 36px "Noto Sans SC"';
          glyphContext.fillStyle = '#fff';
          glyphContext.fillText('氛围图鉴刘宇宁爱情，。？！', 2, 56);
          const glyphPixels = glyphContext.getImageData(0, 0, glyphCanvas.width, glyphCanvas.height).data;
          const visibleGlyphPixels = Array.from(glyphPixels).filter((value, index) => index % 4 === 3 && value > 0).length;
          const wrapContext = document.createElement('canvas').getContext('2d')!;
          wrapContext.font = '400 28px "Noto Sans SC"';
          const wrapped = exports.wrapCanvasText(wrapContext, '他走到门前（停了一下），最后还是把伞留给了她。', 196);
          const shares: Array<{
            title: string;
            text: string;
            files: Array<{ name: string; type: string; size: number }>;
          }> = [];
          Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
          Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: async (payload: {
              title: string;
              text: string;
              files?: File[];
            }) => {
              shares.push({
                title: payload.title,
                text: payload.text,
                files: (payload.files || []).map(file => ({
                  name: file.name,
                  type: file.type,
                  size: file.size,
                })),
              });
            },
          });
          const share = await exports.exportShareCard(data, 'standard');
          return {
            renders: [full, teaser, standard].map(({ width, height, pngType, pngSize, pngHeader }) =>
              ({ width, height, pngType, pngSize, pngHeader })),
            fontFaceCount: fontFaces.length,
            fontReady: document.fonts.check('400 32px "Noto Sans SC"', '氛围图鉴刘宇宁爱情，。？！'),
            visibleGlyphPixels,
            wrapped,
            textCalls,
            share,
            shares,
          };
        } finally {
          CanvasRenderingContext2D.prototype.fillText = nativeFillText;
        }
      }, { mediaOrigin: MEDIA_ORIGIN, providers: PROVIDERS }) as {
        renders: Array<{
          width: number;
          height: number;
          pngType: string;
          pngSize: number;
          pngHeader: number[];
        }>;
        fontFaceCount: number;
        fontReady: boolean;
        visibleGlyphPixels: number;
        wrapped: string[];
        textCalls: Array<{ text: string; width: number; left: number; right: number; y: number; inkPixels: number }>;
        share: { outcome: string };
        shares: Array<{
          title: string;
          text: string;
          files: Array<{ name: string; type: string; size: number }>;
        }>;
      };

      assert.deepEqual(result.renders.map(({ width, height }) => [width, height]), [[1080, 1350], [1080, 1080], [1080, 1080]]);
      for (const rendered of result.renders) {
        assert.equal(rendered.pngType, 'image/png');
        assert.ok(rendered.pngSize > 10_000, 'the full canvas export encodes substantive PNG output');
        assert.deepEqual(rendered.pngHeader, [137, 80, 78, 71, 13, 10, 26, 10], 'canvas output has a PNG signature');
      }
      assert.ok(result.fontFaceCount > 0, 'the named local Simplified Chinese font face loads');
      assert.equal(result.fontReady, true);
      assert.ok(result.visibleGlyphPixels > 200, 'CJK characters and punctuation rasterize on canvas');
      assert.ok(result.wrapped.length > 1, 'Chinese copy wraps rather than overflowing as one unbroken line');
      assert.ok(
        result.wrapped.every(line => !/^[，。、；：？！）》」』】]/u.test(line)),
        `Chinese closing punctuation is kept with preceding text: ${JSON.stringify(result.wrapped)}`,
      );
      assert.ok(
        result.wrapped.every(line => !/[（《「『【]$/u.test(line)),
        'Chinese opening punctuation is not stranded at the end of a line',
      );
      for (const call of result.textCalls) {
        assert.ok(call.left >= -1 && call.right <= 1081, `canvas text stays inside its bounds: ${call.text}`);
        assert.ok(call.y >= 0 && call.y <= 1350, `canvas text baseline stays inside its height: ${call.text}`);
      }
      for (const label of ['刘宇宁', '冷面护短']) {
        const painted = result.textCalls.filter(call => call.text.includes(label));
        assert.ok(painted.length >= 3, `${label} is drawn in the full, teaser, and Standard canvas`);
        painted.forEach(call => {
          assert.ok(call.inkPixels > 20, `${label} leaves visible CJK glyph pixels in the actual rendered canvas`);
        });
      }
      assert.ok(result.textCalls.some(call => call.text.includes('2026-09-20')), 'the original edition date remains on the share card');
      assert.ok(result.textCalls.some(call => call.text.includes('来源（原始记录）')), 'publisher metadata remains explicitly marked as original source evidence');
      assert.equal(result.shares.length, 1);
      const [sharedPayload] = result.shares;
      assert.deepEqual(
        { title: sharedPayload.title, text: sharedPayload.text },
        { title: '氛围图鉴', text: '🔮 今日之星 · 氛围格子' },
      );
      assert.equal(sharedPayload.files.length, 1, 'native sharing includes the generated PNG file');
      assert.match(sharedPayload.files[0].name, /\.png$/u);
      assert.equal(sharedPayload.files[0].type, 'image/png');
      assert.ok(sharedPayload.files[0].size > 10_000, 'the shared file contains the rendered PNG payload');
      assert.equal(result.share.outcome, 'shared');
      assert.ok(fontRequests.length > 0, 'export preparation requested the first-party hosted CJK font');
      assert.equal(new Set(mediaRequests).size, 9, 'all variants use only the nine supplied source images');
      assert.equal((await page.evaluate(() => document.documentElement.lang)), 'zh-CN');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}