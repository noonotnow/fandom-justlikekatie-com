import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expect, type Page } from '@playwright/test';
import {
  BROWSER_ENGINES, closeBrowserAndServer, gotoTestPage,
  launchPageForServer, startViteTestServer,
} from './browserEngines.ts';

const DATE = '2026-09-25';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64');
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
} = {}) {
  await page.route('**/api/membership/status', route => route.fulfill({
    json: { state: 'inactive', isMember: false, capabilities: [] },
  }));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null } }));
  await page.route('**/.netlify/functions/public-archive-inventory**', route => route.fulfill({
    status: 404, json: { fallback: 'legacy_unverified_edition' },
  }));
  await page.route('**/.netlify/functions/star-of-day**', async route => {
    if (options.state === 'loading') return;
    if (options.state === 'error') return route.fulfill({ status: 503, json: { error: 'Unavailable' } });
    if (options.state === 'gated') return route.fulfill({
      status: 401, json: { access: 'sign_in', edition: {
        date: DATE, actorName: board.actorName, vibeLabel: board.vibeLabel,
        vibeLabelEn: board.vibeLabelEn, vibeEmoji: '', previewThumbnails: [],
      } },
    });
    return route.fulfill({ json: {
      ...board,
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
  await page.route('**/.netlify/functions/image-proxy**', route => route.fulfill({ contentType: 'image/png', body: PIXEL }));
  await page.route('https://images.layout-test/**', route => route.fulfill({ contentType: 'image/png', body: PIXEL }));
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

for (const locale of ['en', 'zh-CN'] as const) {
  for (const width of [390, 1280]) {
    test(`Daily Drop content and keyboard order stay unified in ${locale} at ${width}px`, { timeout: 60_000 }, async () => {
      const { server, origin } = await startViteTestServer();
      const { browser, page } = await launchPageForServer(server, BROWSER_ENGINES[0].type);
      try {
        await page.setViewportSize({ width, height: 900 });
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
        await expect(actions.getByRole('button', { name: locale === 'en' ? '◇ Misprint' : '◇ 错版', exact: true })).toBeFocused();
        await actions.getByRole('button', { name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true }).click();
        await actions.getByRole('combobox').selectOption('every_image_belongs');
        await guide.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await guide.evaluate(el => (el as HTMLDetailsElement).open), true);
        const snapshot = page.locator('.daily-released-pack__snapshot');
        await expect(snapshot).toBeVisible();
        assert.equal(await snapshot.evaluate(el => (el as HTMLDetailsElement).open), false);
        await snapshot.locator('summary').click();
        await expect(snapshot.locator('img')).toHaveCount(9);
        await expect(actions.getByRole('combobox')).toHaveValue('every_image_belongs');
        assert.deepEqual(await collectionCounts(page), [0, 0], 'layout/guide/reactions/snapshot must not implicitly save anything');
        await grid.getByRole('button', { name: locale === 'en' ? /View whole grid/ : /查看完整九宫格/ }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(actions.getByRole('combobox')).toHaveValue('every_image_belongs');
      } finally {
        await closeBrowserAndServer(browser, server);
      }
    });
  }
}

for (const locale of ['en', 'zh-CN'] as const) {
  test(`Attached board actions retain deliberate card saves and distinct exports in ${locale}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, BROWSER_ENGINES[0].type);
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
            const image = await createImageBitmap(file);
            window.layoutSharedFiles.push({ name: file.name, type: file.type, width: image.width, height: image.height });
            image.close();
          }
        } });
      `);
      await gotoTestPage(page, `${origin}/${locale === 'zh-CN' ? 'zh-cn/' : ''}vibe-atlas`);
      const actions = page.locator('.daily-drop .daily-actions');
      await expect(actions).toBeVisible();
      await actions.getByRole('button', { name: locale === 'en' ? '★ Legendary' : '★ 传说', exact: true }).click();
      await actions.getByRole('combobox').selectOption('unforgettable_set');
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
      await expect.poll(() => collectionCounts(page)).toEqual([1, 1]);
      await expect(downloadButton).toBeEnabled();
      await actions.getByRole('button', { name: locale === 'en' ? 'Share Spell Sheet' : '分享氛围卡', exact: true }).click();
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
      await expect(downloadButton).toBeEnabled();
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}

test('Daily Drop loading, empty, failure, stale, archive, and publication states retain coherent controls', { timeout: 90_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server, BROWSER_ENGINES[0].type);
  try {
    for (const state of ['loading', 'empty', 'error', 'stale', 'gated', 'archive', 'published', 'unpublished', 'unavailable'] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await installFixtures(page, {
        state: ['loading', 'empty', 'error', 'stale', 'gated'].includes(state) ? state as 'loading' | 'empty' | 'error' | 'stale' | 'gated' : undefined,
        publication: ['published', 'unpublished', 'unavailable'].includes(state) ? state as 'published' | 'unpublished' | 'unavailable' : 'snapshot',
      });
      await gotoTestPage(page, `${origin}/vibe-atlas${state === 'archive' || state === 'gated' ? `?date=${DATE}` : ''}`);
      if (state === 'gated') {
        await expect(page.locator('.archive-gate')).toBeVisible();
        assert.equal(await page.locator('.daily-actions, .daily-grid').count(), 0);
      } else if (state === 'loading' || state === 'empty' || state === 'error') {
        await expect(page.locator('.daily-grid')).toBeVisible();
        if (state === 'empty') await expect(page.locator('.daily-grid__empty')).toBeVisible();
        if (state === 'error') await expect(page.locator('.daily-grid .grid')).toContainText('Unavailable');
        assert.equal(await page.locator('.daily-actions').count(), 0);
      } else {
        await expect(page.locator('.daily-actions')).toBeVisible();
        if (state === 'stale') await expect(page.locator('.atlas-edition__stale')).toBeVisible();
        if (state === 'archive') {
          await expect(page.locator('.daily-grid__header')).toContainText('archived edition');
          await expect(page.getByRole('button', { name: 'Copy archived edition link' })).toBeVisible();
          assert.equal(await page.locator('.daily-released-pack').count(), 0);
        } else {
          await expect(page.locator('.daily-released-pack')).toBeVisible();
          if (state === 'published') await expect(page.getByRole('link', { name: 'View the released pack', exact: true })).toHaveAttribute('href', /\/vibe-atlas\/packs\//);
          if (state === 'unpublished') await expect(page.locator('.daily-released-pack')).toContainText('No permanent public pack');
          if (state === 'unavailable') await expect(page.locator('.daily-released-pack')).toContainText('temporarily unavailable');
        }
      }
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});