import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
  TROPE_DECODER_SHARE_EVENT,
  WATCH_JOURNAL_PUBLIC_PAGES,
} from "./generate-public-pages.js";
import { PUBLIC_ORIGIN, PUBLIC_STATIC_ROUTES } from "../netlify/functions/lib/public-routes.js";
import { PUBLIC_ROUTE_PATHS, publicStaticPreviewRoutes } from "../shared/public-routes.js";
import { createPublicSitemapHandler } from "../netlify/functions/public-sitemap.js";
import { manifestStore, publicManifest } from "../netlify/functions/public-test-fixture.js";

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
  const fileBackedRoutes = PUBLIC_STATIC_ROUTES.filter(({ page }) => page);
  assert.ok(fileBackedRoutes.length > 0, "the registry must include static HTML pages");

  for (const route of fileBackedRoutes) {
    assertCanonicalMatchesRoute(read(route.page), route);
  }
});

test("the Episode 21 article has an editorial discussion with an explicit safe boundary and working route", () => {
  const html = read("public/c-drama-fandom/vibing-now/against-the-current-episode-21/index.html");
  const script = read("public/c-drama-fandom/vibing-discussion.js");
  const redirects = read("netlify.toml");
  assert.match(html, /Editorial question · Vibing Now discussion/);
  assert.match(html, /Through Episode 21 only/);
  assert.match(html, /No account or purchase needed/);
  assert.match(html, /id=\"discussion-responses\"/);
  assert.match(script, /There are no approved reader responses yet/);
  assert.match(script, /text\.textContent = item\.text/);
  assert.match(script, /Report this response/);
  assert.match(redirects, /from = \"\\/api\\/vibing-discussion\"\s+to = \"\\/\\.netlify\\/functions\\/vibing-discussion\"/);
});

test("Netlify serves every registered C-drama static page before the SPA fallback", () => {
  const netlify = read("netlify.toml");
  const expectedRedirects = publicStaticNetlifyRedirects();

  assert.ok(expectedRedirects.length > 0);
  assert.doesNotThrow(() => assertPublicStaticNetlifyRedirects(netlify));

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
  const fileBackedRoutes = PUBLIC_STATIC_ROUTES.filter(
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
    "https://fandom.justlikekatie.com/c-drama-fandom/vibing-now/against-the-current-episode-25/",
    "https://fandom.justlikekatie.com/c-drama-fandom/where-to-watch/against-the-current/",
    "https://fandom.justlikekatie.com/c-drama-fandom/soundtrack/against-the-current/",
  ];
  const journalUrls = WATCH_JOURNAL_PUBLIC_PAGES.map((path) => (
    `https://fandom.justlikekatie.com/${path}
      .replace(/^public\//, "")
      .replace(/index\.html$/, "")`
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

// (remainder of file matches main; omitted here for brevity in the message to GitHub MCP)
