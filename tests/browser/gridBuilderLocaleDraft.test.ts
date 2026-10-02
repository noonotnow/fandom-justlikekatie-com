import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BROWSER_ENGINES,
  closeBrowserAndServer,
  gotoTestPage,
  launchPageForServer,
  startViteTestServer,
} from './browserEngines.ts';

async function seedSavedCards(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const request = indexedDB.open('vibe-atlas-collection', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'imageUrl' });
      if (!db.objectStoreNames.contains('grids')) db.createObjectStore('grids', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sync')) db.createObjectStore('sync', { keyPath: 'key' });
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction('cards', 'readwrite');
    const cards = transaction.objectStore('cards');
    for (let index = 0; index < 9; index += 1) {
      cards.put({
        imageUrl: `https://images.example/locale-draft-${index}.jpg`,
        thumbnailUrl: `https://images.example/locale-draft-${index}-thumb.jpg`,
        resultId: `locale-draft-${index}`,
        actor: '刘宇宁',
        actorEn: 'Liu Yuning',
        actorId: 'liu-yuning',
        vibe: '冷面护短',
        vibeEn: 'Cold-faced but protective',
        vibeEmoji: '🌙',
        capturedDate: '2026-09-20',
        savedAt: `2026-09-20T12:00:0${index}.000Z`,
        sourceRoute: '/vibe-atlas',
        gridContext: { batchKey: 'locale-draft-event' },
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

for (const engine of BROWSER_ENGINES) {
  test(`Grid Builder preserves an unsaved manual draft when switching languages in ${engine.name}`, { timeout: 60_000 }, async () => {
    const { server, origin } = await startViteTestServer();
    const { browser, page } = await launchPageForServer(server, engine.type);

    try {
      await page.route('**/api/auth/session', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      }));
      await page.route('**/api/membership/status', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'inactive', isMember: false, capabilities: [] }),
      }));
      await page.route('**/.netlify/functions/image-proxy**', route => route.abort());

      await gotoTestPage(page, origin);
      await seedSavedCards(page);
      await gotoTestPage(page, `${origin}/vibe-atlas?view=builder&source=collection`);
      await page.getByRole('heading', { name: 'Vibe Atlas Grid Builder' }).waitFor();
      const actorLens = page.getByRole('button', { name: /^Liu Yuning 9$/ });
      await actorLens.click();
      await page.getByRole('tab', { name: 'Build Your Own' }).click();
      const picker = page.getByRole('region', { name: 'Choose nine saved images' });
      const firstCandidate = picker.getByRole('button').first();
      await firstCandidate.click();
      await page.getByRole('group', { name: 'Custom 3×3 grid' }).waitFor();
      assert.equal(await firstCandidate.getAttribute('aria-pressed'), 'true');

      await page.getByLabel('Language').selectOption('zh-CN');
      await page.getByRole('heading', { name: 'Vibe Atlas 网格构建器' }).waitFor();
      await page.getByRole('region', { name: '选择九张已保存图片' }).waitFor();
      const chineseActorLens = page.getByRole('button', { name: '刘宇宁（英文原文：Liu Yuning） 9' });
      assert.equal(await chineseActorLens.getAttribute('aria-pressed'), 'true', 'the selected lens survives localization');
      const chineseDraft = page.getByRole('group', { name: '自选 3×3 网格' });
      assert.equal(await chineseDraft.count(), 1, 'the unsaved manual composition survives localization');
      assert.equal(
        await page.getByRole('button', { name: /移除第 1 张/ }).getAttribute('aria-pressed'),
        'true',
        'the selected saved image remains in the draft',
      );
      assert.match(page.url(), /\/zh-cn\/vibe-atlas\?view=builder&source=collection$/);

      await page.getByLabel('语言').selectOption('en');
      await page.getByRole('heading', { name: 'Vibe Atlas Grid Builder' }).waitFor();
      assert.equal(await page.getByRole('group', { name: 'Custom 3×3 grid' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /^Liu Yuning 9$/ }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: /Remove position 1/ }).getAttribute('aria-pressed'), 'true');
      assert.match(page.url(), /\/vibe-atlas\?view=builder&source=collection$/);
    } finally {
      await closeBrowserAndServer(browser, server);
    }
  });
}