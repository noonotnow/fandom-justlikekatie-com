import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PUBLIC_ORIGIN,
  PUBLIC_STATIC_ROUTES,
} from '../../shared/public-routes.js';
import {
  closeBrowserAndServer,
  gotoTestPage,
  launchBrowserWithServer,
  startViteTestServer,
} from './browserEngines.ts';

type AppRenderedRoute = {
  path: string;
};

type RouteMetadata = {
  title: string;
  robots: string;
  sharing: {
    title: string;
    description: string;
    url: string;
    image: string;
    card: string;
  };
};

const APP_RENDERED_ROUTE_METADATA: Readonly<Record<string, RouteMetadata>> = {
  '/': {
    title: 'Fandom Vibes | Daily C-Drama Collectibles & Fandom Guides',
    robots: 'index,follow,max-image-preview:large',
    sharing: {
      title: 'Fandom Vibes | Daily C-Drama Collectibles & Fandom Guides',
      description: 'Browse Vibe Atlas’s daily C-drama collectible: one star, one vibe, and nine pieces of evidence, alongside guides and fandom games.',
      url: `${PUBLIC_ORIGIN}/`,
      image: `${PUBLIC_ORIGIN}/assets/c-drama-fandom/lg01-master-og.jpg`,
      card: 'summary_large_image',
    },
  },
  '/vibe-atlas': {
    title: 'Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes',
    robots: 'index,follow,max-image-preview:large',
    sharing: {
      title: 'Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes',
      description: 'Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.',
      url: `${PUBLIC_ORIGIN}/vibe-atlas`,
      image: `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`,
      card: 'summary_large_image',
    },
  },
  '/vibe-atlas/archive': {
    title: 'Vibe Atlas Archive | Fandom Vibes',
    robots: 'index,follow,max-image-preview:large',
    sharing: {
      title: 'Vibe Atlas Archive | Fandom Vibes',
      description: 'Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.',
      url: `${PUBLIC_ORIGIN}/vibe-atlas/archive`,
      image: `${PUBLIC_ORIGIN}/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp`,
      card: 'summary_large_image',
    },
  },
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

async function assertRouteMetadata(
  page: import('playwright').Page,
  route: AppRenderedRoute,
  expected: RouteMetadata,
) {
  assertCanonicalMatchesRoute(await canonicalHrefs(page), route);
  const robots = page.locator('meta[name="robots"]');
  await robots.waitFor({ state: 'attached' });
  assert.equal(await page.title(), expected.title, `${route.path} must expose its expected document title`);
  assert.equal(
    await robots.getAttribute('content'),
    expected.robots,
    `${route.path} must expose its expected robots directive`,
  );

  const assertMetaContent = async (selector: string, expectedContent: string, signal: string) => {
    const elements = page.locator(selector);
    assert.equal(
      await elements.count(),
      1,
      `${route.path} must expose exactly one ${signal} sharing signal`,
    );
    assert.equal(
      await elements.first().getAttribute('content'),
      expectedContent,
      `${route.path} must expose its expected ${signal} sharing signal`,
    );
  };
  await assertMetaContent('meta[property="og:title"]', expected.sharing.title, 'Open Graph title');
  await assertMetaContent('meta[property="og:description"]', expected.sharing.description, 'Open Graph description');
  await assertMetaContent('meta[property="og:url"]', expected.sharing.url, 'Open Graph URL');
  await assertMetaContent('meta[property="og:image"]', expected.sharing.image, 'Open Graph image');
  await assertMetaContent('meta[name="twitter:card"]', expected.sharing.card, 'Twitter card directive');
  await assertMetaContent('meta[name="twitter:title"]', expected.sharing.title, 'Twitter title');
  await assertMetaContent('meta[name="twitter:description"]', expected.sharing.description, 'Twitter description');
  await assertMetaContent('meta[name="twitter:image"]', expected.sharing.image, 'Twitter image');
}

test('app-rendered public routes canonically match their registered production URLs', { timeout: 30_000 }, async () => {
  const appRenderedRoutes = PUBLIC_STATIC_ROUTES.filter(
    route => !route.page,
  );
  assert.ok(appRenderedRoutes.length > 0, 'the registry must include app-rendered routes');
  assert.deepEqual(
    Object.keys(APP_RENDERED_ROUTE_METADATA).sort(),
    appRenderedRoutes.map(route => route.path).sort(),
    'every app-rendered public route must have explicit search and social-sharing metadata expectations',
  );

  const [{ server, origin }, browser] = await launchBrowserWithServer(startViteTestServer());
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    page.setDefaultNavigationTimeout(15_000);
    await page.route('https://www.googletagmanager.com/**', route => route.abort());
    const crawlerContext = await browser.newContext({ javaScriptEnabled: false });
    const crawlerPage = await crawlerContext.newPage();

    for (const route of appRenderedRoutes) {
      await gotoTestPage(crawlerPage, `${origin}${route.path}`, { waitUntil: 'domcontentloaded' });
      await assertRouteMetadata(crawlerPage, route, APP_RENDERED_ROUTE_METADATA[route.path]);

      await gotoTestPage(page, `${origin}${route.path}`, { waitUntil: 'domcontentloaded' });
      await page.locator('meta[property="og:url"]').evaluate(
        (meta, expectedUrl) => new Promise<void>((resolve) => {
          if ((meta as HTMLMetaElement).content === expectedUrl) return resolve();
          const observer = new MutationObserver(() => {
            if ((meta as HTMLMetaElement).content === expectedUrl) {
              observer.disconnect();
              resolve();
            }
          });
          observer.observe(meta, { attributes: true, attributeFilter: ['content'] });
        }),
        APP_RENDERED_ROUTE_METADATA[route.path].sharing.url,
      );
      await assertRouteMetadata(page, route, APP_RENDERED_ROUTE_METADATA[route.path]);
    }
    await crawlerContext.close();
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

    await gotoTestPage(page, `${origin}${dailyRoute.path}`, { waitUntil: 'domcontentloaded' });
    await assertRouteMetadata(page, dailyRoute, APP_RENDERED_ROUTE_METADATA[dailyRoute.path]);

    await page.getByRole('button', { name: 'Vibe Atlas archive' }).click();
    await page.waitForURL(`${origin}${archiveRoute.path}`);
    await assertRouteMetadata(page, archiveRoute, APP_RENDERED_ROUTE_METADATA[archiveRoute.path]);

    await page.goBack();
    await page.waitForURL(`${origin}${dailyRoute.path}`);
    await assertRouteMetadata(page, dailyRoute, APP_RENDERED_ROUTE_METADATA[dailyRoute.path]);

    await page.goForward();
    await page.waitForURL(`${origin}${archiveRoute.path}`);
    await assertRouteMetadata(page, archiveRoute, APP_RENDERED_ROUTE_METADATA[archiveRoute.path]);
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
