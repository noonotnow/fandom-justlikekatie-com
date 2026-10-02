import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

const edition = {
  date: '2026-09-18',
  actorId: 'wang-hedi',
  actorName: '王鹤棣',
  actorShortNameEn: 'Dylan Wang',
  actorAccentColor: '#aa3377',
  vibeEmoji: '✨',
  vibeLabel: '男友感光线',
  vibeLabelEn: 'Boyfriend Lighting',
  vibeSubtitle: '灯光很懂，嘴上不说。',
  vibeSubtitleEn: 'The lighting knows.',
  access: 'free',
  rankedBatches: [{
    query: 'wang hedi portrait',
    results: Array.from({ length: 9 }, (_, index) => ({
      title: `Original source ${index + 1}`,
      thumbnail: `https://images.example/chinese-core-${index}.jpg`,
      link: `https://source.example/chinese-core-${index}`,
      source: 'Original publisher',
    })),
  }],
};

for (const engine of BROWSER_ENGINES) {
  test(`Chinese core switching preserves edition, builder draft and saved identity in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json', body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
        contentType: 'application/json', body: JSON.stringify(edition),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=daily&date=2026-09-18`);
      const selector = page.locator('#fandom-language-selector');
      await selector.waitFor();
      const actor = page.getByRole('button', { name: /^Dylan Wang.*9/ });
      await actor.waitFor();
      await actor.click();
      await page.getByRole('button', { name: 'Propose Compiled 3×3' }).click();
      await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
      const before = await page.getByLabel('Proposed Compiled 9-frame set').locator('img').evaluateAll(
        images => images.map(image => image.getAttribute('src')),
      );
      await selector.selectOption('zh-CN');
      await page.getByLabel('9 张风格合辑提案').waitFor();
      assert.equal(new URL(page.url()).pathname, '/zh-cn/vibe-atlas');
      assert.equal(new URL(page.url()).searchParams.get('source'), 'daily');
      assert.equal(new URL(page.url()).searchParams.get('date'), edition.date);
      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
      assert.deepEqual(
        await page.getByLabel('9 张风格合辑提案').locator('img').evaluateAll(
          images => images.map(image => image.getAttribute('src')),
        ),
        before,
        'language is presentation only; the unsaved composition must survive',
      );
      await selector.selectOption('en');
      await page.getByLabel('Proposed Compiled 9-frame set').waitFor();
      assert.equal(new URL(page.url()).pathname, '/vibe-atlas');
      await selector.selectOption('zh-CN');
      await page.reload();
      await page.locator('#fandom-language-selector').waitFor();
      assert.equal(await page.locator('#fandom-language-selector').inputValue(), 'zh-CN');
      // An explicit English URL beats any remembered Chinese preference.
      await gotoTestPage(page, `${origin}/vibe-atlas?view=membership`);
      assert.equal(await page.locator('#fandom-language-selector').inputValue(), 'en');
      // Language selection must not create a save merely by changing presentation.
      const savedCount = await page.evaluate(async () => {
        const request = indexedDB.open('vibe-atlas-collection', 3);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        if (!db.objectStoreNames.contains('grids')) { db.close(); return 0; }
        const count = db.transaction('grids', 'readonly').objectStore('grids').count();
        const result = await new Promise<number>((resolve, reject) => {
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => reject(count.error);
        });
        db.close();
        return result;
      });
      assert.equal(savedCount, 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await gotoTestPage(page, `${origin}/zh-cn/`);
      await page.locator('#fandom-language-selector').waitFor();
      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await gotoTestPage(page, `${origin}/zh-cn/vibe-atlas`);
      // The compact locale control must not cover a core product destination.
      await page.getByRole('button', { name: '会员', exact: true }).click();
      assert.equal(new URL(page.url()).searchParams.get('view'), 'membership');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}