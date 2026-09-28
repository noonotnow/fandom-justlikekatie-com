import assert from "node:assert/strict";
import test from "node:test";
import { checkArchiveRecords } from "./check-archive-records.js";

const origin = "https://fandom.justlikekatie.com";
const actor = "/vibe-atlas/actors/example/";
const edition = "/vibe-atlas/editions/2026-09-01/example/";
const record = { actorPath: actor, editionPath: edition };
const xml = paths => `<urlset>${paths.map(path => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
const html = path => `<!doctype html><head><meta name="robots" content="index,follow"><link rel="canonical" href="${origin}${path}"></head>`;

function fixture({ editionStatus = 200, sitemapPaths = [actor, edition], link = record, editionHtml = html(edition), editionHeaders = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/sitemap.xml")) return new Response(xml(sitemapPaths), { headers: { "Content-Type": "application/xml" } });
    if (url.includes("archive=1")) return Response.json({
      editions: [{ date: "2026-09-01", ...(link ? { publicRecord: link } : {}) }],
      page: { hasMore: false },
    });
    return new Response(url.endsWith(edition) ? editionHtml : html(actor), {
      status: url.endsWith(edition) ? editionStatus : 200,
      headers: { "Content-Type": "text/html", ...(url.endsWith(edition) ? editionHeaders : {}) },
    });
  };
  return { fetchImpl, calls };
}

test("checks all advertised Archive record routes and sitemap membership", async () => {
  const { fetchImpl, calls } = fixture();
  assert.deepEqual(await checkArchiveRecords(fetchImpl, origin), { advertisedRecords: 2 });
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.options.redirect === "manual"));
});

test("dated Archive entries without verified record links remain navigable", async () => {
  const { fetchImpl, calls } = fixture({ link: null });
  assert.deepEqual(await checkArchiveRecords(fetchImpl, origin), { advertisedRecords: 0 });
  assert.equal(calls.length, 2);
});

test("fails for broken or unlisted Archive record links", async () => {
  await assert.rejects(
    checkArchiveRecords(fixture({ editionStatus: 404 }).fetchImpl, origin),
    /returned HTTP 404/,
  );
  await assert.rejects(
    checkArchiveRecords(fixture({ sitemapPaths: [actor] }).fetchImpl, origin),
    /absent from the sitemap/,
  );
  await assert.rejects(
    checkArchiveRecords(fixture({ link: { ...record, editionPath: "https://other.example/" } }).fetchImpl, origin),
    /invalid edition path/,
  );
});

test("visits all Archive pages rather than checking only the first", async () => {
  const { fetchImpl, calls } = fixture();
  const paged = async (url, options) => {
    if (url.includes("archive=1")) {
      calls.push({ url, options });
      return Response.json(url.includes("cursor=")
        ? { editions: [{ date: "2026-09-01", publicRecord: record }], page: { hasMore: false } }
        : { editions: [], page: { hasMore: true, nextCursor: "2026-09-01" } });
    }
    return fetchImpl(url, options);
  };
  assert.deepEqual(await checkArchiveRecords(paged, origin), { advertisedRecords: 2 });
  assert.equal(calls.filter(call => call.url.includes("archive=1")).length, 2);
});

test("fails closed when Archive pagination is incomplete or repeated", async () => {
  const responseFor = page => async (url) => url.endsWith("/sitemap.xml")
    ? new Response(xml([actor, edition]), { headers: { "Content-Type": "application/xml" } })
    : Response.json(page);
  await assert.rejects(checkArchiveRecords(responseFor({
    editions: [], page: { hasMore: true },
  }), origin), /invalid cursor/);
  await assert.rejects(checkArchiveRecords(responseFor({
    editions: [], page: { hasMore: true, nextCursor: "2026-09-01" },
  }), origin), /repeated a cursor/);
});

test("rejects records that are HTML but not indexable canonical documents", async () => {
  for (const options of [
    { editionHtml: html(edition).replace("index,follow", "noindex,follow") },
    { editionHtml: html(edition).replace(origin + edition, origin + actor) },
    { editionHeaders: { "X-Robots-Tag": "noindex" } },
    { editionHtml: "<!doctype html><head></head>" },
  ]) {
    await assert.rejects(checkArchiveRecords(fixture(options).fetchImpl, origin));
  }
});