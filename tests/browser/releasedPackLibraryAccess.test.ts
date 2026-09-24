import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

test('signed-out released-pack visitors see the lock without fetching protected depth', {
  timeout: 30_000,
}, async () => {
  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    let protectedRequests = 0;
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

    await page.goto(`${origin}/vibe-atlas?view=released&actorId=liu-xueyi&vibeIdx=3`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    });
    await page.getByRole('heading', { name: 'Released packs, ready when you are.' }).waitFor();
    assert.equal(protectedRequests, 0);
    await page.getByRole('button', { name: 'Email sign-in link' }).waitFor();
    await page.getByRole('button', { name: 'Become a Fandom Collector' }).waitFor();
    assert.match(page.url(), /view=released&actorId=liu-xueyi&vibeIdx=3/);
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