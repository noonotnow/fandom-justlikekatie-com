import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import seoIndexing, { shouldNoindexUrl } from '../netlify/edge-functions/seo-indexing.js';
import { PUBLIC_ROUTE_PATHS, publicRouteUrl } from '../shared/public-routes.js';
import { injectLaunchpadCanonical } from '../vite.config.js';

const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const netlifyConfig = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
const robots = await readFile(new URL('../public/robots.txt', import.meta.url), 'utf8');
const sitemap = await readFile(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

test('the launchpad canonical is injected from the shared public route before React runs', () => {
  const builtHtml = injectLaunchpadCanonical(indexHtml);
  const expectedCanonical = publicRouteUrl(PUBLIC_ROUTE_PATHS.launchpad);

  assert.match(
    indexHtml,
    /<link rel="canonical" href="%PUBLIC_LAUNCHPAD_CANONICAL%" \/>/,
  );
  assert.doesNotMatch(indexHtml, /<link rel="canonical" href="https?:\/\//);
  assert.match(
    builtHtml,
    new RegExp(`<link rel="canonical" href="${expectedCanonical}" />`),
  );
  assert.throws(
    () => injectLaunchpadCanonical(builtHtml),
    /Expected exactly one %PUBLIC_LAUNCHPAD_CANONICAL% placeholder.*found 0/,
  );
});

test('the response layer excludes private query views but not the public daily route', () => {
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas'), false);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas?view=collection'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas?view=builder'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas?view=plan'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas?account=member'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas/archive?date=2026-09-01'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/auth/verify?token=opaque'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/memeforge/middle-earth?view=collection'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/'), false);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/?source=share'), true);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas/editions/2026-09-03/liu-xueyi/'), false);
  assert.equal(shouldNoindexUrl('https://fandom.justlikekatie.com/vibe-atlas/editions/2026-09-03/liu-xueyi/?date=2026-09-03'), true);
});

test('private raw HTML responses carry X-Robots-Tag before JavaScript runs', async () => {
  const response = await seoIndexing(
    new Request('https://fandom.justlikekatie.com/vibe-atlas?view=collection'),
    { next: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
  );

  assert.match(response.headers.get('x-robots-tag') ?? '', /^noindex,\s*follow$/);
  assert.match(await response.text(), /<meta name="robots" content="index,follow/);
});

test('the public daily HTML remains indexable and advertises its own route', async () => {
  const response = await seoIndexing(
    new Request('https://fandom.justlikekatie.com/vibe-atlas'),
    { next: async () => new Response(indexHtml, { headers: { 'content-type': 'text/html' } }) },
  );

  assert.equal(response.headers.get('x-robots-tag'), null);
  assert.match(await response.text(), /<meta name="robots" content="index,follow/);
  assert.match(appSource, /canonical\.href = publicRouteUrl/);
  assert.match(appSource, /PUBLIC_ROUTE_PATHS\.vibeAtlasArchive/);
  assert.doesNotMatch(appSource, /https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/archive/);
});

test('Netlify applies the response rule to each SPA studio entry point', () => {
  assert.match(netlifyConfig, /function = "seo-indexing"/);
  assert.match(netlifyConfig, /path = "\/vibe-atlas"/);
  assert.match(netlifyConfig, /path = "\/auth\/\*"/);
  assert.match(netlifyConfig, /path = "\/memeforge\/middle-earth"/);
  assert.match(netlifyConfig, /from = "\/vibe-atlas\/actors\/\*"/);
  assert.match(netlifyConfig, /from = "\/vibe-atlas\/editions\/\*"/);
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