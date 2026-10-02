import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES, closeBrowserAndServer, gotoTestPage,
  launchPageForServer, startViteTestServer,
} from './browserEngines.ts';

for (const engine of BROWSER_ENGINES) {
  test(`self-hosted Chinese display glyphs survive Latin font matching in ${engine.name}`, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoTestPage(page, `${origin}/zh-cn/vibe-atlas?view=membership`);
      await page.locator('#fandom-language-selector').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const glyphs = await page.evaluate(async () => {
        const samples = [];
        for (const family of ['Fraunces', 'DM Mono', 'Manrope', 'Georgia']) {
          for (const weight of [400, 500, 600, 700]) {
            await document.fonts.load(`${weight} 28px "${family}"`, '收藏会员');
            const canvas = document.createElement('canvas');
            canvas.width = 240; canvas.height = 60;
            const context = canvas.getContext('2d')!;
            context.font = `${weight} 28px "${family}"`;
            context.fillText('收藏会员', 4, 40);
            const actual = canvas.toDataURL();
            context.clearRect(0, 0, 240, 60);
            // Each alias uses the same local regular CJK face, not system tofu.
            context.font = '400 28px "Noto Sans SC"';
            context.fillText('收藏会员', 4, 40);
            samples.push({ family, weight, matchesLocalGlyphs: actual === canvas.toDataURL() });
          }
        }
        return samples;
      });
      assert.ok(glyphs.every(sample => sample.matchesLocalGlyphs), JSON.stringify(glyphs));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      await gotoTestPage(page, `${origin}/zh-cn/c-drama-fandom/trope-decoder/`);
      assert.equal(await page.locator('[data-search]').count(), 14);
      assert.match(await page.locator('.decoder-search').evaluate(element => getComputedStyle(element).fontFamily), /VibeAtlasCJK/);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}