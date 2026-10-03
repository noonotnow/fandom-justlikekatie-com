import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { launchBrowser } from '../tests/browser/browserEngines.ts';

// Read-only hosted verification: no sign-in links, reports, saves, or exports.
const origin = new URL(process.argv[2] || '');
assert.match(origin.hostname, /^[a-f0-9]+--.+\.netlify\.app$/, 'Use an immutable draft preview URL, not production.');
const output = process.argv[3] || '/tmp/daily-drop-hosted-review';
await mkdir(output, { recursive: true });
const browser = await launchBrowser();
try {
  for (const locale of ['en', 'zh-CN'] as const) {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const crashes: string[] = [];
      page.on('pageerror', error => crashes.push(error.message));
      await page.goto(`${origin.origin}/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas`);
      const drop = page.locator('.daily-drop');
      const grid = drop.locator('.daily-grid');
      const actions = drop.locator('.daily-actions');
      await expect(grid.locator('.grid > [role="button"]')).toHaveCount(9, { timeout: 45_000 });
      await expect(actions).toBeVisible();
      await expect(page.locator('.daily-released-pack')).toBeVisible();
      await expect(page.locator('.daily-released-pack__access')).not.toContainText(
        locale === 'en' ? 'checking' : '正在检查', { timeout: 45_000 },
      );
      const layout = await page.evaluate(() => {
        const context = document.querySelector('.atlas-edition__meta')!;
        const grid = document.querySelector('.daily-grid')!;
        const actions = document.querySelector('.daily-actions')!;
        const discovery = document.querySelector('.daily-released-pack')!;
        return {
          contextFirst: Boolean(context.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING),
          actionsAfter: Boolean(grid.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING),
          discoveryAfter: Boolean(actions.compareDocumentPosition(discovery) & Node.DOCUMENT_POSITION_FOLLOWING),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          loadedCards: Array.from(grid.querySelectorAll<HTMLImageElement>('.grid > [role="button"] > img'))
            .filter(image => image.complete && image.naturalWidth > 0).length,
        };
      });
      assert.deepEqual(layout, { contextFirst: true, actionsAfter: true, discoveryAfter: true, overflow: false, loadedCards: 9 });
      await page.screenshot({ path: `${output}/${locale}-${width}.png`, fullPage: true });
      const guide = actions.locator('details');
      assert.equal(await guide.evaluate(el => (el as HTMLDetailsElement).open), false);
      await actions.getByRole('button', { name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true }).click();
      await actions.getByRole('combobox').selectOption('nailed_vibe');
      await guide.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await guide.evaluate(el => (el as HTMLDetailsElement).open), true);
      await grid.getByRole('button', { name: locale === 'en' ? /View whole grid/ : /查看完整九宫格/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(actions.getByRole('combobox')).toHaveValue('nailed_vibe');
      const snapshot = page.locator('.daily-released-pack__snapshot');
      if (await snapshot.count()) {
        assert.equal(await snapshot.evaluate(el => (el as HTMLDetailsElement).open), false);
        await snapshot.locator('summary').click();
        await expect(snapshot.locator('img')).toHaveCount(9);
        await snapshot.locator('summary').click();
        await expect(actions.getByRole('combobox')).toHaveValue('nailed_vibe');
      }
      // Enlarged image reporting stays local to that image; never submit a report.
      await grid.locator('.grid > [role="button"]').first().click();
      await page.getByRole('button', { name: locale === 'en' ? 'View Full Screen' : '全屏查看', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.locator('details').filter({ hasText: locale === 'en' ? 'Report an image issue' : '报告图片问题' })).toBeVisible();
      await page.keyboard.press('Escape');
      assert.deepEqual(crashes, []);
      console.log(JSON.stringify({ locale, width, ...layout, pageErrors: crashes, screenshot: `${output}/${locale}-${width}.png` }));
      await page.close();
    }
  }
} finally {
  await browser.close();
}