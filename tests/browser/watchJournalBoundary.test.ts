import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { test } from 'node:test';
import { chromium, type Browser } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createTcpServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (!address || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not reserve a test port.')));
        return;
      }
      probe.close(error => error ? reject(error) : resolve(address.port));
    });
  });
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port, strictPort: true },
  });
  await server.listen();
  return { server, origin: `http://127.0.0.1:${port}` };
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

test('an episode-range share page caps a previously saved later boundary', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await Promise.all([startApp(), launchBrowser()]);
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
    await browser.close();
    await server.close();
  }
});