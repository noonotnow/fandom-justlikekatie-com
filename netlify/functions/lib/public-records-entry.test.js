import assert from "node:assert/strict";
import test from "node:test";
import { createPublicRecordsHandler } from "../public-records.js";
import { catalogStore, completeCatalog, manifestStore, publicManifest } from "../public-test-fixture.js";

const emptyStore = () => ({
  async get() { return null; },
  async list() { return { blobs: [] }; },
});

test("public record pages fail closed without a complete approved inventory", async () => {
  const handler = createPublicRecordsHandler({ getStore: emptyStore });
  const result = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/",
  ), {});
  assert.equal(result.statusCode, 503);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(result.body, /query|prompt|diagnostic|candidate|account|confidence/i);
});

test("unknown public record paths are noindex and never become shared cache entries", async () => {
  const store = {
    async get(key) {
      if (key.includes("catalog")) {
        return {
          schemaVersion: 1,
          catalogVersion: "v1",
          kind: "vibe-atlas-publication-manifest-catalog",
          dates: [],
        };
      }
      return null;
    },
    async list() { return { blobs: [] }; },
  };
  const handler = createPublicRecordsHandler({ getStore: () => store });
  const result = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/actors/not-published/",
  ), {});
  assert.equal(result.statusCode, 404);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.match(result.body, /noindex,follow/);
  assert.match(result.body, /rel="canonical"/);
});

test("approved actor and edition pages render indexable allowlisted records", async () => {
  const manifest = publicManifest();
  const handler = createPublicRecordsHandler({ getStore: () => manifestStore([manifest]) });
  const actor = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/",
  ), {});
  const edition = await handler(new Request(
    "https://fandom.justlikekatie.com/vibe-atlas/editions/2026-09-03/liu-xueyi/",
  ), {});
  for (const result of [actor, edition]) {
    assert.equal(result.statusCode, 200);
    assert.match(result.body, /name="robots" content="index,follow,max-image-preview:large"/);
    assert.equal(result.headers["Cache-Control"], "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    assert.doesNotMatch(result.body, /PRIVATE|query|prompt|diagnostic|confidence|candidateId|sourceUrl|assetId|checksum|provenance/i);
  }
  assert.match(actor.body, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/actors\/liu-xueyi\/"/);
  assert.match(actor.body, /\/vibe-atlas\/editions\/2026-09-03\/liu-xueyi\//);
  assert.match(edition.body, /rel="canonical" href="https:\/\/fandom\.justlikekatie\.com\/vibe-atlas\/editions\/2026-09-03\/liu-xueyi\/"/);
  assert.match(edition.body, /An original editorial record/);
  assert.match(edition.body, /https:\/\/media\.example\/thumbs\/liu-xueyi-2026-09-03-0\.jpg/);
  assert.match(edition.body, /property="og:image" content="https:\/\/media\.example\/assets\/liu-xueyi-2026-09-03-4\.jpg"/);
  assert.match(edition.body, /\/vibe-atlas\/actors\/liu-xueyi\//);
});

test("public record routes fail closed and no-store when catalog coverage is missing or malformed", async () => {
  for (const manifest of [null, { publicationDate: "2026-09-03", actor: { id: "broken" } }]) {
    const handler = createPublicRecordsHandler({
      getStore: () => catalogStore(completeCatalog(), manifest ? [manifest] : []),
    });
    const result = await handler(new Request(
      "https://fandom.justlikekatie.com/vibe-atlas/actors/liu-xueyi/",
    ), {});
    assert.equal(result.statusCode, 503);
    assert.equal(result.headers["Cache-Control"], "no-store");
    assert.doesNotMatch(result.body, /partial|query|prompt|candidate/i);
  }
});