import assert from "node:assert/strict";
import test from "node:test";
import { checkPublicRecords, PUBLIC_ORIGIN } from "./check-public-records.js";

const actor = `${PUBLIC_ORIGIN}/vibe-atlas/actors/example-actor/`;
const edition = `${PUBLIC_ORIGIN}/vibe-atlas/editions/2026-09-01/example-actor/`;
const secondActor = `${PUBLIC_ORIGIN}/vibe-atlas/actors/another-actor/`;
const secondEdition = `${PUBLIC_ORIGIN}/vibe-atlas/editions/2026-09-02/another-actor/`;
const releasedActor = `${PUBLIC_ORIGIN}/vibe-atlas/packs/example-actor/`;
const releasedPack = `${PUBLIC_ORIGIN}/vibe-atlas/packs/example-actor/wuxia-0/`;
const secondReleasedPack = `${PUBLIC_ORIGIN}/vibe-atlas/packs/example-actor/xianxia-1/`;
const sitemap = (urls = [actor, edition]) =>
  `<?xml version="1.0"?><urlset>${urls.map(url => `<url><loc>${url}</loc></url>`).join("")}</urlset>`;
const page = (url, robots = "index,follow,max-image-preview:large", canonical = url) =>
  `<!doctype html><html><head><meta name="robots" content="${robots}"><link rel="canonical" href="${canonical}"></head><body><h1>Public record</h1></body></html>`;

function fixture({ xml = sitemap(), inventory = "complete", actorStatus = 200, editionHtml = page(edition), actorHtml = page(actor), headers = {}, additional = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    if (url === `${PUBLIC_ORIGIN}/sitemap.xml`) {
      return new Response(xml, { headers: {
        "Content-Type": "application/xml",
        ...(inventory === null ? {} : { "X-Public-Sitemap-Inventory": inventory }),
      } });
    }
    if (url === actor) {
      return new Response(actorHtml, {
        status: actorStatus,
        headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
      });
    }
    if (url === edition) {
      return new Response(editionHtml, { headers: { "Content-Type": "text/html" } });
    }
    if (url in additional) {
      return additional[url];
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  return { calls, fetchImpl };
}

test("checks every listed actor and edition without following redirects", async () => {
  const { calls, fetchImpl } = fixture({
    xml: sitemap([
      `${PUBLIC_ORIGIN}/vibe-atlas/`,
      actor,
      secondActor,
      edition,
      secondEdition,
    ]),
    additional: Object.fromEntries([secondActor, secondEdition].map(url => [
      url, new Response(page(url), { headers: { "Content-Type": "text/html" } }),
    ])),
  });
  await checkPublicRecords(fetchImpl);
  assert.deepEqual(calls.map(([url]) => url), [`${PUBLIC_ORIGIN}/sitemap.xml`, actor, secondActor, edition, secondEdition]);
  assert.ok(calls.every(([, options]) => options.redirect === "manual" && options.signal));
});

test("accepts a complete empty publication inventory without fetching records", async () => {
  for (const xml of [sitemap([]), sitemap([`${PUBLIC_ORIGIN}/`, `${PUBLIC_ORIGIN}/vibe-atlas/`])]) {
    const { calls, fetchImpl } = fixture({ xml });
    await checkPublicRecords(fetchImpl);
    assert.deepEqual(calls.map(([url]) => url), [`${PUBLIC_ORIGIN}/sitemap.xml`]);
  }
});

test("rejects missing or incomplete sitemap inventory evidence even with no records", async () => {
  for (const inventory of [null, "publication-incomplete", "release-catalog-incomplete", "unavailable", "unknown"]) {
    const { calls, fetchImpl } = fixture({ xml: sitemap([]), inventory });
    await assert.rejects(checkPublicRecords(fetchImpl), /inventory is missing or incomplete/);
    assert.equal(calls.length, 1);
  }
});

test("checks every listed released-pack actor and pack with the same indexability rules", async () => {
  const { calls, fetchImpl } = fixture({
    xml: sitemap([actor, edition, releasedActor, releasedPack, secondReleasedPack]),
    additional: Object.fromEntries([releasedActor, releasedPack, secondReleasedPack].map(url => [
      url, new Response(page(url), { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ])),
  });
  await checkPublicRecords(fetchImpl);
  assert.deepEqual(calls.map(([url]) => url), [
    `${PUBLIC_ORIGIN}/sitemap.xml`, actor, edition, releasedActor, releasedPack, secondReleasedPack,
  ]);
  assert.ok(calls.every(([, options]) => options.redirect === "manual" && options.signal));
});

test("accepts absent released-pack inventory, but rejects a partial sitemap", async () => {
  await checkPublicRecords(fixture().fetchImpl);
  for (const urls of [[actor, edition, releasedActor], [actor, edition, releasedPack]]) {
    await assert.rejects(
      checkPublicRecords(fixture({ xml: sitemap(urls) }).fetchImpl),
      /released-pack actors and packs inconsistently/,
    );
  }
  await assert.rejects(
    checkPublicRecords(fixture({ xml: sitemap([actor, edition, releasedActor, `${PUBLIC_ORIGIN}/vibe-atlas/packs/another-actor/wuxia-0/`]) }).fetchImpl),
    /no released-pack actor/,
  );
  await assert.rejects(
    checkPublicRecords(fixture({ xml: sitemap([actor, edition, releasedActor, `${PUBLIC_ORIGIN}/vibe-atlas/packs/another-actor/`, releasedPack]) }).fetchImpl),
    /no released pack/,
  );
});

test("fails for broken listed released-pack pages, including later packs", async () => {
  for (const broken of [releasedActor, releasedPack, secondReleasedPack]) {
    const { fetchImpl } = fixture({
      xml: sitemap([actor, edition, releasedActor, releasedPack, secondReleasedPack]),
      additional: Object.fromEntries([releasedActor, releasedPack, secondReleasedPack].map(url => [
        url, new Response(url === broken ? "Missing" : page(url), {
          status: url === broken ? 404 : 200,
          headers: { "Content-Type": "text/html" },
        }),
      ])),
    });
    await assert.rejects(checkPublicRecords(fetchImpl), new RegExp(`${broken} returned HTTP 404`));
  }
});

test("fails when released-pack pages are non-indexable, non-HTML, or non-canonical", async () => {
  const checkPack = (url, response) => checkPublicRecords(fixture({
    xml: sitemap([actor, edition, releasedActor, releasedPack]),
    additional: {
      [releasedActor]: new Response(page(releasedActor), { headers: { "Content-Type": "text/html" } }),
      [releasedPack]: new Response(page(releasedPack), { headers: { "Content-Type": "text/html" } }),
      [url]: response,
    },
  }).fetchImpl);
  await assert.rejects(checkPack(releasedActor, new Response(page(releasedActor, "noindex,follow"), { headers: { "Content-Type": "text/html" } })), /not indexable/);
  await assert.rejects(checkPack(releasedPack, new Response(page(releasedPack, "index,follow", releasedActor), { headers: { "Content-Type": "text/html" } })), /canonical differs/);
  await assert.rejects(checkPack(releasedPack, new Response(page(releasedPack), { headers: { "Content-Type": "application/json" } })), /did not return HTML/);
  await assert.rejects(checkPack(releasedPack, new Response(page(releasedPack), { headers: { "Content-Type": "text/html", "X-Robots-Tag": "noindex" } })), /X-Robots-Tag/);
});

test("fails when a non-first actor or edition record is broken", async () => {
  for (const broken of [secondActor, secondEdition]) {
    const { fetchImpl } = fixture({
      xml: sitemap([actor, secondActor, edition, secondEdition]),
      additional: Object.fromEntries([secondActor, secondEdition].map(url => [
        url, new Response(url === broken ? "Unavailable" : page(url), {
          status: url === broken ? 503 : 200,
          headers: { "Content-Type": "text/html" },
        }),
      ])),
    });
    await assert.rejects(checkPublicRecords(fetchImpl), new RegExp(`${broken} returned HTTP 503`));
  }
});

test("fails on a one-sided actor or edition sitemap", async () => {
  for (const urls of [[actor], [edition]]) {
    await assert.rejects(checkPublicRecords(fixture({ xml: sitemap(urls) }).fetchImpl), /actors and editions inconsistently/);
  }
});

test("fails when the sitemap is malformed rather than an empty urlset", async () => {
  for (const xml of ["<not-a-urlset/>", "<urlset><unexpected/></urlset>", "<urlset><url><unexpected/></url></urlset>", "<urlset>"]) {
    await assert.rejects(checkPublicRecords(fixture({ xml }).fetchImpl), /sitemap/);
  }
});

test("fails instead of fetching a foreign sitemap location", async () => {
  await assert.rejects(
    checkPublicRecords(fixture({ xml: sitemap([actor, "https://other.example/vibe-atlas/editions/2026-09-01/example-actor/"]) }).fetchImpl),
    /another origin/,
  );
});

test("fails if a listed actor returns an error or redirect", async () => {
  for (const status of [404, 503, 302]) {
    await assert.rejects(checkPublicRecords(fixture({ actorStatus: status }).fetchImpl), new RegExp(`HTTP ${status}`));
  }
});

test("fails if a record is noindex or has a mismatched canonical", async () => {
  await assert.rejects(
    checkPublicRecords(fixture({ actorHtml: page(actor, "noindex,follow") }).fetchImpl),
    /not indexable/,
  );
  await assert.rejects(
    checkPublicRecords(fixture({ editionHtml: page(edition, "index,follow", actor) }).fetchImpl),
    /canonical differs/,
  );
  await assert.rejects(
    checkPublicRecords(fixture({ headers: { "X-Robots-Tag": "noindex" } }).fetchImpl),
    /X-Robots-Tag/,
  );
});

test("fails on non-HTML record content or absent canonical", async () => {
  await assert.rejects(
    checkPublicRecords(fixture({ actorHtml: "Not an HTML document" }).fetchImpl),
    /not an HTML document/,
  );
  await assert.rejects(
    checkPublicRecords(fixture({ actorHtml: "<!doctype html><html><head><meta name=\"robots\" content=\"index,follow\"></head></html>" }).fetchImpl),
    /one canonical URL/,
  );
});