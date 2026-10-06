import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect, type Page } from '@playwright/test';
import {
  BROWSER_ENGINES, closeBrowserAndServer, gotoTestPage,
  launchPageForServer, startViteTestServer,
} from './browserEngines.ts';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');

async function installRefreshFixture(page: Page) {
  let requests = 0;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null } }));
  await page.route('**/api/membership/status', route => route.fulfill({
    json: { state: 'inactive', isMember: false, capabilities: [] },
  }));
  await page.route('**/.netlify/functions/public-archive-inventory**', route => route.fulfill({
    status: 404, json: { fallback: 'legacy_unverified_edition' },
  }));
  await page.route('**/.netlify/functions/public-released-pack-preview**', route => route.fulfill({
    status: 404, json: {},
  }));
  await page.route('https://images.refresh-test/**', route => route.fulfill({
    contentType: 'image/png', body: PIXEL,
  }));
  await page.route('**/.netlify/functions/star-of-day**', route => {
    if (++requests <= 2) return route.fulfill({
      status: 202, json: { building: true, rankedBatches: [] },
    });
    return route.fulfill({ json: {
      date: '2026-10-07', actorId: 'refresh-actor',
      actorName: '测试演员', actorShortNameEn: 'Refresh Actor',
      actorAccentColor: '#b89155', vibeIdx: 1, vibeEmoji: '',
      vibeLabel: '月下氛围', vibeLabelEn: 'Moonlit mood',
      vibeSubtitle: '中文氛围说明', vibeSubtitleEn: 'English vibe description',
      rankedBatches: [{
        query: 'refresh fixture', provider: 'primary', count: 9, distinctSources: 4,
        results: Array.from({ length: 9 }, (_, index) => ({
          imageId: `refresh-image-${index}`, title: `Refresh image ${index}`,
          thumbnail: `https://images.refresh-test/${index}.png`,
          link: `https://source.refresh-test/${index}`, source: `Publisher ${index % 4}`,
        })),
      }],
    } });
  });
  return () => requests;
}

for (const engine of BROWSER_ENGINES) {
  test(`Daily Drop automatically loads the finished background grid in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      const requestCount = await installRefreshFixture(page);
      await gotoTestPage(page, `${origin}/vibe-atlas`);
      await expect(page.locator('.daily-grid .grid > [role="button"]')).toHaveCount(9, { timeout: 25_000 });
      await expect(page.locator('.daily-actions')).toBeVisible();
      await expect(page.getByText('Today\'s grid is still being built — check back in a moment!', { exact: true })).toHaveCount(0);
      assert.ok(requestCount() >= 3, 'the page retried the preparing response');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}
