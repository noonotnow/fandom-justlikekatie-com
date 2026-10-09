import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Page } from '@playwright/test';
import {
  gotoTestPage,
  BROWSER_ENGINES,
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

type AnalyticsCommand = [string, string, Record<string, unknown>];

async function startApp() {
  return startViteTestServer();
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

for (const engine of BROWSER_ENGINES) {
  test(`trope decoder sends bounded GA4 filter and privacy-safe share success events in ${engine.name}`, { timeout: 45_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startApp(), engine.type);
    try {
      const nativePage = await browser.newPage();
      await nativePage.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(nativePage, `${origin}/c-drama-fandom/trope-decoder/index.html`, {
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
      const nativeShareEvent = nativeCommands.find(command => command[1] === 'decoder_share_succeeded');
      assert.deepEqual(nativeShareEvent, [
        'event',
        'decoder_share_succeeded',
        { method: 'native' },
      ]);
      assert.doesNotMatch(JSON.stringify(nativeShareEvent), /url|account|name|text/i);

      const copyPage = await browser.newPage();
      await copyPage.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(copyPage, `${origin}/c-drama-fandom/trope-decoder/index.html`, {
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
      const copyShareEvent = copyCommands.find(command => command[1] === 'decoder_share_succeeded');
      assert.deepEqual(copyShareEvent, [
        'event',
        'decoder_share_succeeded',
        { method: 'copy' },
      ]);
      assert.doesNotMatch(JSON.stringify(copyShareEvent), /url|account|name|text/i);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  for (const locale of [
    { name: 'English', path: '/c-drama-fandom/trope-decoder/index.html', success: 'Decoder ready to share.' },
    { name: 'Simplified Chinese', path: '/zh-cn/c-drama-fandom/trope-decoder/index.html', success: '分享已准备好。' },
  ]) {
  test(`decoder share outcomes are exclusive, bounded, retryable, and privacy-safe in ${engine.name} (${locale.name})`, { timeout: 90_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startApp(), engine.type);
    const scenarios = [
      { mode: 'native-success', event: 'decoder_share_succeeded', method: 'native' },
      { mode: 'native-cancel', event: 'decoder_share_cancelled', method: 'native' },
      { mode: 'native-failure', event: 'decoder_share_failed', method: 'native' },
      { mode: 'clipboard-success', event: 'decoder_share_succeeded', method: 'copy' },
      { mode: 'clipboard-failure', event: 'decoder_share_failed', method: 'copy' },
      { mode: 'clipboard-abort', event: 'decoder_share_failed', method: 'copy' },
      { mode: 'fallback-success', event: 'decoder_share_succeeded', method: 'copy' },
      { mode: 'fallback-false', event: 'decoder_share_failed', method: 'copy' },
      { mode: 'fallback-throw', event: 'decoder_share_failed', method: 'copy' },
    ];
    try {
      // Cover the normal gtag path and the wrapper's dataLayer fallback.
      for (const transport of ['gtag', 'dataLayer']) {
        for (const scenario of scenarios) {
          const page = await browser.newPage();
          try {
            await page.route('https://www.googletagmanager.com/**', route => route.abort());
            await gotoTestPage(page, `${origin}${locale.path}`, {
              waitUntil: 'domcontentloaded',
            });
            await page.evaluate(`(() => {
              const mode = ${JSON.stringify(scenario.mode)};
              const transport = ${JSON.stringify(transport)};
              const analyticsWindow = window;
              analyticsWindow.dataLayer = [];
              analyticsWindow.gtag = transport === 'gtag'
                ? (...args) => { analyticsWindow.dataLayer.push(args); }
                : undefined;
              const fail = (name) => {
                const error = new Error('private-reader-content account-id https://private.example/');
                error.name = name;
                throw error;
              };
              Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: mode.startsWith('native') ? async () => {
                  if (mode === 'native-cancel') fail('AbortError');
                  if (mode === 'native-failure') fail('NotAllowedError');
                } : undefined,
              });
              Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: mode.startsWith('clipboard') ? { writeText: async () => {
                  if (mode === 'clipboard-abort') fail('AbortError');
                  if (mode === 'clipboard-failure') fail('NotAllowedError');
                } } : undefined,
              });
              document.execCommand = () => {
                if (mode === 'fallback-throw') fail('private-error-name');
                return mode === 'fallback-success';
              };
            })()`);
            const button = page.locator('#share-decoder');
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              // Keep the outcome matrix keyboard-driven; pointer activation is
              // exercised by the success and localized decoder tests above.
              await button.focus();
              await button.press('Enter');
              await page.waitForFunction(expectedCount => {
                const events = (window as Window & { dataLayer?: unknown[] }).dataLayer ?? [];
                return events.length === expectedCount;
              }, attempt);
              await page.waitForFunction(() => !(document.querySelector('#share-decoder') as HTMLButtonElement).disabled);
              const commands = await analyticsCommands(page);
              assert.deepEqual(commands, Array.from({ length: attempt }, () => [
                'event', scenario.event, { method: scenario.method },
              ]), `${transport}: ${scenario.mode}`);
              assert.doesNotMatch(JSON.stringify(commands), /https?:|url|private|account|message|text|name/i);
              assert.equal(await page.locator('textarea').count(), 0, 'fallback scratchpad is removed');
            }
            assert.ok(await page.locator('#share-status').textContent());
          } finally {
            await page.close();
          }
        }
      }
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`analytics failures do not turn a completed share into failure or block retry in ${engine.name} (${locale.name})`, { timeout: 45_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startApp(), engine.type);
    try {
      const page = await browser.newPage();
      await page.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(page, `${origin}${locale.path}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(`(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: async () => {} });
        window.gtag = () => { throw new Error('Analytics unavailable'); };
      })()`);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.locator('#share-decoder').click();
        await page.waitForFunction(() => !(document.querySelector('#share-decoder') as HTMLButtonElement).disabled);
        assert.equal(await page.locator('#share-status').textContent(), locale.success);
      }
      assert.deepEqual(await analyticsCommands(page), []);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
  }
}