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
    {
      name: 'English', path: '/c-drama-fandom/trope-decoder/index.html',
      title: 'The Xianxia Trope Decoder',
      text: 'Newcomers see: Certain death. Veterans know: She’d need amnesia to fall for him in this enemies-to-lovers arc.',
      success: 'Decoder ready to share.', copied: 'Public decoder link copied.',
      manual: 'Share this public link: ',
      cancelled: 'Sharing cancelled.',
      failed: 'Sharing did not complete. You can copy the public page URL from your browser.',
    },
    {
      name: 'Simplified Chinese', path: '/zh-cn/c-drama-fandom/trope-decoder/index.html',
      title: '仙侠套路解码器',
      text: '新人看到：坠崖，命悬一线。老观众知道：这对“仇人”还得先失忆一次，才能重新谈恋爱。',
      success: '分享已准备好。', copied: '已复制公开解码器链接。',
      manual: '复制未完成。你可以手动复制这个公开链接：',
      cancelled: '分享已取消。你仍可从地址栏复制此页面链接。',
      failed: '分享未能完成。你可以从地址栏复制此公开页面链接。',
    },
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
            await gotoTestPage(page, `${origin}${locale.path}?token=private-reader-content#context?filter=love&card=three-lifetimes`, {
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
                value: mode.startsWith('native') ? async (data) => {
                  window.__decoderShare = data;
                  if (mode === 'native-cancel') fail('AbortError');
                  if (mode === 'native-failure') fail('NotAllowedError');
                } : undefined,
              });
              Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: mode.startsWith('clipboard') ? { writeText: async (url) => {
                  window.__decoderCopied = url;
                  if (mode === 'clipboard-abort') fail('AbortError');
                  if (mode === 'clipboard-failure') fail('NotAllowedError');
                } } : undefined,
              });
              document.execCommand = () => {
                 window.__decoderCopied = document.querySelector('textarea').value;
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
            const publicUrl = `https://fandom.justlikekatie.com${locale.path.replace('index.html', '')}`;
            const expectedStatus = scenario.mode === 'native-success' ? locale.success
              : scenario.mode === 'native-cancel' ? locale.cancelled
              : scenario.mode === 'fallback-false' ? `${locale.manual}${publicUrl}`
              : scenario.event === 'decoder_share_succeeded' ? locale.copied
              : locale.failed;
            assert.equal(await page.locator('#share-status').textContent(), expectedStatus);
            const payload = await page.evaluate(() => {
              const state = window as Window & {
                __decoderShare?: Record<string, string>; __decoderCopied?: string;
              };
              return { shared: state.__decoderShare, copied: state.__decoderCopied };
            });
            if (scenario.method === 'native') {
              assert.deepEqual(payload.shared, { title: locale.title, text: locale.text, url: publicUrl });
            } else {
              assert.equal(payload.copied, publicUrl);
            }
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