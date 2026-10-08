import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "/c-drama-fandom/vibing-now/against-the-current-episodes-34-38/";
const article = readFileSync(new URL(`../public${path}index.html`, import.meta.url), "utf8");
const shelf = readFileSync(new URL("../public/c-drama-fandom/vibing-now/index.html", import.meta.url), "utf8");

test("Episodes 34–38 preserves the supplied final reading, not the older Notion draft", () => {
  const body = article.match(/<article class="article"><section>(.*?)<\/section>/s)?.[1];
  assert.ok(body, "the final article body must be present");
  const normalized = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/\s*—\s*/g, "—").trim();
  // Verified word-for-word against the creator-supplied final PDF, ignoring reflow.
  assert.equal(createHash("sha256").update(normalized).digest("hex"),
    "45631d0d5526c7f9c6a0e3d3b77715256cc13f376956d0a7624385b22dcd4df0");
  assert.equal((body.match(/<p>/g) || []).length, 28);
  assert.equal((body.match(/<h2>/g) || []).length, 5);
  assert.match(article, /<h1>Being Remembered, Not Being Discovered<\/h1>/);
  assert.match(article, /<p class="hero__lede">A borrowed birthday, a rebellion, and the birthday he remembers: Episodes 34–38 make Jinqi’s care more specific—and Lanxiang’s choice more complicated\.<\/p>/);
  assert.doesNotMatch(article, /PRIVATE DRAFT|Private reading|Not published|notion\.com|Watch Notes|Draft release package|data-discussion/);
});

test("the shelf exposes one explicit Episode 38 choice with matching structured data", () => {
  const data = JSON.parse(shelf.match(/<script type="application\/ld\+json">\s*(.*?)\s*<\/script>/s)[1]);
  const entry = data.mainEntity.itemListElement.filter(item => item.url.endsWith(path));
  assert.equal(entry.length, 1);
  assert.equal(entry[0].position, 6);
  assert.equal(entry[0].name, "Against the Current: safe through Episodes 34–38");
  assert.match(shelf, /data-series-installment="episodes_34_38">Safe through Episodes 34–38: Read the installment<\/a>/);
  assert.match(article, /<h2>Episode 38<\/h2>/);
  assert.match(article, /Read Episodes 32–33 →/);
});
