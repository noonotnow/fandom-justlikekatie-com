import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PUBLIC_STATIC_ROUTES } from "../shared/public-routes.js";
import { assertVibingWarningCopy } from "./vibing-warning-copy.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
const prefix = "/c-drama-fandom/vibing-now/";
const shelf = read(`public${prefix}index.html`);
const schema = JSON.parse(shelf.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1]);
const cases = [
  ["43-45", 17, "0ca69d8c545708acfe564b027773badd5ddb0f27779eac6005a182998baa4426", [
    "7fe08c29628b1b17dc4b60fc3302a9f4bf218e7be8d5a9b5163a9ce6429a639b",
    "0926e41548904151ce55ab496a6b962fe6d09ce638d6fa82a92a35fbfc491c5a",
  ]],
  ["46-47", 19, "62390c09784a9c67169623bb14a9b2436a6a7a8d39390bb7b392ffb08f7c9933", [
    "9b4eadc61190ef2c467a34cfe02a5e603a2865fb65cd2d0c72674994e85b83ca",
    "6d12620d5a300055d02d1f31d9bc8a5badfc0c3c2ebea2e2ad59cb691c6aa0ac",
  ]],
];

for (const [range, count, digest, stillDigests] of cases) {
  test(`closing ${range} preserves approved prose, image bytes and public surfaces`, () => {
    const path = `${prefix}against-the-current-episodes-${range}/`;
    const html = read(`public${path}index.html`);
    const paragraphs = [...html.matchAll(/<p\b[^>]*data-paragraph="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)]
      .map(m => [m[1], m[2]]);
    assert.equal(paragraphs.length, count);
    assert.equal(hash(JSON.stringify(paragraphs)), digest);
    const images = [...html.matchAll(/<img\b[^>]*src="data:image\/[^;]+;base64,([^"]+)"[^>]*>/g)];
    assert.equal(images.length, 2);
    assert.deepEqual(images.map(m => hash(Buffer.from(m[1], "base64"))), stillDigests);
    assert.equal((html.match(/<figcaption\b/g) || []).length, 2);
    const route = PUBLIC_STATIC_ROUTES.find(r => r.path === path);
    assert.ok(route);
    assertVibingWarningCopy(html, route);
    assert.ok(html.includes(`<link rel="canonical" href="https://fandom.justlikekatie.com${path}">`));
    assert.match(html, /name="robots" content="index,follow/);
    const articleSchema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(articleSchema["@type"], "Article");
    assert.equal(articleSchema.mainEntityOfPage, `https://fandom.justlikekatie.com${path}`);
    assert.equal(articleSchema.datePublished, undefined);
    assert.equal(articleSchema.dateModified, undefined);
    assert.equal(schema.mainEntity.itemListElement.filter(item => item.url.endsWith(path)).length, 1);
    assert.ok(shelf.includes(`data-series-installment="episodes_${range.replace("-", "_")}"`));
    assert.ok(read("public/sitemap.xml").includes(`https://fandom.justlikekatie.com${path}`));
    assert.ok(read("netlify.toml").includes(`to = "${path}index.html"`));
    assert.doesNotMatch(html, /__editorial-preview|Development Preview|Not published|preview-banner|preview-appendix|unlicensed|data-discussion|vibing-discussion\.js/i);
    assert.match(html, /cpophome\.com/);
    assert.ok(html.includes(`href="${prefix}"`));
  });
}

test("closing spoilers remain isolated from the earlier reading and shelf", () => {
  const first = read(`public${prefix}against-the-current-episodes-43-45/index.html`);
  assert.doesNotMatch(first, /A Life Is More Than an Acquittal/);
  assert.doesNotMatch(shelf, /A Life Is More Than an Acquittal/);
  assert.match(first, /Episodes 46–47[^<]*later spoilers/i);
  assert.match(shelf, /Episodes 46–47: Read the closing installment · Ending spoilers/);
  assert.doesNotMatch(first, /<script(?! type="application\/ld\+json")/);
});
