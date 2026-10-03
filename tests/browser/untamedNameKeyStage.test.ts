import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createStagingServer, stageUntamedNameKey, NAME_KEY_ROUTE, BOARD_LABEL, JOURNAL_LABEL } from '../../scripts/stage-untamed-name-key.js';

test('three-character staging preserves exact copy, mobile readability and Journal boundaries', { timeout: 60_000 }, async () => {
  stageUntamedNameKey();
  const server = createStagingServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const journalRequests: string[] = [];
    await page.route('**/.netlify/functions/watch-journal?*', async route => {
      const boundary = new URL(route.request().url()).searchParams.get('safeThroughEpisode')!;
      journalRequests.push(boundary);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        safeThroughEpisode: Number(boundary),
        journal: { schemaVersion: 1, series: { id: 'the-untamed', title: 'The Untamed' }, entries: [], predictions: [], evidence: [] },
      }) });
    });
    await page.goto(`${origin}${NAME_KEY_ROUTE}`);
    await page.evaluate(() => localStorage.setItem('fandom-watch-journal-safe-through:the-untamed', '999'));
    const copy = readFileSync('docs/untamed-three-character-name-key-review.md', 'utf8')
      .split('<!-- reader-copy:start -->')[1].split('<!-- reader-copy:end -->')[0];
    // Strip only markdown syntax, never prose, to check each approved text block against rendered text.
    const content = (await page.locator('main').textContent())!.replace(/\s+/g, ' ');
    for (const line of copy.trim().split('\n')) {
      if (!line.trim() || /^\|/.test(line)) continue;
      const plain = line.replace(/^#+ /, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*/g, '').trim();
      assert.ok(content.includes(plain.replace(/\s+/g, ' ')), plain);
    }
    assert.equal(await page.locator('tbody tr').count(), 3);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow at ${width}`);
      const pairTable = page.locator('.comparison-table--pair');
      assert.equal(await pairTable.evaluate(node => node.scrollWidth <= node.clientWidth), true, `Wen Qing pairing must fit at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const leadTable = page.locator('.comparison-table').first();
    await leadTable.focus();
    await page.keyboard.press('End');
    await leadTable.evaluate(node => { node.scrollLeft = node.scrollWidth; });
    const performer = await leadTable.getByText('Xiao Zhan (肖战)', { exact: true }).boundingBox();
    assert.ok(performer && performer.x >= 0 && performer.x + performer.width <= 390, 'lead performer can be read after scrolling');
    assert.deepEqual(journalRequests, [], 'reference must not load Journal data');
    assert.equal(await page.evaluate(() => localStorage.getItem('fandom-watch-journal-safe-through:the-untamed')), '999');
    await page.goto(`${origin}/c-drama-fandom/untamed-name-board/`);
    await page.getByRole('link', { name: BOARD_LABEL }).click();
    assert.equal(new URL(page.url()).pathname, NAME_KEY_ROUTE);
    await page.goto(`${origin}/c-drama-fandom/watch-journal/episodes-1-4/`);
    await page.getByText('Showing only approved records safe through Episode 4.').waitFor();
    assert.deepEqual(journalRequests, ['4']);
    await page.locator('#safe-through').fill('5');
    await page.getByRole('button', { name: 'Open safe view' }).click();
    await page.getByText('This shared page is capped at Episode 4.').waitFor();
    assert.deepEqual(journalRequests, ['4']);
    await page.getByRole('link', { name: JOURNAL_LABEL }).click();
    assert.equal(new URL(page.url()).pathname, NAME_KEY_ROUTE);
    assert.deepEqual(journalRequests, ['4'], 'returning to name key must not load another Journal view');
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});