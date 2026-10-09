import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";
import {
  LG01_OUTCOMES,
  assertPublicStaticNetlifyRedirects,
  preparePublicPages,
  publicStaticNetlifyRedirects,
  REQUIRED_PUBLIC_PAGES,
  REQUIRED_LOCALIZED_PUBLIC_PAGES,
  TROPE_DECODER_SHARE_EVENT,
  WATCH_JOURNAL_PUBLIC_PAGES,
} from "./generate-public-pages.js";
import {
  PUBLIC_ORIGIN,
  PUBLIC_LOCALIZED_STATIC_ROUTES,
  PUBLIC_STATIC_ROUTES,
} from "../netlify/functions/lib/public-routes.js";
import { PUBLIC_ROUTE_PATHS, publicStaticPreviewRoutes } from "../shared/public-routes.js";
import { assertRegisteredVibingWarningCopy, assertVibingWarningCopy } from "./vibing-warning-copy.js";
import { assertVibingPublicInventory } from "./vibing-public-inventory.js";
import { assertStaticGuidePublicInventory, STATIC_GUIDE_QUERY_SHARE_EXCLUSIONS } from "./static-guide-public-inventory.js";
import { createPublicSitemapHandler } from "../netlify/functions/public-sitemap.js";
import { manifestStore, publicManifest } from "../netlify/functions/public-test-fixture.js";
import { PUBLICATION_RELEASE_DATES_KEY } from "../netlify/functions/lib/publication-manifest.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
}

function assertCanonicalMatchesRoute(html, route) {
  const canonicalTags = [...html.matchAll(/<link\b[^>]*\brel=["'][^"']*\bcanonical\b[^"']*["'][^>]*>/gi)];
  assert.equal(
    canonicalTags.length,
    1,
    `${route.page} must contain exactly one canonical tag`,
  );

  const href = canonicalTags[0][0].match(/\bhref=["']([^"']+)["']/i)?.[1];
  assert.equal(
    href,
    `${PUBLIC_ORIGIN}${route.path}`,
    `${route.page} canonical must match its registered production URL`,
  );
}

function sameOriginAssetPaths(html, routeUrl, origin) {
  const assetReferences = [];
  const elements = html.match(/<(?:img|script|link|source|video)\b[^>]*>/gi) ?? [];

  for (const element of elements) {
    for (const attribute of ["src", "href", "poster"]) {
      const value = element.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1];
      if (value) assetReferences.push(value);
    }

    const srcset = element.match(/\bsrcset=["']([^"']+)["']/i)?.[1];
    if (srcset) {
      assetReferences.push(...srcset.split(",").map((candidate) => candidate.trim().split(/\s+/)[0]));
    }
  }

  return [...new Set(assetReferences.flatMap((reference) => {
    try {
      const url = new URL(reference, routeUrl);
      return url.origin === origin ? [`${url.pathname}${url.search}`] : [];
    } catch {
      return [];
    }
  }))];
}

async function assertSameOriginAssetsLoad(html, routePath, origin) {
  const assetPaths = sameOriginAssetPaths(html, `${origin}${routePath}`, origin);
  for (const assetPath of assetPaths) {
    const assetResponse = await fetch(`${origin}${assetPath}`, {
      headers: { Accept: "application/octet-stream" },
    });
    assert.ok(
      assetResponse.ok && !assetResponse.headers.get("content-type")?.includes("text/html"),
      `${routePath} references missing local asset ${assetPath} (HTTP ${assetResponse.status})`,
    );
  }
}

function localCssUrl(reference, baseUrl, origin) {
  if (!reference || reference.startsWith("#")) return null;
  try {
    const url = new URL(reference, baseUrl);
    return url.origin === origin ? url : null;
  } catch {
    return null;
  }
}

async function assertCssReferencesLoad(css, stylesheetUrl, routePath, origin, visited) {
  // Ignore commented-out declarations, but keep quoted and unquoted url() values.
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const references = /@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)|"([^"]+)"|'([^']+)')|url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]*?))\s*\)/gi;
  for (const match of withoutComments.matchAll(references)) {
    const imported = /^@import/i.test(match[0]);
    const reference = match.slice(1).find(Boolean)?.trim();
    const url = localCssUrl(reference, stylesheetUrl, origin);
    if (!url) continue;
    const assetPath = `${url.pathname}${url.search}`;
    const response = await fetch(url, { headers: { Accept: imported ? "text/css" : "application/octet-stream" } });
    assert.ok(
      response.ok && !response.headers.get("content-type")?.includes("text/html"),
      `${routePath} stylesheet ${stylesheetUrl.pathname} references missing local asset ${assetPath} (HTTP ${response.status})`,
    );
    if (imported && !visited.has(url.href)) {
      visited.add(url.href);
      await assertCssReferencesLoad(await response.text(), url, routePath, origin, visited);
    }
  }
}

async function assertStylesheetAssetsLoad(html, routePath, origin) {
  const visited = new Set();
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1];
    if (!rel?.split(/\s+/).some((value) => value.toLowerCase() === "stylesheet")) continue;
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const url = localCssUrl(href, `${origin}${routePath}`, origin);
    if (!url || visited.has(url.href)) continue;
    visited.add(url.href);
    const response = await fetch(url, { headers: { Accept: "text/css" } });
    assert.ok(
      response.ok && !response.headers.get("content-type")?.includes("text/html"),
      `${routePath} stylesheet ${url.pathname} is missing (HTTP ${response.status})`,
    );
    await assertCssReferencesLoad(await response.text(), url, routePath, origin, visited);
  }
}

test("static public pages canonically match their registered production routes", () => {
  const fileBackedRoutes = [
    ...PUBLIC_STATIC_ROUTES,
    ...PUBLIC_LOCALIZED_STATIC_ROUTES,
  ].filter(({ page }) => page);
  assert.ok(fileBackedRoutes.length > 0, "the registry must include static HTML pages");

  for (const route of fileBackedRoutes) {
    assertCanonicalMatchesRoute(read(route.page), route);
  }
});

test("every publishable Vibing Now article file has its expected public registry route", () => {
  assertVibingPublicInventory(root);
});

test("every static C-drama guide file has its expected public registry route", () => {
  assertStaticGuidePublicInventory(root);
});

test("static guide inventory catches omitted guides and accepts exact registrations", (t) => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "static-guide-inventory-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  for (const directory of ["public/c-drama-fandom", "public/c-dramas"]) {
    mkdirSync(resolve(fixtureRoot, directory), { recursive: true });
  }
  const writeFixture = (page, html = "<!doctype html><h1>Fixture</h1>") => {
    mkdirSync(dirname(resolve(fixtureRoot, page)), { recursive: true });
    writeFileSync(resolve(fixtureRoot, page), html);
  };
  writeFixture("public/c-drama-fandom/glossary/assets/readme.txt");
  assert.doesNotThrow(() => assertStaticGuidePublicInventory(fixtureRoot, []));
  const routes = [];
  for (const page of [
    "public/c-drama-fandom/index.html",
    "public/c-drama-fandom/glossary/index.html",
    "public/c-drama-fandom/glossary/new-term/index.html",
    "public/c-drama-fandom/archetypes/new-archetype/index.html",
    "public/c-drama-fandom/soundtrack/new-drama/index.html",
    "public/c-drama-fandom/new-section/nested/guide/index.html",
    "public/c-dramas/new-drama/themes/index.html",
    "public/c-drama-fandom/vibing-now/index.html",
  ]) {
    const path = `/${page.replace(/^public\//, "").replace(/index\.html$/, "")}`;
    writeFixture(page);
    const message = `${page}: unregistered static C-drama guide; expected route ${path} in shared/public-routes.js`;
    assert.throws(() => assertStaticGuidePublicInventory(fixtureRoot, routes), { message });
    for (const invalid of [
      { path: `${path}wrong/`, page },
      { path, page: `${page}.wrong` },
    ]) {
      assert.throws(() => assertStaticGuidePublicInventory(fixtureRoot, [...routes, invalid]), { message });
    }
    routes.push({ path, page, group: "editorial" });
    assert.doesNotThrow(() => assertStaticGuidePublicInventory(fixtureRoot, routes));
  }
  writeFixture("public/c-drama-fandom/vibing-now/unregistered-article/index.html");
  assert.doesNotThrow(() => assertStaticGuidePublicInventory(fixtureRoot, routes),
    "Vibing Now articles remain owned by their separate inventory");

  for (const page of Object.keys(STATIC_GUIDE_QUERY_SHARE_EXCLUSIONS)) writeFixture(page);
  assert.doesNotThrow(() => assertStaticGuidePublicInventory(fixtureRoot, routes));
  const page = "public/c-drama-fandom/fandom-games/previews/new-result/index.html";
  writeFixture(page, '<meta name="robots" content="noindex"><h1>Fixture</h1>');
  assert.throws(() => assertStaticGuidePublicInventory(fixtureRoot, routes),
    /previews\/new-result\/index\.html: unregistered static C-drama guide/,
    "neither a previews directory nor noindex copy exempts a new file");
  const fixtures = { [page]: "Synthetic non-public test fixture, not a publishable guide." };
  assert.doesNotThrow(() => assertStaticGuidePublicInventory(fixtureRoot, routes, fixtures));
  for (const invalid of [
    { [page]: "" },
    { "public/c-drama-fandom/fandom-games/previews/": "Entire directory" },
    { "public/c-drama-fandom/../c-drama-fandom/draft/index.html": "Non-normalized path" },
    { "public/c-drama-fandom/vibing-now/draft/index.html": "Wrong inventory" },
    { "public/elsewhere/index.html": "Outside inventory" },
  ]) {
    assert.throws(() => assertStaticGuidePublicInventory(fixtureRoot, routes, invalid),
      /exact guide file path and documented reason/);
  }
  writeFixture("public/c-drama-fandom/fandom-games/previews/another-result/index.html");
  assert.throws(() => assertStaticGuidePublicInventory(fixtureRoot, routes, fixtures),
    /previews\/another-result\/index\.html: unregistered static C-drama guide/,
    "an exact fixture exemption does not exempt its siblings");
});

test("Vibing Now inventory catches unregistered articles independently of copy", (t) => {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), "vibing-public-inventory-"));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  const shelf = "public/c-drama-fandom/vibing-now";
  const writeFixture = (page, html = "<!doctype html><h1>Fixture</h1>") => {
    mkdirSync(dirname(resolve(fixtureRoot, page)), { recursive: true });
    writeFileSync(resolve(fixtureRoot, page), html);
  };
  writeFixture(`${shelf}/index.html`);
  writeFixture(`${shelf}/assets/readme.txt`);
  assert.doesNotThrow(() => assertVibingPublicInventory(fixtureRoot, []),
    "the shelf and non-index assets are not installments");

  const page = `${shelf}/another-drama-episodes-31-35/index.html`;
  const path = "/c-drama-fandom/vibing-now/another-drama-episodes-31-35/";
  writeFixture(page);
  assert.throws(() => assertVibingPublicInventory(fixtureRoot, PUBLIC_STATIC_ROUTES), {
    message: `${page}: unregistered Vibing Now article; expected route ${path} in shared/public-routes.js`,
  });
  const routes = [...PUBLIC_STATIC_ROUTES, { path, page, group: "editorial" }];
  assert.doesNotThrow(() => assertVibingPublicInventory(fixtureRoot, routes),
    "registering the same article makes its inventory check pass");
  for (const invalid of [
    { path: `${path}wrong/`, page },
    { path, page: `${shelf}/wrong/index.html` },
  ]) {
    assert.throws(() => assertVibingPublicInventory(fixtureRoot, [invalid]),
      /unregistered Vibing Now article/);
  }

  const nestedPage = `${shelf}/drafts/nested-article/index.html`;
  writeFixture(nestedPage, '<meta name="robots" content="noindex"><h1>Draft fixture</h1>');
  assert.throws(() => assertVibingPublicInventory(fixtureRoot, routes), {
    message: `${nestedPage}: unregistered Vibing Now article; expected route /c-drama-fandom/vibing-now/drafts/nested-article/ in shared/public-routes.js`,
  });
  const fixtures = { [nestedPage]: "Non-public synthetic inventory fixture; not an editorial draft." };
  assert.doesNotThrow(() => assertVibingPublicInventory(fixtureRoot, routes, fixtures));
  assert.throws(() => assertVibingPublicInventory(fixtureRoot, routes, { [nestedPage]: "" }),
    /exact article file path and documented reason/);
  writeFixture(`${shelf}/drafts/another-article/index.html`);
  assert.throws(() => assertVibingPublicInventory(fixtureRoot, routes, fixtures),
    /drafts\/another-article\/index\.html: unregistered Vibing Now article/,
    "a fixture exemption must not exclude its siblings or the whole directory");
});

test("the Episode 21 article has an editorial discussion with an explicit safe boundary and working route", () => {
  const html = read("public/c-drama-fandom/vibing-now/against-the-current-episode-21/index.html");
  const script = read("public/c-drama-fandom/vibing-discussion.js");
  const redirects = read("netlify.toml");
  assert.match(html, /Editorial question · Vibing Now discussion/);
  assert.match(html, /Through Episode 21 only/);
  assert.match(html, /No account or purchase needed/);
  assert.match(html, /id="discussion-responses"/);
  assert.match(script, /There are no approved reader responses yet/);
  assert.match(script, /text\.textContent = item\.text/);
  assert.match(script, /Report this response/);
  assert.match(redirects, /from = "\/api\/vibing-discussion"\s+to = "\/\.netlify\/functions\/vibing-discussion"/);
});

test("Netlify serves every registered C-drama static page before the SPA fallback", () => {
  const netlify = read("netlify.toml");
  const expectedRedirects = publicStaticNetlifyRedirects();

  assert.ok(expectedRedirects.length > 0);
  assert.doesNotThrow(() => assertPublicStaticNetlifyRedirects(netlify));
  assert.ok(REQUIRED_LOCALIZED_PUBLIC_PAGES.includes(
    "public/zh-cn/c-drama-fandom/trope-decoder/index.html",
  ));

  const renamedRoutes = PUBLIC_STATIC_ROUTES.map((route) => (
    route.path === "/c-drama-fandom/getting-started/"
      ? {
        ...route,
        path: "/c-drama-fandom/start-here/",
        page: "public/c-drama-fandom/start-here/index.html",
      }
      : route
  ));
  assert.throws(
    () => assertPublicStaticNetlifyRedirects(netlify, renamedRoutes),
    /must serve \/c-drama-fandom\/start-here from \/c-drama-fandom\/start-here\/index\.html/,
  );

  const gettingStartedBlock = `[[redirects]]
from = "/c-drama-fandom/getting-started"
to = "/c-drama-fandom/getting-started/index.html"
status = 200`;
  const belowSpaFallback = netlify
    .replace(`${gettingStartedBlock}\n\n`, "")
    .concat(`\n\n${gettingStartedBlock}\n`);
  assert.throws(
    () => assertPublicStaticNetlifyRedirects(belowSpaFallback),
    /route \/c-drama-fandom\/getting-started is unreachable behind earlier redirect \/\*/,
  );
});

test("local preview routes follow registered C-drama static page renames", () => {
  const renamedRoutes = PUBLIC_STATIC_ROUTES.map((route) => (
    route.path === "/c-drama-fandom/getting-started/"
      ? {
        ...route,
        path: "/c-drama-fandom/start-here/",
        page: "public/c-drama-fandom/start-here/index.html",
      }
      : route
  ));
  const previewRoutes = new Map(publicStaticPreviewRoutes(renamedRoutes));

  assert.equal(
    previewRoutes.get("/c-drama-fandom/start-here"),
    "/c-drama-fandom/start-here/index.html",
  );
  assert.equal(previewRoutes.has("/c-drama-fandom/getting-started"), false);
  assert.equal(previewRoutes.has("/vibe-atlas"), false, "SPA routes must remain on the SPA fallback");

  const viteConfig = read("vite.config.ts");
  assert.match(viteConfig, /new Map\(publicStaticPreviewRoutes\(\)\)/);
  assert.match(viteConfig, /request\.url = `\$\{publicFile\}\$\{url\.search\}`/);
});

test("local Vite serves registered C-drama documents before the SPA fallback", async (t) => {
  const server = await createViteServer({
    configFile: resolve(root, "vite.config.ts"),
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  t.after(() => server.close());
  await server.listen();

  const address = server.httpServer?.address();
  assert.ok(address && typeof address !== "string", "Vite must listen on an isolated TCP port");
  const origin = `http://127.0.0.1:${address.port}`;
  const homepage = await (await fetch(origin)).text();
  assert.match(homepage, /<a href="\/c-drama-fandom\/vibing-now\/">choose an Against the Current Vibing Now reading<\/a>/);
  const fileBackedRoutes = [
    ...PUBLIC_STATIC_ROUTES,
    ...PUBLIC_LOCALIZED_STATIC_ROUTES,
  ].filter(
    ({ group, page }) => group === "editorial" && page,
  );
  assert.ok(fileBackedRoutes.length > 0, "the registry must include C-drama static HTML pages");

  for (const route of fileBackedRoutes) {
    const expectedHtml = read(route.page);
    const expectedTitle = expectedHtml.match(/<title>([^<]+)<\/title>/i)?.[1];
    assert.ok(expectedTitle, `${route.page} must have a title`);

    const cleanResponse = await fetch(`${origin}${route.path}`);
    assert.equal(cleanResponse.status, 200, `${route.path} must be served by local Vite`);
    const cleanHtml = await cleanResponse.text();
    assert.match(cleanHtml, new RegExp(`<title>${expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`, "i"));
    assertCanonicalMatchesRoute(cleanHtml, route);
    assert.doesNotMatch(cleanHtml, /<div id="root"><\/div>/i, `${route.path} must not receive the SPA shell`);

    await assertSameOriginAssetsLoad(cleanHtml, route.path, origin);
    await assertStylesheetAssetsLoad(cleanHtml, route.path, origin);

    const queryResponse = await fetch(`${origin}${route.path}?preview=registered-route`);
    assert.equal(queryResponse.status, 200, `${route.path} must accept query strings`);
    assert.equal(
      await queryResponse.text(),
      cleanHtml,
      `${route.path} query strings must not change the selected static document`,
    );
  }

  const spaResponse = await fetch(`${origin}${PUBLIC_ROUTE_PATHS.vibeAtlas}?view=collection`);
  assert.equal(spaResponse.status, 200);
  const spaHtml = await spaResponse.text();
  assert.match(spaHtml, /<div id="root">/i, "non-file-backed routes must receive the SPA shell");
  assert.match(spaHtml, /<title>Vibe Atlas \| Daily C-Drama Collectible Cards \| Fandom Vibes<\/title>/i);

  await assert.rejects(
    assertSameOriginAssetsLoad(
      '<script src="/c-drama-fandom/missing-guide-script.js"></script>',
      "/c-drama-fandom/example/",
      origin,
    ),
    /\/c-drama-fandom\/example\/ references missing local asset \/c-drama-fandom\/missing-guide-script\.js \(HTTP 404\)/,
  );
  await assert.rejects(
    assertStylesheetAssetsLoad(
      '<link href="/c-drama-fandom/missing-guide-styles.css" rel="preload stylesheet">',
      "/c-drama-fandom/example/",
      origin,
    ),
    /\/c-drama-fandom\/example\/ stylesheet \/c-drama-fandom\/missing-guide-styles\.css is missing \(HTTP 404\)/,
  );

  const stylesheetUrl = new URL("/c-drama-fandom/styles.css", origin);
  for (const css of [
    'figure { background-image: url("missing-guide-image.webp"); }',
    '@import "missing-guide-theme.css";',
    '@import url("missing-guide-theme.css") screen;',
  ]) {
    await assert.rejects(
      assertCssReferencesLoad(css, stylesheetUrl, "/c-drama-fandom/example/", origin, new Set()),
      /\/c-drama-fandom\/example\/ stylesheet \/c-drama-fandom\/styles\.css references missing local asset \/c-drama-fandom\/missing-guide-(?:image\.webp|theme\.css) \(HTTP 404\)/,
    );
  }
  await assert.doesNotReject(
    assertCssReferencesLoad(
      '/* url("missing-guide-image.webp") */ .icon { background: url(data:image/svg+xml;base64,PHN2Zy8+); } @import "https://example.com/theme.css";',
      stylesheetUrl,
      "/c-drama-fandom/example/",
      origin,
      new Set(),
    ),
  );
});

test("static redirect validation leaves fandom-game query previews independent", () => {
  const netlify = read("netlify.toml");
  const previewRedirects = [...netlify.matchAll(
    /\[\[redirects\]\]\s+from = "\/c-drama-fandom\/fandom-games\/"\s+to = "([^"]+)"\s+status = 200\s+force = true\s+query = \{ fate = "([^"]+)" \}/g,
  )];

  assert.equal(previewRedirects.length, LG01_OUTCOMES.length);
  assert.deepEqual(
    previewRedirects.map(([, to, fate]) => ({ to, fate })),
    LG01_OUTCOMES.map(({ id }) => ({
      to: `/c-drama-fandom/fandom-games/previews/${id}/index.html`,
      fate: id,
    })),
  );
});

test("canonical route validation rejects conflicting indexing signals", async (t) => {
  const route = {
    path: "/c-drama-fandom/example/",
    page: "public/c-drama-fandom/example/index.html",
  };
  const canonical = (href) => `<link rel="canonical" href="${href}">`;

  await t.test("query-bearing canonical", () => {
    assert.throws(
      () => assertCanonicalMatchesRoute(
        canonical(`${PUBLIC_ORIGIN}${route.path}?view=collection`),
        route,
      ),
      /canonical must match its registered production URL/,
    );
  });

  await t.test("alternate-origin canonical", () => {
    assert.throws(
      () => assertCanonicalMatchesRoute(
        canonical(`https://example.com${route.path}`),
        route,
      ),
      /canonical must match its registered production URL/,
    );
  });

  await t.test("duplicate canonical tags", () => {
    assert.throws(
      () => assertCanonicalMatchesRoute(
        `${canonical(`${PUBLIC_ORIGIN}${route.path}`)}${canonical(`${PUBLIC_ORIGIN}${route.path}`)}`,
        route,
      ),
      /must contain exactly one canonical tag/,
    );
  });
});

test("the C-drama fandom routes are substantial static HTML documents", () => {
  const titles = new Set();
  const canonicals = new Set();

  for (const path of REQUIRED_PUBLIC_PAGES) {
    const html = read(path);
    assert.match(html, /<!doctype html>/i, `${path} must be a full HTML document`);
    assert.match(html, /<h1[\s>]/i, `${path} must contain a crawlable H1`);
    assert.match(html, /<meta name="description" content="[^"]{80,}"/i);
    assert.match(html, /<script type="application\/ld\+json">/i);
    assert.doesNotMatch(html, /<div id="root"><\/div>/i, `${path} cannot rely on the SPA root`);
    const minimumLength = path.endsWith("/untamed-name-board/index.html") ? 6_000 : 7_000;
    assert.ok(html.length > minimumLength, `${path} should contain substantial editorial content`);

    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(title);
    assert.ok(canonical);
    titles.add(title);
    canonicals.add(canonical);
  }

  assert.equal(titles.size, REQUIRED_PUBLIC_PAGES.length, "page titles must be unique");
  assert.equal(canonicals.size, REQUIRED_PUBLIC_PAGES.length, "canonicals must be unique");
});

test("robots and sitemap expose only intended public surfaces", () => {
  const robots = read("public/robots.txt");
  const sitemap = read("public/sitemap.xml");
  const viteConfig = read("vite.config.ts");
  const netlify = read("netlify.toml");
  const editorialUrls = [
    "https://fandom.justlikekatie.com/c-drama-fandom/",
    "https://fandom.justlikekatie.com/c-drama-fandom/getting-started/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/",
    "https://fandom.justlikekatie.com/c-drama-fandom/untamed-name-board/",
    "https://fandom.justlikekatie.com/c-drama-fandom/untamed-names-and-performers/",
    "https://fandom.justlikekatie.com/c-drama-fandom/place-names/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/cp/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/cultivation/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/xianxia/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/jianghu/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/wuxia/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/wuxia-vs-xianxia-vs-xuanhuan/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/historical-vs-costume-drama/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/duanju-microdrama-vertical-drama/",
    "https://fandom.justlikekatie.com/c-drama-fandom/archetypes/",
    "https://fandom.justlikekatie.com/c-drama-fandom/archetypes/cold-male-lead-vs-tsundere/",
    "https://fandom.justlikekatie.com/c-drama-fandom/archetypes/black-bellied-vs-white-cut-black/",
    "https://fandom.justlikekatie.com/c-drama-fandom/archetypes/white-moonlight-vs-cinnabar-mole/",
    "https://fandom.justlikekatie.com/c-drama-fandom/trope-decoder/",
    "https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episode-21/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episodes-22-25/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episodes-30-31/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episodes-32-33/",
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episodes-34-38/",
    "https://fandom.justlikekatie.com/c-drama-fandom/where-to-watch/against-the-current/",
    "https://fandom.justlikekatie.com/c-drama-fandom/soundtrack/against-the-current/",
  ];
  const journalUrls = WATCH_JOURNAL_PUBLIC_PAGES.map((path) => (
    `https://fandom.justlikekatie.com/${path
      .replace(/^public\//, "")
      .replace(/index\.html$/, "")}`
  ));

  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Sitemap: https:\/\/fandom\.justlikekatie\.com\/sitemap\.xml$/m);
  assert.equal(XMLValidator.validate(sitemap), true, "sitemap must be valid XML");

  const sitemapDocument = new XMLParser({ ignoreAttributes: true }).parse(sitemap);
  const sitemapUrls = sitemapDocument.urlset?.url?.map((entry) => entry.loc);
  assert.ok(Array.isArray(sitemapUrls), "sitemap must contain a urlset with url entries");
  for (const url of editorialUrls) {
    assert.equal(
      sitemapUrls.filter((sitemapUrl) => sitemapUrl === url).length,
      1,
      `${url} must appear in the sitemap exactly once`,
    );
  }
  for (const url of journalUrls) {
    assert.equal(
      sitemapUrls.filter((sitemapUrl) => sitemapUrl === url).length,
      1,
      `${url} must appear in the sitemap exactly once`,
    );
  }
  assert.equal(
    sitemapUrls.filter((url) => url.startsWith("https://fandom.justlikekatie.com/c-drama-fandom/")).length,
    editorialUrls.length + journalUrls.length,
    "sitemap must expose only the intended editorial and journal routes",
  );
  assert.ok(sitemapUrls.includes("https://fandom.justlikekatie.com/vibe-atlas"));
  assert.doesNotMatch(sitemap, /view=(?:collection|builder|plan|membership)/);
  assert.doesNotMatch(sitemap, /\/api\/|\/auth\/|create-handoff|idea-packet/);
  assert.match(viteConfig, /new Map\(publicStaticPreviewRoutes\(\)\)/);
  assert.match(netlify, /from = "\/c-drama-fandom\/trope-decoder"[\s\S]*?to = "\/c-drama-fandom\/trope-decoder\/index\.html"/);
  for (const slug of [
    "cp",
    "cultivation",
    "xianxia",
    "jianghu",
    "wuxia",
    "wuxia-vs-xianxia-vs-xuanhuan",
    "historical-vs-costume-drama",
    "duanju-microdrama-vertical-drama",
  ]) {
    assert.match(
      netlify,
      new RegExp(`from = "/c-drama-fandom/glossary/${slug}"[\\s\\S]*?to = "/c-drama-fandom/glossary/${slug}/index\\.html"`),
    );
  }
  for (const slug of [
    "archetypes",
    "archetypes/cold-male-lead-vs-tsundere",
    "archetypes/black-bellied-vs-white-cut-black",
    "archetypes/white-moonlight-vs-cinnabar-mole",
  ]) {
    assert.match(
      netlify,
      new RegExp(`from = "/c-drama-fandom/${slug}"[\\s\\S]*?to = "/c-drama-fandom/${slug}/index\\.html"`),
    );
  }
});

test("generated and production sitemaps preserve every crawlable static route", async () => {
  const staticUrls = new XMLParser({ ignoreAttributes: true })
    .parse(read("public/sitemap.xml"))
    .urlset.url.map(({ loc }) => loc);
  const handler = createPublicSitemapHandler({
    getStore: () => manifestStore([publicManifest()]),
  });
  const result = await handler(new Request(`${PUBLIC_ORIGIN}/sitemap.xml`), {});
  assert.equal(result.statusCode, 200);

  for (const { path } of PUBLIC_STATIC_ROUTES) {
    const url = `${PUBLIC_ORIGIN}${path}`;
    assert.equal(staticUrls.filter((entry) => entry === url).length, 1, `${url} must appear once in the generated sitemap`);
    assert.equal(result.body.split(`<loc>${url}</loc>`).length - 1, 1, `${url} must appear once in the production sitemap`);
  }
  for (const url of staticUrls) {
    assert.doesNotMatch(url, /\?|\/(?:api|auth)\//);
  }
});

test("sitemap detects a released date removed from a syntactically valid catalog", async () => {
  const release = publicManifest();
  const store = manifestStore([release]);
  const released = {
    schemaVersion: 1,
    kind: "vibe-atlas-released-dates",
    verifiedBaseline: true,
    dates: [release.publicationDate],
  };
  let catalogDates = [release.publicationDate];
  const publicationStore = {
    get: (key, options) => key === PUBLICATION_RELEASE_DATES_KEY
      ? released
      : key.includes("grid-manifest-catalog")
        ? Promise.resolve({
          schemaVersion: 1, catalogVersion: "v1",
          kind: "vibe-atlas-publication-manifest-catalog", dates: catalogDates,
        })
        : store.get(key, options),
    list: () => ({ blobs: [] }), // Listing may lag or be empty independently of the catalog.
  };
  const handler = createPublicSitemapHandler({
    getStore: () => publicationStore,
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const request = new Request(`${PUBLIC_ORIGIN}/sitemap.xml`);
  let result = await handler(request, {});
  assert.equal(result.headers["X-Public-Sitemap-Inventory"], "complete");
  catalogDates = [];
  result = await handler(request, {});
  assert.equal(result.headers["X-Public-Sitemap-Inventory"], "publication-history-mismatch");
  assert.doesNotMatch(result.body, /\/vibe-atlas\/editions\//);
  catalogDates = [release.publicationDate];
  result = await handler(request, {});
  assert.equal(result.headers["X-Public-Sitemap-Inventory"], "complete");
});

test("a verified release history must cover every catalog date", async () => {
  const store = manifestStore([publicManifest()]);
  const handler = createPublicSitemapHandler({
    getStore: () => ({
      ...store,
      get: (key, options) => key.includes("grid-release-dates")
        ? { schemaVersion: 1, kind: "vibe-atlas-released-dates",
          verifiedBaseline: true, dates: [] }
        : store.get(key, options),
    }),
    buildReleaseCatalog: async () => ({ complete: true, packs: [] }),
  });
  const result = await handler(new Request(`${PUBLIC_ORIGIN}/sitemap.xml`), {});
  assert.equal(result.headers["X-Public-Sitemap-Inventory"], "release-history-unavailable");
});

test("the fandom-literacy pages answer independently and continue honestly into Atlas", () => {
  const literacyPages = [
    ["cp", /What does CP mean in C-drama fandom\?/i],
    ["cultivation", /What is cultivation in Chinese dramas\?/i],
    ["xianxia", /What is xianxia\?/i],
    ["jianghu", /What is jianghu\?/i],
  ];

  for (const [slug, question] of literacyPages) {
    const html = read(`public/c-drama-fandom/glossary/${slug}/index.html`);
    assert.match(html, question);
    assert.match(html, /data-content-mode="fandom-literacy"/);
    assert.match(html, /class="field-lens"/);
    assert.match(html, /data-atlas-continuation/);
    assert.match(html, /Today’s Vibe Atlas drop/i);
    assert.match(html, /src="\/c-drama-fandom\/editorial\.js"/);
  }
});

test("the second authority batch offers complete answers and measurable interactions", () => {
  const authorityPages = [
    ["public/c-drama-fandom/glossary/wuxia/index.html", /Code → Debt → Choice/],
    ["public/c-drama-fandom/glossary/wuxia-vs-xianxia-vs-xuanhuan/index.html", /data-genre-tool/],
    ["public/c-drama-fandom/archetypes/index.html", /data-archetype-filter/],
    ["public/c-drama-fandom/archetypes/cold-male-lead-vs-tsundere/index.html", /Surface → Leak → Pattern/],
  ];

  for (const [path, signature] of authorityPages) {
    const html = read(path);
    assert.match(html, /class="answer-line"/);
    assert.match(html, /data-section-id=/);
    assert.match(html, /data-atlas-continuation/);
    assert.match(html, /Today’s Vibe Atlas drop/i);
    assert.match(html, /src="\/c-drama-fandom\/editorial\.js"/);
    assert.match(html, signature);
  }
});

test("the third authority batch preserves nuance and measurable reader tools", () => {
  const authorityPages = [
    ["public/c-drama-fandom/glossary/historical-vs-costume-drama/index.html", /Grounding → Visual language → World/],
    ["public/c-drama-fandom/glossary/duanju-microdrama-vertical-drama/index.html", /Length → Rhythm → Frame → Distribution/],
    ["public/c-drama-fandom/archetypes/black-bellied-vs-white-cut-black/index.html", /Mask → Method → Motive/],
    ["public/c-drama-fandom/archetypes/white-moonlight-vs-cinnabar-mole/index.html", /Distance → Memory → Symbol/],
  ];

  for (const [path, signature] of authorityPages) {
    const html = read(path);
    assert.match(html, /class="answer-line"/);
    assert.match(html, /data-section-id=/);
    assert.match(html, /data-tool-action=/);
    assert.match(html, /data-atlas-continuation/);
    assert.match(html, /data-source-page=/);
    assert.doesNotMatch(html, /data-editorial-page=/);
    assert.match(html, /Today’s Vibe Atlas drop/i);
    assert.match(html, /src="\/c-drama-fandom\/editorial\.js"/);
    assert.match(html, signature);
  }
});

test("the studio glossary demonstrates collectible vocabulary without inventing provenance", () => {
  const glossary = read("public/c-drama-fandom/glossary/index.html");
  const liuSpecimen = glossary.match(
    /<figure class="[^"]*studio-specimen--legendary-grid[^"]*">[\s\S]*?<\/figure>/,
  )?.[0];
  const gandalfSpecimen = glossary.match(
    /<figure class="[^"]*studio-specimen--misprint-story[^"]*">\s*<img src="\/assets\/c-drama-fandom\/legendary-misprint-gandalf-collection-2026-08-28\.webp"[\s\S]*?<\/figure>/,
  )?.[0];
  const wangtermelonSpecimen = glossary.match(
    /<figure class="[^"]*studio-specimen--misprint-story[^"]*">\s*<img src="\/assets\/c-drama-fandom\/legendary-misprint-dylan-wangtermelon-2026-08-15\.webp"[\s\S]*?<\/figure>/,
  )?.[0];
  const anatomyPanel = glossary.match(
    /<section class="[^"]*studio-specimen--misprint-anatomy[^"]*"[^>]*>[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(liuSpecimen);
  assert.ok(gandalfSpecimen);
  assert.ok(wangtermelonSpecimen);
  assert.ok(anatomyPanel);
  assert.match(glossary, /Legendary Star of the Day Grid/);
  assert.match(glossary, /legendary-grid-liu-xueyi-2026-08-29\.webp/);
  assert.match(glossary, /August 29 Liu Xueyi · #0829-01/);
  assert.match(glossary, /Nine real photos, a sharply resolved vibe, and relic-class cohesion made this an excellent grid worth preserving as a whole\./);
  assert.match(glossary, /legendary-misprint-gandalf-collection-2026-08-28\.webp/);
  assert.match(glossary, /Collection-Level Legendary Misprint/);
  assert.match(glossary, /Before Collections learned to respect dimensional borders, a random C-drama grid reached into MemeForge and returned with two Gandalf study memes, Ao Ruipeng, and Riley\./);
  assert.match(glossary, /Nine random saves from the C-drama Collection\./);
  assert.match(glossary, /MemeForge had not yet been informed that Middle-earth and C-drama were separate universes\./);
  assert.match(glossary, /Two Gandalf study memes casually joined Ao Ruipeng and Riley\./);
  assert.match(glossary, /Universe boundaries fixed\. Artifact preserved\. Collection-Level Legendary Misprint\./);
  assert.match(glossary, /legendary-misprint-dylan-wangtermelon-2026-08-15\.webp/);
  assert.match(glossary, /Variety Show Chaos Legendary Misprint/);
  assert.match(glossary, /The Vibe Pack was asked for Dylan Wang: Variety Show Chaos, examined the evidence, and returned biblically accurate watermelon man\./);
  assert.match(glossary, /First, there was Man\.<br>Then, there was Melon\.<br>Then Man entered the melon patch and discovered he had always been Melon\./);
  assert.match(glossary, /human form is merely one temporary phase of the Wang Hedi lifecycle/);
  assert.match(glossary, /Nothing is mislabeled\. Nothing crossed universes\. The retrieval is technically impeccable\./);
  assert.match(glossary, /The prompt was “Variety Show Chaos\.” The Atlas responded with a man becoming melon\. No correction was required\. Recovery took longer\./);
  assert.doesNotMatch(glossary, /The Atlas responded with a man becoming produce\./);
  assert.match(glossary, /Dylan Wang being chaotic on variety shows\./);
  assert.match(glossary, /Dylan entered the room\. The cameras began rolling\. The melon completed its transformation\./);
  assert.match(glossary, /Disturbingly relevant\. Technically correct\. Legendary Misprint\./);
  assert.match(glossary, /Fruit-based character development made the Dylan Wangtermelon incident canon\./);
  assert.match(glossary, /The correction restored his identity\. The Collection remembered what he became\./);
  assert.match(anatomyPanel, /src="\/assets\/cards\/badges\/misprint\.svg"/);
  assert.match(anatomyPanel, /How a misprint becomes collectible/);
  assert.match(anatomyPanel, /What’s a Legendary Misprint\?/);
  assert.match(anatomyPanel, /<dt>Intended identity<\/dt><dd>Who or what the search was meant to find\.<\/dd>/);
  assert.match(anatomyPanel, /<dt>Unexpected identity<\/dt><dd>What the image actually shows\.<\/dd>/);
  assert.match(anatomyPanel, /<dt>Why it survived<\/dt><dd>The funny, beautiful, revealing, or uncanny reason a curator preserved it\.<\/dd>/);
  const liuPosition = glossary.indexOf("studio-specimen--legendary-grid");
  const anatomyPosition = glossary.indexOf("studio-specimen--misprint-anatomy");
  const gandalfPosition = glossary.indexOf("legendary-misprint-gandalf-collection-2026-08-28.webp");
  const wangtermelonPosition = glossary.indexOf("legendary-misprint-dylan-wangtermelon-2026-08-15.webp");
  assert.ok(liuPosition < anatomyPosition);
  assert.ok(anatomyPosition < gandalfPosition);
  assert.ok(anatomyPosition < wangtermelonPosition);
  assert.match(glossary, /Explore fandom games/);
  assert.match(glossary, /Try a fandom game/);
  assert.match(glossary, /Open fandom games →/);
  assert.doesNotMatch(glossary, /not a Legendary Misprint/i);
  assert.doesNotMatch(liuSpecimen, /Misprint/i);
  assert.doesNotMatch(gandalfSpecimen, /Star of the Day/i);
  assert.doesNotMatch(wangtermelonSpecimen, /Legendary Grid/i);
  assert.doesNotMatch(glossary, /\/assets\/c-drama-fandom\/lg01-master-og\.jpg/i);
  assert.doesNotMatch(glossary, /Legendary Grid · LG 01/i);
  assert.doesNotMatch(glossary, /Open the living example/i);
  assert.doesNotMatch(glossary, /See a Legendary Grid in action/i);
  assert.doesNotMatch(glossary, /See terms in motion/i);
  assert.doesNotMatch(glossary, /Which fate exposes you\?/i);
  assert.doesNotMatch(glossary, /Play LG · 01/i);
  assert.doesNotMatch(glossary, /illustrated xianxia fate archetypes/i);
  assert.doesNotMatch(glossary, /fictional misprint|sample actor|placeholder identity/i);
});

test("editorial analytics use bounded identifiers and never collect reader text", () => {
  const script = read("public/c-drama-fandom/editorial.js");
  const events = [
    "editorial_article_viewed",
    "editorial_read_depth_reached",
    "editorial_section_viewed",
    "editorial_topic_interest_clicked",
    "editorial_tool_engaged",
    "editorial_atlas_continuation_clicked",
  ];

  for (const event of events) assert.match(script, new RegExp(`"${event}"`));
  assert.match(script, /const sourcePages = new Set\(/);
  assert.match(script, /const sectionIds = new Set\(/);
  assert.match(script, /const topicIds = new Set\(/);
  assert.match(script, /const toolActions = new Set\(/);
  assert.match(script, /sectionObserver\.unobserve\(entry\.target\)/);
  assert.doesNotMatch(script, /innerText|textContent|location\.href|location\.search|URLSearchParams|input\.value|formData/i);
});

test("Against the Current stays within Episode 21 and uses registered static editorial analytics", () => {
  const path = "/c-drama-fandom/vibing-now/against-the-current-episode-21/";
  const html = read(`public${path}index.html`);
  const route = PUBLIC_STATIC_ROUTES.find((entry) => entry.path === path);
  assert.ok(route);
  assert.equal(route.changefreq, "weekly");
  assertCanonicalMatchesRoute(html, route);
  assert.match(html, /<body data-source-page="drama-against-the-current-episode-21" data-content-mode="drama-authority">/);
  assert.match(html, /<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-FHZJ1T74TG"><\/script>/);
  assert.match(html, /<script defer src="\/c-drama-fandom\/editorial\.js"><\/script>/);
  assert.deepEqual(
    [...html.matchAll(/data-section-id="([^"]+)"/g)].map(([, id]) => id),
    ["vibing-now-intro", "survival-cost", "domestic-statecraft", "ethical-competence",
      "damage-control", "romance-imbalance", "defining-current", "emerging-vibe", "pack-verdict"],
  );
  assert.match(html, /<p class="breadcrumb"><a href="\/c-drama-fandom\/">C-drama fandom<\/a> \/ <a href="\/c-drama-fandom\/vibing-now\/">Vibing Now<\/a><\/p>/);
  assert.match(html, /view=released&amp;source=article&amp;actorId=liu-xueyi&amp;vibeIdx=2/);
  assert.match(html, /view=released&amp;source=article&amp;actorId=liu-xueyi&amp;vibeIdx=1/);
  assert.doesNotMatch(html, /source=library_navigation&amp;actorId=liu-xueyi/);
  assert.match(html, /Explore the two Vibe Packs linked above/);
  assert.match(html, /Silk-Robed Damage Control<\/strong> <em>\(Pack candidate · unreleased\)<\/em>/);
  assert.match(html, /Spoiler boundary: Episode 21 · No preview, later-episode, novel, or endgame material included/);
  assert.match(html, /href="\/c-drama-fandom\/soundtrack\/against-the-current\/"/);
  assert.doesNotMatch(html, /Research boundary|Rendition map|Episode 2[2-9]\b|HK01|CPOP HOME/i);
  assert.match(read("netlify.toml"), /from = "\/c-drama-fandom\/vibing-now\/against-the-current-episode-21"\s+to = "\/c-drama-fandom\/vibing-now\/against-the-current-episode-21\/index\.html"/);
  assert.equal(new Map(publicStaticPreviewRoutes()).get(path.slice(0, -1)), `${path}index.html`);
  assert.match(read("netlify.toml"), /from = "\/c-drama-fandom\/vibing-now"\s+to = "\/c-drama-fandom\/vibing-now\/index\.html"/);
  assert.match(read("public/c-drama-fandom/index.html"), /Currently Vibing/);
  assert.match(read("public/c-drama-fandom/index.html"), /href="\/c-drama-fandom\/vibing-now\/"/);
});

test("Against the Current follow-ups keep their declared boundaries and public routes", () => {
  const shelf = read("public/c-drama-fandom/vibing-now/index.html");
  const netlify = read("netlify.toml");
  const pages = [
    { suffix: "episodes-22-25", boundary: 25, source: "drama-against-the-current-episodes-22-25" },
  ];
  for (const { suffix, boundary, source } of pages) {
    const path = `/c-drama-fandom/vibing-now/against-the-current-${suffix}/`;
    const html = read(`public${path}index.html`);
    const route = PUBLIC_STATIC_ROUTES.find((entry) => entry.path === path);
    assert.ok(route, `${path} must be registered`);
    assertCanonicalMatchesRoute(html, route);
    assert.match(html, new RegExp(`data-source-page="${source}"`));
    assert.match(read("public/c-drama-fandom/editorial.js"), new RegExp(`"${source}"`));
    for (const [, section] of html.matchAll(/data-section-id="([^"]+)"/g)) {
      assert.match(read("public/c-drama-fandom/editorial.js"), new RegExp(`"${section}"`));
    }
    assert.match(html, new RegExp(`stops at the end of Episode ${boundary}`));
    assert.match(html, /Source-reviewed September 28, 2026/);
    assert.match(html, /<script defer src="\/c-drama-fandom\/editorial\.js"><\/script>/);
    assert.doesNotMatch(html, /X-Amz-|prod-files-secure|Draft release package/);
    assert.match(shelf, new RegExp(`href="${path}"`));
    assert.match(netlify, new RegExp(`from = "${path.slice(0, -1)}"\\s+to = "${path}index\\.html"`));
    assert.equal(new Map(publicStaticPreviewRoutes()).get(path.slice(0, -1)), `${path}index.html`);
  }
  const first = read("public/c-drama-fandom/vibing-now/against-the-current-episodes-22-25/index.html");
  // These strings catch known regressions, not whether a plot claim happened before
  // the boundary. Editorial sign-off follows docs/vibing-now-publication-review.md.
  assert.doesNotMatch(first, /The state does not become just|Episode 26 also widens|music house|slaps him|drugging her/);
  const revised = read("public/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/index.html");
  assert.match(revised, /Zheng family’s downfall/);
  assert.match(revised, /He can move her body\. He cannot manufacture arrival\./);
});

test("episode boundary notices use the approved event-free copy", () => {
  assertRegisteredVibingWarningCopy(read);
});

test("warning-copy checks follow newly registered installments without scanning analysis", () => {
  const route = {
    path: "/c-drama-fandom/vibing-now/another-drama-episodes-31-35/",
    page: "public/c-drama-fandom/vibing-now/another-drama-episodes-31-35/index.html",
  };
  const opening = "<p><strong>Spoiler boundary:</strong> This installment stops at the end of Episode 35. No previews, later episodes, novel material, or endgame information.</p>";
  const closing = "<p><strong>Spoiler boundary:</strong> This installment discusses Episodes 31–35 and includes spoilers through the end of Episode 35. No later episodes, previews, novel material, or endgame information.</p>";
  const html = `${opening}<section><p>The wedding and punishment inform this reading.</p></section>${closing}`;
  const routes = [
    ...PUBLIC_STATIC_ROUTES,
    route,
  ];
  const fixtureRead = (page) => page === route.page ? html : read(page);
  assert.doesNotThrow(() => assertRegisteredVibingWarningCopy(fixtureRead, routes));
  assert.throws(() => assertRegisteredVibingWarningCopy(
    (page) => page === route.page ? "" : read(page), routes,
  ), /another-drama-episodes-31-35.*approved event-free/);

  const mutations = [
    ["event-specific exclusion", html.replace("No previews,", "No <em>secret coronation or exile</em>, previews,")],
    ["scene cutoff", html.replace("the end of Episode 35", "the scene before the messenger arrives in Episode 35")],
    ["wrong opening endpoint", html.replace("the end of Episode 35", "the end of Episode 36")],
    ["wrong closing endpoint", html.replace("spoilers through the end of Episode 35", "spoilers through the end of Episode 36")],
    ["wrong start episode", html.replace("Episodes 31–35", "Episodes 30–35")],
    ["missing opening", html.replace(opening, "")],
    ["missing closing", html.replace(closing, "")],
    ["missing all warnings", "<p>Article analysis without a warning.</p>"],
    ["extra exclusion warning", `${html}<p>Spoiler boundary: No palace fire included.</p>`],
    ["commented warning", html.replace(opening, `<!--${opening}-->`)],
  ];
  for (const [label, invalid] of mutations) {
    assert.throws(() => assertVibingWarningCopy(invalid, route),
      /approved event-free warning paragraphs/, label);
  }
  const single = { path: "/c-drama-fandom/vibing-now/another-drama-episode-35/" };
  assert.doesNotThrow(() => assertVibingWarningCopy(opening, single));
  assert.throws(() => assertRegisteredVibingWarningCopy(() => html, [single]),
    /warning-checkable page/);
  assert.throws(() => assertVibingWarningCopy(html, { ...route, path: "/c-drama-fandom/vibing-now/new-format/" }),
    /warning boundary needs an episode route/);
  assert.throws(() => assertVibingWarningCopy(html, { ...route, path: "/c-drama-fandom/vibing-now/another-drama-episodes-35-31/" }),
    /invalid episode range/);
});

test("the reviewed Episode 21 warning also rejects event exclusions and missing copy", () => {
  const route = PUBLIC_STATIC_ROUTES.find(({ path }) => path.endsWith("/against-the-current-episode-21/"));
  const html = read(route.page);
  assert.doesNotThrow(() => assertVibingWarningCopy(html, route));
  for (const invalid of [
    html.replace("No preview, later-episode, novel, or endgame material included", "No sentencing or later-episode material included"),
    html.replace("Spoiler boundary: Episode 21", "Spoiler boundary: Episode 22"),
    html.replace("Spoiler boundary: Episode 21", "Spoiler boundary: Before the wedding in Episode 21"),
    html.replace(/<p class="meta-row">Spoiler boundary:[^<]+<\/p>/, ""),
  ]) assert.throws(() => assertVibingWarningCopy(invalid, route), /approved event-free/);
});

test("the soundtrack pilot links only to verified licensed listings and stays separate from viewing data", () => {
  const path = "/c-drama-fandom/soundtrack/against-the-current/";
  const html = read(`public${path}index.html`);
  const route = PUBLIC_STATIC_ROUTES.find((entry) => entry.path === path);
  assert.ok(route);
  assertCanonicalMatchesRoute(html, route);
  for (const country of ["us", "gb", "tw"]) {
    assert.match(html, new RegExp(`https://music\\.apple\\.com/${country}/album/6815627808`));
  }
  for (const track of ["6815627811", "6815627814", "6815627816", "6815627821", "6815628003"]) {
    assert.match(html, new RegExp(`https://music\\.apple\\.com/us/song/${track}`));
  }
  assert.match(html, /not a promise that you can play/);
  assert.match(html, /track names may hint at story developments/);
  assert.doesNotMatch(html, /<audio\b|<iframe\b|<blockquote\b|lyrics\s*:/i);
  assert.doesNotMatch(read("scripts/where-to-watch.js"), /soundtrack\/against-the-current/);
  assert.doesNotMatch(read("docs/against-the-current-availability.json"), /6815627808/);
  assert.equal(new Map(publicStaticPreviewRoutes()).get(path.slice(0, -1)), `${path}index.html`);
});

test("Vibing Now landing page is crawlable and advertises the live spoiler boundary", () => {
  const path = "/c-drama-fandom/vibing-now/";
  const html = read(`public${path}index.html`);
  const route = PUBLIC_STATIC_ROUTES.find((entry) => entry.path === path);
  assert.ok(route);
  assert.equal(route.changefreq, "weekly");
  assertCanonicalMatchesRoute(html, route);
  assert.match(html, /<body data-source-page="vibing-now-index" data-content-mode="drama-authority">/);
  assert.match(html, /Against the Current, through Episode 21/);
  assert.match(html, /No preview material, later episodes, novel material, or endgame commentary/);
  assert.match(read("public/c-drama-fandom/editorial.js"), /"vibing-now-index"/);
});

test("Against the Current discovery path and search snippets preserve episode boundaries", () => {
  const guide = read("public/c-drama-fandom/index.html");
  const shelfPath = "/c-drama-fandom/vibing-now/";
  const shelf = read(`public${shelfPath}index.html`);
  const sitemap = read("public/sitemap.xml");
  const paths = [
    { slug: "episode-21", label: "Episode 21", boundary: "21" },
    { slug: "episodes-22-25", label: "Episodes 22–25", boundary: "25" },
    { slug: "episodes-26-29", label: "Episodes 26–29", boundary: "29", headline: "He Asked the Emperor for a Wife. The Drama Keeps Asking Whether She Chose Him." },
    { slug: "episodes-30-31", label: "Episodes 30–31", boundary: "31", headline: "Lanxiang Comes Home. Then She Shows Jinqi How She Works." },
    { slug: "episodes-32-33", label: "Episodes 32–33", boundary: "33", headline: "Lanxiang Starts Writing Justice. Lin Jinqi Has No Choice but to Come Along." },
    { slug: "episodes-34-38", label: "Episodes 34–38", boundary: "38", headline: "Being Remembered, Not Being Discovered" },
  ];
  const pages = [{ path: shelfPath, html: shelf }];

  assert.ok(guide.indexOf("Featured series / Currently Vibing") < guide.indexOf("01 / Fandom literacy"),
    "the show feature must lead the guide choices");
  assert.match(guide, /<h3><a href="\/c-drama-fandom\/vibing-now\/"[^>]*>Against the Current: Vibing Now<\/a><\/h3>/);
  assert.match(shelf, /<h1>Against the Current · Choose by last episode watched<\/h1>/);
  assert.match(shelf, /Start with the last episode you’ve finished, not the platform you use/);

  for (const { slug, label, boundary, headline } of paths) {
    const path = `${shelfPath}against-the-current-${slug}/`;
    const html = read(`public${path}index.html`);
    pages.push({ path, html });
    assert.match(shelf, new RegExp(`href="${path}"`));
    assert.match(shelf, new RegExp(`Safe through ${label}`));
    assert.match(html, /<p class="eyebrow">Vibing Now · Against the Current/);
    if (headline) assert.ok(html.includes(`<h1>${headline}</h1>`), `${path}: approved headline`);
    else assert.match(html, /<h1>Against the Current/);
    assert.match(html, new RegExp(`Contains spoilers through Episode ${boundary} only`));
  }

  const titles = new Set();
  const descriptions = new Set();
  const urls = new Set();
  for (const { path, html } of pages) {
    const route = PUBLIC_STATIC_ROUTES.find((entry) => entry.path === path);
    assert.ok(route, `${path} must be registered`);
    assertCanonicalMatchesRoute(html, route);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.match(title, /Against the Current/);
    assert.match(description, /Against the Current/);
    assert.match(html, new RegExp(`<meta property="og:url" content="${PUBLIC_ORIGIN}${path}"`));
    assert.match(html, /<meta property="og:title" content="[^"]*Against the Current/);
    assert.match(html, /<meta name="twitter:title" content="[^"]*Against the Current/);
    assert.match(html, /<meta name="twitter:description" content="[^"]*"/);
    const json = JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1]);
    assert.equal(json.mainEntityOfPage, `${PUBLIC_ORIGIN}${path}`);
    const approvedHeadline = paths.find((entry) => path.endsWith(`against-the-current-${entry.slug}/`))?.headline;
    if (approvedHeadline) assert.equal(json.headline, approvedHeadline);
    else assert.match(json.headline, /Against the Current/);
    assert.equal(sitemap.split(`<loc>${PUBLIC_ORIGIN}${path}</loc>`).length - 1, 1);
    titles.add(title);
    descriptions.add(description);
    urls.add(`${PUBLIC_ORIGIN}${path}`);
  }
  assert.equal(titles.size, pages.length);
  assert.equal(descriptions.size, pages.length);
  assert.equal(urls.size, pages.length);
  for (const { path, html } of pages) {
    const snippets = [...html.matchAll(/<meta (?:name="(?:description|twitter:description)"|property="og:description") content="([^"]+)"/g)]
      .map(([, content]) => content).join(" ");
    // The supplied 26–29 metadata explicitly names its wedding topic. Its
    // complete wording is frozen in vibing-revised-readings.test.js; this is
    // not permission to add outcomes or treat keyword checks as source review.
    assert.doesNotMatch(snippets, /marriage decree|assassination|drugged|beaten|trafficking/i);
    if (!path.endsWith("against-the-current-episodes-26-29/")) {
      assert.doesNotMatch(snippets, /wedding/i);
    }
  }
});

test("the public field journal has crawlable direct routes with spoiler-safe metadata", () => {
  const netlify = read("netlify.toml");
  const viteConfig = read("vite.config.ts");
  const canonicals = new Set();
  const titles = new Set();

  for (const path of WATCH_JOURNAL_PUBLIC_PAGES) {
    const html = read(path);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
    assert.ok(title, `${path} must have a title`);
    assert.ok(canonical, `${path} must have a canonical`);
    titles.add(title);
    canonicals.add(canonical);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<h1[\s>]/i);
    assert.match(html, /<script type="application\/ld\+json">/i);
    assert.match(html, /name="robots" content="index,follow,max-image-preview:large"/i);
    assert.match(html, /property="og:image" content="https:\/\/fandom\.justlikekatie\.com\/assets\/c-drama-fandom\/watch-journal-og\.jpg"/);
    assert.doesNotMatch(html, /accountId|admin controls|privateDraft|audience=admin/i);
    assert.doesNotMatch(canonical, /[?&](?:safeThroughEpisode|account|email)=/i);
  }

  assert.equal(titles.size, WATCH_JOURNAL_PUBLIC_PAGES.length);
  assert.equal(canonicals.size, WATCH_JOURNAL_PUBLIC_PAGES.length);
  assert.match(
    netlify,
    /from = "\/c-drama-fandom\/watch-journal\/episodes-1-4"[\s\S]*?to = "\/c-drama-fandom\/watch-journal\/episodes-1-4\/index\.html"/,
  );
  assert.match(viteConfig, /new Map\(publicStaticPreviewRoutes\(\)\)/);
});

test("the C-drama guide makes the Watch Journal discoverable", () => {
  const guide = read("public/c-drama-fandom/index.html");

  assert.match(
    guide,
    /<a href="\/c-drama-fandom\/watch-journal\/">Field journal<\/a>/,
    "the shared C-drama navigation must link to the Watch Journal",
  );
  assert.match(
    guide,
    /<a class="button button--secondary" href="\/c-drama-fandom\/watch-journal\/">Read The Untamed field journal<\/a>/,
    "the guide must have a clear Watch Journal call to action",
  );
  assert.match(
    guide,
    /<a href="\/c-drama-fandom\/watch-journal\/">Open the Watch Journal →<\/a>/,
    "the guide exploration rail must link to the Watch Journal",
  );
});

test("the where-to-watch guide is crawlable from the hub without implying worldwide access", () => {
  const route = "/c-drama-fandom/where-to-watch/against-the-current/";
  const guide = read("public/c-drama-fandom/index.html");
  const html = read("public/c-drama-fandom/where-to-watch/against-the-current/index.html");
  assert.match(guide, /href="\/c-drama-fandom\/where-to-watch\/against-the-current\/"/);
  assert.equal(PUBLIC_STATIC_ROUTES.filter((entry) => entry.path === route).length, 1);
  assert.match(read("netlify.toml"), /from = "\/c-drama-fandom\/where-to-watch\/against-the-current"\s+to = "\/c-drama-fandom\/where-to-watch\/against-the-current\/index\.html"/);
  assert.match(read("public/sitemap.xml"), /<loc>https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/where-to-watch\/against-the-current\/<\/loc>/);
  assert.match(html, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/where-to-watch\/against-the-current\/"/);
  assert.match(html, /United Kingdom — availability not verified/);
  assert.match(html, /Mainland China — availability not verified/);
});

test("the field journal source persists a strict boundary and fetches no unfiltered payload", () => {
  const index = read("public/c-drama-fandom/watch-journal/index.html");
  const range = read("public/c-drama-fandom/watch-journal/episodes-1-4/index.html");

  assert.match(index, /data-default-safe-through=""/);
  assert.match(range, /data-default-safe-through="4"/);
  assert.match(index, /fandom-watch-journal-safe-through:the-untamed/);
  assert.match(index, /\/\^\[1-9\]\[0-9\]\{0,2\}\$\//);
  assert.match(index, /Number\(value\) <= 999/);
  assert.match(index, /safeThroughEpisode=" \+ encodeURIComponent\(boundary\)/);
  assert.match(index, /credentials: "omit", cache: "no-store"/);
  assert.match(index, /payload\.safeThroughEpisode !== boundary/);
  assert.match(range, /const routeMaximum = validBoundary\(defaultBoundary\) \? Number\(defaultBoundary\) : null/);
  assert.match(range, /routeMaximum === null \|\| Number\(value\) <= routeMaximum/);
  assert.match(range, /if \(!allowedOnRoute\(stored\)\) return defaultBoundary \|\| null/);
  assert.match(index, /content\.replaceChildren\(\)/);
  assert.match(index, /node\.textContent = value/);
  assert.doesNotMatch(index, /innerHTML|dangerouslySetInnerHTML/);
  assert.doesNotMatch(index, /journal\s*=\s*\{\s*"entries"/);
  assert.doesNotMatch(index, /fetch\("[^"]*audience=reader"\)/);
  assert.match(index, /The journal stayed locked because the boundary is malformed/);
  assert.match(index, /new URL\(window\.location\.pathname, window\.location\.origin\)\.href/);
});

test("the field journal analytics track outcomes without journal content or private values", () => {
  const index = read("public/c-drama-fandom/watch-journal/index.html");
  const range = read("public/c-drama-fandom/watch-journal/episodes-1-4/index.html");
  const eventNames = [...index.matchAll(/trackJournalEvent\("([^"]+)"/g)].map((match) => match[1]);
  const trackedData = [...index.matchAll(/trackJournalEvent\("[^"]+", \{([\s\S]*?)\}\);/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(eventNames)].sort(), [
    "watch_journal_boundary_changed",
    "watch_journal_safe_view_loaded",
    "watch_journal_shared",
  ]);
  assert.match(index, /const trackEvent = \(name, data\) => \{\s*try \{\s*window\.umami\?\.track\(name, data\);\s*\} catch \{/);
  assert.match(index, /route_end_episode: routeMaximum/);
  assert.match(index, /safe_through_episode: boundary/);
  assert.match(index, /from_episode: previousBoundary/);
  assert.match(index, /to_episode: boundary/);
  assert.match(index, /outcome: "failed"/);
  assert.match(index, /failure_reason: "invalid_boundary"/);
  assert.match(index, /loadFailureReason = "invalid_response"/);
  assert.match(index, /safe_through_episode: boundary/);
  assert.match(index, /outcome: "failed"/);
  assert.match(index, /trackShareOutcome\(error && error\.name === "AbortError" \? "cancelled" : "failed"/);
  assert.match(index, /trackShareOutcome\("success", "native"\)/);
  assert.match(index, /trackShareOutcome\("success", "copy"\)/);
  assert.doesNotMatch(index, /trackJournalEvent\([^)]*(?:originalText|interpretation|publicUrl|error\.message|accountId|email)/i);
  for (const data of trackedData) {
    assert.doesNotMatch(data, /text|evidence|prediction|entry|url|account|email|error/i);
  }
  assert.match(range, /route_end_episode: routeMaximum/);
});

test("the trope decoder is searchable, shareable, and spoiler-light", () => {
  const html = read("public/c-drama-fandom/trope-decoder/index.html");
  const entryIds = [...html.matchAll(/class="trope-card" id="([^"]+)"/g)].map((match) => match[1]);
  const categoryIds = [...html.matchAll(/class="trope-card"[^>]+data-category="([^"]+)"/g)].map((match) => match[1]);
  const filterIds = [...html.matchAll(/class="decoder-filter[^"]*"[^>]+data-filter="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(entryIds.length, 14);
  assert.equal(new Set(entryIds).size, 14);
  assert.equal((html.match(/class="trope-card__newcomer"/g) ?? []).length, 14);
  assert.equal((html.match(/class="trope-card__veteran"/g) ?? []).length, 14);
  assert.deepEqual([...new Set(categoryIds)].sort(), ["love", "realm", "signs"]);
  assert.deepEqual(
    categoryIds.reduce((counts, category) => ({ ...counts, [category]: (counts[category] ?? 0) + 1 }), {}),
    { love: 5, realm: 5, signs: 4 },
  );
  assert.deepEqual(filterIds, ["all", "love", "realm", "signs"]);
  assert.match(html, /Newcomers see:<\/span> Certain death\./);
  assert.match(html, /Veterans know:<\/span> She’d need amnesia to fall for him in this enemies-to-lovers arc\./);
  assert.doesNotMatch(html, /It’s never a cliff of death\. It’s a cliff of amnesia\./);
  assert.match(html, /id="trope-search"/);
  assert.match(html, /data-search="[^"]+"/);
  assert.match(html, /matchesCategory = activeFilter === "all" \|\| card\.dataset\.category === activeFilter/);
  assert.match(html, /id="share-decoder"/);
  assert.match(html, /publicUrl = "https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/trope-decoder\/"/);
  assert.match(html, /window\.gtag\("event", name, data\)/);
  assert.match(html, /window\.dataLayer\.push\(\["event", name, data\]\)/);
  assert.match(html, /trackEvent\("trope_filter_used", \{\s*category: activeFilter,\s*query_present: Boolean\(query\),\s*result_count: visible\s*\}\)/);
  assert.match(html, new RegExp(`trackEvent\\("${TROPE_DECODER_SHARE_EVENT}", \\{ method: "native" \\}\\)`));
  assert.match(html, new RegExp(`trackEvent\\("${TROPE_DECODER_SHARE_EVENT}", \\{ method: "copy" \\}\\)`));
  assert.doesNotMatch(html, /trackEvent\("trope_filter_used"[\s\S]*?search\.value/);
  assert.doesNotMatch(html, /trackEvent\("decoder_share_succeeded", \{[^}]*publicUrl/);
  assert.match(html, /no account, Collection, name, or browsing information/i);
  assert.match(html, /original descriptions—not dialogue, scripts, or episode transcripts/i);
  assert.match(html, /"@type": "ItemList"/);
  assert.match(html, /"numberOfItems": 14/);
});

for (const path of [
  "public/c-drama-fandom/trope-decoder/index.html",
  "public/zh-cn/c-drama-fandom/trope-decoder/index.html",
]) {
test(`decoder sharing outcomes use only bounded event names and method properties in ${path}`, () => {
  const html = read(path);
  const review = read("docs/trope-decoder-analytics-review.md");
  const events = [...html.matchAll(/trackEvent\("(decoder_share_[^"]+)", \{([^}]+)\}\)/g)]
    .map((match) => [match[1], match[2].trim()]);
  assert.deepEqual(events, [
    ["decoder_share_succeeded", 'method: "native"'],
    ["decoder_share_succeeded", 'method: "copy"'],
    ["decoder_share_failed", 'method: "copy"'],
    ["decoder_share_cancelled", 'method: "native"'],
    ["decoder_share_failed", "method"],
  ]);
  assert.match(html, /const method = typeof navigator\.share === "function" \? "native" : "copy"/);
  assert.match(html, /if \(method === "native" && error\?\.name === "AbortError"\)/);
  assert.match(html, /return document\.execCommand\("copy"\);\s*\} finally \{\s*textarea\.remove\(\)/);
  assert.match(html, /finally \{\s*shareButton\.disabled = false/);
  for (const [event] of events) assert.ok(review.includes(`\`${event}\``));
  assert.doesNotMatch(events.map(([, data]) => data).join(" "), /url|message|account|email|name|text|query/i);
});
}

test("LG01 has nine bounded outcomes and a privacy-safe share contract", () => {
  const html = read("public/c-drama-fandom/fandom-games/index.html");
  const script = read("public/c-drama-fandom/fandom-games/lg01.js");
  const outcomeIds = [...html.matchAll(/data-fate="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(outcomeIds.length, 9);
  assert.equal(new Set(outcomeIds).size, 9);
  for (const id of outcomeIds) {
    assert.match(id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.match(script, new RegExp(`id: "${id}"`));
  }
  assert.match(script, /searchParams\.set\("fate", outcome\.id\)/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(script, /email|accountId|collectionId|userId/);
  assert.match(html, /requires no account|no sign-in gate|private by default|Privacy note/i);
});

test("LG01 promo media uses published assets with an accessible reduced-motion fallback", async () => {
  await preparePublicPages();
  const html = read("public/c-drama-fandom/fandom-games/index.html");
  const script = read("public/c-drama-fandom/fandom-games/lg01.js");
  const styles = read("public/c-drama-fandom/styles.css");
  const videoPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo.mp4");
  const posterPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo-poster.jpg");
  assert.equal(existsSync(videoPath), true);
  assert.equal(existsSync(posterPath), true);
  assert.ok(readFileSync(videoPath).length > 100_000);
  const posterMeta = await sharp(posterPath).metadata();
  assert.equal(posterMeta.format, "jpeg");
  assert.equal(posterMeta.width, 1080);
  assert.equal(posterMeta.height, 1080);

  assert.match(html, /class="promo-media"/);
  assert.match(html, /src="\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo\.mp4" type="video\/mp4"/);
  assert.match(html, /poster="\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo-poster\.jpg"/);
  assert.match(html, /aria-label="Preview of Which Xianxia Fate Chose You\?"/);
  assert.match(html, /aria-describedby="promo-media-description"/);
  assert.match(html, /\bcontrols\b/);
  assert.match(html, /\bloop\b/);
  assert.match(html, /\bmuted\b/);
  assert.match(html, /\bplaysinline\b/);
  assert.match(html, /data-autoplay="normal-motion-only"/);
  assert.match(html, /Video unavailable\./);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.promo-media__poster \{ display: none; \}/);
  assert.doesNotMatch(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.promo-media__video \{ display: none; \}/);
  assert.match(styles, /\.promo-media__toggle \{ display: none; \}/);
  assert.match(script, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
  assert.match(script, /if \(!reducedMotion\)/);
  assert.match(html, /The poster above and the master grid image still show the full nine-fate board/);
  for (const name of [
    "Moonlit Strategist", "Exiled Immortal", "Chaos Prince", "Lotus Healer",
    "Silent Sword", "Fox Spirit", "Celestial Guardian", "Bamboo Recluse", "Fated Romantic",
  ]) {
    assert.match(html, new RegExp(name));
  }
  assert.doesNotMatch(html, /attached_assets|localhost|127\.0\.0\.1/);
});

test("asset preparation produces optimized content, specimen, and social images", async () => {
  await preparePublicPages();
  const contentPath = resolve(root, "public/assets/c-drama-fandom/which-xianxia-fate-chose-you-lg01.webp");
  const glossarySourcePath = "attached_assets/legendary-grid-liu-xueyi-0829-01-issue44.png";
  const glossarySpecimenPath = resolve(root, "public/assets/c-drama-fandom/legendary-grid-liu-xueyi-2026-08-29.webp");
  const collectionMisprintSourcePath = "attached_assets/legendary-misprint-gandalf-collection-2026-08-28.png";
  const collectionMisprintPath = resolve(root, "public/assets/c-drama-fandom/legendary-misprint-gandalf-collection-2026-08-28.webp");
  const wangtermelonMisprintSourcePath = "attached_assets/legendary-misprint-dylan-wangtermelon-2026-08-15.png";
  const wangtermelonMisprintPath = resolve(root, "public/assets/c-drama-fandom/legendary-misprint-dylan-wangtermelon-2026-08-15.webp");
  const socialPath = resolve(root, "public/assets/c-drama-fandom/lg01-master-og.jpg");
  const journalSocialPath = resolve(root, "public/assets/c-drama-fandom/watch-journal-og.jpg");
  const promoVideoPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo.mp4");
  const promoPosterPath = resolve(root, "public/assets/c-drama-fandom/xianxia-fate-lg01-promo-poster.jpg");
  assert.equal(existsSync(contentPath), true);
  assert.equal(existsSync(resolve(root, glossarySourcePath)), true);
  assert.equal(existsSync(glossarySpecimenPath), true);
  assert.equal(existsSync(resolve(root, collectionMisprintSourcePath)), true);
  assert.equal(existsSync(collectionMisprintPath), true);
  assert.equal(existsSync(resolve(root, wangtermelonMisprintSourcePath)), true);
  assert.equal(existsSync(wangtermelonMisprintPath), true);
  assert.equal(existsSync(socialPath), true);
  assert.equal(existsSync(journalSocialPath), true);
  assert.equal(existsSync(promoVideoPath), true);
  assert.equal(existsSync(promoPosterPath), true);

  const contentMeta = await sharp(contentPath).metadata();
  const glossarySpecimenMeta = await sharp(glossarySpecimenPath).metadata();
  const collectionMisprintMeta = await sharp(collectionMisprintPath).metadata();
  const wangtermelonMisprintMeta = await sharp(wangtermelonMisprintPath).metadata();
  const socialMeta = await sharp(socialPath).metadata();
  const journalSocialMeta = await sharp(journalSocialPath).metadata();
  assert.equal(contentMeta.format, "webp");
  assert.ok((contentMeta.width ?? 0) <= 1100);
  assert.equal(
    sha256(glossarySourcePath),
    "83451fd778110b46acdba1838f04e83ee6b346dd55ca8064bf42dd25e1bff426",
  );
  assert.equal(glossarySpecimenMeta.format, "webp");
  assert.equal(glossarySpecimenMeta.width, 1080);
  assert.equal(glossarySpecimenMeta.height, 1350);
  assert.equal(
    sha256(collectionMisprintSourcePath),
    "5c01366a86f9acf493316b2a16f34197c496a5eb184ec9eb84e1bd2764cf6683",
  );
  assert.equal(collectionMisprintMeta.format, "webp");
  assert.equal(collectionMisprintMeta.width, 1080);
  assert.equal(collectionMisprintMeta.height, 1350);
  assert.equal(
    sha256(wangtermelonMisprintSourcePath),
    "6f1d026907414f5a20ceb6396f8e7f8f9268a820fd967f52a9cee73da6fbd4fa",
  );
  assert.equal(wangtermelonMisprintMeta.format, "webp");
  assert.equal(wangtermelonMisprintMeta.width, 1080);
  assert.equal(wangtermelonMisprintMeta.height, 1350);
  assert.equal(socialMeta.format, "jpeg");
  assert.equal(socialMeta.width, 1200);
  assert.equal(socialMeta.height, 630);
  assert.equal(journalSocialMeta.format, "jpeg");
  assert.equal(journalSocialMeta.width, 1200);
  assert.equal(journalSocialMeta.height, 630);
});

test("each allowlisted LG01 fate has a static social preview and exact query rewrite", async () => {
  await preparePublicPages();
  const netlify = read("netlify.toml");

  for (const outcome of LG01_OUTCOMES) {
    const previewPath = `public/c-drama-fandom/fandom-games/previews/${outcome.id}/index.html`;
    const html = read(previewPath);
    const title = `Your Xianxia Fate: ${outcome.name} | Fandom Vibes`;
    const imageUrl = `https://fandom.justlikekatie.com/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`;
    const openGraphUrl = `https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/?fate=${outcome.id}`;

    assert.match(html, new RegExp(`<title>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/title>`));
    assert.match(html, new RegExp(`name="description" content="${outcome.description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, new RegExp(`property="og:image" content="${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(html, /property="og:image:width" content="1200"/);
    assert.match(html, /property="og:image:height" content="630"/);
    assert.match(html, /name="robots" content="noindex,follow,max-image-preview:large"/);
    assert.match(html, /<link rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/fandom-games\/">/);
    assert.match(html, new RegExp(`property="og:url" content="${openGraphUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.doesNotMatch(html, /property="og:url" content="[^"]*utm_/);
    assert.match(
      netlify,
      new RegExp(
        `to = "/c-drama-fandom/fandom-games/previews/${outcome.id}/index\\.html"[\\s\\S]*?query = \\{ fate = "${outcome.id}" \\}`,
      ),
    );
    assert.match(html, /\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo\.mp4/);
    assert.match(html, /\/assets\/c-drama-fandom\/xianxia-fate-lg01-promo-poster\.jpg/);
    assert.doesNotMatch(html, /attached_assets|localhost|127\.0\.0\.1/);

    const socialMeta = await sharp(resolve(root, `public/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`)).metadata();
    assert.equal(socialMeta.format, "jpeg");
    assert.equal(socialMeta.width, 1200);
    assert.equal(socialMeta.height, 630);
  }

  assert.doesNotMatch(netlify, /query = \{ fate = ":fate" \}/);
});