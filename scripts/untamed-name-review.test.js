import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_STATIC_ROUTES } from "../shared/public-routes.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const draft = read("docs/untamed-names-and-performers-review.md");
const copy = draft.split("<!-- reader-copy:start -->")[1]?.split("<!-- reader-copy:end -->")[0];
const route = "/c-drama-fandom/untamed-names-and-performers/";

test("name-help copy approval is recorded separately from production release", () => {
  assert.ok(copy, "Reader copy must be delimited independently of review notes");
  assert.match(draft, /RELEASED TO PRODUCTION — APPROVED TWO-LEAD VERSION/);
  assert.match(draft, /\*\*Decision:\*\* approved the exact two-lead reader copy on October 3, 2026/);
  assert.match(draft, /copy approval does not publish the guide/);
  assert.match(copy, /Pre-watch \/ episode 0/);
  const rows = copy.split("\n").filter((line) => /^\| \*\*/.test(line));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /Wei Wuxian.*Wei Ying.*Wuxian.*Xiao Zhan/);
  assert.match(rows[1], /Lan Wangji.*Lan Zhan.*Wangji.*Wang Yibo/);
  assert.doesNotMatch(copy, /Wen Qing|Yiling Patriarch|Hanguang|Mo Xuanyu|Lan Sizhui|Jin Guangyao/i);
});

test("reader key retains attribution, version distinction, journal and Daily Drop handoffs", () => {
  for (const text of [
    "50 episodes", "20-episode", "UNTAMED (2025)", "Mo Dao Zu Shi",
    "courtesy name", "secondary reference, not primary credits",
    "Source pages can contain spoilers",
    "not a claim that we inspected on-screen closing credits",
  ]) assert.ok(copy.includes(text), text);
  for (const path of [
    "/c-drama-fandom/untamed-name-board/", "/c-drama-fandom/place-names/",
    "/c-drama-fandom/watch-journal/", "/vibe-atlas",
  ]) assert.ok(copy.includes(`](${path})`), path);
  assert.match(copy, /does not load journal entries, change your saved boundary/);
  assert.match(copy, /does not promise either lead is today's featured actor/);
});

test("combined destination replacement has separate production authorization and preserves two-lead review records", () => {
  assert.ok(existsSync(resolve(root, `public${route}index.html`)));
  assert.ok(PUBLIC_STATIC_ROUTES.some((entry) => entry.path === route));
  assert.match(read("docs/untamed-three-character-name-key-review.md"), /\*\*Production release authorization: GRANTED\.\*\*/);
  assert.match(read(`public${route}index.html`), /The Untamed: three characters, three performers/);
  assert.ok(!read("public/c-drama-fandom/place-names/index.html").includes("untamed-names-and-performers"));
  assert.match(read("netlify.toml"), /publish\s*=\s*"dist"/);
});

test("downloadable preview is text-only, non-indexable and retains reader destinations", () => {
  const html = read("docs/editorial/untamed-names-and-performers.html");
  assert.match(html, /Approved copy — review archive\./);
  assert.match(html, /Two-lead production release verified October 3, 2026/);
  assert.match(html, /name="robots" content="noindex,nofollow"/);
  assert.doesNotMatch(html, /<script\b|<img\b|<video\b|<audio\b|rel="canonical"/i);
  const links = [...copy.matchAll(/\]\((https:\/\/[^)]+|\/[^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    const absolute = link.startsWith("/") ? `https://fandom.justlikekatie.com${link}` : link;
    assert.ok(html.includes(`href="${absolute}"`), absolute);
  }
  assert.match(html, /魏婴/);
  assert.match(html, /蓝湛/);
});