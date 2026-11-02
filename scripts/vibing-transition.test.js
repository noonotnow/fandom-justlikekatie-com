import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PUBLIC_STATIC_ROUTES, publicStaticPreviewRoutes, staticSitemapXml } from "../shared/public-routes.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const journalPath = "/cdrama-fandom/vibing-now/field-journals/against-the-current/";
const currentPath = "/c-drama-fandom/vibing-now/";
const current = read(`public${currentPath}index.html`);
const journal = read(`public${journalPath}index.html`);
const schema = html => JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1]);

test("the new spotlight and continuing journal have distinct identities and reciprocal links", () => {
  assert.match(current, /<h1>Where the Mask Ends<\/h1>/);
  assert.match(journal, /<h1>Against the Current<\/h1>/);
  assert.ok(current.includes(`href="${journalPath}"`));
  assert.ok(journal.includes(`href="${currentPath}"`));
  assert.match(journal, /The closing readings are in\. The journal stays open\./);
  for (const [path, html] of [[currentPath, current], [journalPath, journal]]) {
    const url = `https://fandom.justlikekatie.com${path}`;
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
    assert.equal(schema(html).mainEntityOfPage, url);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`));
    assert.match(html, /<script src="\/audience-gate\.js"><\/script>/);
  }
});

test("every existing registered reading keeps its original address and appears once in the journal", () => {
  const articles = PUBLIC_STATIC_ROUTES.filter(r => r.path.startsWith(`${currentPath}against-the-current-`));
  const list = schema(journal).mainEntity.itemListElement;
  assert.deepEqual(list.map(r => r.url).sort(), articles.map(r => `https://fandom.justlikekatie.com${r.path}`).sort());
  for (const { path } of articles) {
    assert.equal([...journal.matchAll(new RegExp(`href="${path}"`, "g"))].length, 1, path);
  }
  list.forEach((r, i) => assert.equal(r.position, i + 1));
  assert.match(journal, /Episodes 46–47: Read the closing installment · Ending spoilers/);
  assert.doesNotMatch(journal, /A Life Is More Than an Acquittal/);
  assert.match(journal, /href="\/c-drama-fandom\/soundtrack\/against-the-current\/"/);
  assert.doesNotMatch(journal, /href="[^"]*episodes-26-30\//);
});

test("new journal is registered for build, sitemap, preview and Netlify without migrating readings", () => {
  assert.ok(PUBLIC_STATIC_ROUTES.some(r => r.path === journalPath && r.group === "editorial"));
  assert.equal(new Map(publicStaticPreviewRoutes()).get(journalPath.slice(0, -1)), `${journalPath}index.html`);
  assert.equal(staticSitemapXml().split(`<loc>https://fandom.justlikekatie.com${journalPath}</loc>`).length - 1, 1);
  const redirects = read("netlify.toml");
  assert.ok(redirects.includes(`from = "${journalPath.slice(0, -1)}"\nto = "${journalPath}index.html"\nstatus = 200`));
  assert.doesNotMatch(redirects, /from = "\/c-drama-fandom\/\*"/);
});

test("discovery surfaces distinguish the new spotlight from the journal", () => {
  for (const path of ["public/c-drama-fandom/index.html", "src/components/FandomLaunchpad/FandomLaunchpad.tsx"]) {
    const html = read(path);
    assert.ok(html.includes("Where the Mask Ends"));
    assert.ok(html.includes(`href="${journalPath}"`));
    assert.ok(html.includes(`href="${currentPath}"`));
    assert.doesNotMatch(html, /Follow three spoiler-bounded C-drama readings|Choose your Against the Current reading →/);
  }
  const fallback = read("index.html").match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1];
  assert.ok(fallback, "the no-JavaScript homepage remains useful");
  assert.match(fallback, /href="\/c-drama-fandom\/vibing-now\/">meet Where the Mask Ends, our current Vibing Now focus<\/a>/);
  assert.ok(fallback.includes(`href="${journalPath}">open the Against the Current Field Journal</a>`));
});

test("the launch introduction does not expose the later reveal or fabricate releases", () => {
  const introduction = current.split('aria-labelledby="new-focus"')[1].split("</section>")[0];
  assert.doesNotMatch(introduction, /Guo Yufeng|47:18|49:02|ZHEN|MEI CUO|mastermind|LYN|借名入局/);
  assert.doesNotMatch(current, /href="[^"]*(?:lin-jinqi|where-the-mask-ends-episodes)/);
  assert.match(current, /href="\/memeforge\/c-drama"/);
  assert.match(journal, /These remain two separate readings, not a new combined essay/);
});
