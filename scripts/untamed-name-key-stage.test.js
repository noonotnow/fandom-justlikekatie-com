import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PUBLIC_STATIC_ROUTES } from "../shared/public-routes.js";
import { WATCH_JOURNAL_PUBLIC_PAGES } from "./generate-public-pages.js";
import { stageUntamedNameKey, NAME_KEY_ROUTE, BOARD_LABEL, JOURNAL_LABEL } from "./stage-untamed-name-key.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = path => readFileSync(`${root}${path}`, "utf8");

test("production activation has separate authorization after staging", () => {
  const approval = read("docs/untamed-three-character-name-key-review.md");
  assert.match(approval, /\*\*Staging authorization: GRANTED\.\*\*/);
  assert.match(approval, /\*\*Production release authorization: GRANTED\.\*\*/);
  assert.match(approval, /Authorize production publication/);
  assert.ok(PUBLIC_STATIC_ROUTES.some(({ path }) => path === NAME_KEY_ROUTE));
  assert.ok(existsSync(`${root}public${NAME_KEY_ROUTE}index.html`));
  assert.ok(read("public/sitemap.xml").includes(NAME_KEY_ROUTE));
  assert.match(read("netlify.toml"), /from = "\/c-drama-fandom\/untamed-names-and-performers"/);
});

test("staged integrations add only the exact approved links, preserving all Journal code and board panels", () => {
  const pages = stageUntamedNameKey();
  for (const path of WATCH_JOURNAL_PUBLIC_PAGES) {
    const html = pages.get(`/${path.replace(/^public\//, "")}`);
    const addition = `<a href="${NAME_KEY_ROUTE}">${JOURNAL_LABEL}</a>`;
    assert.equal(html.split(addition).length, 2);
    assert.equal(html, read(path), path);
    const behavior = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join("\n");
    assert.equal(createHash("sha256").update(behavior).digest("hex"),
      "75f0cb29fbbc8f573467be91597d709e385c86478b1277c4624cdd11c010a910", "Journal script is unchanged from before this release");
  }
  const addition = `<section class="side-card"><a href="${NAME_KEY_ROUTE}">${BOARD_LABEL}</a></section>`;
  assert.equal(pages.get("/c-drama-fandom/untamed-name-board/index.html").split(addition).length, 2);
  assert.equal(pages.get("/c-drama-fandom/untamed-name-board/index.html"),
    read("public/c-drama-fandom/untamed-name-board/index.html"));
});

test("staged guide has exactly the three approved pairings, warnings and all approved citations", () => {
  const html = stageUntamedNameKey().get(`${NAME_KEY_ROUTE}index.html`);
  assert.equal(html, read(`public${NAME_KEY_ROUTE}index.html`), "Production page matches verified staging renderer");
  const draft = read("docs/untamed-three-character-name-key-review.md");
  const copy = draft.split("<!-- reader-copy:start -->")[1].split("<!-- reader-copy:end -->")[0];
  assert.match(html, /The Untamed: three characters, three performers/);
  for (const text of ["Wei Wuxian", "Xiao Zhan", "Lan Wangji", "Wang Yibo", "Wen Qing", "Meng Ziyi",
    "魏无羡", "肖战", "蓝忘机", "王一博", "温情", "孟子义", "Source pages can contain spoilers",
    "This is a listing check, not an on-screen closing-credit inspection.", "secondary reference, not primary credits"]) {
    assert.ok(html.includes(text), text);
  }
  for (const [, destination] of copy.matchAll(/\]\(([^)]+)\)/g)) {
    assert.ok(html.includes(`href="${destination}"`), destination);
    if (destination.startsWith("/") && destination !== "/vibe-atlas") {
      assert.ok(existsSync(`${root}public${destination}index.html`), destination);
    }
  }
  assert.equal((html.match(/<tbody>/g) ?? []).length, 2);
  assert.doesNotMatch(html, /<img\b|<video\b|<audio\b|fetch\(|localStorage|safeThroughEpisode|Yiling Patriarch|Hanguang|Mo Xuanyu/);
});

test("production preserves every approved heading, paragraph and table cell, with unchanged group panels", () => {
  const html = read(`public${NAME_KEY_ROUTE}index.html`);
  const copy = read("docs/untamed-three-character-name-key-review.md")
    .split("<!-- reader-copy:start -->")[1].split("<!-- reader-copy:end -->")[0];
  const text = value => value.replace(/<[^>]+>/g, "")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
  const plainMarkdown = value => value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*/g, "").replace(/^#+ /, "");
  const blocks = [...html.matchAll(/<(h[123]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => text(match[2]));
  const cells = [...html.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => text(match[2]));
  for (const paragraph of copy.trim().split(/\n\s*\n/)) {
    if (paragraph.startsWith("|")) {
      for (const row of paragraph.split("\n").filter(line => !/^\| ---/.test(line))) {
        for (const cell of row.split("|").slice(1, -1)) {
          assert.ok(cells.includes(text(plainMarkdown(cell))), cell);
        }
      }
    } else {
      assert.ok(blocks.includes(text(plainMarkdown(paragraph))), paragraph);
    }
  }
  const board = read("public/c-drama-fandom/untamed-name-board/index.html");
  const panels = board.match(/<div class="name-board">([\s\S]*?)\n          <\/div>/)[1];
  assert.equal(createHash("sha256").update(panels).digest("hex"),
    "50bdc56cbe2c56d7b069afb4877addd23e1c13492e2943b3e07803242b6fe41c");
  assert.match(html, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/c-drama-fandom\/untamed-names-and-performers\/"/);
  assert.match(html, /name="robots" content="index,follow"/);
});