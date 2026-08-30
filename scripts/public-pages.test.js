import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";
import {
  LG01_OUTCOMES,
  preparePublicPages,
  REQUIRED_PUBLIC_PAGES,
} from "./generate-public-pages.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("the five C-drama fandom routes are substantial static HTML documents", () => {
  const titles = new Set();
  const canonicals = new Set();

  for (const path of REQUIRED_PUBLIC_PAGES) {
    const html = read(path);
    assert.match(html, /<!doctype html>/i, `${path} must be a full HTML document`);
    assert.match(html, /<h1[\s>]/i, `${path} must contain a crawlable H1`);
    assert.match(html, /<meta name="description" content="[^"]{80,}"/i);
    assert.match(html, /<script type="application\/ld\+json">/i);
    assert.doesNotMatch(html, /<div id="root"><\/div>/i, `${path} cannot rely on the SPA root`);
    assert.ok(html.length > 7_000, `${path} should contain substantial editorial content`);

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
  const editorialUrls = [
    "https://fandom.justlikekatie.com/c-drama-fandom/",
    "https://fandom.justlikekatie.com/c-drama-fandom/getting-started/",
    "https://fandom.justlikekatie.com/c-drama-fandom/glossary/",
    "https://fandom.justlikekatie.com/c-drama-fandom/trope-decoder/",
    "https://fandom.justlikekatie.com/c-drama-fandom/fandom-games/",
  ];

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
  assert.equal(
    sitemapUrls.filter((url) => url.startsWith("https://fandom.justlikekatie.com/c-drama-fandom/")).length,
    editorialUrls.length,
    "sitemap must expose exactly five editorial C-drama routes",
  );
  assert.ok(sitemapUrls.includes("https://fandom.justlikekatie.com/vibe-atlas"));
  assert.doesNotMatch(sitemap, /view=(?:collection|builder|plan|membership)/);
  assert.doesNotMatch(sitemap, /\/api\/|\/auth\/|create-handoff|idea-packet/);
});

test("the trope decoder is searchable, shareable, and spoiler-light", () => {
  const html = read("public/c-drama-fandom/trope-decoder/index.html");
  const entryIds = [...html.matchAll(/class="trope-card" id="([^"]+)"/g)].map((match) => match[1]);

  assert.equal(entryIds.length, 14);
  assert.equal(new Set(entryIds).size, 14);
  assert.match(html, /It’s never a cliff of death\. <em>It’s a cliff of amnesia\.<\/em>/);
  assert.match(html, /id="trope-search"/);
  assert.match(html, /data-search="[^"]+"/);
  assert.match(html, /id="share-decoder"/);
  assert.match(html, /publicUrl = "https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/trope-decoder\/"/);
  assert.match(html, /no account, Collection, name, or browsing information/i);
  assert.match(html, /original descriptions—not dialogue, scripts, or episode transcripts/i);
  assert.match(html, /"@type": "ItemList"/);
  assert.match(html, /"numberOfItems": 14/);
});

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

test("asset preparation produces optimized content and social images", async () => {
  await preparePublicPages();
  const contentPath = resolve(root, "public/assets/c-drama-fandom/which-xianxia-fate-chose-you-lg01.webp");
  const socialPath = resolve(root, "public/assets/c-drama-fandom/lg01-master-og.jpg");
  assert.equal(existsSync(contentPath), true);
  assert.equal(existsSync(socialPath), true);

  const contentMeta = await sharp(contentPath).metadata();
  const socialMeta = await sharp(socialPath).metadata();
  assert.equal(contentMeta.format, "webp");
  assert.ok((contentMeta.width ?? 0) <= 1100);
  assert.equal(socialMeta.format, "jpeg");
  assert.equal(socialMeta.width, 1200);
  assert.equal(socialMeta.height, 630);
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

    const socialMeta = await sharp(resolve(root, `public/assets/c-drama-fandom/lg01-${outcome.id}-og.jpg`)).metadata();
    assert.equal(socialMeta.format, "jpeg");
    assert.equal(socialMeta.width, 1200);
    assert.equal(socialMeta.height, 630);
  }

  assert.doesNotMatch(netlify, /query = \{ fate = ":fate" \}/);
});