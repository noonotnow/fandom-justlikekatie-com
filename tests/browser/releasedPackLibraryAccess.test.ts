import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
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
    await page.route('**/api/membership/status', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ state: 'signed_out', capabilities: [] }),
    }));
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

    await page.goto(`${origin}/vibe-atlas?view=released&actorId=liu-xueyi&vibeIdx=2`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.getByRole('heading', { name: 'The Vibe Atlas library.' }).waitFor();
    assert.equal(protectedRequests, 0);
    await page.getByRole('heading', { name: /Polished Danger/ }).waitFor();
    await page.getByText('Public teaser · 公开预览').waitFor();
    await page.getByText('This Vibe Pack / 氛围包 is the reusable editorial sourceboard.').waitFor();
    await page.getByText('Free today: this release is the current Star of the Day Vibe Pack on the Vibe Atlas homepage.').waitFor();
    assert.equal(await page.locator('img').count() >= 3, true);
    await page.getByRole('button', { name: 'Email sign-in link' }).waitFor();
    await page.getByRole('button', { name: 'Become a Fandom Collector' }).waitFor();
    assert.match(page.url(), /view=released&actorId=liu-xueyi&vibeIdx=2/);
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
    await page.route('**/.netlify/functions/collector-grid*', route => {
      const images = Array.from({ length: 12 }, (_, index) => ({
        thumbnail: `https://media.example/${index}.jpg`,
        link: 'https://source.example/shared-story',
      }));
      return route.fulfill({
        contentType: 'application/json',
        status: route.request().method() === 'GET' ? 200 : 409,
        body: JSON.stringify(route.request().method() === 'GET'
          ? { runs: [
            { id: 'saved-2', actorId: 'liu-yuning', vibeIdx: 0, generatedAt: '2026-09-24T12:00:00.000Z', images },
            { id: 'saved-1', actorId: 'liu-yuning', vibeIdx: 0, generatedAt: '2026-09-24T11:00:00.000Z', images },
          ] }
          : { error: 'No different safe nine-image board is available. Your saved grid is unchanged.' }),
      });
    });
    await page.goto(`${origin}/vibe-atlas?view=released&actorId=liu-yuning&vibeIdx=0`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.locator('.released-image-grid__item').first().waitFor();
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