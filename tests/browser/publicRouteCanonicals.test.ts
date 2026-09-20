import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PUBLIC_ORIGIN,
  PUBLIC_STATIC_ROUTES,
} from '../../shared/public-routes.js';
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

async function canonicalHrefs(page: import('playwright').Page) {
  await page.locator('link[rel~="canonical"]').first().waitFor({ state: 'attached' });
  return page.locator('link[rel~="canonical"]').evaluateAll(
    links => links.map(link => (link as HTMLLinkElement).href),
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
    page.setDefaultNavigationTimeout(15_000);
    await page.route('https://www.googletagmanager.com/**', route => route.abort());

    for (const route of appRenderedRoutes) {
      await page.goto(`${origin}${route.path}`, { waitUntil: 'domcontentloaded' });
      const hrefs = await canonicalHrefs(page);
      assertCanonicalMatchesRoute(hrefs, route);
    }
  } finally {
    await closeBrowserAndServer(browser, server);
  }
});

test('Daily and Archive UI and history navigation keeps one registered canonical', { timeout: 30_000 }, async () => {
  const dailyRoute = PUBLIC_STATIC_ROUTES.find(route => route.path === '/vibe-atlas' && !route.page);
  const archiveRoute = PUBLIC_STATIC_ROUTES.find(route => route.path === '/vibe-atlas/archive' && !route.page);
  assert.ok(dailyRoute, 'the registry must include the app-rendered Daily route');
  assert.ok(archiveRoute, 'the registry must include the app-rendered Archive route');

  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(10_000);
    await page.route('https://www.googletagmanager.com/**', route => route.abort());

    await page.goto(`${origin}${dailyRoute.path}`, { waitUntil: 'domcontentloaded' });
    assertCanonicalMatchesRoute(await canonicalHrefs(page), dailyRoute);

    await page.getByRole('button', { name: 'Vibe Atlas archive' }).click();
    await page.waitForURL(`${origin}${archiveRoute.path}`);
    assertCanonicalMatchesRoute(await canonicalHrefs(page), archiveRoute);

    await page.goBack();
    await page.waitForURL(`${origin}${dailyRoute.path}`);
    assertCanonicalMatchesRoute(await canonicalHrefs(page), dailyRoute);

    await page.goForward();
    await page.waitForURL(`${origin}${archiveRoute.path}`);
    assertCanonicalMatchesRoute(await canonicalHrefs(page), archiveRoute);
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
