import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PUBLIC_STATIC_ROUTES, PUBLIC_EDITORIAL_REDIRECTS } from "../shared/public-routes.js";

const root = "/c-drama-fandom/vibing-now/";
const read = (path) => readFileSync(path, "utf8");
const hash = (text) => createHash("sha256").update(text).digest("hex");
const text = (markup) => markup.replace(/<[^>]*>/g, " ")
  .replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
// Frozen exact-copy checks, not evidence of episode chronology or source approval.
const records = [
  ["26-29", 29, "1c5bc657f0970d27d7fdf0bdd86c7b43d1dced82a822f66089958b403c0c99d8",
    "He Asked the Emperor for a Wife. The Drama Keeps Asking Whether She Chose Him.",
    "Jinqi is willing to be beaten for the marriage. Lanxiang is still the person who was not asked whether she wanted it.",
    "Against the Current Episodes 26–29: Love and Choice | Vibing Now",
    "A reading of Against the Current Episodes 26–29: the wedding, family, humor, and the difference between obtaining a marriage and being chosen."],
  ["30-31", 31, "2d803c214b4f70e79b845571c4cfcc3a0b193de2640efbb6a95ccdcec03705a1",
    "Lanxiang Comes Home. Then She Shows Jinqi How She Works.",
    "The return to her childhood home and the fight for Ji’er’s freedom belong to the same movement: Lanxiang has a history, judgment, and work of her own.",
    "Against the Current Episodes 30–31: Homecoming and Freedom | Vibing Now",
    "A reading of Against the Current Episodes 30–31: Lanxiang’s homecoming, Ji’er’s freedom, women reading together, and help that leaves room for her judgment."],
  ["32-33", 33, "fbdc97f3bb2184b756a22bc4eab0740819480f32f32e558156d95ffe15f7d1de",
    "Lanxiang Starts Writing Justice. Lin Jinqi Has No Choice but to Come Along.",
    "A woman needs a way out of an abusive marriage. Lanxiang must find grounds the court will hear without letting anyone else decide the woman’s future.",
    "Against the Current Episodes 32–33: Lanxiang Writes Justice | Vibing Now",
    "A reading of Against the Current Episodes 32–33: the divorce case, legal constraint, and the difference between helping a woman and deciding for her."],
];

for (const [range, endpoint, bodyDigest, headline, lede, seoTitle, description] of records) {
  test(`revised ${range} retains exact approved text and complete release surfaces`, () => {
    const path = `${root}against-the-current-episodes-${range}/`;
    const html = read(`public${path}index.html`);
    const body = html.match(/<section class="article-copy"[^>]*>([\s\S]*?)<\/section>/)?.[1];
    assert.ok(body);
    assert.equal(hash(text(body)), bodyDigest);
    assert.equal(text(html.match(/<h1>([\s\S]*?)<\/h1>/)[1]), headline);
    assert.equal(text(html.match(/<p class="hero__lede">([\s\S]*?)<\/p>/)[1]), lede);
    assert.equal(text(html.match(/<title>([\s\S]*?)<\/title>/)[1]), seoTitle);
    for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
      assert.equal(text(html.match(new RegExp(`<meta ${attribute} content="([^"]+)"`))[1]), description);
    }
    const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(schema.headline, headline);
    assert.equal(schema.description, description);
    assert.equal(schema.mainEntityOfPage, `https://fandom.justlikekatie.com${path}`);
    assert.equal(schema.datePublished, undefined, "do not invent a publication date while preparing a release");
    assert.equal(schema.dateModified, undefined);
    assert.match(html, new RegExp(`<h2>Episode ${endpoint}</h2>`));
    assert.match(html, /or choose to read ahead knowing/);
    assert.ok(PUBLIC_STATIC_ROUTES.some(route => route.path === path));
    for (const file of ["public/sitemap.xml", "netlify.toml"]) {
      assert.ok(read(file).includes(path), `${path} missing from ${file}`);
    }
    assert.doesNotMatch(html, /Reddit|Audience context|source-certified|Source-reviewed|watch notes|vibing-discussion\.js|data-discussion-article/i);
  });
}

test("superseded essay redirects to its correction, without a legacy discussion page", () => {
  const retired = `${root}against-the-current-episodes-26-30/`;
  assert.equal(existsSync(`public${retired}index.html`), false);
  assert.ok(!PUBLIC_STATIC_ROUTES.some(route => route.path === retired));
  assert.doesNotMatch(read("public/sitemap.xml"), /episodes-26-30/);
  for (const { from, to, status } of PUBLIC_EDITORIAL_REDIRECTS) {
    assert.equal(to, `${root}against-the-current-episodes-26-29/`);
    assert.equal(status, 301);
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(read("netlify.toml"), new RegExp(`from = "${escaped}"\\s+to = "${to}"\\s+status = 301\\s+force = true`));
  }
  const shelf = read(`public${root}index.html`);
  assert.doesNotMatch(shelf, /href="[^"]*episodes-26-30\//);
  const earlier = read(`public${root}against-the-current-episodes-22-25/index.html`);
  const unchanged = earlier.replace(
    'href="/c-drama-fandom/vibing-now/against-the-current-episodes-26-29/">Continue to Episodes 26–29 (later spoilers)',
    'href="/c-drama-fandom/vibing-now/against-the-current-episodes-26-30/">Continue to Episodes 26–30 (later spoilers)',
  );
  assert.equal(hash(unchanged), "debe69d324b36971bdb0527527841a84b0f2c8eaa87c4706344b04df02417563");
  assert.equal(hash(read(`public${root}against-the-current-episode-21/index.html`)), "5f09d04509c210c9d2c4834b5d1d77f440ce06bd332262d884b1110ef3fe7c76");
});

test("shelf discovers five bounded readings without fixed counts or availability promises", () => {
  const shelf = read(`public${root}index.html`);
  assert.match(shelf, /Start with the last episode you’ve finished, not the platform you use/);
  assert.match(shelf, /WeTV Express, VIP, free viewing, and Viki do not necessarily put everyone at the same point/);
  assert.match(shelf, /Read after finishing the named endpoint—or choose to read ahead/);
  assert.doesNotMatch(shelf, /three current-state readings|Three spoiler-bounded readings/);
  const schema = JSON.parse(shelf.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.mainEntity.itemListElement.length, 5);
  for (const [range] of records) {
    assert.ok(schema.mainEntity.itemListElement.some(item => item.url.endsWith(`episodes-${range}/`)));
    assert.match(shelf, new RegExp(`data-series-installment="episodes_${range.replace("-", "_")}"`));
  }
});
