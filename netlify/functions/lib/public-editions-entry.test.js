import assert from "node:assert/strict";
import test from "node:test";
import { createPublicEditionsHandler } from "../public-editions.js";
import { catalogStore, completeCatalog, manifestStore, publicManifest } from "../public-test-fixture.js";

test("public editions fail closed while the immutable catalog is incomplete", async () => {
  const handler = createPublicEditionsHandler({
    getStore: () => ({
      async get() { return null; },
      async list() { return { blobs: [] }; },
    }),
  });
  const response = await handler(new Request(
    "https://fandom.justlikekatie.com/.netlify/functions/public-editions",
  ), {});
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(response.body, /actor|account|entitlement|query|prompt/i);
});

test("public edition responses use a shared cache only for the public allowlist", async () => {
  const handler = createPublicEditionsHandler({
    getStore: () => ({
      async get() { return null; },
      async list() { return { blobs: [] }; },
    }),
  });
  const response = await handler(new Request(
    "https://fandom.justlikekatie.com/.netlify/functions/public-editions?date=2026-09-03&actor=liu-xueyi",
  ), {});
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers.Vary, undefined);
});

test("public-editions returns the allowlisted approved record with shared caching", async () => {
  const manifest = publicManifest();
  const handler = createPublicEditionsHandler({ getStore: () => manifestStore([manifest]) });
  const response = await handler(new Request(
    "https://fandom.justlikekatie.com/.netlify/functions/public-editions?date=2026-09-03&actor=liu-xueyi",
  ), {});
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "public, max-age=300, stale-while-revalidate=3600");
  const body = JSON.parse(response.body);
  assert.equal(body.canonical, "https://fandom.justlikekatie.com/vibe-atlas/editions/2026-09-03/liu-xueyi/");
  assert.match(body.vibe.copy, /An original editorial record/);
  const visit = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      assert.doesNotMatch(key, /query|prompt|diagnostic|confidence|candidateId|sourceUrl|assetId|checksum|provenance/i);
      visit(child);
    }
  };
  visit(body);
});

test("public-editions never caches a missing or malformed catalogued manifest as a 404", async () => {
  for (const manifest of [null, { publicationDate: "2026-09-03", actor: { id: "broken" } }]) {
    const handler = createPublicEditionsHandler({
      getStore: () => catalogStore(completeCatalog(), manifest ? [manifest] : []),
    });
    const response = await handler(new Request(
      "https://fandom.justlikekatie.com/.netlify/functions/public-editions?date=2026-09-03&actor=liu-xueyi",
    ), {});
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers["Cache-Control"], "no-store");
  }
});