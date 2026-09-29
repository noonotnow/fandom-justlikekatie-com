import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

type GuideEvent = { name: string; data?: Record<string, string | number | boolean> };

test('homepage guide menu records opens and each selected destination without adding pageviews', { timeout: 60_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(8_000);
    await page.addInitScript(() => {
      (window as Window & { umami?: { track(name: string, data?: Record<string, string | number | boolean>): void } }).umami = {
        track(name, data) {
          const events = JSON.parse(sessionStorage.getItem('__guideEvents') ?? '[]');
          sessionStorage.setItem('__guideEvents', JSON.stringify([...events, { name, data }]));
        },
      };
    });
    const destinations = [
      ['Glossary', 'glossary', '/c-drama-fandom/glossary/'],
      ['Archetypes', 'archetypes', '/c-drama-fandom/archetypes/'],
      ['Veteran journal', 'watch_journal', '/c-drama-fandom/watch-journal/'],
      ['Vibing Now', 'vibing_now', '/c-drama-fandom/vibing-now/'],
    ] as const;
    for (const [label, destination, path] of destinations) {
      await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: 'Explore C-drama fandom' });
      const more = nav.getByRole('button', { name: /More guides/ });
      await more.click();
      await more.click(); // Closing the menu is not an open.
      await more.click();
      await nav.getByRole('link', { name: label }).click();
      await page.waitForURL(`${origin}${path}`);
      const events = await page.evaluate(() => JSON.parse(sessionStorage.getItem('__guideEvents') ?? '[]') as GuideEvent[]);
      assert.deepEqual(events.slice(-3), [
        { name: 'homepage_guide_menu_opened' },
        { name: 'homepage_guide_menu_opened' },
        { name: 'homepage_guide_menu_link_selected', data: { destination } },
      ]);
      assert.equal(events.some(event => event.name === 'page_view'), false);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('guide links still navigate without analytics and when the tracker throws', { timeout: 60_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    for (const trackerThrows of [false, true]) {
      const page = await browser.newPage();
      page.setDefaultTimeout(8_000);
      if (trackerThrows) {
        await page.addInitScript(() => {
          (window as Window & { umami?: { track(): void } }).umami = {
            track() { throw new Error('tracker unavailable'); },
          };
        });
      }
      await gotoTestPage(page, origin, { waitUntil: 'domcontentloaded' });
      const nav = page.getByRole('navigation', { name: 'Explore C-drama fandom' });
      await nav.getByRole('button', { name: /More guides/ }).click();
      await nav.getByRole('link', { name: 'Glossary' }).click();
      await page.waitForURL(`${origin}/c-drama-fandom/glossary/`);
      await page.close();
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});