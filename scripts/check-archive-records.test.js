import assert from "node:assert/strict";
import test from "node:test";
import { checkArchiveRecords } from "./check-archive-records.js";

const origin = "https://fandom.justlikekatie.com";
const actor = "/vibe-atlas/actors/example/";
const edition = "/vibe-atlas/editions/2026-09-01/example/";
const record = { actorPath: actor, editionPath: edition };
const images = Array.from({ length: 9 }, (_, index) => `https://images.xhs.justlikekatie.com/images/sha256/card-${index}.jpg`);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c]);
const fullSize = Array.from({ length: 9 }, (_, index) => `https://media.justlikekatie.com/images/sha256/full-${index}.jpg`);
const xml = paths => `<urlset>${paths.map(path => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
const html = path => `<!doctype html><head><meta name="robots" content="index,follow"><link rel="canonical" href="${origin}${path}"></head><body>${path === edition ? `<section aria-label="Approved preview grid">${images.map((src, index) => `<figure><img src="${src}" data-media-delivery-url="${fullSize[index]}"></figure>`).join("")}</section>` : ""}</body>`;

function fixture({ editionStatus = 200, sitemapPaths = [actor, edition], sitemapInventory = "complete", link = record, editionHtml = html(edition), editionHeaders = {}, imageResponses = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/sitemap.xml")) return new Response(xml(sitemapPaths), { headers: {
      "Content-Type": "application/xml",
      ...(sitemapInventory === null ? {} : { "X-Public-Sitemap-Inventory": sitemapInventory }),
    } });
    if (url.includes("archive=1")) return Response.json({
      editions: [{ date: "2026-09-01", ...(link ? { publicRecord: link } : {}) }],
      page: { hasMore: false },
    });
    if (images.includes(url) || fullSize.includes(url)) {
      const response = imageResponses[url];
      return response ? response() : new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } });
    }
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
  assert.equal(calls.length, 22);
  assert.deepEqual(calls.filter(call => images.includes(call.url)).map(call => call.url).sort(), [...images].sort());
  assert.deepEqual(calls.filter(call => fullSize.includes(call.url)).map(call => call.url).sort(), [...fullSize].sort());
  assert.ok(calls.every(call => call.options.redirect === "manual"));
});

test("dated Archive entries without verified record links remain navigable", async () => {
  // A historical entry without an indexable publication is not in the sitemap.
  const { fetchImpl, calls } = fixture({ link: null, sitemapPaths: [actor] });
  assert.deepEqual(await checkArchiveRecords(fetchImpl, origin), { advertisedRecords: 0 });
  assert.equal(calls.length, 2);
});

test("rejects a static-only inventory fallback before treating it as an empty publication inventory", async () => {
  for (const status of ["publication-incomplete", "release-history-unavailable", "release-catalog-incomplete", "unavailable", null]) {
    const { fetchImpl, calls } = fixture({ sitemapPaths: ["/", "/vibe-atlas/"], link: null, sitemapInventory: status });
    await assert.rejects(
      checkArchiveRecords(fetchImpl, origin),
      /Production sitemap inventory is .*; Archive release comparison has incomplete evidence/,
    );
    assert.equal(calls.length, 1, "Do not compare Archive entries against an unverified sitemap");
  }
});

test("warns about a disappeared release even when the sitemap reports well-formed XML", async () => {
  const { fetchImpl, calls } = fixture({
    sitemapPaths: ["/", "/vibe-atlas/"],
    sitemapInventory: "publication-history-mismatch",
    link: null,
  });
  await assert.rejects(checkArchiveRecords(fetchImpl, origin),
    /Previously released editions are missing from the public publication inventory/);
  assert.equal(calls.length, 1);
});

test("accepts a verified, legitimately empty publication inventory without Collector access", async () => {
  const { fetchImpl, calls } = fixture({ sitemapPaths: ["/", "/vibe-atlas/"], link: null });
  assert.deepEqual(await checkArchiveRecords(fetchImpl, origin), { advertisedRecords: 0 });
  assert.equal(calls.length, 2);
});

test("fails when a sitemap-published edition is missing from the Archive, without fetching it", async () => {
  const missing = "/vibe-atlas/editions/2026-09-02/another-actor/";
  const { fetchImpl, calls } = fixture({ sitemapPaths: [actor, edition, missing] });
  await assert.rejects(
    checkArchiveRecords(fetchImpl, origin),
    new RegExp(`missing from the Archive listing: ${origin}${missing}`),
  );
  assert.ok(!calls.some(call => call.url === `${origin}${missing}`));
});

test("fails when an indexable edition has a dated Archive entry but no verified public record", async () => {
  const { fetchImpl, calls } = fixture({ link: null });
  await assert.rejects(checkArchiveRecords(fetchImpl, origin), /missing from the Archive listing/);
  assert.ok(!calls.some(call => call.url === `${origin}${edition}`));
});

test("compares the full paginated Archive with canonical edition URLs only", async () => {
  const { fetchImpl, calls } = fixture({
    sitemapPaths: [
      actor, edition, "/vibe-atlas/actors/another-actor/",
      "/vibe-atlas/packs/example/",
      "/vibe-atlas/editions/2026-09-02/another-actor/?preview=1",
    ],
  });
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
  assert.ok(!calls.some(call => call.url.includes("preview=1")));
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
  assert.equal(calls.filter(call => images.includes(call.url)).length, 9);
  assert.equal(calls.filter(call => fullSize.includes(call.url)).length, 9);
});

test("fails when any published image is missing, empty, or not an image", async () => {
  for (const response of [
    () => new Response(null, { status: 404 }),
    () => new Response(null, { headers: { "Content-Type": "image/jpeg", "Content-Length": "0" } }),
    () => new Response(new Uint8Array(), { headers: { "Content-Type": "image/jpeg" } }),
    () => new Response("<html>missing</html>", { headers: { "Content-Type": "text/html" } }),
  ]) {
    for (const image of [images[8], fullSize[8]]) {
      await assert.rejects(checkArchiveRecords(fixture({ imageResponses: { [image]: response } }).fetchImpl, origin), new RegExp(image.split("/").at(-1).replace(".", "\\.")));
    }
  }
});

test("rejects non-image bytes, truncated signatures, and bytes inconsistent with the image type", async () => {
  for (const [bytes, type] of [
    [new TextEncoder().encode("<html>not an image"), "image/jpeg"],
    [jpeg.slice(0, 3), "image/jpeg"],
    [png, "image/jpeg"],
    [jpeg, "image/png"],
    [new Uint8Array([...png.slice(0, 12), 1, 2, 3, 4]), "image/png"],
    [new Uint8Array([...webp.slice(0, 12), 1, 2, 3, 4]), "image/webp"],
  ]) {
    for (const image of [images[8], fullSize[8]]) {
      await assert.rejects(
        checkArchiveRecords(fixture({ imageResponses: {
          [image]: () => new Response(bytes, { headers: { "Content-Type": type } }),
        } }).fetchImpl, origin),
        /invalid (jpeg|png|webp) signature/,
      );
    }
  }
});

test("accepts JPEG, PNG, and WebP signatures even when split across chunks", async () => {
  for (const [bytes, type] of [[jpeg, "jpeg"], [png, "png"], [webp, "webp"]]) {
    const { fetchImpl } = fixture({ imageResponses: {
      [fullSize[8]]: () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(bytes.slice(0, 2));
          controller.enqueue(bytes.slice(2, 9));
          controller.enqueue(bytes.slice(9));
          controller.close();
        },
      }), { headers: { "Content-Type": `image/${type}` } }),
    } });
    assert.deepEqual(await checkArchiveRecords(fetchImpl, origin), { advertisedRecords: 2 });
  }
});

test("fails closed for incomplete, duplicate, or non-MEDIA grids without fetching source URLs", async () => {
  for (const sources of [
    images.slice(0, 8),
    [...images.slice(0, 8), images[0]],
    [...images.slice(0, 8), "https://source-search.example/image.jpg"],
  ]) {
    const editionHtml = html(edition).replace(/<section[\s\S]*?<\/section>/, `<section aria-label="Approved preview grid">${sources.map((src, index) => `<img src="${src}" data-media-delivery-url="${fullSize[index]}">`).join("")}</section>`);
    const { fetchImpl, calls } = fixture({ editionHtml });
    await assert.rejects(checkArchiveRecords(fetchImpl, origin), /nine images|nine distinct images|not a published MEDIA URL/);
    assert.ok(!calls.some(call => call.url.startsWith("https://source-search.example/")));
  }
});

test("rejects missing, repeated, and unsafe full-size URLs before fetching them", async () => {
  for (const url of [
    null,
    fullSize[0],
    "https://source-search.example/image.jpg",
    "https://media.justlikekatie.com/images/sha256/full-8.jpg?source=search",
    "https://media.justlikekatie.com/private/full-8.jpg",
  ]) {
    const editionHtml = html(edition).replace(`data-media-delivery-url="${fullSize[8]}"`,
      url === null ? "" : `data-media-delivery-url="${url}"`);
    const { fetchImpl, calls } = fixture({ editionHtml });
    await assert.rejects(checkArchiveRecords(fetchImpl, origin), /full-size image|nine distinct full-size images/);
    assert.ok(!calls.some(call => call.url === url));
    assert.ok(!calls.some(call => call.url.startsWith("https://source-search.example/")));
  }
});

test("ignores search provenance and unrelated images outside the approved grid", async () => {
  const source = "https://source-search.example/original.jpg";
  const editionHtml = html(edition)
    .replace("</body>", `<img src="${source}"></body>`)
    .replace("</section>", `<a href="${source}">Source</a></section>`);
  const { fetchImpl, calls } = fixture({ editionHtml });
  assert.deepEqual(await checkArchiveRecords(fetchImpl, origin), { advertisedRecords: 2 });
  assert.ok(!calls.some(call => call.url === source));
});

test("cancels the image response after reading only its bounded signature", async () => {
  let cancelled = 0;
  let extraReads = 0;
  const { fetchImpl } = fixture({
    imageResponses: Object.fromEntries([...images, ...fullSize].map(url => [url, () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(jpeg.slice(0, 5)); },
      pull(controller) {
        if (this.sentHeader) {
          extraReads++;
          controller.enqueue(new Uint8Array(1024));
        } else {
          this.sentHeader = true;
          controller.enqueue(jpeg.slice(5));
        }
      },
      cancel() { cancelled++; },
    }), { headers: { "Content-Type": "image/jpeg" } })])),
  });
  await checkArchiveRecords(fetchImpl, origin);
  assert.equal(cancelled, 18);
  // Streams can prefetch a chunk, but must not consume the rest of an image.
  assert.ok(extraReads <= 18);
});

test("fails closed when Archive pagination is incomplete or repeated", async () => {
  const responseFor = page => async (url) => url.endsWith("/sitemap.xml")
    ? new Response(xml([actor, edition]), { headers: { "Content-Type": "application/xml", "X-Public-Sitemap-Inventory": "complete" } })
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
