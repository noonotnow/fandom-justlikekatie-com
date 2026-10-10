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

const expectedCardIds = [
  'cliff-of-amnesia',
  'three-lifetimes',
  'heavenly-bureaucracy',
  'tribulation-forecast',
  'mortal-arc',
  'warm-soup',
  'vow-fine-print',
  'useful-sect',
  'eight-words',
  'cultivation-level-up',
  'sword-with-opinions',
  'fox-spirit-reveal',
  'tragic-filing-cabinet',
  'fate-receipts',
];

for (const engine of BROWSER_ENGINES) {
  for (const locale of [
    {
      name: 'English', path: '/c-drama-fandom/trope-decoder/',
      otherPath: '/zh-cn/c-drama-fandom/trope-decoder/',
      count: (visible: number) => `Showing ${visible} of 14 tropes`,
    },
    {
      name: 'Simplified Chinese', path: '/zh-cn/c-drama-fandom/trope-decoder/',
      otherPath: '/c-drama-fandom/trope-decoder/',
      count: (visible: number) => `当前显示 ${visible} / 14 条套路`,
    },
  ]) {
    test(`${locale.name} decoder sanitizes context and keeps filter state and analytics aligned in ${engine.name}`, { timeout: 120_000 }, async () => {
      const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer(), engine.type);
      try {
        const page = await browser.newPage();
        await page.route('https://www.googletagmanager.com/**', route => route.abort());
        for (const context of [
          { hash: '#context?filter=unknown&card=unknown&token=private-secret', filter: 'all', card: '' },
          { hash: '#context?filter=signs&card=fox-spirit-reveal&query=private-secret', filter: 'signs', card: 'fox-spirit-reveal' },
          { hash: '#three-lifetimes', filter: 'all', card: 'three-lifetimes' },
        ]) {
          // Hash-only navigation keeps the old document and does not reinitialize
          // context; each fixture represents a newly opened language page.
          await gotoTestPage(page, 'about:blank');
          await gotoTestPage(page, `${origin}${locale.path}?account=private-secret${context.hash}`, { waitUntil: 'domcontentloaded' });
          assert.deepEqual(await analyticsCommands(page), [], 'restoring context is not a filter interaction');
          assert.deepEqual(await page.locator('.trope-card').evaluateAll(cards => cards.map(card => card.id)), expectedCardIds);
          assert.equal(await page.locator('#trope-search').inputValue(), '');
          assert.equal(await page.locator('.decoder-filter[aria-pressed="true"]').getAttribute('data-filter'), context.filter);
          const fragment = context.card
            ? `#context?${context.filter === 'all' ? '' : `filter=${context.filter}&`}card=${context.card}`
            : '';
          assert.equal(await page.locator('[data-language-link]').getAttribute('href'), `${locale.otherPath}${fragment}`);
        }
        // A fresh page starts with all cards, without an analytics event.
        await gotoTestPage(page, `${origin}${locale.path}`, { waitUntil: 'domcontentloaded' });
        for (const [category, visible] of [['love', 5], ['realm', 5], ['signs', 4], ['all', 14]] as const) {
          const button = page.locator(`[data-filter="${category}"]`);
          await button.click();
          assert.equal(await page.locator('#trope-count').textContent(), locale.count(visible));
          assert.equal(await page.locator('.trope-card:not([hidden])').count(), visible);
          assert.equal(await page.locator('.decoder-filter[aria-pressed="true"]').count(), 1);
          assert.equal(await button.getAttribute('aria-pressed'), 'true');
          const commands = await analyticsCommands(page);
          assert.deepEqual(commands.at(-1), ['event', 'trope_filter_used', {
            category, query_present: false, result_count: visible,
          }]);
          await button.click();
          assert.deepEqual(await analyticsCommands(page), commands, 'unchanged filter state is deduplicated');
        }
        await page.locator('#trope-search').fill('private-secret-no-match');
        assert.equal(await page.locator('#trope-count').textContent(), locale.count(0));
        assert.equal(await page.locator('#trope-empty').isVisible(), true);
        assert.equal(await page.locator('[data-language-link]').getAttribute('href'), `${locale.otherPath}#context?filter=all`);
        assert.doesNotMatch(JSON.stringify(await analyticsCommands(page)), /private-secret|account|query_text|search_text/);
        await page.locator('#trope-search').fill('');
        assert.equal(await page.locator('#trope-count').textContent(), locale.count(14));
        assert.equal(await page.locator('#trope-empty').isVisible(), false);
        assert.equal(await page.locator('[data-language-link]').getAttribute('href'), locale.otherPath);
      } finally {
        await closeBrowserAndServer(browser, server);
      }
    });
  }

  test(`Simplified Chinese decoder preserves its public identity and bilingual filter context in ${engine.name}`, { timeout: 120_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer(), engine.type);
    try {
      const page = await browser.newPage();
      await page.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(page, `${origin}/zh-cn/c-drama-fandom/trope-decoder/index.html`, {
        waitUntil: 'domcontentloaded',
      });

      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
      assert.equal(
        await page.locator('link[rel="canonical"]').getAttribute('href'),
        'https://fandom.justlikekatie.com/zh-cn/c-drama-fandom/trope-decoder/',
      );
      assert.equal(
        await page.locator('link[rel="alternate"][hreflang="en"]').getAttribute('href'),
        'https://fandom.justlikekatie.com/c-drama-fandom/trope-decoder/',
      );
      assert.equal(
        await page.locator('link[rel="alternate"][hreflang="zh-CN"]').getAttribute('href'),
        'https://fandom.justlikekatie.com/zh-cn/c-drama-fandom/trope-decoder/',
      );
      assert.deepEqual(
        await page.locator('.trope-card').evaluateAll(cards => cards.map(card => card.id)),
        expectedCardIds,
      );
      assert.equal(await page.locator('.trope-card').count(), 14);
      const cardShapes = await page.locator('.trope-card').evaluateAll(cards => cards.map(card => ({
        category: card.getAttribute('data-category'),
        search: card.getAttribute('data-search'),
        newcomer: card.querySelector('.trope-card__newcomer')?.textContent?.trim(),
        veteran: card.querySelector('.trope-card__veteran')?.textContent?.trim(),
        explanation: card.querySelector('.trope-card__example')?.textContent?.trim(),
      })));
      assert.equal(cardShapes.every(card => (
        ['love', 'realm', 'signs'].includes(card.category || '')
        && Boolean(card.search)
        && Boolean(card.newcomer)
        && Boolean(card.veteran)
        && Boolean(card.explanation)
      )), true);

      await page.getByRole('button', { name: '爱情与误会' }).click();
      await page.getByLabel('搜索解码器').fill('轮回');
      assert.equal(await page.locator('#trope-count').textContent(), '当前显示 1 / 14 条套路');
      assert.equal(await page.locator('#trope-list .trope-card:not([hidden])').getAttribute('id'), 'three-lifetimes');
      assert.equal(await page.getByRole('button', { name: '爱情与误会' }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#trope-empty').isVisible(), false);

      const englishLink = page.getByRole('link', { name: 'Read this page in English' });
      const englishHref = await englishLink.getAttribute('href');
      assert.ok(englishHref);
      assert.doesNotMatch(englishHref, /轮回/);
      const safeContext = new URL(englishHref, origin);
      assert.equal(safeContext.search, '');
      assert.equal(safeContext.hash, '#context?filter=love&card=three-lifetimes');
      assert.doesNotMatch(safeContext.href, /capability|token|account|email/i);

      await englishLink.click();
      await page.waitForURL(url => (
        url.pathname === '/c-drama-fandom/trope-decoder/'
        && url.hash === '#context?filter=love&card=three-lifetimes'
      ));
      assert.equal(await page.locator('html').getAttribute('lang'), 'en');
      assert.deepEqual(
        await page.locator('.trope-card').evaluateAll(cards => cards.map(card => card.id)),
        expectedCardIds,
      );
      assert.equal(await page.getByLabel('Search the decoder').inputValue(), '');
      assert.equal(await page.getByRole('button', { name: 'Love & misunderstandings' }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#trope-count').textContent(), 'Showing 5 of 14 tropes');
      assert.equal(await page.locator('#three-lifetimes').isVisible(), true);

      await page.getByRole('link', { name: 'Read this page in Simplified Chinese' }).click();
      await page.waitForURL(url => (
        url.pathname === '/zh-cn/c-drama-fandom/trope-decoder/'
        && url.hash === '#context?filter=love&card=three-lifetimes'
      ));
      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
      assert.equal(await page.getByLabel('搜索解码器').inputValue(), '');
      assert.equal(await page.getByRole('button', { name: '爱情与误会' }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#trope-count').textContent(), '当前显示 5 / 14 条套路');
      assert.equal(await page.locator('#three-lifetimes').isVisible(), true);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });

  test(`Simplified Chinese decoder keeps bounded filter and sharing analytics in ${engine.name}`, { timeout: 120_000 }, async () => {
    const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer(), engine.type);
    try {
      const nativePage = await browser.newPage();
      await nativePage.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(nativePage, `${origin}/zh-cn/c-drama-fandom/trope-decoder/index.html`, {
        waitUntil: 'domcontentloaded',
      });
      await nativePage.evaluate(`
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async function (data) {
            window.__sharedDecoder = data;
          }
        });
      `);
      await nativePage.getByRole('button', { name: '爱情与误会' }).click();
      await nativePage.getByLabel('搜索解码器').fill('轮回');
      await nativePage.getByRole('button', { name: '分享这份解码器' }).click();

      const filterCommands = await analyticsCommands(nativePage);
      const filterEvent = filterCommands.findLast(command => command[1] === 'trope_filter_used');
      assert.deepEqual(filterEvent, [
        'event',
        'trope_filter_used',
        { category: 'love', query_present: true, result_count: 1 },
      ]);
      assert.doesNotMatch(JSON.stringify(filterEvent), /轮回|query_text|search_text|url|account|name/i);
      const nativeShare = await nativePage.evaluate(
        () => (window as Window & { __sharedDecoder?: Record<string, string> }).__sharedDecoder,
      );
      assert.deepEqual(nativeShare, {
        title: '仙侠套路解码器',
        text: '新人看到：坠崖，命悬一线。老观众知道：这对“仇人”还得先失忆一次，才能重新谈恋爱。',
        url: 'https://fandom.justlikekatie.com/zh-cn/c-drama-fandom/trope-decoder/',
      });
      const nativeShareEvent = filterCommands.find(command => command[1] === 'decoder_share_succeeded');
      assert.deepEqual(nativeShareEvent, [
        'event',
        'decoder_share_succeeded',
        { method: 'native' },
      ]);
      assert.doesNotMatch(JSON.stringify(nativeShareEvent), /url|account|name|text|轮回/i);
      await nativePage.getByLabel('搜索解码器').fill('这里没有对应的套路');
      assert.equal(await nativePage.locator('#trope-count').textContent(), '当前显示 0 / 14 条套路');
      assert.equal(await nativePage.locator('#trope-empty').isVisible(), true);
      const emptySearchEvent = (await analyticsCommands(nativePage))
        .findLast(command => command[1] === 'trope_filter_used');
      assert.deepEqual(emptySearchEvent, [
        'event',
        'trope_filter_used',
        { category: 'love', query_present: true, result_count: 0 },
      ]);
      assert.doesNotMatch(JSON.stringify(emptySearchEvent), /这里没有|search_text|query_text/i);

      const copyPage = await browser.newPage();
      await copyPage.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(copyPage, `${origin}/zh-cn/c-drama-fandom/trope-decoder/index.html`, {
        waitUntil: 'domcontentloaded',
      });
      await copyPage.evaluate(`
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: undefined
        });
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async function (url) {
            window.__copiedDecoderUrl = url;
          } }
        });
      `);
      await copyPage.getByRole('button', { name: '分享这份解码器' }).click();
      assert.equal(await copyPage.getByRole('status').filter({ hasText: '已复制公开解码器链接' }).count(), 1);
      assert.equal(
        await copyPage.evaluate(() => (window as Window & { __copiedDecoderUrl?: string }).__copiedDecoderUrl),
        'https://fandom.justlikekatie.com/zh-cn/c-drama-fandom/trope-decoder/',
      );
      assert.deepEqual(
        (await analyticsCommands(copyPage)).find(command => command[1] === 'decoder_share_succeeded'),
        ['event', 'decoder_share_succeeded', { method: 'copy' }],
      );

      const cancelledPage = await browser.newPage();
      await cancelledPage.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(cancelledPage, `${origin}/zh-cn/c-drama-fandom/trope-decoder/index.html`, {
        waitUntil: 'domcontentloaded',
      });
      await cancelledPage.evaluate(`
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async function () {
            throw new DOMException("cancelled", "AbortError");
          }
        });
      `);
      await cancelledPage.getByRole('button', { name: '分享这份解码器' }).click();
      await cancelledPage.waitForFunction(() =>
        document.getElementById('share-status')?.textContent?.includes('分享已取消'),
      );
      assert.match(await cancelledPage.locator('#share-status').textContent() || '', /分享已取消/);
      assert.deepEqual(await analyticsCommands(cancelledPage), [
        ['event', 'decoder_share_cancelled', { method: 'native' }],
      ]);
      assert.equal(
        (await analyticsCommands(cancelledPage)).some(command => command[1] === 'decoder_share_succeeded'),
        false,
      );

      const failedSharePage = await browser.newPage();
      await failedSharePage.route('https://www.googletagmanager.com/**', route => route.abort());
      await gotoTestPage(failedSharePage, `${origin}/zh-cn/c-drama-fandom/trope-decoder/index.html`, {
        waitUntil: 'domcontentloaded',
      });
      await failedSharePage.evaluate(`
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async function () {
            const failure = new Error("not allowed");
            failure.name = "NotAllowedError";
            throw failure;
          }
        });
      `);
      await failedSharePage.getByRole('button', { name: '分享这份解码器' }).click();
      await failedSharePage.waitForFunction(() =>
        !(document.getElementById('share-decoder') as HTMLButtonElement).disabled,
      );
      assert.equal(
        await failedSharePage.locator('#share-status').textContent(),
        '分享未能完成。你可以从地址栏复制此公开页面链接。',
      );
      assert.deepEqual(await analyticsCommands(failedSharePage), [
        ['event', 'decoder_share_failed', { method: 'native' }],
      ]);
      assert.equal(
        (await analyticsCommands(failedSharePage)).some(command => command[1] === 'decoder_share_succeeded'),
        false,
      );
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}