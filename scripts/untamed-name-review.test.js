import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_STATIC_ROUTES, staticSitemapXml } from "../shared/public-routes.js";
import { assertPublicStaticNetlifyRedirects } from "./generate-public-pages.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const draft = read("docs/untamed-names-and-performers-review.md");
const copy = draft.split("<!-- reader-copy:start -->")[1]?.split("<!-- reader-copy:end -->")[0];
const route = "/c-drama-fandom/untamed-names-and-performers/";
const page = `public${route}index.html`;
const releasedHtml = read(page);
const text = (value) => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

test("name-help copy approval is recorded separately from production release", () => {
  assert.ok(copy, "Reader copy must be delimited independently of review notes");
  assert.match(draft, /COPY APPROVED — NOT RELEASED TO PRODUCTION/);
  assert.match(draft, /\*\*Decision:\*\* approved the exact two-lead reader copy on October 3, 2026/);
  assert.match(draft, /copy approval does not publish the guide/);
  assert.match(draft, /Katie affirmatively chose \*\*“Authorize production release”\*\*/);
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

test("approved guide is registered for release with a canonical, sitemap and Netlify route", () => {
  assert.ok(PUBLIC_STATIC_ROUTES.some((entry) => entry.path === route && entry.page === page));
  assertPublicStaticNetlifyRedirects(read("netlify.toml"));
  assert.ok(staticSitemapXml().includes(`https://fandom.justlikekatie.com${route}`));
  assert.ok(read("public/sitemap.xml").includes(route));
  assert.equal([...releasedHtml.matchAll(/rel="canonical"/g)].length, 1);
  assert.ok(releasedHtml.includes(`rel="canonical" href="https://fandom.justlikekatie.com${route}"`));
  assert.match(releasedHtml, /name="robots" content="index,follow"/);
  assert.doesNotMatch(releasedHtml, /creator review|review-banner|noindex|<img\b|<video\b|<audio\b/i);
  assert.match(releasedHtml, /src="\/c-drama-fandom\/styles.css"|href="\/c-drama-fandom\/styles.css"/);
  assert.match(releasedHtml, /src="\/c-drama-fandom\/editorial.js"/);
  assert.ok(read("public/c-drama-fandom/editorial.js").includes('"untamed-names-and-performers"'));
  assert.match(read("netlify.toml"), /publish\s*=\s*"dist"/);
});

test("release preserves every approved paragraph, heading, table cell and citation exactly", () => {
  const renderedBlocks = [...releasedHtml.matchAll(/<(h[12]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((match) => text(match[2]));
  const plainMarkdown = (value) => value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/^#+ /, "");
  for (const paragraph of copy.trim().split(/\n\s*\n/)) {
    if (paragraph.startsWith("|")) {
      const renderedCells = [...releasedHtml.matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/g)]
        .map((match) => text(match[2]));
      for (const row of paragraph.split("\n").filter((line) => !/^\| ---/.test(line))) {
        for (const cell of row.split("|").slice(1, -1)) {
          assert.ok(renderedCells.includes(text(plainMarkdown(cell))), `Missing approved cell: ${cell}`);
        }
      }
    } else {
      assert.ok(renderedBlocks.includes(text(plainMarkdown(paragraph))), `Changed approved copy: ${paragraph}`);
    }
  }
  for (const [, link] of copy.matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(releasedHtml.includes(`href="${link}"`), `Missing approved destination: ${link}`);
  }
  assert.equal([...releasedHtml.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0][1].match(/<tr>/g).length, 2);
  assert.doesNotMatch(releasedHtml, /Wen Qing|Yiling Patriarch|Hanguang|Mo Xuanyu|Lan Sizhui|Jin Guangyao/i);
  assert.doesNotMatch(releasedHtml, /localStorage|safeThroughEpisode=|\/api\/watch-journal/);
  assert.match(releasedHtml, /role="region"[^>]*aria-label="[^"]*scroll horizontally[^"]*" tabindex="0"/);
});

test("release adds only the exact secondary links and leaves the approved group panels intact", () => {
  const board = read("public/c-drama-fandom/untamed-name-board/index.html");
  assert.ok(board.includes(`<a href="${route}">Looking for character and actor names? Read the two-lead name key →</a>`));
  const link = `<a href="${route}">Two characters and their performers — pre-watch names only →</a>`;
  assert.ok(read("scripts/generate-public-pages.js").includes(link));
  for (const { page: journalPage } of PUBLIC_STATIC_ROUTES.filter(({ group }) => group === "journal")) {
    const journal = read(journalPage);
    assert.ok(journal.includes(link), journalPage);
    assert.match(journal, /const allowedOnRoute = \(value\) => validBoundary\(value\) && \(routeMaximum === null \|\| Number\(value\) <= routeMaximum\)/);
    assert.match(journal, /payload\.safeThroughEpisode !== boundary/);
    assert.match(journal, /fandom-watch-journal-safe-through:the-untamed/);
  }
  assert.ok(!read("public/c-drama-fandom/place-names/index.html").includes(route));
  const panels = board.match(/<div class="name-board">([\s\S]*?)\n          <\/div>/)[1];
  assert.equal(createHash("sha256").update(panels).digest("hex"), "50bdc56cbe2c56d7b069afb4877addd23e1c13492e2943b3e07803242b6fe41c");
});

test("downloadable preview is text-only, non-indexable and retains reader destinations", () => {
  const html = read("docs/editorial/untamed-names-and-performers.html");
  assert.match(html, /COPY APPROVED — NOT RELEASED TO PRODUCTION/i);
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