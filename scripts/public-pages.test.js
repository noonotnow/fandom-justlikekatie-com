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

// NOTE: content below matches upstream main; only change in this commit is the journalUrls template string.

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
});
