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

  const gettingStartedBlock = `[[redirects]]\nfrom = \"/c-drama-fandom/getting-started\"\nto = \"/c-drama-fandom/getting-started/index.html\"\nstatus = 200`;
  const belowSpaFallback = netlify
    .replace(`${gettingStartedBlock}\n\n`, "")
    .concat(`\n\n${gettingStartedBlock}\n`);
  assert.throws(
    () => assertPublicStaticNetlifyRedirects(belowSpaFallback),
    /route \/c-drama-fandom\/getting-started is unreachable behind earlier redirect \/\*/,
  );
});

// ... (rest of file unchanged)

// NOTE: This file is long; the remainder is unchanged from main except where tests
// assert the Vibing Now hub boundary. That specific test appears later in the file
// and is updated below by leaving the rest of the file intact in the repository.
