import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  gotoTestPage,
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

test('signed-out released-pack visitors see a public teaser without fetching protected depth', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.addInitScript(() => {
      (window as Window & { capturedAnalytics?: Array<{ name: string; data?: object }> }).capturedAnalytics = [];
      (window as Window & {
        umami?: { track(name: string, data?: Record<string, string | number | boolean>): void };
      }).umami = {
        track(name: string, data?: Record<string, string | number | boolean>) {
          (window as Window & { capturedAnalytics?: Array<{ name: string; data?: object }> })
            .capturedAnalytics?.push({ name, data });
        },
      };
    });
    let protectedRequests = 0;
    await page.route('**/.netlify/functions/star-of-day*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        actorId: 'liu-xueyi',
        vibeIdx: 2,
        actorName: '刘学义',
        actorShortNameEn: 'Liu Xueyi',
        actorAccentColor: '#a8bde0',
        vibeEmoji: '🤓',
        vibeLabel: '斯文败类',
        vibeLabelEn: 'Polished Danger',
        vibeSubtitle: '眼镜一戴，危险变得很有礼貌',
        vibeSubtitleEn: 'Put the glasses on. The danger got extremely polite.',
        rankedBatches: [{ query: 'today', results: [{ title: 'One', thumbnail: 'https://media.example/1.jpg', link: 'https://example.com/1', source: 'Example' }] }],
        displayResults: [{ title: 'One', thumbnail: 'https://media.example/1.jpg', link: 'https://example.com/1', source: 'Example' }],
        date: '2026-09-24',
      }),
    }));
    await page.route('**/api/membership/status', async route => {
      await new Promise(resolve => setTimeout(resolve, 150));
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ state: 'signed_out', capabilities: [] }),
      });
    });
    await page.route('**/.netlify/functions/actor-pack-depth*', route => {
      protectedRequests += 1;
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Protected endpoint must not be called.' }),
      });
    });
    await page.route('**/.netlify/functions/released-pack-preview*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        schemaVersion: 1,
        kind: 'vibe-atlas-released-pack-preview',
        pack: {
          actor: { id: 'liu-xueyi', name: '刘学义', nameEn: 'Liu Xueyi' },
          vibe: {
            emoji: '🤓',
            label: '斯文败类',
            labelEn: 'Polished Danger',
            subtitle: '眼镜一戴，危险变得很有礼貌',
            subtitleEn: 'Put the glasses on. The danger got extremely polite.',
          },
          vibeIdx: 2,
          preview: {
            copy: 'A public editorial teaser that keeps the pack understandable without opening gated collector tools.',
            cards: [
              { title: 'Preview One', thumbnailUrl: 'https://media.example/1.jpg', link: 'https://example.com/1', source: 'Example' },
              { title: 'Preview Two', thumbnailUrl: 'https://media.example/2.jpg', link: 'https://example.com/2', source: 'Example' },
              { title: 'Preview Three', thumbnailUrl: 'https://media.example/3.jpg', link: 'https://example.com/3', source: 'Example' },
            ],
          },
        },
      }),
    }));

    await gotoTestPage(page, `${origin}/vibe-atlas?view=released&actorId=liu-xueyi&vibeIdx=2`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.getByRole('heading', { name: 'The Vibe Atlas library.' }).waitFor();
    assert.equal(protectedRequests, 0);
    await page.getByRole('heading', { name: /Polished Danger/ }).waitFor();
    await page.getByText('Public teaser').waitFor();
    await page.getByText(
      'This Vibe Pack is the reusable editorial sourceboard. Each grid is freshly generated from its search, safety, and ranking rules.',
    ).waitFor();
    await page.getByText('Free today: this release is the current Star of the Day Vibe Pack on the Vibe Atlas homepage.').waitFor();
    assert.equal(await page.locator('img').count() >= 3, true);
    await page.getByRole('button', { name: 'Email sign-in link' }).waitFor();
    await page.getByRole('button', { name: 'Become a Fandom Collector' }).waitFor();
    assert.match(page.url(), /view=released&actorId=liu-xueyi&vibeIdx=2/);
    await page.waitForTimeout(250);
    const opens = await page.evaluate(() => (
      (window as Window & { capturedAnalytics?: Array<{ name: string; data?: object }> })
        .capturedAnalytics?.filter(event => event.name === 'released_library_opened') ?? []
    ));
    assert.deepEqual(opens, [{
      name: 'released_library_opened',
      data: { source: 'library_navigation', actor_id: 'liu-xueyi', vibe_index: 2, entitled: false },
    }]);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('verified billing return consumes released-pack attribution once', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.addInitScript(() => {
      (window as Window & { capturedAnalytics?: Array<{ name: string; data?: object }> }).capturedAnalytics = [];
      (window as Window & {
        umami?: { track(name: string, data?: Record<string, string | number | boolean>): void };
      }).umami = {
        track(name: string, data?: Record<string, string | number | boolean>) {
          (window as Window & { capturedAnalytics?: Array<{ name: string; data?: object }> })
            .capturedAnalytics?.push({ name, data });
        },
      };
      window.localStorage.setItem('fandom_released_pack_checkout_attribution', JSON.stringify({
        source: 'public_record',
        actor_id: 'liu-xueyi',
        vibe_index: 0,
        started_at: Date.now(),
      }));
    });
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', capabilities: ['fandom_collector'] }),
    }));
    await gotoTestPage(page, `${origin}/vibe-atlas?view=membership&membership=success`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.waitForFunction(() => (
      (window as Window & { capturedAnalytics?: Array<{ name: string }> })
        .capturedAnalytics?.some(event => event.name === 'released_library_collector_activated')
    ));
    const activations = await page.evaluate(() => (
      (window as Window & { capturedAnalytics?: Array<{ name: string; data?: object }> })
        .capturedAnalytics?.filter(event => event.name === 'released_library_collector_activated') ?? []
    ));
    assert.deepEqual(activations, [{
      name: 'released_library_collector_activated',
      data: { source: 'public_record', actor_id: 'liu-xueyi', vibe_index: 0 },
    }]);
    assert.equal(await page.evaluate(() => window.localStorage.getItem('fandom_released_pack_checkout_attribution')), null);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('switching saved runs with shared source links never leaves more than nine grid cards', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'active', capabilities: ['fandom_collector'] }),
    }));
    await page.route('**/.netlify/functions/actor-pack-depth*', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ packs: [{
        id: 'liu-yuning', name: 'Liu Yuning',
        vibes: [{ vibeIdx: 0, label_en: 'Boyfriend Lighting' }],
      }] }),
    }));
    let returnedImages = 0;
    await page.route('**/.netlify/functions/collector-grid*', route => {
      const images = Array.from({ length: 12 }, (_, index) => ({
        thumbnail: `https://media.example/${index}.jpg`,
        title: `Image ${index}`,
        link: 'https://source.example/shared-story',
      }));
      returnedImages = images.length;
      return route.fulfill({
        contentType: 'application/json',
        status: route.request().method() === 'GET' ? 200 : 409,
        body: JSON.stringify(route.request().method() === 'GET'
          ? { runs: [
            { id: 'saved-2', actorId: 'liu-yuning', vibeIdx: 0, generatedAt: '2026-09-24T12:00:00.000Z', images },
            { id: 'saved-1', actorId: 'liu-yuning', vibeIdx: 0, generatedAt: '2026-09-24T11:00:00.000Z', images },
          ] }
          : { error: 'No different safe nine-image board is available for this pairing yet. Your saved grid is unchanged.' }),
      });
    });
    await gotoTestPage(page, `${origin}/vibe-atlas?view=released&actorId=liu-yuning&vibeIdx=0`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.locator('.released-image-grid__item').first().waitFor();
    assert.equal(returnedImages, 12);
    assert.equal(await page.locator('.released-image-grid__item').count(), 9);
    assert.equal(await page.locator('.released-image-grid__item img').count(), 9);
    await page.getByText(/No different safe nine-image board/).waitFor();
    const savedRun = page.getByLabel('Saved run');
    for (const id of ['saved-1', 'saved-2', 'saved-1']) {
      await savedRun.selectOption(id);
      assert.equal(await page.locator('.released-image-grid > .released-image-grid__item').count(), 9);
    }
    assert.equal(await page.locator('.released-image-grid__item').count(), 9);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('daily-star directory previews are restricted to other three-card releases for that actor', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'signed_out', capabilities: [] }),
    }));
    let protectedRequests = 0;
    await page.route('**/.netlify/functions/actor-pack-depth*', route => {
      protectedRequests += 1;
      return route.fulfill({ status: 500, body: 'Protected route must not be requested.' });
    });
    let directoryRequestUrl = '';
    await page.route('**/.netlify/functions/public-preflight-preview-directory*', route => {
      directoryRequestUrl = route.request().url();
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          kind: 'vibe-atlas-preflight-preview-directory',
          previews: [
            {
              kind: 'vibe-atlas-preflight-three-card-preview',
              actor: { id: 'liu-xueyi', name: '刘学义', nameEn: 'Liu Xueyi' },
              vibe: { labelEn: 'Current Daily Pair', copy: 'The current pairing is not teased in the actor directory.' },
              vibeIdx: 2,
              cards: [{ thumbnailUrl: 'https://media.example/current.jpg', title: 'Current' }, { thumbnailUrl: 'https://media.example/current-2.jpg', title: 'Current 2' }, { thumbnailUrl: 'https://media.example/current-3.jpg', title: 'Current 3' }],
            },
            {
              kind: 'vibe-atlas-preflight-three-card-preview',
              actor: { id: 'liu-xueyi', name: '刘学义', nameEn: 'Liu Xueyi' },
              vibe: { labelEn: 'Other Release', copy: 'A released actor pack with an editorially approved context.' },
              vibeIdx: 3,
              cards: [{ thumbnailUrl: 'https://media.example/other.jpg', title: 'Other 1' }, { thumbnailUrl: 'https://media.example/other-2.jpg', title: 'Other 2' }, { thumbnailUrl: 'https://media.example/other-3.jpg', title: 'Other 3' }],
            },
            {
              kind: 'vibe-atlas-preflight-three-card-preview',
              actor: { id: 'other-actor', name: 'Other', nameEn: 'Other Actor' },
              vibe: { labelEn: 'Other Actor Vibe', copy: 'This belongs to another actor.' },
              vibeIdx: 0,
              cards: [{ thumbnailUrl: 'https://media.example/unrelated.jpg', title: 'Unrelated 1' }, { thumbnailUrl: 'https://media.example/unrelated-2.jpg', title: 'Unrelated 2' }, { thumbnailUrl: 'https://media.example/unrelated-3.jpg', title: 'Unrelated 3' }],
            },
          ],
        }),
      });
    });

    await gotoTestPage(page, `${origin}/vibe-atlas?view=released&source=daily_star&actorId=liu-xueyi&vibeIdx=2`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.getByRole('heading', { name: /other Vibe Packs/ }).waitFor();
    await page.getByText('Other Release').waitFor();
    await page.getByText('A released actor pack with an editorially approved context.').waitFor();
    assert.equal(new URL(directoryRequestUrl).searchParams.get('actorId'), 'liu-xueyi');
    assert.equal(await page.getByText('Current Daily Pair').count(), 0);
    assert.equal(await page.getByText('Other Actor Vibe').count(), 0);
    assert.equal(await page.locator('.released-library__teaser .released-image-grid__item').count(), 3);
    assert.equal(protectedRequests, 0);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('article teaser requests only its exact approved Liu Xueyi pair and fails closed on 404', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'signed_out', capabilities: [] }),
    }));
    let requestedPair = '';
    let directoryRequests = 0;
    await page.route('**/.netlify/functions/public-preflight-preview-directory*', route => {
      directoryRequests += 1;
      return route.fulfill({ status: 500, body: 'Article must not use directory.' });
    });
    await page.route('**/.netlify/functions/public-preflight-preview*', route => {
      requestedPair = new URL(route.request().url()).search;
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not released.' }) });
    });

    await gotoTestPage(page, `${origin}/vibe-atlas?view=released&source=article&actorId=liu-xueyi&vibeIdx=2`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.getByRole('alert').filter({ hasText: 'does not have an approved public preview' }).waitFor();
    assert.equal(requestedPair, '?actorId=liu-xueyi&vibeIdx=2');
    assert.equal(directoryRequests, 0);
    assert.equal(await page.locator('.released-library__teaser .released-image-grid__item').count(), 0);
    assert.equal(await page.locator('.released-image-grid[aria-label="Nine image generated grid"]').count(), 0);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('article previews reject an unapproved actor without making a public-preview request', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'signed_out', capabilities: [] }),
    }));
    let previewRequests = 0;
    await page.route('**/.netlify/functions/public-preflight-preview*', route => {
      previewRequests += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await gotoTestPage(page, `${origin}/vibe-atlas?view=released&source=article&actorId=other-actor&vibeIdx=2`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.getByRole('alert').filter({ hasText: 'only to its two approved Liu Xueyi pack previews' }).waitFor();
    assert.equal(previewRequests, 0);
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});