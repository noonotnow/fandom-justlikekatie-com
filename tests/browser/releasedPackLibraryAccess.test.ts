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