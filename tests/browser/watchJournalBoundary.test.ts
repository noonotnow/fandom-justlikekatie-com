import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

async function startApp() {
  return startViteTestServer();
}

test('an episode-range share page caps a previously saved later boundary', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startApp());
  try {
    const page = await browser.newPage();
    await page.goto(origin);
    await page.evaluate(() => {
      localStorage.setItem('fandom-watch-journal-safe-through:the-untamed', '999');
    });

    const requestedBoundaries: string[] = [];
    await page.route('**/.netlify/functions/watch-journal?*', async route => {
      const url = new URL(route.request().url());
      const boundary = url.searchParams.get('safeThroughEpisode') ?? '';
      requestedBoundaries.push(boundary);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          safeThroughEpisode: Number(boundary),
          journal: {
            schemaVersion: 1,
            series: { id: 'the-untamed', title: 'The Untamed' },
            entries: [],
            predictions: [],
            evidence: [],
          },
        }),
      });
    });

    await page.goto(`${origin}/c-drama-fandom/watch-journal/episodes-1-4/`);
    await page.getByText('Showing only approved records safe through Episode 4.').waitFor();
    assert.deepEqual(requestedBoundaries, ['4']);
    assert.equal(await page.locator('#safe-through').inputValue(), '4');

    await page.locator('#safe-through').fill('5');
    await page.getByRole('button', { name: 'Open safe view' }).click();
    await page.getByText('This shared page is capped at Episode 4.').waitFor();
    assert.deepEqual(requestedBoundaries, ['4'], 'a range route must not request beyond its endpoint');
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});