import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HISTORICAL_PUBLICATION_APPROVALS,
  historicalPublicationFingerprint,
  hasHistoricalPublicationApproval,
} from "./historical-publication-approvals.js";
import {
  isGridManifest,
  isIndexablePublicationManifest,
  publicActorDirectory,
  publicEditionPreview,
} from "./publication-manifest.js";
import { reviewArchivedPublication } from "./archive-publication-review.js";

const evidence = JSON.parse(await readFile(
  new URL("./test-fixtures/reviewed-historical-publication.json", import.meta.url),
  "utf8",
));

function reviewedManifest() {
  const snapshot = structuredClone(evidence);
  const sourceCandidateIds = snapshot.cards.map(card => `fixture-${card.position}`);
  return {
    ...snapshot,
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: "historical-test-manifest",
    idempotencyKey: `vibe-atlas:daily-drop:${snapshot.publicationDate}`,
    kind: "vibe-atlas-daily-drop",
    boardHash: "a".repeat(64),
    actor: { ...snapshot.actor, accentColor: "#e8c87a" },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    cards: snapshot.cards.map(card => ({
      ...card,
      candidateId: sourceCandidateIds[card.position],
      title: `Frame ${card.position}`,
      source: "fixture",
      sourceUrl: `https://example.com/frame-${card.position}.jpg`,
      link: `https://example.com/frame-${card.position}`,
    })),
  };
}

test("historical approvals contain exactly the 30 independently reviewed dates", () => {
  const expected = [
    ...Array.from({ length: 23 }, (_, i) => `2026-09-${String(i + 5).padStart(2, "0")}`),
    "2026-09-29", "2026-09-30",
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-07",
  ];
  assert.deepEqual(Object.keys(HISTORICAL_PUBLICATION_APPROVALS), expected);
  assert.ok(Object.isFrozen(HISTORICAL_PUBLICATION_APPROVALS));
  for (const digest of Object.values(HISTORICAL_PUBLICATION_APPROVALS)) {
    assert.match(digest, /^[a-f0-9]{64}$/);
  }
  for (const date of [
    "2026-07-31", "2026-08-01", "2026-08-02",
    "2026-09-28", "2026-10-06", "2026-10-08", "__proto__",
  ]) assert.equal(hasHistoricalPublicationApproval(date), false);
});

test("reviewed original bilingual copy and nine MEDIA references become public without rewritten copy", () => {
  const manifest = reviewedManifest();
  assert.equal(isGridManifest(manifest), true);
  assert.equal(historicalPublicationFingerprint(manifest),
    HISTORICAL_PUBLICATION_APPROVALS[manifest.publicationDate]);
  assert.equal(isIndexablePublicationManifest(manifest), true);
  const preview = publicEditionPreview(manifest);
  assert.equal(preview.vibe.label, evidence.vibe.label);
  assert.equal(preview.vibe.labelEn, evidence.vibe.labelEn);
  assert.equal(preview.vibe.subtitleEn, evidence.vibe.subtitleEn);
  assert.equal(preview.vibe.copy, evidence.vibe.subtitleEn);
  assert.equal(preview.previews.length, 9);
  assert.equal(publicActorDirectory([manifest])[0].editionCount, 1);
});

test("approved date closes after any bilingual copy or actor/vibe identity substitution", () => {
  for (const field of ["label", "labelEn", "subtitle", "subtitleEn",
    "supportingCopy", "supportingCopyEn", "key", "idx"]) {
    const manifest = reviewedManifest();
    manifest.vibe[field] = field === "idx" ? 1 : "Changed editorial copy longer than the generic forty-character minimum.";
    assert.equal(isIndexablePublicationManifest(manifest), false, field);
    assert.equal(publicEditionPreview(manifest), null, field);
  }
  for (const field of ["id", "name", "nameEn"]) {
    const manifest = reviewedManifest();
    manifest.actor[field] = "different-actor";
    assert.equal(isIndexablePublicationManifest(manifest), false, field);
  }
});

test("each of the nine MEDIA references is independently bound to its reviewed evidence", () => {
  for (let position = 0; position < 9; position += 1) {
    for (const field of ["assetId", "deliveryUrl", "thumbnailUrl", "mimeType",
      "sizeBytes", "checksum", "dimensions", "association"]) {
      const manifest = reviewedManifest();
      const media = manifest.cards[position].media;
      const replacements = {
        assetId: "00000000-0000-4000-8000-000000000001",
        deliveryUrl: "https://images.xhs.justlikekatie.com/images/sha256/" + "b".repeat(64) + ".jpg",
        thumbnailUrl: "https://images.xhs.justlikekatie.com/images/sha256/" + "c".repeat(64) + ".jpg",
        mimeType: "image/png",
        sizeBytes: media.sizeBytes + 1,
        checksum: "d".repeat(64),
        dimensions: { ...media.dimensions, width: media.dimensions.width + 1 },
        association: { ...media.association, itemId: "another-card" },
      };
      media[field] = replacements[field];
      assert.equal(isIndexablePublicationManifest(manifest), false, `${position}:${field}`);
    }
  }
  for (const transform of [
    m => m.cards.pop(),
    m => m.cards.reverse(),
    m => { m.cards[0] = structuredClone(m.cards[1]); },
  ]) {
    const manifest = reviewedManifest();
    transform(manifest);
    assert.equal(isIndexablePublicationManifest(manifest), false);
  }
});

test("same copy and MEDIA cannot authorize another approved date or an unreviewed date", () => {
  for (const date of ["2026-09-06", "2026-09-28", "2026-10-08", "2026-07-31"]) {
    const manifest = reviewedManifest();
    manifest.publicationDate = date;
    for (const card of manifest.cards) {
      card.media.association.id = `vibe-atlas:daily-drop:${date}`;
    }
    assert.equal(isGridManifest(manifest), true);
    assert.equal(isIndexablePublicationManifest(manifest), false, date);
  }
  assert.equal(isIndexablePublicationManifest(null), false);
});

test("JSON object-key order and unrelated annotations do not invalidate reviewed identity", () => {
  const manifest = reviewedManifest();
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]))
      : value;
  const reordered = reorder(manifest);
  reordered.provenance.operatorNote = "Non-editorial metadata";
  assert.equal(isIndexablePublicationManifest(reordered), true);
});

test("private historical review includes both original languages", async () => {
  const manifest = reviewedManifest();
  const store = { get: async () => manifest };
  const review = await reviewArchivedPublication(store, manifest.publicationDate);
  assert.equal(review.vibe.label, evidence.vibe.label);
  assert.equal(review.vibe.labelEn, evidence.vibe.labelEn);
  assert.equal(review.vibe.subtitle, evidence.vibe.subtitle);
  assert.equal(review.vibe.subtitleEn, evidence.vibe.subtitleEn);
  assert.equal(review.vibe.supportingCopy, "");
});
