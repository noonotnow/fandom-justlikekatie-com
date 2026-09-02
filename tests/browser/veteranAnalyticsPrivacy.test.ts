import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { chromium, type Browser } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const JOURNAL_CAPABILITY = 'PrivateJournalCapability';

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('The browser test server did not expose a TCP port.');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (defaultLaunchError) {
    const executablePath = process.env.PATH
      ?.split(':')
      .map(directory => `${directory}/chromium`)
      .find(existsSync);
    if (!executablePath) throw defaultLaunchError;
    return chromium.launch({ executablePath, args: ['--no-sandbox'] });
  }
}

test('veteran pageviews and events never expose the journal capability', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await Promise.all([startApp(), launchBrowser()]);
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    const requestedJournalIds: string[] = [];

    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.route('**/.netlify/functions/watch-journal?*', async route => {
      const url = new URL(route.request().url());
      requestedJournalIds.push(url.searchParams.get('journal') ?? '');
      const audience = url.searchParams.get('audience');
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(audience === 'targets'
          ? {
              series: { id: 'the-untamed', title: 'The Untamed' },
              targets: {
                entries: [{
                  id: 'entry-1',
                  entryId: 'entry-1',
                  episodeStart: 1,
                  episodeEnd: 4,
                }],
                predictions: [],
              },
            }
          : { submissions: [] }),
      });
    });

    await page.goto(
      `${origin}/vibe-atlas/veteran-journal?journal=${JOURNAL_CAPABILITY}&source=private`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.locator('option[value="entry:entry-1"]').waitFor({ state: 'attached' });
    await page.getByLabel('Related journal moment').selectOption('entry:entry-1');

    assert.equal(page.url(), `${origin}/vibe-atlas/veteran-journal`);
    assert.ok(requestedJournalIds.length >= 2);
    assert.ok(requestedJournalIds.every(value => value === JOURNAL_CAPABILITY));

    const dataLayer = await page.evaluate(() => {
      const values = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
      return values.map(value => {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object' && 'length' in value) {
          return Array.from(value as ArrayLike<unknown>);
        }
        return value;
      });
    });
    const serialized = JSON.stringify(dataLayer);
    assert.doesNotMatch(serialized, new RegExp(JOURNAL_CAPABILITY));

    const config = dataLayer.find(
      value => Array.isArray(value) && value[0] === 'config',
    ) as unknown[] | undefined;
    assert.deepEqual(config, [
      'config',
      'G-CGWB67360Q',
      { page_location: `${origin}/vibe-atlas/veteran-journal` },
    ]);

    for (const eventName of ['veteran_form_started', 'veteran_relation_selected']) {
      const event = dataLayer.find(
        value => Array.isArray(value) && value[0] === 'event' && value[1] === eventName,
      ) as unknown[] | undefined;
      assert.equal(
        (event?.[2] as { page_location?: string } | undefined)?.page_location,
        `${origin}/vibe-atlas/veteran-journal`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
});