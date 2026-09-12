import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { chromium, type Browser } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const ARCHIVED_DATE = '2026-08-31';

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

function starOfDay(date: string) {
  return {
    actorId: 'browser-archive-actor',
    actorName: 'Browser Archive Actor',
    actorShortNameEn: 'Browser Archive Actor',
    actorAccentColor: '#aabbcc',
    vibeEmoji: '🧪',
    vibeLabel: 'Browser Archive Vibe',
    vibeLabelEn: 'Browser Archive Vibe',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    rankedBatches: [{
      query: 'browser archive test',
      results: [{
        title: 'Browser archive card',
        thumbnail: 'https://images.browser-archive.test/card.jpg',
        link: 'https://browser-archive.test/card',
        source: 'browser-archive.test',
      }],
      count: 1,
      distinctSources: 1,
      provider: null,
    }],
    date,
  };
}

test('archived edition copy uses its date and announces clipboard success or failure', { timeout: 30_000 }, async () => {
  const [{ server, origin }, browser] = await Promise.all([startApp(), launchBrowser()]);
  try {
    const page = await browser.newPage();
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    await page.route('**/api/auth/session', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: null }),
    }));
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'inactive', isMember: false }),
    }));
    await page.route('**/.netlify/functions/star-of-day**', async route => {
      const url = new URL(route.request().url());
      const response = url.searchParams.get('archive') === '1'
        ? {
            editions: [{
              date: ARCHIVED_DATE,
              actorName: 'Browser Archive Actor',
              actorShortNameEn: 'Browser Archive Actor',
              vibeEmoji: '🧪',
              vibeLabel: 'Browser Archive Vibe',
              vibeLabelEn: 'Browser Archive Vibe',
              vibeSubtitleEn: '',
            }],
          }
        : starOfDay(url.searchParams.get('date') ?? '2026-09-02');
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(response),
      });
    });

    await page.goto(`${origin}/vibe-atlas`, { waitUntil: 'domcontentloaded' });
    await page.getByText("Today's curated card drop").waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Copy archived edition link' }).count(),
      0,
      'today must not show the archived-edition copy action',
    );

    await page.getByRole('button', { name: /Browse past editions/ }).click();
    await page.getByRole('button', { name: /Aug 31, 2026/ }).click();
    await page.getByText('Archived card drop · Aug 31, 2026').waitFor();

    await page.evaluate(`
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async function (text) {
            window.__archiveClipboardWrites = (window.__archiveClipboardWrites || []).concat(text);
          }
        }
      });
    `);
    await page.getByRole('button', { name: 'Copy archived edition link' }).click();
    await page.getByText('Copied link for Aug 31, 2026.', { exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate('window.__archiveClipboardWrites'),
      [`${origin}/vibe-atlas?date=${ARCHIVED_DATE}`],
      'the clipboard must receive the exact date-aware archive URL',
    );

    await page.evaluate(`
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async function () {
            throw new Error("clipboard denied");
          }
        }
      });
    `);
    await page.getByRole('button', { name: 'Copy archived edition link' }).click();
    await page.getByText(
      'Could not copy this archived edition link. Please copy the address from your browser.',
      { exact: true },
    ).waitFor();

    await page.getByRole('button', { name: /Return to today/ }).click();
    await page.getByText("Today's curated card drop").waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Copy archived edition link' }).count(),
      0,
      'returning to today must remove the archived-edition copy action',
    );
  } finally {
    await browser.close();
    await server.close();
  }
});