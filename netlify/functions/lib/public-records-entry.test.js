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

test("released pack pages expose one stable safe preview with valid structured data", async () => {
  const manifest = publicManifest();
  const pack = {
    actorId: "liu-xueyi",
    vibeIdx: 0,
    canonical: "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/",
    actor: { id: "liu-xueyi", name: "刘学义", nameEn: "Liu Xueyi", accentColor: "#fff" },
    vibe: {
      key: "liu-xueyi:0",
      label: "仙门冷玉",
      labelEn: "Cold Jade Immortal",
      emoji: "🗡️",
      subtitleEn: "All in white, like discipline itself caught feelings",
    },
    preview: {
      copy: "An original editorial record with enough substantive public context for this release.",
      cards: [{
        position: 0,
        title: "Approved frame",
        source: "Publisher",
        thumbnailUrl: "https://media.example/thumb.jpg",
        deliveryUrl: "https://media.example/full.jpg",
        mimeType: "image/jpeg",
        dimensions: { width: 900, height: 1200 },
      }],
    },
    publishedAt: "2026-09-03T04:00:00.000Z",
    runId: "PRIVATE-RUN",
  };
  const handler = createPublicRecordsHandler({
    getStore: () => manifestStore([manifest]),
    buildReleaseCatalog: async () => ({ complete: true, packs: [pack] }),
  });
  const result = await handler(new Request(pack.canonical), {});
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.match(result.body, /index,follow,max-image-preview:large/);
  assert.match(result.body, /Cold Jade Immortal/);
  assert.match(result.body, /Become|Fandom Collectors/);
  const structured = result.body.match(/<script type="application\/ld\+json">(.+?)<\/script>/)?.[1];
  assert.equal(JSON.parse(structured)["@type"], "Article");
  assert.doesNotMatch(result.body, /PRIVATE-RUN|query|prompt|audit|diagnostic|score|candidate|account/i);

  const variant = await handler(new Request(`${pack.canonical}?view=private`), {});
  assert.match(variant.body, /noindex,follow/);
  assert.equal(variant.headers["Cache-Control"], "no-store");
});

test("released pack revocation is visible immediately and cannot reuse a shared response", async () => {
  const manifest = publicManifest();
  const canonical = "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-xueyi/cold-jade-immortal-0/";
  let released = true;
  const pack = {
    canonical,
    actor: { id: "liu-xueyi", name: "刘学义", nameEn: "Liu Xueyi" },
    vibe: { key: "liu-xueyi:0", label: "仙门冷玉", labelEn: "Cold Jade Immortal", subtitleEn: "Approved context" },
    preview: {
      copy: "A substantive approved editorial preview that is safe for public readers.",
      cards: [{ title: "Frame", thumbnailUrl: "https://media.example/t.jpg", deliveryUrl: "https://media.example/d.jpg" }],
    },
  };
  const handler = createPublicRecordsHandler({
    getStore: () => manifestStore([manifest]),
    buildReleaseCatalog: async () => ({ complete: true, packs: released ? [pack] : [] }),
  });
  const before = await handler(new Request(canonical), {});
  assert.equal(before.statusCode, 200);
  assert.equal(before.headers["Cache-Control"], "no-store");
  released = false;
  const after = await handler(new Request(canonical), {});
  assert.equal(after.statusCode, 404);
  assert.equal(after.headers["Cache-Control"], "no-store");
  assert.match(after.body, /noindex,follow/);
});