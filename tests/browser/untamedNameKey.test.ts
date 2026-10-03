import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gotoTestPage,
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

test('the approved name key reads on mobile without loading or changing journal records', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await gotoTestPage(page, origin);
    await page.evaluate(() => {
      localStorage.setItem('fandom-watch-journal-safe-through:the-untamed', '3');
    });
    const journalRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/.netlify/functions/watch-journal')) journalRequests.push(request.url());
    });
    await gotoTestPage(page, `${origin}/c-drama-fandom/untamed-names-and-performers/`);
    assert.equal(await page.locator('h1').innerText(), 'The Untamed: two characters, two performers');
    assert.equal(await page.locator('tbody tr').count(), 2);
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 812 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `No page-wide overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const region = page.getByRole('region', { name: /Character and performer names/ });
    await region.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (document.querySelector('.comparison-table')?.scrollLeft ?? 0) > 0);
    await page.locator('tbody td').last().scrollIntoViewIfNeeded();
    assert.equal(await page.locator('tbody td').last().innerText(), 'Wang Yibo (王一博)');
    assert.equal(await page.evaluate(() => localStorage.getItem('fandom-watch-journal-safe-through:the-untamed')), '3');
    assert.deepEqual(journalRequests, []);
    assert.equal(await page.getByRole('link', { name: "today's Daily Drop in Vibe Atlas" }).getAttribute('href'), '/vibe-atlas');
    await page.getByRole('link', { name: 'three-group pre-watch board' }).click();
    assert.equal(await page.locator('.name-board__card').count(), 3);
    await page.getByRole('link', { name: 'Looking for character and actor names? Read the two-lead name key →' }).click();
    assert.equal(await page.locator('tbody tr').count(), 2);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});