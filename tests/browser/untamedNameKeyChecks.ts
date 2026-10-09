import assert from 'node:assert/strict';
import type { Locator, Page } from '@playwright/test';
import { gotoTestPage } from './browserEngines.ts';
import { NAME_KEY_ROUTE, BOARD_LABEL, JOURNAL_LABEL } from '../../scripts/stage-untamed-name-key.js';

const SETTING_KEY = 'fandom-watch-journal-safe-through:the-untamed';
const JOURNAL_ROUTE = '/c-drama-fandom/watch-journal/episodes-1-4/';

async function assertReadable(cell: Locator, width: number) {
  const bounds = await cell.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width,
    `${await cell.innerText()} must fit inside the ${width}px viewport`);
}

export async function checkNameKeyReading(page: Page) {
  assert.equal(await page.locator('h1').innerText(), 'The Untamed: three characters, three performers');
  assert.equal(await page.locator('tbody tr').count(), 3);
  const rows = page.locator('tbody tr');
  for (const [index, character, performer] of [
    [0, 'Wei Wuxian (魏无羡)', 'Xiao Zhan (肖战)'],
    [1, 'Lan Wangji (蓝忘机)', 'Wang Yibo (王一博)'],
    [2, 'Wen Qing (温情)', 'Meng Ziyi (孟子义)'],
  ] as const) {
    assert.equal(await rows.nth(index).locator('td').first().innerText(), character);
    assert.equal(await rows.nth(index).locator('td').last().innerText(), performer);
  }
  const leadTable = page.getByRole('region', { name: /Character and performer names/ }).first();
  const pairTable = page.locator('.comparison-table--pair');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No page-wide overflow at ${width}px`);
    assert.ok(await pairTable.evaluate(node => node.scrollWidth <= node.clientWidth),
      `Wen Qing pairing must fit at ${width}px`);
    await pairTable.scrollIntoViewIfNeeded();
    await assertReadable(rows.nth(2).locator('td').first(), width);
    await assertReadable(rows.nth(2).locator('td').last(), width);
    if (width > 390) continue;

    // Reset only the starting position; keyboard movement itself must be native.
    await leadTable.evaluate(node => { node.scrollLeft = 0; });
    // Start from a different focus target even after the preceding touch check.
    await page.getByRole('link', { name: 'C-drama fandom', exact: true }).focus();
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => document.querySelector('.comparison-table') === document.activeElement);
    assert.ok(await leadTable.evaluate(node => node === document.activeElement),
      'The lead table must be reachable by keyboard');
    for (const index of [0, 1]) await assertReadable(rows.nth(index).locator('td').first(), width);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => (document.querySelector('.comparison-table')?.scrollLeft ?? 0) > 0);
    for (let step = 0; step < 30; step += 1) await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => {
      const table = document.querySelector('.comparison-table');
      return table && table.scrollLeft + table.clientWidth >= table.scrollWidth - 1;
    });
    for (const index of [0, 1]) await assertReadable(rows.nth(index).locator('td').last(), width);

    // Playwright's touch tap scrolls its target into view before dispatching
    // real touch events. This checks touch access, not a native swipe gesture.
    await leadTable.evaluate(node => {
      node.addEventListener('touchend', () => { node.setAttribute('data-touched', 'yes'); });
    });
    for (const index of [0, 1]) {
      await leadTable.evaluate(node => {
        node.scrollLeft = 0;
        node.removeAttribute('data-touched');
      });
      const performer = rows.nth(index).locator('td').last();
      await performer.tap();
      assert.equal(await leadTable.getAttribute('data-touched'), 'yes');
      await assertReadable(performer, width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

export async function checkNameKeyNavigation(page: Page, origin: string) {
  const journalRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/.netlify/functions/watch-journal')) {
      journalRequests.push(request.url());
    }
  });
  await page.route('https://www.googletagmanager.com/**', route => route.abort());
  await page.route('**/.netlify/functions/watch-journal**', async route => {
    const boundary = new URL(route.request().url()).searchParams.get('safeThroughEpisode');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      safeThroughEpisode: Number(boundary),
      journal: { schemaVersion: 1, series: { id: 'the-untamed', title: 'The Untamed' }, entries: [], predictions: [], evidence: [] },
    }) });
  });
  await gotoTestPage(page, `${origin}${NAME_KEY_ROUTE}`);
  await page.evaluate(key => localStorage.setItem(key, '3'), SETTING_KEY);
  await page.reload();
  assert.equal(await page.locator('tbody tr').count(), 3);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SETTING_KEY), '3');
  assert.deepEqual(journalRequests, [], 'An earlier saved boundary must remain untouched too');
  await page.evaluate(key => localStorage.setItem(key, '999'), SETTING_KEY);
  await page.reload();
  await checkNameKeyReading(page);
  assert.deepEqual(journalRequests, [], 'The name key must not request any Journal endpoint');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SETTING_KEY), '999');
  assert.equal(await page.getByRole('link', { name: "today's Daily Drop in Vibe Atlas", exact: true }).getAttribute('href'), '/vibe-atlas');

  await page.getByRole('link', { name: 'three-group pre-watch board', exact: true }).tap();
  await page.waitForURL(`${origin}/c-drama-fandom/untamed-name-board/`);
  assert.equal(new URL(page.url()).pathname, '/c-drama-fandom/untamed-name-board/');
  assert.equal(await page.locator('.name-board__card').count(), 3);
  const boardLink = page.getByRole('link', { name: BOARD_LABEL, exact: true });
  assert.equal(await boardLink.getAttribute('href'), NAME_KEY_ROUTE);
  await boardLink.tap();
  await page.waitForURL(`${origin}${NAME_KEY_ROUTE}`);
  assert.equal(new URL(page.url()).pathname, NAME_KEY_ROUTE);
  assert.equal(await page.locator('tbody tr').count(), 3);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SETTING_KEY), '999');
  assert.deepEqual(journalRequests, [], 'Returning from the board must not load Journal data');

  assert.equal(await page.getByRole('link', { name: 'Field Journal', exact: true }).getAttribute('href'),
    '/c-drama-fandom/watch-journal/');
  // Open the existing bounded share URL, not the unbounded Journal landing link.
  await gotoTestPage(page, `${origin}${JOURNAL_ROUTE}`);
  assert.equal(new URL(page.url()).pathname, JOURNAL_ROUTE);
  await page.getByText('Showing only approved records safe through Episode 4.', { exact: true }).waitFor();
  assert.equal(await page.locator('#safe-through').inputValue(), '4');
  assert.equal(journalRequests.length, 1);
  assert.equal(new URL(journalRequests[0]).searchParams.get('safeThroughEpisode'), '4');
  await page.locator('#safe-through').fill('5');
  await page.getByRole('button', { name: 'Open safe view', exact: true }).tap();
  await page.getByText('This shared page is capped at Episode 4. Choose a later episode page before raising the boundary.', { exact: true }).waitFor();
  assert.equal(journalRequests.length, 1, 'Refusing Episode 5 must not make another request');

  const savedBoundary = await page.evaluate(key => localStorage.getItem(key), SETTING_KEY);
  const journalInbound = page.getByRole('link', { name: JOURNAL_LABEL, exact: true });
  assert.equal(await journalInbound.getAttribute('href'), NAME_KEY_ROUTE);
  await journalInbound.tap();
  await page.waitForURL(`${origin}${NAME_KEY_ROUTE}`);
  assert.equal(new URL(page.url()).pathname, NAME_KEY_ROUTE);
  assert.equal(await page.locator('tbody tr').count(), 3);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), SETTING_KEY), savedBoundary);
  assert.equal(journalRequests.length, 1, 'Returning from the Journal must not request another view');
}