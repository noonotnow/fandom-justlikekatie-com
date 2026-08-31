import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { test } from 'node:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

type AnalyticsCommand = [string, string, Record<string, unknown>];

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

async function analyticsCommands(page: Page): Promise<AnalyticsCommand[]> {
  return page.evaluate(() => {
    const values = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
    return values
      .map(value => {
        if (Array.isArray(value)) return value;
        if (value && typeof value === 'object' && 'length' in value) {
          return Array.from(value as ArrayLike<unknown>);
        }
        return value;
      })
      .filter((value): value is AnalyticsCommand => (
        Array.isArray(value)
        && value[0] === 'event'
        && typeof value[1] === 'string'
        && Boolean(value[2])
        && typeof value[2] === 'object'
      ));
  });
}

test('trope decoder sends bounded GA4 filter and share outcomes', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await Promise.all([startApp(), launchBrowser()]);
  try {
    const nativePage = await browser.newPage();
    await nativePage.route('https://www.googletagmanager.com/**', route => route.abort());
    await nativePage.goto(`${origin}/c-drama-fandom/trope-decoder/index.html`, {
      waitUntil: 'domcontentloaded',
    });
    await nativePage.evaluate(`
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async function () {}
      });
    `);

    await nativePage.getByRole('button', { name: 'Love & misunderstandings' }).click();
    await nativePage.getByLabel('Search the decoder').fill('memory');
    await nativePage.getByRole('button', { name: 'Share this decoder' }).click();

    const nativeCommands = await analyticsCommands(nativePage);
    const filterEvent = nativeCommands.findLast(command => command[1] === 'trope_filter_used');
    assert.deepEqual(filterEvent, [
      'event',
      'trope_filter_used',
      { category: 'love', query_present: true, result_count: 1 },
    ]);
    assert.doesNotMatch(JSON.stringify(filterEvent), /memory|query_text|search_text|url|account|name/i);
    assert.deepEqual(
      nativeCommands.find(command => command[1] === 'trope_decoder_shared'),
      ['event', 'trope_decoder_shared', { method: 'native' }],
    );

    const copyPage = await browser.newPage();
    await copyPage.route('https://www.googletagmanager.com/**', route => route.abort());
    await copyPage.goto(`${origin}/c-drama-fandom/trope-decoder/index.html`, {
      waitUntil: 'domcontentloaded',
    });
    await copyPage.evaluate(`
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async function () {} }
      });
    `);
    await copyPage.getByRole('button', { name: 'Share this decoder' }).click();

    const copyCommands = await analyticsCommands(copyPage);
    assert.deepEqual(
      copyCommands.find(command => command[1] === 'trope_decoder_shared'),
      ['event', 'trope_decoder_shared', { method: 'copy' }],
    );
  } finally {
    await browser.close();
    await server.close();
  }
});