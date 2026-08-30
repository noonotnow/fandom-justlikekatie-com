import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { preparePublicPages, REQUIRED_PUBLIC_PAGES } from "./generate-public-pages.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

test("the four C-drama fandom routes are substantial static HTML documents", () => {
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

  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /Sitemap: https:\/\/fandom\.justlikekatie\.com\/sitemap\.xml/);
  assert.match(sitemap, /^<\?xml version="1.0"/);
  assert.match(sitemap, /https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\//);
  assert.match(sitemap, /https:\/\/fandom\.justlikekatie\.com\/vibe-atlas/);
  assert.doesNotMatch(sitemap, /view=(?:collection|builder|plan|membership)/);
  assert.doesNotMatch(sitemap, /\/api\/|\/auth\/|create-handoff|idea-packet/);
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