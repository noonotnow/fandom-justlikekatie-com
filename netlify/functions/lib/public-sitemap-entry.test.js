import assert from "node:assert/strict";
import test from "node:test";
import { createPublicSitemapHandler, sitemapXml } from "../public-sitemap.js";
import { catalogStore, completeCatalog, manifestStore, publicManifest } from "../public-test-fixture.js";

test("sitemap preserves static public routes and never emits query-bearing URLs", () => {
  const xml = sitemapXml(["/", "/vibe-atlas", "/vibe-atlas/actors/liu-xueyi/"]);
  assert.match(xml, /<loc>https:\/\/fandom\.justlikekatie\.com\/vibe-atlas<\/loc>/);
  assert.match(xml, /\/vibe-atlas\/actors\/liu-xueyi\//);
  assert.doesNotMatch(xml, /[?&](?:query|account|view)=/);
});

test("dynamic sitemap fails closed while the catalog is incomplete", async () => {
  const handler = createPublicSitemapHandler({
    getStore: () => ({
      async get() { return null; },
      async list() { return { blobs: [] }; },
    }),
  });
  const result = await handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal(result.statusCode, 503);
  assert.equal(result.headers["Cache-Control"], "no-store");
});

test("dynamic sitemap includes approved actor and edition once and excludes thin records", async () => {
  const approved = publicManifest();
  const incomplete = publicManifest({ date: "2026-09-04", completeEditorial: false });
  const handler = createPublicSitemapHandler({
    getStore: () => manifestStore([approved, incomplete]),
  });
  const result = await handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
  assert.equal(result.statusCode, 200);
  const actorUrl = "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/";
  const editionUrl = "https://fandom.justlikekatie.com/vibe-atlas/editions/2026-09-03/liu-xueyi/";
  assert.equal(result.body.split(actorUrl).length - 1, 1);
  assert.equal(result.body.split(editionUrl).length - 1, 1);
  assert.doesNotMatch(result.body, /2026-09-04/);
});

test("dynamic sitemap never shared-caches a partial inventory when catalog coverage is missing or malformed", async () => {
  for (const manifest of [null, { publicationDate: "2026-09-03", actor: { id: "broken" } }]) {
    const handler = createPublicSitemapHandler({
      getStore: () => catalogStore(completeCatalog(), manifest ? [manifest] : []),
    });
    const result = await handler(new Request("https://fandom.justlikekatie.com/sitemap.xml"), {});
    assert.equal(result.statusCode, 503);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.doesNotMatch(result.body, /2026-09-03|liu-xueyi/);
  }
});