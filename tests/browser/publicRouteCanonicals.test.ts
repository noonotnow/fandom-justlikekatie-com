import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PUBLIC_ORIGIN,
  PUBLIC_STATIC_ROUTES,
} from '../../netlify/functions/lib/public-routes.js';
import {
  closeBrowserAndServer,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

type AppRenderedRoute = {
  path: string;
};

function assertCanonicalMatchesRoute(hrefs: string[], route: AppRenderedRoute) {
  assert.equal(
    hrefs.length,
    1,
    `${route.path} must expose exactly one canonical tag`,
  );
  assert.equal(
    hrefs[0],
    `${PUBLIC_ORIGIN}${route.path}`,
    `${route.path} canonical must match its registered production URL`,
  );
}

test('app-rendered public routes canonically match their registered production URLs', { timeout: 30_000 }, async () => {
  const appRenderedRoutes = PUBLIC_STATIC_ROUTES.filter(
    route => !route.page,
  );
  assert.ok(appRenderedRoutes.length > 0, 'the registry must include app-rendered routes');

  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    await page.route('https://www.googletagmanager.com/**', route => route.abort());

    for (const route of appRenderedRoutes) {
      await page.goto(`${origin}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.locator('link[rel~="canonical"]').first().waitFor({ state: 'attached' });
      const hrefs = await page.locator('link[rel~="canonical"]').evaluateAll(
        links => links.map(link => (link as HTMLLinkElement).href),
      );
      assertCanonicalMatchesRoute(hrefs, route);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('app-rendered canonical validation rejects conflicting indexing signals', async (t) => {
  const route: AppRenderedRoute = { path: '/vibe-atlas' };
  const expected = `${PUBLIC_ORIGIN}${route.path}`;

  await t.test('query-bearing canonical', () => {
    assert.throws(
      () => assertCanonicalMatchesRoute([`${expected}?view=collection`], route),
      /canonical must match its registered production URL/,
    );
  });

  await t.test('alternate-origin canonical', () => {
    assert.throws(
      () => assertCanonicalMatchesRoute([`https://example.com${route.path}`], route),
      /canonical must match its registered production URL/,
    );
  });

  await t.test('missing canonical tag', () => {
    assert.throws(
      () => assertCanonicalMatchesRoute([], route),
      /must expose exactly one canonical tag/,
    );
  });

  await t.test('duplicate canonical tags', () => {
    assert.throws(
      () => assertCanonicalMatchesRoute([expected, expected], route),
      /must expose exactly one canonical tag/,
    );
  });
});