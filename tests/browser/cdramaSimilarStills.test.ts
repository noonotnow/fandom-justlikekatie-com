import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createCdramaStillHandler } from '../../netlify/functions/lib/cdrama-still-search.js';
import { DRAFT_KEY, emptyDraft } from '../../src/utils/cdramaForge.ts';
import { gotoTestPage, closeBrowserAndServer, launchPageForServer, startViteTestServer } from './browserEngines.ts';

const seed = 'https://images.example.com/wu-huan.jpg';
const proxy = (url: string) => `/.netlify/functions/image-proxy?url=${encodeURIComponent(url)}`;
const initial = {
  ...emptyDraft(), moment: 'the fire starter discovers a fire',
  ideas: [{ setup: 'MY CAPTION STAYS', punchline: 'MY PUNCHLINE TOO', visualDirection: 'Appalled reaction', searchQuery: 'wu huan white hair ancient love poetry' }],
  still: { kind: 'search', title: 'Original Wu Huan still', thumbnail: proxy(seed), link: 'https://publisher.example.com/scene', source: 'Original publisher', query: 'wu huan' },
  framing: 'contain', focusY: 37,
  copy: { hook: 'My hook', tiktok: 'My TikTok copy', instagram: 'My Instagram copy', hashtags: '#mytag' },
};
const matches = [1, 2].map(i => ({
  title: `Alternative ${i}`, thumbnail: `https://images.example.com/alt-${i}.jpg`,
  // Two stills on the same page must not collapse into a single candidate.
  link: 'https://publisher.example.com/more', source: 'Related publisher',
}));

test('image-based discovery preserves draft and main results; replacing image is explicit and survives reload', { timeout: 100_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const png = await sharp({ create: { width: 720, height: 460, channels: 3, background: '#19aa77' } }).png().toBuffer();
  const seeds: string[] = [];
  let mode: 'success' | 'error' | 'empty' = 'success';
  let release: (() => void) | undefined;
  let delayed = false;
  try {
    await page.route('**/api/auth/session', route => route.fulfill({ json: { user: null } }));
    await page.route('**/.netlify/functions/image-proxy*', route => route.fulfill({ contentType: 'image/png', body: png }));
    const handler = createCdramaStillHandler(
      async () => ({ results: [{ title: 'Original search result', thumbnail: seed, link: initial.still.link, source: 'Original search' }] }),
      {}, {},
      async (image: string) => {
        seeds.push(image);
        if (delayed) await new Promise<void>(resolve => { release = resolve; });
        if (mode === 'error') throw new Error('provider down');
        return { results: mode === 'empty' ? [] : matches, warning: mode === 'empty' ? 'No additional visual matches found.' : 'Visual matches, not verified scene matches.' };
      },
    );
    await page.route('**/.netlify/functions/cdrama-still-search*', async route => {
      const response = await handler(new Request(route.request().url()));
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() }).catch(() => {});
    });
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key: DRAFT_KEY, draft: initial });
    await page.reload();
    await page.getByRole('button', { name: 'Find more like this', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Find reaction stills', exact: true }).click();
    await page.getByLabel('Search clean C-drama stills').fill('original query');
    await page.getByRole('button', { name: 'Search stills', exact: true }).click();
    await page.getByRole('button', { name: /Use this still · Original search/ }).waitFor();
    const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), DRAFT_KEY);
    const before = await stored();
    const related = page.getByRole('region', { name: 'Related stills', exact: true });
    await related.getByRole('button', { name: 'Find more like this', exact: true }).click();
    await related.getByRole('button', { name: /Use this still · Related publisher · Alternative 2/ }).waitFor();
    assert.deepEqual(seeds, [seed], 'request must use original still URL, not proxy, page link or meme export');
    assert.deepEqual(await stored(), before, 'browsing must not change any draft field');
    await page.getByRole('button', { name: /Use this still · Original search/ }).waitFor();
    await related.getByRole('button', { name: /Use this still · Related publisher · Alternative 1/ }).click();
    await page.waitForFunction(({ key, thumbnail }) => JSON.parse(localStorage.getItem(key)!).still.thumbnail === thumbnail, {
      key: DRAFT_KEY, thumbnail: proxy(matches[0].thumbnail),
    });
    const after = await stored();
    assert.deepEqual({ ...after, still: before.still }, before, 'only selected still changes; caption, framing, copy and focus survive');
    await related.getByRole('button', { name: /Use this still · Related publisher · Alternative 2/ }).waitFor();
    mode = 'error';
    await related.getByRole('button', { name: 'Find more like this', exact: true }).click();
    await related.getByRole('alert').waitFor();
    assert.equal(seeds.at(-1), matches[0].thumbnail, 'a replacement can seed another search');
    assert.deepEqual(await stored(), after);
    mode = 'empty';
    await related.getByRole('button', { name: 'Retry related search' }).click();
    await related.getByText('No additional visual matches found.', { exact: true }).waitFor();
    assert.deepEqual(await stored(), after);
    delayed = true; mode = 'success';
    await related.getByRole('button', { name: 'Find more like this', exact: true }).click();
    await related.getByText('Looking for visually related stills…', { exact: true }).waitFor();
    await related.getByRole('button', { name: 'Hide', exact: true }).click();
    release?.();
    await related.getByRole('button', { name: 'Show', exact: true }).click();
    assert.equal(await related.getByRole('button', { name: /Use this still · Related publisher/ }).count(), 0, 'closed request cannot install stale results');
    await page.reload();
    await page.getByRole('button', { name: 'Find more like this', exact: true }).waitFor();
    assert.deepEqual(await stored(), after);
    // A device image must never be sent for reverse search.
    const upload = { ...after, still: { ...after.still, kind: 'upload', thumbnail: `data:image/png;base64,${png.toString('base64')}` } };
    await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key: DRAFT_KEY, draft: upload });
    await page.reload();
    const count = seeds.length;
    await page.getByRole('button', { name: 'Find more like this', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Device uploads stay on this device' }).waitFor();
    assert.equal(seeds.length, count);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { release?.(); await closeBrowserAndServer(browser, server); }
});
