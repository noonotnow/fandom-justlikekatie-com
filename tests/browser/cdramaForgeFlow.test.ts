import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createCdramaStillHandler } from '../../netlify/functions/lib/cdrama-still-search.js';
import {
  gotoTestPage, closeBrowserAndServer, launchPageForServer, startViteTestServer,
} from './browserEngines.ts';

const ideas = [
  { setup: 'ONE EPISODE BEFORE BED', punchline: 'THE SUN: GOOD MORNING', visualDirection: 'A stunned viewer', searchQuery: 'C-drama stunned reaction still' },
  { setup: 'A MINOR SECT TEST', punchline: 'THE SKY FILED A COMPLAINT', visualDirection: 'Worried ensemble', searchQuery: 'xianxia worried group still' },
  { setup: 'I ONLY ASKED FOR TEA', punchline: 'THE PALACE SCHEDULED A TRIAL', visualDirection: 'Confused courtier', searchQuery: 'Chinese costume drama confused courtier still' },
];
const still = {
  title: 'Clean reaction still', source: 'example.test',
  link: 'https://example.test/still/clean',
  thumbnail: 'https://images.example/still.jpg',
};

test('C-drama studio creates a local draft, survives refresh, and exports both real PNG sizes', { timeout: 100_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const sourceImage = await sharp({ create: { width: 720, height: 460, channels: 3, background: '#19aa77' } }).png().toBuffer();
  const generatedRequests: unknown[] = [];
  const imageProxyRequests: string[] = [];
  let resolveOldRequest: (() => void) | undefined;
  try {
    await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { accountId: 'cdrama-creator', email: 'creator@example.test', isAdmin: false } }) }));
    await page.route('**/.netlify/functions/cdrama-memeforge', async route => {
      generatedRequests.push(route.request().postDataJSON());
      if (generatedRequests.length === 1) {
        await new Promise<void>(resolve => { resolveOldRequest = resolve; });
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ideas }) }).catch(() => {});
    });
    const stillSearch = createCdramaStillHandler(async () => ({ results: [still] }));
    await page.route('**/.netlify/functions/cdrama-still-search*', async route => {
      const response = await stillSearch(new Request(route.request().url()));
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    await page.route('**/.netlify/functions/image-proxy*', route => {
      imageProxyRequests.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'image/png', body: sourceImage });
    });
    await page.route('https://images.example/**', route => route.abort());
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill('one episode before bed');
    await page.getByRole('button', { name: /Find three joke angles/ }).click();
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill('Another late night');
    await page.getByRole('button', { name: /Find three joke angles/ }).click();
    resolveOldRequest?.();
    await page.getByRole('button', { name: /ANGLE 01/ }).waitFor();
    assert.equal(generatedRequests.length, 2);
    assert.equal((generatedRequests[1] as { moment: string }).moment, 'Another late night');
    assert.doesNotMatch(JSON.stringify(generatedRequests), /Middle-earth|rednote|mordor/i);
    await page.getByRole('button', { name: /ANGLE 02/ }).click();
    await page.getByLabel('Setup', { exact: true }).fill('A TINY TEST');
    await page.getByRole('button', { name: 'Find reaction stills' }).click();
    await page.getByLabel('Search clean C-drama stills').fill('xianxia worried group still');
    await page.getByRole('button', { name: 'Search stills' }).click();
    await page.getByRole('button', { name: /example.test/ }).click();
    await page.getByRole('button', { name: 'Download 1080×1920 PNG' }).waitFor();
    assert.ok(imageProxyRequests.some(url => url.includes(encodeURIComponent(still.thumbnail))),
      'provider URL must be converted to the same-origin image proxy before preview and export');
    await page.getByLabel('Image framing', { exact: true }).selectOption('cover');
    await page.getByLabel('Vertical crop position').focus();
    await page.getByLabel('Vertical crop position').press('ArrowRight');
    await page.getByRole('button', { name: 'Download 1080×1920 PNG' }).waitFor();
    await page.getByLabel('TikTok hook').fill('My edited TikTok hook');
    await page.getByLabel('Instagram caption').fill('My edited Instagram caption');
    await page.reload();
    await page.getByLabel('Setup', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'A TINY TEST');
    assert.equal(await page.getByLabel('Instagram caption').inputValue(), 'My edited Instagram caption');
    const tiktokPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 1080×1920 PNG' }).click();
    const tiktok = await tiktokPromise;
    const tiktokPath = await tiktok.path();
    const tiktokInfo = await sharp(tiktokPath).metadata();
    assert.deepEqual([tiktokInfo.width, tiktokInfo.height], [1080, 1920]);
    const previewUrl = await page.locator('canvas').evaluate((element: HTMLCanvasElement) => element.toDataURL('image/png'));
    assert.equal(Buffer.compare(
      await sharp(Buffer.from(previewUrl.split(',')[1], 'base64')).raw().toBuffer(),
      await sharp(tiktokPath).raw().toBuffer(),
    ), 0, 'downloaded pixels must match the actual canvas preview');
    const tiktokPixel = await sharp(tiktokPath).extract({ left: 540, top: 800, width: 1, height: 1 }).raw().toBuffer();
    assert.ok(tiktokPixel[1] > tiktokPixel[0], 'reaction still must remain visibly green, not a dimmed quote background');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Instagram · 4:5' }).click();
    const instagramPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download 1080×1350 PNG' }).click();
    const instagramPath = await (await instagramPromise).path();
    assert.deepEqual(
      [ (await sharp(instagramPath).metadata()).width, (await sharp(instagramPath).metadata()).height ],
      [1080, 1350],
    );
    await page.getByRole('button', { name: 'Clear local draft' }).click();
    await page.reload();
    assert.equal(await page.getByLabel('Situation, trope, dynamic, or viewer frustration').inputValue(), '');
    assert.equal(await page.evaluate(() => localStorage.getItem('fandom-cdrama-memeforge-draft-v1')), null);
  } finally { resolveOldRequest?.(); await closeBrowserAndServer(browser, server); }
});

test('search and clipboard failures allow a local upload without any Collection or media publication', { timeout: 70_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const sourceImage = await sharp({ create: { width: 720, height: 460, channels: 3, background: '#ac7352' } }).png().toBuffer();
  const unwantedWrites: string[] = [];
  try {
    page.on('request', request => {
      if (request.method() !== 'GET' && /collection\/sync|media-upload|collection-media|workstation-handoff/.test(request.url())) unwantedWrites.push(request.url());
    });
    await page.route('**/api/auth/session', route => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"user":{"accountId":"local-only","email":"creator@example.test","isAdmin":false}}',
    }));
    await page.route('**/.netlify/functions/cdrama-memeforge', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ideas }) }));
    await page.route('**/.netlify/functions/cdrama-still-search*', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Still search unavailable. Upload your own image instead."}' }));
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill('Testing upload fallback');
    await page.getByRole('button', { name: /Find three joke angles/ }).click();
    await page.getByRole('button', { name: /ANGLE 01/ }).waitFor();
    await page.getByRole('button', { name: 'Find reaction stills' }).click();
    await page.getByRole('button', { name: 'Search stills' }).click();
    await page.getByText('Still search unavailable. Upload your own image instead.').waitFor();
    await page.locator('input[type="file"]').setInputFiles({ name: 'my-reaction.png', mimeType: 'image/png', buffer: sourceImage });
    await page.getByText(/Selected: my-reaction.png/).waitFor();
    await page.evaluate(`(() => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'fandom-cdrama-memeforge-draft-v1') throw new DOMException('Quota reached', 'QuotaExceededError');
        return set.call(this, key, value);
      };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } });
    })()`);
    await page.getByLabel('Instagram caption').fill('My local edit despite quota');
    await page.getByText('Could not save locally. Keep this tab open; try a smaller image.').waitFor();
    await page.getByRole('button', { name: 'Copy Instagram post' }).click();
    await page.getByText('Instagram copy could not be copied. Select and copy the text manually.').waitFor();
    assert.equal(await page.getByLabel('Instagram caption').inputValue(), 'My local edit despite quota');
    assert.deepEqual(unwantedWrites, []);
  } finally { await closeBrowserAndServer(browser, server); }
});

test('image hunting and wording suggestions never discard the current meme', { timeout: 100_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const sourceImage = await sharp({ create: { width: 720, height: 460, channels: 3, background: '#19aa77' } }).png().toBuffer();
  const requests: { moment: string }[] = [];
  const replacements = ideas.map((idea, i) => ({ ...idea, setup: `NEW WORDING ${i + 1}` }));
  let searches = 0;
  const savedDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem('fandom-cdrama-memeforge-draft-v1') || '{}'));
  try {
    await page.route('**/api/auth/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { accountId: 'intent-creator', email: 'creator@example.test', isAdmin: false } }) }));
    await page.route('**/.netlify/functions/cdrama-memeforge', route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ideas: requests.length === 1 ? ideas : replacements }) });
    });
    await page.route('**/.netlify/functions/cdrama-still-search*', route => {
      searches++;
      return route.fulfill({ status: searches === 2 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(searches === 2 ? { error: 'Search unavailable for this attempt.' } : { results: [{ ...still, thumbnail: '/.netlify/functions/image-proxy?url=fixture' }] }) });
    });
    await page.route('**/.netlify/functions/image-proxy*', route => route.fulfill({ status: 200, contentType: 'image/png', body: sourceImage }));
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    // An image can be chosen before generation, not only after accepting an angle.
    await page.locator('input[type="file"]').setInputFiles({ name: 'villain.png', mimeType: 'image/png', buffer: sourceImage });
    await page.getByText(/Selected: villain.png/).waitFor();
    const brief = 'Where the Mask Ends villain caught delivering her MEI CUO defense speech';
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill(brief);
    await page.getByRole('button', { name: /Find three joke angles/ }).click();
    await page.getByRole('button', { name: /ANGLE 01/ }).waitFor();
    await page.getByLabel('Setup', { exact: true }).fill('WHEN I GET CAUGHT');
    await page.getByLabel('Punchline', { exact: true }).fill('I HAVE PREPARED A DEFENSE');
    await page.getByLabel('Instagram caption').fill('Keep my caption too');
    await page.getByLabel('Reaction image direction').fill('Caught villain delivering her own defense');
    await page.getByText(/Selected: villain.png/).waitFor();
    await page.getByRole('button', { name: 'Find reaction stills' }).click();
    await page.getByLabel('Search clean C-drama stills').fill('Where the Mask Ends villain speech still');
    await page.getByRole('button', { name: 'Search stills' }).click();
    await page.getByRole('button', { name: /example.test/ }).click();
    const chosen = (await savedDraft()).still;
    await page.getByRole('button', { name: 'Search stills' }).click();
    await page.getByText('Search unavailable for this attempt.').waitFor();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'WHEN I GET CAUGHT');
    assert.equal(await page.getByLabel('Instagram caption').inputValue(), 'Keep my caption too');
    assert.deepEqual((await savedDraft()).still, chosen);
    assert.equal(requests.length, 1, 'searches must never trigger joke generation');
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill(`${brief}. More defiant.`);
    await page.getByRole('button', { name: /Suggest new wording/ }).click();
    await page.getByRole('region', { name: 'New wording options' }).waitFor();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'WHEN I GET CAUGHT');
    assert.deepEqual((await savedDraft()).still, chosen);
    await page.getByRole('button', { name: 'Keep current wording' }).click();
    await page.getByRole('button', { name: /Suggest new wording/ }).click();
    await page.getByRole('button', { name: /USE WORDING 01/ }).click();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'NEW WORDING 1');
    assert.deepEqual((await savedDraft()).still, chosen);
    await page.reload();
    await page.getByLabel('Setup', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'NEW WORDING 1');
    assert.deepEqual((await savedDraft()).still, chosen);
    assert.equal(requests.length, 3);
    assert.equal(requests[1].moment, `${brief}. More defiant.`);
  } finally { await closeBrowserAndServer(browser, server); }
});

test('C-drama studio remains usable in a narrow phone viewport with expired generation session', { timeout: 70_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  let active = true;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/auth/session', route => route.fulfill({
      status: active ? 200 : 401, contentType: 'application/json',
      body: JSON.stringify(active ? { user: { accountId: 'creator', email: 'creator@example.test', isAdmin: false } } : { error: 'Expired' }),
    }));
    await page.route('**/.netlify/functions/cdrama-memeforge', route => {
      active = false;
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sign in to generate ideas."}' });
    });
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill('My viewer confession survives');
    await page.getByRole('button', { name: /Find three joke angles/ }).click();
    await page.getByText('Sign in to generate ideas.').waitFor();
    await page.getByLabel('Email for sign-in link').waitFor();
    await page.reload();
    assert.equal(await page.getByLabel('Situation, trope, dynamic, or viewer frustration').inputValue(), 'My viewer confession survives');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
  } finally { await closeBrowserAndServer(browser, server); }
});

test('signed-out caption editing keeps its image and text during recap-only source searches', { timeout: 70_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const sourceImage = await sharp({ create: { width: 320, height: 480, channels: 3, background: '#a74235' } }).png().toBuffer();
  let recapUrl = '';
  let generationRequests = 0;
  try {
    await page.route('**/api/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Signed out"}' }));
    await page.route('**/.netlify/functions/cdrama-memeforge', route => {
      generationRequests++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"AI generation must not be called"}' });
    });
    await page.route('**/.netlify/functions/cdrama-still-search*', route => {
      recapUrl = route.request().url();
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ results: [], research: [
          { title: 'Recap source', link: 'https://example.test/recap', snippet: '<img id="unsafe-snippet"> episode clue', episodeStart: 7, episodeEnd: 8 },
        ] }),
      });
    });
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.getByRole('button', { name: /Try: the fire starter/ }).click();
    await page.getByLabel('Setup', { exact: true }).waitFor();
    await page.getByLabel('Setup', { exact: true }).fill('One editable line');
    await page.getByLabel('Punchline', { exact: true }).fill('');
    await page.locator('input[type="file"]').setInputFiles({ name: 'local-reaction.png', mimeType: 'image/png', buffer: sourceImage });
    await page.getByText(/Selected: local-reaction.png/).waitFor();
    await page.getByRole('button', { name: 'Look through recaps' }).click();
    await page.getByLabel('Drama title (optional)').fill('Palace of Strings');
    await page.getByLabel('Search recap moments or characters').fill('the palace argument');
    await page.getByRole('button', { name: 'Search recaps' }).click();
    await page.getByRole('link', { name: 'Recap source ↗' }).waitFor();
    assert.equal(new URL(recapUrl).searchParams.get('mode'), 'recaps');
    assert.equal(new URL(recapUrl).searchParams.get('q'), 'the palace argument');
    assert.equal(new URL(recapUrl).searchParams.get('dramaTitle'), 'Palace of Strings');
    assert.equal(new URL(recapUrl).searchParams.has('watchedThrough'), false);
    await page.getByText('Episode range 7–8').waitFor();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'One editable line');
    await page.getByText(/Selected: local-reaction.png/).waitFor();
    assert.equal(await page.locator('#unsafe-snippet').count(), 0);
    assert.match(await page.getByText(/episode clue/).textContent() ?? '', /<img id="unsafe-snippet">/);
    assert.equal(generationRequests, 0, 'manual caption creation while signed out does not call the AI endpoint');
    assert.equal(await page.getByLabel('Watched through episode').count(), 0);
  } finally { await closeBrowserAndServer(browser, server); }
});

test('scene-first discovery preserves the caption, exposes bilingual clues and honest candidate limits', { timeout: 100_000 }, async () => {
  const { server, origin } = await startViteTestServer();
  const { browser, page } = await launchPageForServer(server);
  const sourceImage = await sharp({ create: { width: 600, height: 297, channels: 3, background: '#a74235' } }).png().toBuffer();
  const sourceLink = 'https://recaps.example.org/ancient-love-poetry/episode-47';
  const requests: URL[] = [];
  const queries: string[] = [];
  const errors: string[] = [];
  let generationRequests = 0;
  let empty = false;
  const handler = createCdramaStillHandler(async q => {
    queries.push(q);
    return { results: empty ? [] : [
      { title: '千古玦尘第47集剧照', thumbnail: 'https://images.example.org/defiance.jpg', link: sourceLink },
      { title: 'Episode 48', thumbnail: 'https://images.example.org/unavailable.jpg', link: sourceLink },
    ] };
  }, {}, {
    resolveScene: async () => ({
      clues: [{ summary: 'Possible post-defeat speech; not an exact verified frame.', episodeStart: 47, episodeEnd: 47,
        chineseTitle: '千古玦尘', chineseCharacter: '芜浣', chineseAction: '白发 认罪', sourceUrls: [sourceLink] }],
      research: [{ title: 'Episode 47 recap', link: sourceLink, snippet: 'AI research summary of the trial.' }],
    }),
  });
  try {
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/auth/session', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Signed out"}' }));
    await page.route('**/.netlify/functions/cdrama-memeforge', route => { generationRequests++; return route.abort(); });
    await page.route('**/.netlify/functions/cdrama-still-search*', async route => {
      requests.push(new URL(route.request().url()));
      const response = await handler(new Request(route.request().url()));
      return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    await page.route('**/.netlify/functions/image-proxy*', route => route.request().url().includes('unavailable')
      ? route.fulfill({ status: 404, body: '' })
      : route.fulfill({ status: 200, contentType: 'image/png', body: sourceImage }));
    await gotoTestPage(page, `${origin}/memeforge/c-drama`);
    await page.getByLabel('Write a caption yourself').fill('My joke stays exactly like this');
    await page.getByRole('button', { name: 'Add caption', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: sourceImage });
    await page.getByText(/Selected: original.png/).waitFor();
    await page.getByLabel('Situation, trope, dynamic, or viewer frustration').fill('Wu Huan making a villain speech after caught');
    await page.getByRole('button', { name: 'Use my moment description' }).click();
    await page.getByRole('button', { name: 'Find performance stills' }).click();
    await page.getByText('Episode-aligned lead · frame unverified', { exact: true }).waitFor();
    await page.getByText('Different episode lead · frame unverified', { exact: true }).waitFor();
    await page.getByText('600 × 297 · Small source; enlargement may look soft.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Use this still.*Episode 48/ }).isDisabled(), true);
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'My joke stays exactly like this');
    await page.getByText(/Selected: original.png/).waitFor();
    assert.equal(requests[0].searchParams.get('mode'), 'scenes');
    assert.equal(requests[0].searchParams.get('q'), 'Wu Huan making a villain speech after caught');
    assert.ok(!requests[0].href.includes('My+joke'));
    assert.ok(queries.some(query => query.includes('芜浣') && query.includes('47')));
    await page.getByText('Subtitles not checked. Inspect the image before using it.').first().waitFor();
    assert.equal(await page.getByLabel('Watched through episode').count(), 0);
    await page.getByRole('button', { name: /Use this still.*第47集/ }).click();
    assert.equal(await page.getByLabel('Setup', { exact: true }).inputValue(), 'My joke stays exactly like this');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fandom-cdrama-memeforge-draft-v1') || '{}'));
    assert.match(saved.still.title, /第47集/);
    empty = true;
    await page.getByLabel('Describe the performance to find').fill('another remembered moment');
    await page.getByRole('button', { name: 'Find performance stills' }).click();
    await page.getByRole('link', { name: 'Episode 47 recap ↗' }).waitFor();
    const next = await page.evaluate(() => JSON.parse(localStorage.getItem('fandom-cdrama-memeforge-draft-v1') || '{}'));
    assert.deepEqual(next.still, saved.still);
    assert.equal(next.ideas[0].setup, saved.ideas[0].setup);
    assert.equal(generationRequests, 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    assert.deepEqual(errors, []);
  } finally { await closeBrowserAndServer(browser, server); }
});
