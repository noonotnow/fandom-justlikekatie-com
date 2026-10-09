import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect } from '@playwright/test';
import { ENDINGS, GAME_PATH } from '../../public/c-drama-fandom/fandom-games/sect-day/story.js';
import { BROWSER_ENGINES, launchBrowserWithServer, startViteTestServer, closeBrowserAndServer, gotoTestPage } from './browserEngines.ts';

for (const engine of BROWSER_ENGINES) {
  test(`sect day: mobile, keyboard, callbacks, preview privacy and action failures (${engine.name})`, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer(), engine.type);
    try {
      const context = await browser.newContext({ viewport: { width: 360, height: 780 }, reducedMotion: 'reduce', acceptDownloads: true });
      const page = await context.newPage();
      await gotoTestPage(page, origin + GAME_PATH);
      await page.locator('#start').focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#sect-heading')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('.sect-choices button').first()).toBeFocused();
      assert.notEqual(await page.locator('.sect-choices button').first().evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      const path = [1,0,0,1,0];
      for (let i = 0; i < 5; i++) {
        await expect(page.locator('#progress')).toHaveText(`Decision ${i + 1} of 5`);
        if (i === 3) await expect(page.locator('#story-view')).toContainText('Ren stands beside you');
        await page.locator('.sect-choices button').nth(path[i]).evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
        await expect(page.locator('.sect-consequence')).toBeVisible();
        await expect(page.locator('.sect-consequence h3')).toBeFocused();
        await page.getByRole('button', { name: i === 4 ? 'See your ending' : 'Continue', exact: true }).click();
      }
      await expect(page.locator('#sect-heading')).toHaveText('Reluctant Sect Savior');
      await expect(page.locator('.sect-recap li')).toHaveCount(5);
      const events = () => page.evaluate(() => (window as any).dataLayer || []);
      assert.equal((await events()).filter((e: any) => e.event === 'sect_game_complete').length, 1);
      assert.equal(new URL(page.url()).search, '');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(`(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } });
        document.execCommand = () => false;
      })()`);
      await page.getByRole('button', { name: 'Copy ending link', exact: true }).click();
      await expect(page.locator('#action-status')).toContainText('did not finish');
      assert.equal((await events()).filter((e: any) => e.event === 'sect_game_action').length, 0);
      await page.evaluate(`Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('cancelled', 'AbortError'); } })`);
      await page.getByRole('button', { name: 'Share ending', exact: true }).click();
      await expect(page.locator('#action-status')).toContainText('cancelled');
      assert.equal((await events()).filter((e: any) => e.event === 'sect_game_action').length, 0);
      await page.evaluate(`Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new Error('sharing unavailable'); } })`);
      await page.getByRole('button', { name: 'Share ending', exact: true }).click();
      await expect(page.locator('#action-status')).toContainText('did not finish');
      assert.equal((await events()).filter((e: any) => e.event === 'sect_game_action').length, 0);
      await page.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => { window.copiedSectLink = url; } } })`);
      await page.getByRole('button', { name: 'Copy ending link', exact: true }).click();
      await expect(page.locator('#action-status')).toContainText('copied');
      assert.equal(await page.evaluate(() => (window as any).copiedSectLink), 'https://fandom.justlikekatie.com' + GAME_PATH + '?ending=sect-savior');
      await page.evaluate(`Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} })`);
      await page.getByRole('button', { name: 'Share ending', exact: true }).click();
      await expect(page.locator('#action-status')).toContainText('shared');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download ending card', exact: true }).click();
      const download = await downloadPromise;
      assert.ok(download.suggestedFilename().endsWith('sect-savior.png'));
      assert.equal(await download.failure(), null);
      assert.deepEqual((await events()).filter((e: any) => e.event === 'sect_game_action').map((e: any) => e.shareMethod), ['copy', 'native', 'download']);
      const layouts = await page.evaluate(async () => {
        // @ts-ignore browser URL module import
        const { drawCard } = await import('/c-drama-fandom/fandom-games/sect-day/card.js');
        // @ts-ignore browser URL module import
        const { ENDINGS } = await import('/c-drama-fandom/fandom-games/sect-day/story.js');
        return ENDINGS.map((e: any) => drawCard(document.createElement('canvas'), e.id));
      });
      for (const layout of layouts) for (const line of layout) { assert.ok(line.width <= 860); assert.ok(line.y < 1195); }
      await page.getByRole('button', { name: 'Play again', exact: true }).click();
      await expect(page.locator('#progress')).toHaveText('Decision 1 of 5');
      await expect(page.locator('.sect-recap')).toHaveCount(0);
      for (let i = 0; i < 5; i++) {
        await page.locator('.sect-choices button').nth(2).click();
        await page.getByRole('button', { name: i === 4 ? 'See your ending' : 'Continue', exact: true }).click();
      }
      await expect(page.locator('#sect-heading')).toHaveText('Survived by Leaving Before Lunch');
      await expect(page.locator('#story-view')).toContainText('You got yourself out');
      await page.reload();
      await expect(page.locator('#start')).toBeVisible();
      for (const ending of ENDINGS) {
        await gotoTestPage(page, origin + GAME_PATH + '?ending=' + ending.id);
        await expect(page.locator('#sect-heading')).toHaveText(ending.name);
        await expect(page.locator('#progress')).toContainText('Shared result');
        await expect(page.locator('.sect-recap')).toHaveCount(0);
        assert.equal((await events()).length, 0);
      }
      await gotoTestPage(page, origin + GAME_PATH + '?ending=sect-savior&ending=three-realms');
      await expect(page.locator('#start')).toBeVisible();
      await gotoTestPage(page, origin + '/c-drama-fandom/fandom-games/');
      await page.locator('[data-fate="moonlit-strategist"]').click();
      await expect(page.locator('#fate-result h3')).toHaveText('Moonlit Strategist');
      assert.equal(new URL(page.url()).searchParams.get('fate'), 'moonlit-strategist');
      await gotoTestPage(page, origin + GAME_PATH + '?ending=unknown-value');
      await expect(page.locator('#start')).toBeVisible();
      assert.equal(new URL(page.url()).search, '');
      await page.evaluate(`window.dataLayer = { push: () => { throw new Error('analytics unavailable'); } }`);
      await page.locator('#start').evaluate(el => { (el as HTMLButtonElement).click(); (el as HTMLButtonElement).click(); });
      await expect(page.locator('#progress')).toHaveText('Decision 1 of 5');
      for (let i = 0; i < 5; i++) {
        await page.locator('.sect-choices button').nth(2).click();
        await page.getByRole('button', { name: i === 4 ? 'See your ending' : 'Continue', exact: true }).click();
      }
      await expect(page.locator('#sect-heading')).toHaveText('Survived by Leaving Before Lunch');
      const noJS = await browser.newContext({ javaScriptEnabled: false });
      const plain = await noJS.newPage();
      await gotoTestPage(plain, origin + GAME_PATH);
      // The injected matcher can treat noscript as inactive even in a no-JS
      // context; inspect its real child and text instead.
      await expect(plain.locator('noscript p')).toBeVisible();
      assert.ok((await plain.locator('noscript').textContent())?.includes('Interactive play requires JavaScript'));
      await expect(plain.locator('#start')).not.toBeVisible();
      await noJS.close(); await context.close();
    } finally { await closeBrowserAndServer(browser, server); }
  });
}
