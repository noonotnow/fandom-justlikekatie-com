import assert from "node:assert/strict";
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

import { manifestFromEvidence, reviewedEvidence } from "./test-fixtures/reviewed-historical-publications.js";

test("historical approvals contain exactly the 30 independently reviewed dates", () => {
  const expected = [
    ...Array.from({ length: 23 }, (_, i) => `2026-09-${String(i + 5).padStart(2, "0")}`),
    "2026-09-29", "2026-09-30",
    "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-07",
  ];
  assert.deepEqual(Object.keys(HISTORICAL_PUBLICATION_APPROVALS), expected);
  assert.deepEqual(reviewedEvidence.map(snapshot => snapshot.publicationDate), expected);
  assert.ok(Object.isFrozen(HISTORICAL_PUBLICATION_APPROVALS));
  for (const digest of Object.values(HISTORICAL_PUBLICATION_APPROVALS)) {
    assert.match(digest, /^[a-f0-9]{64}$/);
  }
  for (const date of [
    "2026-07-31", "2026-08-01", "2026-08-02",
    "2026-09-28", "2026-10-06", "2026-10-08", "__proto__",
  ]) assert.equal(hasHistoricalPublicationApproval(date), false);
});

test("fixed evidence contains only public actor, copy and MEDIA fields", () => {
  const keys = (value, expected) =>
    assert.deepEqual(Object.keys(value).sort(), expected.split(" ").sort());
  for (const snapshot of reviewedEvidence) {
    keys(snapshot, "publicationDate actor vibe cards");
    keys(snapshot.actor, "id name nameEn");
    keys(snapshot.vibe, "key idx label labelEn subtitle subtitleEn supportingCopy supportingCopyEn");
    assert.equal(snapshot.cards.length, 9, snapshot.publicationDate);
    assert.deepEqual(snapshot.cards.map(card => card.position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const card of snapshot.cards) {
      keys(card, "position media");
      keys(card.media, "schemaVersion assetId deliveryUrl thumbnailUrl mimeType sizeBytes checksum dimensions association");
      keys(card.media.dimensions, "width height");
      keys(card.media.association, "type id itemId");
    }
  }
});

for (const evidence of reviewedEvidence) {
  const date = evidence.publicationDate;
  const reviewedManifest = () => manifestFromEvidence(evidence);

test(`${date}: original bilingual identity and ordered MEDIA match the pin and public projection`, () => {
  const manifest = reviewedManifest();
  assert.equal(isGridManifest(manifest), true);
  assert.equal(historicalPublicationFingerprint(manifest),
    HISTORICAL_PUBLICATION_APPROVALS[manifest.publicationDate]);
  assert.equal(isIndexablePublicationManifest(manifest), true);
  const preview = publicEditionPreview(manifest);
  // Expected paths and fields come from fixed evidence, not projection helpers.
  const slug = evidence.actor.nameEn.toLowerCase().replaceAll(" ", "-");
  const actorPath = `/vibe-atlas/actors/${slug}/`;
  const editionPath = `/vibe-atlas/editions/${date}/${slug}/`;
  const actor = {
    ...evidence.actor,
    accentColor: "#e8c87a",
    slug,
    path: actorPath,
    canonical: `https://fandom.justlikekatie.com${actorPath}`,
  };
  assert.deepEqual(preview, {
    kind: "vibe-atlas-public-edition",
    date,
    actor,
    vibe: {
      label: evidence.vibe.label,
      labelEn: evidence.vibe.labelEn,
      emoji: null,
      subtitle: evidence.vibe.subtitle,
      subtitleEn: evidence.vibe.subtitleEn,
      copy: evidence.vibe.subtitleEn,
    },
    canonical: `https://fandom.justlikekatie.com${editionPath}`,
    path: editionPath,
    publishedAt: undefined,
    heroPosition: 4,
    previews: evidence.cards.map(({ position, media }) => ({
      position,
      title: `Frame ${position}`,
      source: "fixture",
      link: `https://example.com/frame-${position}`,
      thumbnailUrl: media.thumbnailUrl,
      deliveryUrl: media.deliveryUrl,
      mimeType: media.mimeType,
      dimensions: media.dimensions,
    })),
  });
  assert.deepEqual(publicActorDirectory([manifest]), [{
    ...actor,
    editionCount: 1,
    latestEdition: date,
    editions: [{ date, path: editionPath, canonical: preview.canonical }],
    relatedContext: [{
      label: evidence.vibe.label,
      labelEn: evidence.vibe.labelEn,
      subtitleEn: evidence.vibe.subtitleEn,
    }],
  }]);
});

test(`${date}: approval closes after any bilingual copy or actor/vibe identity substitution`, () => {
  for (const field of ["label", "labelEn", "subtitle", "subtitleEn",
    "supportingCopy", "supportingCopyEn", "key", "idx"]) {
    const manifest = reviewedManifest();
    manifest.vibe[field] = field === "idx" ? manifest.vibe.idx + 1
      : "Changed editorial copy longer than the generic forty-character minimum.";
    assert.equal(isIndexablePublicationManifest(manifest), false, field);
    assert.equal(publicEditionPreview(manifest), null, field);
  }
  for (const field of ["id", "name", "nameEn"]) {
    const manifest = reviewedManifest();
    manifest.actor[field] = "different-actor";
    assert.equal(isIndexablePublicationManifest(manifest), false, field);
  }
});

test(`${date}: each of the nine ordered MEDIA references is independently bound`, () => {
  for (let position = 0; position < 9; position += 1) {
    for (const field of ["schemaVersion", "assetId", "deliveryUrl", "thumbnailUrl", "mimeType",
      "sizeBytes", "checksum", "dimensions", "association"]) {
      const manifest = reviewedManifest();
      const media = manifest.cards[position].media;
      const replacements = {
        schemaVersion: 2,
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
    // Keep the positions and publication associations valid while swapping
    // the MEDIA references: rejection must come from the date-specific pin.
    m => {
      [m.cards[0].media, m.cards[1].media] = [m.cards[1].media, m.cards[0].media];
      for (const card of m.cards) card.media.association.itemId = `card-${card.position}`;
      assert.equal(isGridManifest(m), true);
    },
  ]) {
    const manifest = reviewedManifest();
    transform(manifest);
    assert.equal(isIndexablePublicationManifest(manifest), false);
  }
});

test(`${date}: same copy and MEDIA cannot authorize another date`, () => {
  const nextApprovedDate = reviewedEvidence[
    (reviewedEvidence.indexOf(evidence) + 1) % reviewedEvidence.length
  ].publicationDate;
  for (const date of [nextApprovedDate, "2026-09-28", "2026-10-08", "2026-07-31"]) {
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

test(`${date}: JSON object-key order and unrelated annotations do not invalidate identity`, () => {
  const manifest = reviewedManifest();
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]))
      : value;
  const reordered = reorder(manifest);
  reordered.provenance.operatorNote = "Non-editorial metadata";
  assert.equal(isIndexablePublicationManifest(reordered), true);
});

test(`${date}: historical review includes both original languages`, async () => {
  const manifest = reviewedManifest();
  const store = { get: async () => manifest };
  const review = await reviewArchivedPublication(store, manifest.publicationDate);
  assert.equal(review.vibe.label, evidence.vibe.label);
  assert.equal(review.vibe.labelEn, evidence.vibe.labelEn);
  assert.equal(review.vibe.subtitle, evidence.vibe.subtitle);
  assert.equal(review.vibe.subtitleEn, evidence.vibe.subtitleEn);
  assert.equal(review.vibe.supportingCopy, "");
  assert.equal(review.vibe.supportingCopyEn, "");
});
}
