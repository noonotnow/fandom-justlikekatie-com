import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { assertAudienceGatedHtml } from "./static-audience-gates.js";

const path = "/zh-cn/c-drama-fandom/vibing-now/lin-jinqi-pack-vote/";
const html = readFileSync(new URL(`../public${path}index.html`, import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");

// Campaign landing page for the Rednote/Weibo vote. It is Chinese-only, so it
// sits outside the localized-pair registry and stays out of the sitemap.
test("the Lin Jinqi pack vote page is a noindexed Chinese campaign page", () => {
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.ok(html.includes(`<link rel="canonical" href="https://fandom.justlikekatie.com${path}">`));
  assert.doesNotThrow(() => assertAudienceGatedHtml(html, path));
  assert.match(netlify, new RegExp(`from = "${path.replace(/\/$/, "")}"\\s+to = "${path}index\\.html"\\s+status = 200`));
  assert.doesNotMatch(readFileSync(new URL("../public/sitemap.xml", import.meta.url), "utf8"), /lin-jinqi-pack-vote/);
});

test("the ballot lists four unreleased candidates bounded at Episode 42", () => {
  const cards = [...html.matchAll(/<li class="ballot-card" id="candidate-(\d)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(cards.map(match => match[1]), ["1", "2", "3", "4"]);
  for (const name of ["Silk-Robed Damage Control", "Biggest Baby, Thickest Skin", "The Man Who Remembers for You", "Room-Making Husband"]) {
    assert.ok(html.includes(`lang="en">${name}</p>`), name);
  }
  assert.match(html, /四个都还只是候选，没有一个已经做成氛围包/);
  assert.match(html, /截至第42集/);
  assert.doesNotMatch(html, /第4[3-9]集(?!以后)/);
  for (const [, , body] of cards) {
    const href = body.match(/href="(\/c-drama-fandom\/vibing-now\/against-the-current-[^"]+\/)"/)?.[1];
    assert.ok(href, "each candidate links to its reading");
    assert.ok(existsSync(new URL(`../public${href}index.html`, import.meta.url)), href);
    assert.match(body, /（英文）<\/a>/);
  }
});

test("the page loads only self-hosted images and collects no votes itself", () => {
  const sources = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]);
  assert.ok(sources.length >= 1);
  for (const src of sources) {
    assert.match(src, /^\/assets\//);
    assert.ok(existsSync(new URL(`../public${src}`, import.meta.url)), src);
  }
  assert.doesNotMatch(html, /redd\.it|reddit\.com|<form\b|<input\b/);
  assert.match(html, /这一页不收集投票/);
});
