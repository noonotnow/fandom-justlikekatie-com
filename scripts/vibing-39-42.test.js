import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const path = "/c-drama-fandom/vibing-now/against-the-current-episodes-39-42/";
const article = readFileSync(new URL(`../public${path}index.html`, import.meta.url), "utf8");
const journal = readFileSync(new URL("../public/cdrama-fandom/vibing-now/field-journals/against-the-current/index.html", import.meta.url), "utf8");

// Frozen exact-copy check, not evidence of episode chronology or source approval.
test("Episodes 39–42 keeps the approved reading and its release surfaces", () => {
  const body = article.match(/<article class="article"><section>(.*?)<\/section>/s)?.[1];
  assert.ok(body, "the article body must be present");
  const normalized = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(createHash("sha256").update(normalized).digest("hex"),
    "dba14d9eae75d171d552bc3b06d1481d91a71b0bba6f63bb6f9bd00d934284bd");
  assert.equal((body.match(/<h2>/g) || []).length, 9);
  assert.match(article, /<h1>What Love Makes Room For<\/h1>/);
  assert.match(article, /<h2>Episode 42<\/h2>/);
  assert.match(article, /Read Episodes 34–38 →/);
  assert.doesNotMatch(article, /notion\.com|Watch Notes|Publication support|Verification notes|data-discussion/);
  // Candidates named in the verdict are not released packs and must say so.
  for (const name of ["Silk-Robed Damage Control", "Room-Making Husband"]) {
    assert.match(article, new RegExp(`<strong>${name}</strong> <em>\\(Pack candidate · unreleased\\)</em>`));
  }
});

test("the journal lists Episodes 39–42 once, between 34–38 and the closing readings", () => {
  const data = JSON.parse(journal.match(/<script type="application\/ld\+json">\s*(.*?)\s*<\/script>/s)[1]);
  const entry = data.mainEntity.itemListElement.filter(item => item.url.endsWith(path));
  assert.equal(entry.length, 1);
  assert.equal(entry[0].position, 10);
  assert.equal(entry[0].name, "Safe through Episodes 39–42");
  assert.match(journal, /data-series-installment="episodes_39_42">Safe through Episodes 39–42<\/a>/);
});
