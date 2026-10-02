import test from 'node:test';
import assert from 'node:assert/strict';
import seoIndexing, { appRouteMetadata, shouldNoindexUrl } from '../netlify/edge-functions/seo-indexing.js';
import {
  PUBLIC_CHINESE_LOCALE,
  PUBLIC_ORIGIN,
  PUBLIC_LOCALIZED_ROUTE_PATHS,
  PUBLIC_ROUTE_PATHS,
  VIBE_ATLAS_NETLIFY_ROUTES,
  publicRouteUrl,
} from '../shared/public-routes.js';
import {
  injectAppRouteMetadata,
  injectLaunchpadCanonical,
  launchpadOgImagePath,
} from '../vite.config.js';
import { localizedPath } from '../shared/locale.js';
import {
  checkLaunchpadPreview,
  launchpadOgImageUrl,
} from '../scripts/check-launchpad-preview.js';
import { access, readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const netlifyConfig = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

function netlifyBlocks(section: string) {
  return [...netlifyConfig.matchAll(
    new RegExp(`\\[\\[${section}\\]\\]\\s*([\\s\\S]*?)(?=\\n\\[\\[|$)`, 'g'),
  )].map(([, body]) => Object.fromEntries(
    [...body.matchAll(/^\s*(\w+)\s*=\s*(?:"([^"]*)"|(\d+|true|false))\s*$/gm)]
      .map(([, key, quoted, bare]) => [key, quoted ?? bare]),
  ));
}

const srcRouteSources = await Promise.all(
  (await readdir(new URL('../src/', import.meta.url), { recursive: true }))
    .filter(path => /\.(?:[cm]?[jt]sx?)$/.test(path))
    .map(path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')),
);

test('the launchpad canonical and social URLs are injected from the shared public routes before React runs', async () => {
  const builtHtml = injectLaunchpadCanonical(indexHtml);
  const expectedCanonical = publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad);
  const expectedImage = `${PUBLIC_ORIGIN}${launchpadOgImagePath}`;

  await access(new URL(`../public${launchpadOgImagePath}`, import.meta.url));

  assert.match(
    indexHtml,
    /<link rel="canonical" href="%PUBLIC_LAUNCHPAD_CANONICAL%" \/>/,
  );
  assert.match(indexHtml, /<meta property="og:url" content="%PUBLIC_LAUNCHPAD_OG_URL%" \/>/);
  assert.match(indexHtml, /<meta property="og:image" content="%PUBLIC_LAUNCHPAD_OG_IMAGE%" \/>/);
  assert.match(indexHtml, /hreflang="zh-CN" href="%PUBLIC_LAUNCHPAD_ZH_CANONICAL%"/);
  assert.doesNotMatch(
    indexHtml,
    /<(?:link rel="canonical"|meta property="og:(?:url|image)") [^>]*(?:href|content)="https?:\/\//,
  );
  assert.match(
    builtHtml,
    new RegExp(`<link rel="canonical" href="${expectedCanonical}" />`),
  );
  assert.match(
    builtHtml,
    new RegExp(`<meta property="og:url" content="${expectedCanonical}" />`),
  );
  assert.match(
    builtHtml,
    new RegExp(`<meta property="og:image" content="${expectedImage}" />`),
  );
  assert.throws(
    () => injectLaunchpadCanonical(builtHtml),
    /Expected 3 %PUBLIC_LAUNCHPAD_CANONICAL% placeholders.*found 0/,
  );
});

test('the production smoke check requests the exact launchpad Open Graph image and requires JPEG', async () => {
  const expectedImage = `${PUBLIC_ORIGIN}${launchpadOgImagePath}`;
  let requestedUrl = '';
  let requestedRedirectMode = '';
  const imageUrl = await checkLaunchpadPreview(async (input, init) => {
    requestedUrl = String(input);
    requestedRedirectMode = init?.redirect ?? '';
    return new Response('jpeg bytes', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
  }, indexHtml);

  assert.equal(launchpadOgImageUrl(indexHtml), expectedImage);
  assert.equal(imageUrl, expectedImage);
  assert.equal(requestedUrl, expectedImage);
  assert.equal(requestedRedirectMode, 'manual');
});

test('the launchpad social preview image decodes at the expected dimensions', async () => {
  const imageUrl = new URL(`../public${launchpadOgImagePath}`, import.meta.url);
  const image = await readFile(imageUrl);
  const { info } = await sharp(image, { failOn: 'error' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  assert.deepEqual(
    { width: info.width, height: info.height },
    { width: 1200, height: 630 },
  );
});

test('the production smoke check rejects redirects, HTML fallbacks, and errors', async () => {
  await assert.rejects(
    checkLaunchpadPreview(
      async () => new Response(null, {
        status: 301,
        headers: { location: '/index.html' },
      }),
      indexHtml,
    ),
    /returned HTTP 301/,
  );
  await assert.rejects(
    checkLaunchpadPreview(
      async () => new Response('<!doctype html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
      indexHtml,
    ),
    /did not return image\/jpeg/,
  );
  await assert.rejects(
    checkLaunchpadPreview(
      async () => new Response('missing', { status: 404 }),
      indexHtml,
    ),
    /returned HTTP 404/,
  );
});

test('the response layer excludes private query views but not the public daily route', () => {
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=collection`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=builder`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=plan`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}?account=member`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlasArchive}?date=2026-09-01`), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/auth/verify?token=opaque'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/memeforge/middle-earth?view=collection'), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/liu-xueyi/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlasActors}/liu-xueyi/?source=share`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/2026-09-03/liu-xueyi/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlasEditions}/2026-09-03/liu-xueyi/?date=2026-09-03`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/?utm_source=private`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/vibe-atlas`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/vibe-atlas/archive`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/vibe-atlas/actors/liu-xueyi/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/vibe-atlas/editions/2026-09-03/liu-xueyi/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/vibe-atlas/packs/liu-xueyi/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/c-drama-fandom/trope-decoder/`), false);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/c-drama-fandom/trope-decoder/?fate=moonlit-strategist`), true);
  assert.equal(shouldNoindexUrl(`${PUBLIC_ORIGIN}/zh-cn/c-drama-fandom/archetypes/`), true);
});

test('private raw HTML responses carry X-Robots-Tag before JavaScript runs', async () => {
  const response = await seoIndexing(
    new Request(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=collection`),
    { next: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
  );

  assert.match(response.headers.get('x-robots-tag') ?? '', /^noindex,\s*follow$/);
  assert.match(await response.text(), /<meta name="robots" content="noindex,follow" \/>/);
});

test('the public daily HTML remains indexable and advertises its own route', async () => {
  const response = await seoIndexing(
    new Request(`${PUBLIC_ORIGIN}${PUBLIC_ROUTE_PATHS.vibeAtlas}`),
    { next: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
  );

  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.match(await response.text(), /<meta name="robots" content="index,follow/);
  assert.match(appSource, /canonical\.href = publicRouteUrl/);
  assert.match(appSource, /PUBLIC_ROUTE_PATHS\.vibeAtlasArchive/);
  assert.doesNotMatch(srcRouteSources.join('\n'), /(?<!path\()(['"`])\/vibe-atlas(?:\/[^'"`]*)?(?:[?'"`])/);
  assert.doesNotMatch(appSource, /https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/archive/);
  assert.match(await readFile(new URL('../netlify/edge-functions/seo-indexing.js', import.meta.url), 'utf8'), /PUBLIC_ROUTE_PATHS\.vibeAtlasActors/);
});

test('public Vibe Atlas responses expose route-specific sharing metadata before JavaScript runs', async () => {
  const routes = [
    {
      path: PUBLIC_ROUTE_PATHS.vibeAtlas,
      title: 'Vibe Atlas | Daily C-Drama Collectible Cards | Fandom Vibes',
      description: 'Browse today’s Vibe Atlas C-drama collectible: one star, one vibe, and nine pieces of evidence.',
    },
    {
      path: PUBLIC_ROUTE_PATHS.vibeAtlasArchive,
      title: 'Vibe Atlas Archive | Fandom Vibes',
      description: 'Browse past Vibe Atlas C-drama collectible card drops, with one star, one vibe, and nine pieces of evidence in every edition.',
    },
  ];

  for (const route of routes) {
    const url = publicRouteUrl(route.path);
    const response = await seoIndexing(
      new Request(url),
      {
        next: async () => new Response(injectLaunchpadCanonical(indexHtml), {
          headers: { 'content-type': 'text/html; charset=UTF-8' },
        }),
      },
    );
    const html = await response.text();
    const expectedTags = [
      `<meta property="og:title" content="${route.title}" />`,
      `<meta property="og:description" content="${route.description}" />`,
      `<meta property="og:url" content="${url}" />`,
      '<meta name="twitter:card" content="summary_large_image" />',
      `<meta name="twitter:title" content="${route.title}" />`,
      `<meta name="twitter:description" content="${route.description}" />`,
    ];

    for (const tag of expectedTags) {
      assert.equal(
        html.split(tag).length - 1,
        1,
        `${route.path} raw response must expose exactly one ${tag}`,
      );
    }
    assert.doesNotMatch(
      html,
      /<meta property="og:url" content="https:\/\/fandom\.justlikekatie\.com\/" \/>/,
      `${route.path} raw response must not retain the launchpad sharing URL`,
    );
  }
});

test('Simplified Chinese core pages render Chinese metadata and reciprocal canonical alternates before JavaScript', async () => {
  const routes = [
    {
      english: '/',
      chinese: PUBLIC_LOCALIZED_ROUTE_PATHS.launchpad,
      title: 'Fandom Vibes｜古装剧粉丝指南与 Vibe Atlas',
    },
    {
      english: PUBLIC_ROUTE_PATHS.vibeAtlas,
      chinese: PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlas,
      title: 'Vibe Atlas｜每日古装剧收藏卡 | Fandom Vibes',
    },
    {
      english: PUBLIC_ROUTE_PATHS.vibeAtlasArchive,
      chinese: PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlasArchive,
      title: 'Vibe Atlas 往期典藏｜每日古装剧收藏卡 | Fandom Vibes',
    },
  ];

  for (const route of routes) {
    const englishUrl = publicRouteUrl(route.english);
    const chineseUrl = publicRouteUrl(route.chinese);
    const metadata = appRouteMetadata(chineseUrl);
    assert.equal(metadata?.lang, PUBLIC_CHINESE_LOCALE);
    assert.equal(metadata?.url, chineseUrl);
    assert.equal(metadata?.title, route.title);
    assert.equal(metadata?.alternates.find(({ hreflang }) => hreflang === 'en')?.href, englishUrl);
    assert.equal(metadata?.alternates.find(({ hreflang }) => hreflang === 'zh-CN')?.href, chineseUrl);

    const viteHtml = injectAppRouteMetadata(injectLaunchpadCanonical(indexHtml), route.chinese);
    assert.match(viteHtml, /<html lang="zh-CN"/);
    assert.match(viteHtml, new RegExp(`<title>${route.title}</title>`));
    assert.match(viteHtml, new RegExp(`<link rel="canonical" href="${chineseUrl}" \\/>`));
    assert.match(viteHtml, new RegExp(`<meta property="og:url" content="${chineseUrl}" \\/>`));
    assert.match(viteHtml, new RegExp(`<link rel="alternate" hreflang="en" href="${englishUrl}" \\/>`));
    assert.match(viteHtml, new RegExp(`<link rel="alternate" hreflang="zh-CN" href="${chineseUrl}" \\/>`));

    const response = await seoIndexing(
      new Request(chineseUrl),
      { next: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
    );
    const html = await response.text();
    assert.equal(response.headers.get('x-robots-tag'), null);
    assert.match(html, /<html lang="zh-CN"/);
    assert.match(html, new RegExp(`<title>${route.title}</title>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${chineseUrl}" \\/>`));
    assert.match(html, new RegExp(`<meta property="og:url" content="${chineseUrl}" \\/>`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="en" href="${englishUrl}" \\/>`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="zh-CN" href="${chineseUrl}" \\/>`));
    assert.match(html, new RegExp(`<link rel="alternate" hreflang="x-default" href="${englishUrl}" \\/>`));
  }
});

test('localized public sitemap entries stay limited to translated static routes and have language alternates', () => {
  for (const path of [
    PUBLIC_LOCALIZED_ROUTE_PATHS.launchpad,
    PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlas,
    PUBLIC_LOCALIZED_ROUTE_PATHS.vibeAtlasArchive,
    localizedPath(PUBLIC_ROUTE_PATHS.tropeDecoder, PUBLIC_CHINESE_LOCALE),
  ]) {
    assert.match(sitemap, new RegExp(`<loc>${PUBLIC_ORIGIN}${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>`));
  }
  assert.match(sitemap, /hreflang="zh-CN" href="https:\/\/fandom\.justlikekatie\.com\/zh-cn\/vibe-atlas"/);
  assert.doesNotMatch(sitemap, /\/zh-cn\/c-drama-fandom\/(?:archetypes|glossary|watch-journal)\//);
  assert.doesNotMatch(sitemap, /(?:\?|&)(?:view|account|token|handoff-preview)=/);
});

test('Netlify route bindings match the shared Vibe Atlas public-route registry', () => {
  const edgePaths = netlifyBlocks('edge_functions')
    .filter(({ function: functionName }) => functionName === 'seo-indexing')
    .map(({ path }) => path);
  const publicRecordRedirects = netlifyBlocks('redirects')
    .filter(({ to }) => to === '/.netlify/functions/public-records')
    .map(({ from, status, force }) => ({ from, status, force }));

  for (const path of VIBE_ATLAS_NETLIFY_ROUTES.seoIndexing) {
    assert.equal(
      edgePaths.filter(candidate => candidate === path).length,
      1,
      `Netlify must bind seo-indexing exactly once to ${path}`,
    );
  }
  assert.deepEqual(
    publicRecordRedirects,
    VIBE_ATLAS_NETLIFY_ROUTES.publicRecords.map(from => ({
      from,
      status: '200',
      force: 'true',
    })),
  );
});

test('Netlify still applies indexing protection to the other SPA entry points', () => {
  const edgePaths = netlifyBlocks('edge_functions')
    .filter(({ function: functionName }) => functionName === 'seo-indexing')
    .map(({ path }) => path);

  assert.ok(edgePaths.includes('/auth/*'));
  assert.ok(edgePaths.includes('/memeforge/middle-earth'));
  assert.ok(edgePaths.includes('/memeforge/middle-earth/*'));
  assert.match(netlifyConfig, /from = "\/sitemap\.xml"/);
});

test('robots lets crawlers observe noindex while the sitemap omits private views', () => {
  assert.doesNotMatch(robots, /Disallow: \/auth\//);
  assert.doesNotMatch(robots, /Disallow: \/vibe-atlas/);
  assert.doesNotMatch(robots, /Disallow: \/memeforge\/middle-earth/);
  assert.match(sitemap, /<loc>https:\/\/fandom\.justlikekatie\.com\/vibe-atlas<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/archive<\/loc>/);
  assert.doesNotMatch(sitemap, /view=(?:collection|builder|plan|membership)/);
});
