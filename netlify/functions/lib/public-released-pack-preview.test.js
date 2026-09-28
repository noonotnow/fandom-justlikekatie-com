import assert from "node:assert/strict";
import test from "node:test";
import { createPublicReleasedPackPreviewHandler } from "../public-released-pack-preview.js";

const actorPacks = [{ id: "liu-yuning", vibes: [{}, {}, {}] }];
const url = "https://example.com/.netlify/functions/public-released-pack-preview?actorId=liu-yuning&vibeIdx=2";

function handler(catalog, resolveSnapshot = async () => null) {
  return createPublicReleasedPackPreviewHandler({
    actorPacks,
    getStore: () => ({}),
    buildCatalog: async () => catalog,
    resolveSnapshot,
  });
}

test("daily pairing without a qualifying edition remains unpublished; unavailable inventory is distinct", async () => {
  const missing = await handler({ complete: true, packs: [] })({ method: "GET", url }, {});
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(JSON.parse(missing.body), { status: "unpublished" });
  const unavailable = await handler({ complete: false, packs: [] })({ method: "GET", url }, {});
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(JSON.parse(unavailable.body), { status: "unavailable" });
  assert.equal(missing.headers["Cache-Control"], "no-store");
});

test("public preview returns only safe catalog projection, never source URLs or audit metadata", async () => {
  const preview = {
    copy: "Original editorial context for this carefully reviewed permanent edition.",
    cards: Array.from({ length: 9 }, (_, position) => ({
      position, title: `Card ${position}`,
      thumbnailUrl: `https://media.example/${position}.jpg`,
      deliveryUrl: `https://media.example/${position}-full.jpg`,
    })),
  };
  const response = await handler({
    complete: true,
    packs: [{
      actorId: "liu-yuning", vibeIdx: 2,
      canonical: "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-yuning/boyfriend-lighting-2/",
      actor: { id: "liu-yuning", nameEn: "Liu Yuning" },
      vibe: { labelEn: "Boyfriend Lighting" },
      preview, runId: "private-audit", sourceUrl: "https://private.example",
    }],
  })({ method: "GET", url }, {});
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.preview.cards.length, 9);
  assert.equal(body.canonical.includes("boyfriend-lighting-2"), true);
  assert.equal(response.body.includes("private-audit"), false);
  assert.equal(response.body.includes("private.example"), false);
  assert.equal(response.headers["Cache-Control"], "no-store");
});

test("a featured daily grid can be a non-canonical snapshot while editorial publication waits", async () => {
  const snapshot = {
    kind: "vibe-atlas-daily-pack-snapshot",
    actorId: "liu-yuning",
    vibeIdx: 2,
    date: "2026-09-25",
    cards: Array.from({ length: 9 }, (_, i) => ({ thumbnailUrl: `https://media.example/${i}.jpg` })),
  };
  const response = await handler({ complete: true, packs: [] }, async input => {
    assert.equal(input.date, snapshot.date);
    assert.equal(input.actorId, snapshot.actorId);
    return snapshot;
  })({ method: "GET", url: `${url}&date=2026-09-25` }, {});
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), snapshot);
  assert.equal(response.body.includes("canonical"), false);
});

test("a dated teaser selects today's first grid rather than an older released record", async () => {
  const snapshot = {
    kind: "vibe-atlas-daily-pack-snapshot", date: "2026-09-25",
    actorId: "liu-yuning", vibeIdx: 2,
    cards: Array.from({ length: 9 }, (_, i) => ({ thumbnailUrl: `https://media.example/${i}.jpg` })),
  };
  const pack = {
    actorId: "liu-yuning", vibeIdx: 2, publicationDate: "2026-09-24",
    canonical: "https://fandom.justlikekatie.com/vibe-atlas/packs/liu-yuning/boyfriend-lighting-2/",
    preview: { copy: "Older editorial record", cards: snapshot.cards },
  };
  const result = await handler({ complete: true, packs: [pack] }, async () => snapshot)(
    { method: "GET", url: `${url}&date=2026-09-25` }, {},
  );
  assert.deepEqual(JSON.parse(result.body), snapshot);
  assert.equal(result.statusCode, 200);
});