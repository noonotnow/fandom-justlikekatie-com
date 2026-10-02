import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyReleasedPackHealth,
  inspectReleasedPackManifest,
  publicReleasedPack,
  protectedReleasedPackIds,
  releasedPackCatalog,
  releasedPackCatalogHealth,
} from "./released-pack-catalog.js";
import {
  gridManifestKey,
  publicationManifestCatalogKey,
} from "./publication-manifest.js";

function manifest(overrides = {}) {
  const associationId = "vibe-atlas:daily-drop:2026-09-23";
  const candidateIds = Array.from({ length: 9 }, (_, position) => `candidate-${position}`);
  return {
    schemaVersion: 1,
    manifestVersion: "v1",
    kind: "vibe-atlas-daily-drop",
    publicationDate: "2026-09-23",
    manifestId: "manifest-1",
    idempotencyKey: "publication-1",
    boardHash: "a".repeat(64),
    actor: { id: "actor", name: "Actor", nameEn: "Actor", accentColor: "#000000" },
    vibe: {
      key: "actor:0",
      idx: 0,
      label: "Quiet Power",
      labelEn: "Quiet Power",
      subtitleEn: "A complete subtitle",
      supportingCopyEn: "This is substantive editorial copy long enough for the released library.",
    },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds: candidateIds },
    cards: candidateIds.map((candidateId, position) => ({
      position,
      candidateId,
      title: `Card ${position + 1}`,
      source: "Source",
      sourceUrl: `https://source.example/${position}.jpg`,
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
        thumbnailUrl: `https://media.example/${position}-thumb.jpg`,
        deliveryUrl: `https://media.example/${position}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        checksum: String(position).repeat(64),
        dimensions: { width: 100, height: 100 },
        association: { type: "publication", id: associationId, itemId: `card-${position}` },
      },
    })),
    ...overrides,
  };
}

test("released pack inspection distinguishes editorial and media gates", () => {
  assert.equal(inspectReleasedPackManifest(null).reasonCode, "incomplete_inventory");
  const missingCopy = manifest();
  missingCopy.vibe.subtitleEn = "";
  missingCopy.vibe.supportingCopyEn = "short";
  assert.equal(inspectReleasedPackManifest(missingCopy).reasonCode, "missing_editorial_copy");
  const malformed = manifest();
  malformed.cards[4].media.deliveryUrl = "";
  assert.equal(inspectReleasedPackManifest(malformed).reasonCode, "malformed_media");
  assert.ok(inspectReleasedPackManifest(manifest()).safe);
});

test("released pack previews project optional Chinese copy and preserve explicit English fallback without manifest mutation", () => {
  const withChineseCopy = manifest();
  withChineseCopy.vibe.supportingCopy = "戏服会换，情绪废墟不换。";
  const unchangedManifest = structuredClone(withChineseCopy);
  const projection = inspectReleasedPackManifest(withChineseCopy).safe;
  assert.equal(projection.copyZh, "戏服会换，情绪废墟不换。");
  assert.equal(projection.copyEn, withChineseCopy.vibe.supportingCopyEn);
  assert.equal(projection.copy, withChineseCopy.vibe.supportingCopyEn);
  assert.deepEqual(withChineseCopy, unchangedManifest);

  const englishOnly = manifest();
  const fallback = inspectReleasedPackManifest(englishOnly).safe;
  assert.equal(fallback.copyZh, undefined);
  assert.equal(fallback.copyEn, englishOnly.vibe.supportingCopyEn);
  assert.equal(fallback.copy, englishOnly.vibe.supportingCopyEn);
});

test("private catalog health distinguishes every fail-closed gate", () => {
  const valid = manifest();
  const missingCopy = manifest();
  missingCopy.vibe.supportingCopyEn = "too short";
  assert.equal(classifyReleasedPackHealth({
    inventoryComplete: true,
    eligibilityAvailable: false,
  }), "eligibility_unavailable");
  assert.equal(classifyReleasedPackHealth({
    inventoryComplete: true,
    releaseReady: false,
  }), "revoked_eligibility");
  assert.equal(classifyReleasedPackHealth({
    inventoryComplete: false,
    releaseReady: true,
  }), "incomplete_inventory");
  assert.equal(classifyReleasedPackHealth({
    inventoryComplete: false,
    releaseReady: true,
    malformedMedia: true,
  }), "malformed_media");
  assert.equal(classifyReleasedPackHealth({
    inventoryComplete: true,
    releaseReady: true,
    manifest: missingCopy,
  }), "missing_editorial_copy");
  assert.equal(classifyReleasedPackHealth({
    inventoryComplete: true,
    releaseReady: true,
    manifest: valid,
  }), null);
});

test("public released pack projection excludes private catalog diagnostics", () => {
  const projected = publicReleasedPack({
    actor: { id: "actor" },
    vibe: { key: "actor:0" },
    vibeIdx: 0,
    canonical: "https://example.com/pack",
    preview: { copy: "safe", cards: Array.from({ length: 9 }, () => ({ title: "Card" })) },
    publishedAt: "2026-09-23T00:00:00.000Z",
    reasonCode: "malformed_media",
    summary: "private",
  });
  assert.deepEqual(Object.keys(projected).sort(), [
    "actor",
    "canonical",
    "kind",
    "preview",
    "publishedAt",
    "vibe",
    "vibeIdx",
  ]);
  assert.equal(projected.vibeIdx, 0);
});

test("stale malformed listed records cannot contradict a valid released catalog entry", async () => {
  const valid = manifest();
  const staleMalformed = {
    ...manifest({ publicationDate: "2026-09-22" }),
    cards: manifest({ publicationDate: "2026-09-22" }).cards.map((card, position) => (
      position === 0 ? { ...card, media: { ...card.media, deliveryUrl: "" } } : card
    )),
  };
  const records = new Map([
    [publicationManifestCatalogKey(), {
      schemaVersion: 1,
      catalogVersion: "v1",
      kind: "vibe-atlas-publication-manifest-catalog",
      dates: ["2026-09-23"],
    }],
    [gridManifestKey("2026-09-23"), valid],
    [gridManifestKey("2026-09-22"), staleMalformed],
  ]);
  const publicationStore = {
    get: async key => records.get(key) ?? null,
    list: async () => ({
      blobs: [
        { key: gridManifestKey("2026-09-23") },
        { key: gridManifestKey("2026-09-22") },
      ],
    }),
  };
  const actorPacks = [{
    id: "actor",
    name: "Actor",
    shortName_en: "Actor",
    vibes: [{ label: "Quiet Power", label_en: "Quiet Power" }],
  }];
  const eligibilityReader = async () => ({
    eligible: true,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: true,
    publishableConfirmed: true,
  });
  const catalog = await releasedPackCatalog({}, {
    publicationStore,
    actorPacks,
    eligibilityReader,
  });
  const health = await releasedPackCatalogHealth({}, {
    publicationStore,
    actorPacks,
    eligibilityReader,
  });
  assert.equal(catalog.complete, true);
  assert.equal(catalog.packs.length, 1);
  assert.equal(health.pairings[0].status, "released");
  assert.equal(health.pairings[0].reasonCode, null);
});

test("an unready newer edition does not hide an older qualifying immutable preview", async () => {
  const older = manifest();
  older.vibe.supportingCopy = "戏服会换，情绪废墟不换。";
  const newer = manifest({
    publicationDate: "2026-09-24",
    vibe: { ...manifest().vibe, supportingCopyEn: "" },
    cards: manifest().cards.map(card => ({
      ...card,
      media: {
        ...card.media,
        association: {
          ...card.media.association,
          id: "vibe-atlas:daily-drop:2026-09-24",
        },
      },
    })),
  });
  const records = new Map([
    [publicationManifestCatalogKey(), {
      schemaVersion: 1,
      catalogVersion: "v1",
      kind: "vibe-atlas-publication-manifest-catalog",
      dates: ["2026-09-23", "2026-09-24"],
    }],
    [gridManifestKey("2026-09-23"), older],
    [gridManifestKey("2026-09-24"), newer],
  ]);
  const publicationStore = {
    get: async key => records.get(key) ?? null,
    list: async () => ({ blobs: [...records.keys()].filter(key => key.startsWith("vibeAtlas:grid-manifest:v1:")).map(key => ({ key })) }),
  };
  const options = {
    publicationStore,
    actorPacks: [{ id: "actor", name: "Actor", shortName_en: "Actor", vibes: [{ label_en: "Quiet Power" }] }],
    eligibilityReader: async () => ({
      eligible: true, runId: "run-1", verdict: "approved_override",
    }),
  };
  const catalog = await releasedPackCatalog({}, options);
  const health = await releasedPackCatalogHealth({}, options);
  assert.equal(catalog.packs.length, 1);
  assert.deepEqual(catalog.collectorPackIds, ["actor:0"]);
  assert.equal(catalog.packs[0].preview.copy, older.vibe.supportingCopyEn);
  assert.equal(catalog.packs[0].preview.copyZh, older.vibe.supportingCopy);
  assert.equal(catalog.packs[0].preview.copyEn, older.vibe.supportingCopyEn);
  assert.equal(health.pairings[0].status, "released");
  assert.equal(health.pairings[0].publicationDate, "2026-09-23");
});

test("an approved rolling pack stays refreshable even before its first public snapshot", async () => {
  const publicationStore = {
    get: async key => key === publicationManifestCatalogKey() ? {
      schemaVersion: 1,
      catalogVersion: "v1",
      kind: "vibe-atlas-publication-manifest-catalog",
      dates: [],
    } : null,
    list: async () => ({ blobs: [] }),
  };
  const catalog = await releasedPackCatalog({}, {
    publicationStore,
    actorPacks: [{ id: "actor", name: "Actor", vibes: [{ label_en: "Quiet Power" }] }],
    eligibilityReader: async () => ({
      eligible: true, runId: "run-1", verdict: "approved_override",
    }),
  });
  assert.equal(catalog.complete, true);
  assert.deepEqual(catalog.collectorPackIds, ["actor:0"]);
  assert.deepEqual(catalog.packs, []);
});

test("one unavailable eligibility read globally withholds the private and public catalogs", async () => {
  const valid = manifest();
  const records = new Map([
    [publicationManifestCatalogKey(), {
      schemaVersion: 1,
      catalogVersion: "v1",
      kind: "vibe-atlas-publication-manifest-catalog",
      dates: ["2026-09-23"],
    }],
    [gridManifestKey("2026-09-23"), valid],
  ]);
  const publicationStore = {
    get: async key => records.get(key) ?? null,
    list: async () => ({ blobs: [{ key: gridManifestKey("2026-09-23") }] }),
  };
  const actorPacks = [{
    id: "actor",
    name: "Actor",
    shortName_en: "Actor",
    vibes: [
      { label: "Quiet Power", label_en: "Quiet Power" },
      { label: "Bright Power", label_en: "Bright Power" },
    ],
  }];
  const eligibilityReader = async (_store, _actor, vibeIdx) => {
    if (vibeIdx === 1) throw new Error("eligibility unavailable");
    return {
      eligible: true,
      runId: "run-1",
      verdict: "approved",
      vibeConfirmed: true,
      publishableConfirmed: true,
    };
  };
  const catalog = await releasedPackCatalog({}, {
    publicationStore,
    actorPacks,
    eligibilityReader,
  });
  const health = await releasedPackCatalogHealth({}, {
    publicationStore,
    actorPacks,
    eligibilityReader,
  });
  assert.equal(catalog.complete, false);
  assert.deepEqual(catalog.packs, []);
  assert.equal(health.releasedCount, 0);
  assert.equal(health.withheldCount, 2);
  assert.deepEqual(
    health.pairings.map(pair => pair.reasonCode),
    ["eligibility_unavailable", "eligibility_unavailable"],
  );
});
const actorPacks = [{
  id: "fixture-actor",
  name: "Fixture Actor",
  shortName_en: "Fixture Actor",
  accentColor: "#123456",
  vibes: [
    { label: "甲", label_en: "Approved Override", subtitle_en: "Eligible for Star of the Day" },
    { label: "乙", label_en: "Rejected", subtitle_en: "Not eligible" },
  ],
}];

const approvedOverride = {
  eligible: true,
  runId: "run-approved-override",
  verdict: "approved_override",
  vibeConfirmed: true,
  publishableConfirmed: true,
};

const rejected = {
  eligible: false,
  runId: "run-rejected",
  verdict: "rejected",
  vibeConfirmed: false,
  publishableConfirmed: false,
};

test("released pack catalog includes approved overrides as release-ready", async () => {
  const catalog = await releasedPackCatalog({}, {
    actorPacks,
    getEligibilitySnapshot: async (_store, _actor, vibeIdx) =>
      vibeIdx === 0 ? approvedOverride : rejected,
    readPublications: async () => ({
      inventory: { complete: true },
      manifests: [],
    }),
  });

  assert.equal(catalog.complete, true);
  assert.equal(catalog.indexingComplete, true);
  assert.deepEqual(catalog.collectorPackIds, ["fixture-actor:0"]);
  assert.equal(catalog.packs.length, 0);
  assert.deepEqual([...protectedReleasedPackIds(catalog)], ["fixture-actor:0"]);
});

test("publication inventory failure does not hide eligible Collector packs", async () => {
  const catalog = await releasedPackCatalog({}, {
    actorPacks: actorPacks.slice(0, 1),
    getEligibilitySnapshot: async (_store, _actor, vibeIdx) =>
      vibeIdx === 0 ? approvedOverride : rejected,
    readPublications: async () => {
      throw new Error("publication inventory unavailable");
    },
  });

  assert.equal(catalog.complete, true);
  assert.equal(catalog.indexingComplete, false);
  assert.equal(catalog.indexingFailureReason, "publication_inventory_unavailable");
  assert.deepEqual(catalog.collectorPackIds, ["fixture-actor:0"]);
  assert.equal(catalog.packs.length, 0);
});
