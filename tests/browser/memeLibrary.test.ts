import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { DRAFT_KEY, emptyDraft } from '../../src/utils/cdramaForge.ts';
import { gotoTestPage, closeBrowserAndServer, launchPageForServer, startViteTestServer } from './browserEngines.ts';

test('finished C-drama exports and uploads share the scoped library without mixing LOTR or Atlas', { timeout: 120_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const png = await sharp({ create: { width: 640, height: 400, channels: 3, background: '#b46f33' } }).png().toBuffer();
  const image = `data:image/png;base64,${png.toString('base64')}`;
  try {
    await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null } }));
    await page.route('**/.netlify/functions/log-engagement', route => route.fulfill({ json: {} }));
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), {
      key: DRAFT_KEY,
      draft: { ...emptyDraft(), ideas: [{ setup: 'MY FINISHED MEME', punchline: 'NOT JUST THE SOURCE STILL', visualDirection: '', searchQuery: '' }],
        still: { kind: 'upload', title: 'Source', thumbnail: image, link: '', source: 'Your device', query: '' }, format: 'tiktok' },
    });
    await page.reload();
    const firstDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 1080×1920 PNG', exact: true }).click();
    const downloaded = await firstDownload;
    await page.getByText(/saved to your C-drama meme library on this device/).waitFor();
    const saved = await page.evaluate<Array<{ imageUrl: string }>>(`(async () => {
      const db = await import('/src/utils/collectionDB.ts');
      return await db.dbGetVisibleCardsByScope(undefined, 'c-drama');
    })()`);
    assert.equal(saved.length, 1);
    const actual = Buffer.from(saved[0].imageUrl.split(',')[1].split('#')[0], 'base64');
    assert.deepEqual(actual, await readFile((await downloaded.path())!), 'library preserves the exact finished download');
    assert.equal((await sharp(actual).metadata()).height, 1920);

    // Same finished image is not duplicated when downloaded again.
    const repeatedDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 1080×1920 PNG', exact: true }).click();
    await repeatedDownload;
    await page.getByText(/saved to your C-drama meme library on this device/).waitFor();
    assert.equal(await page.evaluate(`(async () => {
      const db = await import('/src/utils/collectionDB.ts');
      return (await db.dbGetVisibleCardsByScope(undefined, 'c-drama')).length;
    })()`), 1);

    // A storage error must not cancel the actual download or claim a library save.
    await page.getByLabel('Punchline', { exact: true }).fill('NEW UNSAVED VERSION');
    await page.evaluate(`(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (this.name === 'cards') throw new DOMException('Storage full', 'QuotaExceededError');
        return key === undefined ? original.call(this, value) : original.call(this, value, key);
      };
    })()`);
    const failedSaveDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 1080×1920 PNG', exact: true }).click();
    await failedSaveDownload;
    await page.getByText(/download started, but the library copy could not be saved/).waitFor();
    await page.reload();
    await page.evaluate(`(async () => {
      const db = await import('/src/utils/collectionDB.ts');
      const base = { actor: 'Seed', actorEn: 'Seed', vibe: 'Seed', vibeEn: 'Seed', vibeEmoji: '', capturedDate: '2026-10-31' };
      await db.dbSaveCard({ ...base, imageUrl: 'https://images.example/lotr.png', thumbnailUrl: 'https://images.example/lotr.png', title: 'LOTR ONLY', collectionScope: 'middle-earth', contentKind: 'middle-earth-meme' });
      await db.dbSaveCard({ ...base, imageUrl: 'https://images.example/atlas.png', thumbnailUrl: 'https://images.example/atlas.png', title: 'ATLAS ONLY', collectionScope: 'vibe-atlas' });
    })()`);
    await page.route('https://images.example/**', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.getByRole('link', { name: 'My meme library', exact: true }).click();
    await page.getByRole('heading', { name: 'The meme library', exact: true }).waitFor();
    await page.getByText('MY FINISHED MEME / NOT JUST THE SOURCE STILL', { exact: true }).waitFor();
    assert.equal(await page.getByText('LOTR ONLY', { exact: true }).count(), 0);
    assert.equal(await page.getByText('ATLAS ONLY', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /^Grids|^Builder/ }).count(), 0);
    await page.getByLabel('Upload and save a C-drama meme').setInputFiles({ name: 'already-downloaded.png', mimeType: 'image/png', buffer: png });
    await page.getByText('already-downloaded', { exact: true }).waitFor();
    await page.getByLabel('Upload and save a C-drama meme').setInputFiles({ name: 'again.png', mimeType: 'image/png', buffer: png });
    await page.getByText('“again.png” is saved in this Collection.', { exact: true }).waitFor();
    assert.equal(await page.locator('article').count(), 2);
    await page.reload();
    const uploaded = page.locator('article').filter({ has: page.getByText('already-downloaded', { exact: true }) });
    await uploaded.waitFor();
    const redownload = page.waitForEvent('download');
    await uploaded.getByRole('button', { name: 'Download saved image' }).click();
    assert.deepEqual(await readFile((await (await redownload).path())!), png, 're-download preserves original bytes');
    await uploaded.getByRole('button', { name: /View .* larger/ }).click();
    await page.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    await uploaded.getByRole('button', { name: /Remove/ }).click();
    await page.getByRole('button', { name: /Undo/ }).waitFor();
    await page.waitForTimeout(8500);
    await page.reload();
    await page.getByText('MY FINISHED MEME / NOT JUST THE SOURCE STILL', { exact: true }).waitFor();
    assert.equal(await page.getByText('already-downloaded', { exact: true }).count(), 0);
    await page.getByRole('button', { name: /02 Middle-earth/ }).click();
    await page.getByText('LOTR ONLY', { exact: true }).waitFor();
    assert.equal(await page.getByText('MY FINISHED MEME / NOT JUST THE SOURCE STILL', { exact: true }).count(), 0);
    assert.equal(await page.getByText('ATLAS ONLY', { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: /01 C-drama/ }).click();
    await page.getByLabel('Upload and save a C-drama meme').setInputFiles({ name: 'corrupt.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.getByText(/could not be decoded|could not be saved|source image/i).waitFor();
    assert.equal(await page.locator('article').count(), 1);
  } finally { await closeBrowserAndServer(browser, server); }
});
