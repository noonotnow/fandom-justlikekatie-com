import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect, type Page } from '@playwright/test';
import { assertDailyDropRenderedLayout } from './dailyDropLayoutChecks.ts';
import {
  BROWSER_ENGINES, closeBrowserAndServer, gotoTestPage,
  launchPageForServer, startViteTestServer,
} from './browserEngines.ts';

const DATE = '2026-09-25';
const FIXTURE_IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#b89155"/></svg>';
const board = {
  actorId: 'layout-actor', actorName: '测试演员', actorShortNameEn: 'Layout Actor',
  actorAccentColor: '#b89155', vibeIdx: 1, vibeEmoji: '',
  vibeLabel: '月下氛围', vibeLabelEn: 'Moonlit mood',
  vibeSubtitle: '中文氛围说明', vibeSubtitleEn: 'English vibe description',
  vibeSupportingCopy: '中文补充说明', vibeSupportingCopyEn: 'English supporting description',
  date: DATE, generatedAt: `${DATE}T12:00:00.000Z`,
  rankedBatches: [{
    query: 'layout fixture', provider: 'primary', count: 9, distinctSources: 4,
    results: Array.from({ length: 9 }, (_, index) => ({
      imageId: `layout-image-${index}`, title: `Layout image ${index}`,
      thumbnail: `https://images.layout-test/${index}.png`,
      link: `https://source.layout-test/${index}`, source: `Publisher ${index % 4}`,
    })),
  }],
};

async function installFixtures(page: Page, options: {
  state?: 'empty' | 'error' | 'loading' | 'stale' | 'gated';
  publication?: 'snapshot' | 'published' | 'unavailable' | 'unpublished';
  boardForDate?: (date: string | null) => typeof board;
} = {}) {
  await page.route('**/api/membership/status', route => route.fulfill({
    json: { state: 'inactive', isMember: false, capabilities: [] },
  }));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null } }));
  await page.route('**/.netlify/functions/public-archive-inventory**', route => route.fulfill({
    status: 404, json: { fallback: 'legacy_unverified_edition' },
  }));
  await page.route('**/.netlify/functions/star-of-day**', async route => {
    const displayedBoard = options.boardForDate?.(new URL(route.request().url()).searchParams.get('date')) ?? board;
    if (options.state === 'loading') return;
    if (options.state === 'error') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    if (options.state === 'gated') return route.fulfill({
      status: 401, json: { access: 'sign_in', edition: {
        date: DATE, actorName: board.actorName, vibeLabel: board.vibeLabel,
        vibeLabelEn: board.vibeLabelEn, vibeEmoji: '', previewThumbnails: [],
      } },
    });
    return route.fulfill({ json: {
      ...displayedBoard,
      ...(options.state === 'stale' ? { stale: true } : {}),
      ...(options.state === 'empty' ? { rankedBatches: [{ ...board.rankedBatches[0], results: [] }] } : {}),
    } });
  });
  await page.route('**/.netlify/functions/public-released-pack-preview**', route => {
    if (options.publication === 'unavailable' || options.publication === 'unpublished') {
      return route.fulfill({ status: options.publication === 'unpublished' ? 404 : 503, json: {} });
    }
    const cards = Array.from({ length: 9 }, (_, index) => ({
      thumbnailUrl: `https://images.layout-test/first-${index}.png`, title: `First publication ${index}`,
    }));
    return route.fulfill({ json: options.publication === 'published' ? {
      kind: 'vibe-atlas-released-pack',
      canonical: 'https://fandom.justlikekatie.com/vibe-atlas/packs/layout-actor/moonlit',
      preview: { cards },
    } : {
      kind: 'vibe-atlas-daily-pack-snapshot',
      date: DATE, actorId: board.actorId, vibeIdx: board.vibeIdx, cards,
    } });
  });
  await page.route('**/.netlify/functions/image-proxy**', route => route.fulfill({ contentType: 'image/svg+xml', body: FIXTURE_IMAGE }));
  await page.route('https://images.layout-test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: FIXTURE_IMAGE }));
}

async function collectionCounts(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('vibe-atlas-collection', 3);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const counts = await Promise.all(['cards', 'grids'].map(store => new Promise<number>((resolve, reject) => {
      const count = db.transaction(store).objectStore(store).count();
      count.onsuccess = () => resolve(count.result);
      count.onerror = () => reject(count.error);
    })));
    db.close();
    return counts;
  });
}

for (const engine of BROWSER_ENGINES) {
for (const locale of ['en', 'zh-CN'] as const) {
  test(`Daily Drop reaction stays board-scoped across rerenders and edition switches in ${engine.name}, ${locale}`, { timeout: 60_000, concurrency: false }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await page.clock.setFixedTime(new Date(`${DATE}T12:00:00.000Z`));
      // Keep the image composition identical: the edition/actor/vibe identity,
      // not a different set of image URLs, must invalidate the old reaction.
      const nextBoard = {
        ...board, date: '2026-09-24', generatedAt: '2026-09-24T12:00:00.000Z',
        actorId: 'second-layout-actor', actorName: '另一位演员', actorShortNameEn: 'Second Layout Actor',
        vibeIdx: 2, vibeLabel: '晨光氛围', vibeLabelEn: 'Morning mood',
      };
      const requests: (string | null)[] = [];
      const mutations: string[] = [];
      await page.route(/\/(?:api\/|\.netlify\/functions\/)/, async route => {
        if (['GET', 'HEAD'].includes(route.request().method())) return route.fallback();
        // Page/zoom engagement is expected, but stays entirely fixture-local.
        if (new URL(route.request().url()).pathname === '/.netlify/functions/log-engagement') {
          return route.fulfill({ json: { ok: true } });
        }
        mutations.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
        await route.fulfill({ status: 409, json: { error: 'No mutations allowed in reaction fixtures' } });
      });
      await installFixtures(page, {
        boardForDate: date => {
          requests.push(date);
          return date === nextBoard.date ? nextBoard : board;
        },
      });
      const pathname = `/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas`;
      await gotoTestPage(page, `${origin}${pathname}?date=${DATE}`);
      const drop = page.locator('.daily-drop');
      const actions = drop.locator('.daily-actions');
      const legendary = actions.getByRole('button', {
        name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true,
      });
      const misprint = actions.getByRole('button', {
        name: locale === 'en' ? '◇ Misprint' : '◇ 错版', exact: true,
      });
      await expect(drop.locator('.daily-grid .grid > [role="button"]')).toHaveCount(9);
      await legendary.click();
      await actions.getByRole('combobox').selectOption('every_image_belongs');
      await expect(legendary).toHaveAttribute('aria-pressed', 'true');
      assert.deepEqual(await collectionCounts(page), [0, 0], 'selecting a tier and reason must not save');

      // Opening/closing the zoom changes App state without remounting it or
      // fetching another edition; ordinary same-board rerenders retain both.
      const requestCount = requests.length;
      await drop.getByRole('button', { name: locale === 'en' ? /View whole grid/ : /查看完整九宫格/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(legendary).toHaveAttribute('aria-pressed', 'true');
      await expect(actions.getByRole('combobox')).toHaveValue('every_image_belongs');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(legendary).toHaveAttribute('aria-pressed', 'true');
      await expect(actions.getByRole('combobox')).toHaveValue('every_image_belongs');
      assert.equal(requests.length, requestCount, 'same-board rerenders do not fetch a replacement');
      assert.deepEqual(await collectionCounts(page), [0, 0], 'same-board rerenders must not save');

      // Exercise App's URL restoration in the same document. A full page.goto
      // would discard React state and could conceal a broken board-key guard.
      await page.evaluate(url => {
        window.history.pushState({}, '', url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, `${pathname}?date=${nextBoard.date}`);
      await expect.poll(() => requests.includes(nextBoard.date)).toBe(true);
      await expect(page.locator('.atlas-edition__meta')).toContainText(locale === 'en'
        ? nextBoard.actorShortNameEn : nextBoard.actorName);
      await expect(page.locator('.atlas-edition__meta')).toContainText(locale === 'en'
        ? nextBoard.vibeLabelEn : nextBoard.vibeLabel);
      await expect(drop.locator('.daily-grid .grid > [role="button"]')).toHaveCount(9);
      await expect(legendary).toHaveAttribute('aria-pressed', 'false');
      await expect(misprint).toHaveAttribute('aria-pressed', 'false');
      await expect(actions.getByRole('combobox')).toHaveCount(0);
      assert.deepEqual(await collectionCounts(page), [0, 0], 'switching boards must not save the previous board');

      // Reveal the new board's reason picker: merely hiding it when the tier
      // resets is not proof that the previous reason has been cleared.
      await legendary.click();
      await expect(actions.getByRole('combobox')).toHaveValue('');
      await actions.getByRole('combobox').selectOption('unforgettable_set');
      await expect(legendary).toHaveAttribute('aria-pressed', 'true');
      await expect(actions.getByRole('combobox')).toHaveValue('unforgettable_set');
      assert.deepEqual(await collectionCounts(page), [0, 0], 'reacting to the new board must not save either board');
      assert.deepEqual(mutations, [], 'reaction changes must not issue account or save mutations');
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}
}

// Register cases serially rather than launching the engine/viewport matrix with
// Promise.all. Each case releases its browser and server before the next starts.
const layoutCases = BROWSER_ENGINES.flatMap(engine => (
  (['en', 'zh-CN'] as const).flatMap(locale => (
    [390, 1280].flatMap(width => [900, 480].map(height => ({ engine, locale, width, height })))
  ))
));

for (const { engine, locale, width, height } of layoutCases) {
    test(`Daily Drop content and keyboard order stay unified in ${engine.name}, ${locale} at ${width}×${height}px`, { timeout: 60_000, concurrency: false }, async () => {
      const { server, origin } = await startViteTestServer();
      const { browser, page } = await launchPageForServer(server, engine.type);
      try {
        await page.setViewportSize({ width, height });
        await installFixtures(page);
        await gotoTestPage(page, `${origin}/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas`);
        const drop = page.locator('.daily-drop');
        const grid = drop.locator('.daily-grid');
        const actions = drop.locator('.daily-actions');
        await expect(grid.locator('.grid > [role="button"]')).toHaveCount(9);
        await expect(actions).toBeVisible();
        assert.equal(await page.locator('.daily-actions').count(), 1);
        const order = await page.evaluate(() => {
          const context = document.querySelector('.atlas-edition__meta')!;
          const grid = document.querySelector('.daily-grid')!;
          const actions = document.querySelector('.daily-actions')!;
          const discovery = document.querySelector('.daily-released-pack')!;
          return {
            contextFirst: Boolean(context.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING),
            gridFirst: Boolean(grid.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING),
            actionsFirst: Boolean(actions.compareDocumentPosition(discovery) & Node.DOCUMENT_POSITION_FOLLOWING),
            noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          };
        });
        assert.deepEqual(order, { contextFirst: true, gridFirst: true, actionsFirst: true, noOverflow: true });
        await expect(page.locator('.daily-released-pack__snapshot')).toBeVisible();
        await assertDailyDropRenderedLayout(page);
        await expect(drop.locator('.atlas-edition__supporting-copy')).toHaveText(locale === 'en'
          ? board.vibeSupportingCopyEn : board.vibeSupportingCopy);
        const guide = actions.locator('details');
        assert.equal(await guide.evaluate(el => (el as HTMLDetailsElement).open), false);
        const lastSave = grid.getByRole('button', { name: locale === 'en' ? 'Save item' : '收藏此项', exact: true }).last();
        // DOM and actual tab navigation both put card controls before reactions.
        await grid.locator('.grid > [role="button"]').last().focus();
        await page.keyboard.press('Tab');
        await expect(lastSave).toBeFocused();
        await page.keyboard.press('Tab');
         const misprint = actions.getByRole('button', { name: locale === 'en' ? '◇ Misprint' : '◇ 错版', exact: true });
         const legendary = actions.getByRole('button', { name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true });
         await expect(misprint).toBeFocused();
         await page.keyboard.press('Enter');
         await expect(misprint).toHaveAttribute('aria-pressed', 'true');
         await page.keyboard.press('Tab');
         await expect(legendary).toBeFocused();
         await page.keyboard.press('Enter');
         await expect(legendary).toHaveAttribute('aria-pressed', 'true');
         await expect(misprint).toHaveAttribute('aria-pressed', 'false');
         await page.keyboard.press('Tab');
         const reason = actions.getByRole('combobox');
         await expect(reason).toBeFocused();
         await reason.selectOption('every_image_belongs');
         await page.keyboard.press('Tab');
         await expect(guide.locator('summary')).toBeFocused();
        await page.keyboard.press('Enter');
         await expect.poll(() => guide.evaluate(el => (el as HTMLDetailsElement).open)).toBe(true);
        const snapshot = page.locator('.daily-released-pack__snapshot');
        await expect(snapshot).toBeVisible();
        assert.equal(await snapshot.evaluate(el => (el as HTMLDetailsElement).open), false);
         await expect(snapshot.locator('img').first()).toBeHidden();
        // Expanded guide and selected reaction can increase the actions' height.
        await assertDailyDropRenderedLayout(page);
         // Use native Tab traversal, not a sorted list of DOM controls.
         for (const name of locale === 'en'
           ? ['Share Spell Sheet', 'Download Spell Sheet as PNG', 'Handoff Publishing Grid']
           : ['分享氛围卡', '下载氛围卡 PNG 图片', '移交发布用九宫格']) {
           const control = actions.getByRole('button', { name, exact: true });
           await expect(control).toBeEnabled();
           await page.keyboard.press('Tab');
           await expect(control).toBeFocused();
         }
         await page.keyboard.press('Tab');
         await expect(page.locator('.daily-released-pack').getByRole('link', {
           name: locale === 'en' ? 'Explore this star’s released packs' : '探索这位演员的已发布氛围包',
           exact: true,
         })).toBeFocused();
         await page.keyboard.press('Tab');
         await expect(snapshot.locator('summary')).toBeFocused();
         await page.keyboard.press('Enter');
         await expect.poll(() => snapshot.evaluate(el => (el as HTMLDetailsElement).open)).toBe(true);
        await expect(snapshot.locator('img')).toHaveCount(9);
         await expect(snapshot.locator('img').first()).toBeVisible();
        await expect(actions.getByRole('combobox')).toHaveValue('every_image_belongs');
         await expect(legendary).toHaveAttribute('aria-pressed', 'true');
         await page.keyboard.press('Enter');
         await expect.poll(() => snapshot.evaluate(el => (el as HTMLDetailsElement).open)).toBe(false);
         await expect(snapshot.locator('img').first()).toBeHidden();
         await assertDailyDropRenderedLayout(page);
        assert.deepEqual(await collectionCounts(page), [0, 0], 'layout/guide/reactions/snapshot must not implicitly save anything');
        await grid.getByRole('button', { name: locale === 'en' ? /View whole grid/ : /查看完整九宫格/ }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
         await expect(page.getByRole('dialog')).toBeHidden();
        await expect(actions.getByRole('combobox')).toHaveValue('every_image_belongs');
         await expect(legendary).toHaveAttribute('aria-pressed', 'true');
      } finally {
        await closeBrowserAndServer(browser, server);
      }
    });

test(`Rendered layout guard rejects CSS reordering and overlap in ${engine.name}, ${locale} at ${width}×${height}px despite unchanged DOM order`, { timeout: 60_000, concurrency: false }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, engine.type);
  try {
    await page.setViewportSize({ width, height });
    await installFixtures(page);
    await gotoTestPage(page, `${origin}/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas`);
    await expect(page.locator('.daily-released-pack__snapshot')).toBeVisible();
    await assertDailyDropRenderedLayout(page);
    for (const fixture of [
      { name: 'CSS order', css: '.daily-drop { display: flex !important; flex-direction: column !important; } .daily-actions { order: -1 !important; }', error: /Whole-board actions must follow/ },
      { name: 'actions overlap', css: '.daily-actions { transform: translateY(-150px) !important; }', error: /Whole-board actions must follow/ },
      { name: 'escaped control', css: '.daily-actions__primary button:first-child { position: absolute !important; top: 0 !important; } .daily-drop { position: relative !important; }', error: /Whole-board control must follow/ },
      { name: 'discovery overlap', css: '.daily-released-pack { transform: translateY(-150px) !important; }', error: /Related-pack discovery must follow/ },
      { name: 'snapshot overlap', css: '.daily-released-pack__snapshot { position: fixed !important; top: 0 !important; }', error: /Collapsed snapshot must follow/ },
    ]) {
      const style = await page.addStyleTag({ content: fixture.css });
      try {
        assert.equal(await page.locator('.daily-grid').evaluate(grid => Boolean(
          grid.compareDocumentPosition(document.querySelector('.daily-actions')!)
          & Node.DOCUMENT_POSITION_FOLLOWING,
        )), true, `${fixture.name} preserves the old DOM-order check`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true, `${fixture.name} preserves the old overflow check`);
        await assert.rejects(() => assertDailyDropRenderedLayout(page), fixture.error, fixture.name);
      } finally {
        await style.evaluate(el => el.parentNode!.removeChild(el));
      }
      await assertDailyDropRenderedLayout(page);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
}

for (const engine of BROWSER_ENGINES) {
for (const locale of ['en', 'zh-CN'] as const) {
  test(`Attached board actions retain deliberate card saves and distinct exports in ${engine.name}, ${locale}`, { timeout: 60_000, concurrency: false }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);
    try {
      await installFixtures(page);
      await page.route('**/.netlify/functions/archive-image-save', async route => {
        const identity = route.request().postDataJSON();
        await route.fulfill({ json: { ...identity, allowed: true } });
      });
      await page.route('**/.netlify/functions/grid-exports**', route => route.fulfill({ json: { exports: [] } }));
      await page.addInitScript(`
        window.layoutSharedFiles = [];
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
          for (const file of data.files || []) {
            const url = URL.createObjectURL(file);
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              window.layoutSharedFiles.push({ name: file.name, type: file.type, width: image.naturalWidth, height: image.naturalHeight });
            } finally {
              URL.revokeObjectURL(url);
            }
          }
        } });
      `);
      await gotoTestPage(page, `${origin}/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas`);
      const actions = page.locator('.daily-drop .daily-actions');
      await expect(actions).toBeVisible();
      await actions.getByRole('button', { name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true }).click();
      await actions.getByRole('combobox').selectOption('unforgettable_set');
      assert.deepEqual(await collectionCounts(page), [0, 0], 'choosing a reaction is not a save');
      const cardSave = page.locator('.daily-grid .grid > [role="button"]').first()
        .getByRole('button', { name: locale === 'en' ? 'Save item' : '收藏此项', exact: true });
      await cardSave.click();
      await expect(page.locator('.daily-grid').getByRole('button', {
        name: locale === 'en' ? 'Remove from saved' : '从收藏中移除', exact: true,
      })).toHaveCount(1);
      assert.deepEqual(await collectionCounts(page), [1, 0]);
      const downloadButton = actions.getByRole('button', {
        name: locale === 'en' ? 'Download Spell Sheet as PNG' : '下载氛围卡 PNG 图片', exact: true,
      });
      await expect(downloadButton).toBeEnabled();
      const pendingDownload = page.waitForEvent('download');
      await downloadButton.click();
      const download = await pendingDownload;
      assert.match(download.suggestedFilename(), /legendary.*\.png$/);
      assert.doesNotMatch(download.suggestedFilename(), /_raw\.png$/);
      await expect.poll(() => collectionCounts(page)).toEqual([1, 1]);
      await expect(downloadButton).toBeEnabled();
      await actions.getByRole('button', { name: locale === 'en' ? 'Share Spell Sheet' : '分享氛围卡', exact: true }).click();
      await expect.poll(() => page.evaluate('window.layoutSharedFiles.length')).toBe(1);
      await expect(downloadButton).toBeEnabled();
      await actions.getByRole('button', { name: locale === 'en' ? 'Handoff Publishing Grid' : '移交发布用九宫格', exact: true }).click();
      await expect.poll(() => page.evaluate('window.layoutSharedFiles.length')).toBe(2);
      const files = await page.evaluate('window.layoutSharedFiles') as { name: string; type: string; width: number; height: number }[];
      assert.deepEqual(files.map(file => [file.type, file.width, file.height]), [
        ['image/png', 1080, 1350], ['image/png', 1080, 1080],
      ]);
      assert.match(files[0].name, /legendary.*\.png$/);
      assert.doesNotMatch(files[0].name, /_raw\.png$/);
      assert.match(files[1].name, /legendary.*_raw\.png$/);
      await expect.poll(() => collectionCounts(page)).toEqual([1, 1]);
      await expect(actions.getByRole('combobox')).toHaveValue('unforgettable_set');
      await expect(actions.getByRole('button', {
        name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true,
      })).toHaveAttribute('aria-pressed', 'true');
      await expect(downloadButton).toBeEnabled();
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}
}

for (const engine of BROWSER_ENGINES) {
for (const locale of ['en', 'zh-CN'] as const) {
test(`Daily Drop loading, empty, failure, stale, gated, archive, and publication states retain coherent controls in ${engine.name}, ${locale}`, { timeout: 90_000, concurrency: false }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, engine.type);
  try {
    // Keep edition/save cutoffs deterministic without pausing loading timers.
    await page.clock.setFixedTime(new Date(`${DATE}T12:00:00.000Z`));
    const exportNames = locale === 'en'
      ? ['Share Spell Sheet', 'Download Spell Sheet as PNG', 'Handoff Publishing Grid']
      : ['分享氛围卡', '下载氛围卡 PNG 图片', '移交发布用九宫格'];
    for (const state of ['loading', 'empty', 'error', 'stale', 'gated', 'archive', 'published', 'unpublished', 'unavailable'] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await installFixtures(page, {
        state: ['loading', 'empty', 'error', 'stale', 'gated'].includes(state) ? state as 'loading' | 'empty' | 'error' | 'stale' | 'gated' : undefined,
        publication: ['published', 'unpublished', 'unavailable'].includes(state) ? state as 'published' | 'unpublished' | 'unavailable' : 'snapshot',
      });
      await gotoTestPage(page, `${origin}/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas${state === 'archive' || state === 'gated' ? `?date=${DATE}` : ''}`);
      if (state === 'gated') {
        await expect(page.locator('.archive-gate')).toBeVisible();
        await expect(page.locator('.daily-actions, .daily-grid')).toHaveCount(0);
      } else if (state === 'loading' || state === 'empty' || state === 'error') {
        await expect(page.locator('.daily-grid')).toBeVisible();
        if (state === 'loading') await expect(page.locator('.daily-grid [role="presentation"][aria-hidden="true"]')).toHaveCount(9);
        if (state === 'empty') await expect(page.locator('.daily-grid__empty')).toHaveText(locale === 'en'
          ? 'No cards are available for today’s Drop yet. Please check back soon.' : '今日卡组暂时没有可用卡片，请稍后再来查看。');
        if (state === 'error') await expect(page.locator('.daily-grid .grid')).toHaveText(locale === 'en'
          ? 'Unavailable' : '英文原文错误：Unavailable');
        await expect(page.locator('.daily-actions')).toHaveCount(0);
      } else {
        await expect(page.locator('.daily-actions')).toBeVisible();
        await expect(page.locator('.daily-grid .grid > [role="button"]')).toHaveCount(9);
        for (const name of exportNames) {
          await expect(page.locator('.daily-actions').getByRole('button', { name, exact: true })).toBeEnabled();
        }
        if (state === 'stale') await expect(page.locator('.atlas-edition__stale')).toContainText(locale === 'en'
          ? "Showing yesterday's picks while today's grid builds" : '今日九宫格正在生成，暂时显示昨日精选');
        if (state === 'archive') {
          await expect(page.locator('.daily-grid__header')).toContainText(locale === 'en' ? 'archived edition' : '本期典藏的互动九宫格');
          const archiveActions = page.locator('.daily-drop .daily-edition-share');
          await expect(archiveActions).toBeVisible();
          for (const name of locale === 'en'
            ? ['Rebuild this edition', 'Copy archived edition link']
            : ['重建本期九宫格', '复制本期典藏链接']) {
            await expect(archiveActions.getByRole('button', { name, exact: true })).toBeVisible();
            await expect(archiveActions.getByRole('button', { name, exact: true })).toBeEnabled();
            await expect(page.locator('.daily-actions').getByRole('button', { name, exact: true })).toHaveCount(0);
          }
          await expect(page.locator('.daily-released-pack')).toHaveCount(0);
        } else {
          await expect(page.locator('.daily-released-pack')).toBeVisible();
          const releasedLink = page.locator('.daily-released-pack').getByRole('link', {
            name: locale === 'en' ? 'View the released pack' : '查看已发布氛围包', exact: true,
          });
          if (state === 'published') await expect(releasedLink).toHaveAttribute('href',
            'https://fandom.justlikekatie.com/vibe-atlas/packs/layout-actor/moonlit');
          else await expect(releasedLink).toHaveCount(0);
          if (state === 'unpublished') await expect(page.locator('.daily-released-pack')).toContainText(locale === 'en'
            ? 'No permanent public pack' : '这组演员与氛围尚未发布永久公开氛围包。');
          if (state === 'unavailable') await expect(page.locator('.daily-released-pack')).toContainText(locale === 'en'
            ? 'temporarily unavailable' : '暂时无法使用');
          if (state === 'stale') await expect(page.locator('.daily-released-pack__snapshot')).toBeVisible();
          else await expect(page.locator('.daily-released-pack__snapshot')).toHaveCount(0);
        }
      }
      if (['loading', 'empty', 'error', 'gated'].includes(state)) {
        await expect(page.locator('.daily-edition-share, .daily-grid__zoom, .daily-grid .grid > [role="button"]')).toHaveCount(0);
        for (const name of exportNames) {
          await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
        }
      }
      if (state !== 'archive') await expect(page.locator('.daily-edition-share')).toHaveCount(0);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});
}
}