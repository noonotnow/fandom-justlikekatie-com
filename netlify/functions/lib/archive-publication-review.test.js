import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { reviewArchivedPublication } from "./archive-publication-review.js";
import { gridManifestKey } from "./publication-manifest.js";

const date = "2026-08-28";
const bytes = Buffer.from("fixed delivery bytes");
const checksum = createHash("sha256").update(bytes).digest("hex");
const delivery = `https://media.justlikekatie.com/images/sha256/${checksum}.jpg`;

function manifest() {
  const sourceCandidateIds = Array.from({ length: 9 }, (_, i) => `candidate-${i}`);
  return {
    schemaVersion: 1, manifestVersion: "v1", kind: "vibe-atlas-daily-drop",
    manifestId: "manifest-1", idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    publicationDate: date, publishedAt: `${date}T12:00:00Z`, boardHash: "a".repeat(64),
    actor: { id: "actor", name: "Actor", nameEn: "Actor", accentColor: "#abcdef" },
    vibe: { key: "vibe", idx: 1, label: "Vibe", labelEn: "Vibe", subtitleEn: "Subtitle", supportingCopyEn: "Too short" },
    heroPosition: 4, cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    cards: sourceCandidateIds.map((candidateId, position) => ({
      position, candidateId, title: `Card ${position}`, sourceUrl: `https://source.example/${position}.jpg`,
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
        deliveryUrl: delivery, thumbnailUrl: delivery, mimeType: "image/jpeg",
        sizeBytes: bytes.length, checksum, dimensions: { width: 100, height: 100 },
        association: { type: "publication", id: `vibe-atlas:daily-drop:${date}`, itemId: `card-${position}` },
      },
    })),
  };
}

function store(value) {
  return {
    async get(key, options) {
      assert.equal(key, gridManifestKey(date));
      assert.equal(options.consistency, "strong");
      return value;
    },
  };
}

test("review reads only the original manifest and keeps short copy private", async () => {
  const review = await reviewArchivedPublication(store(manifest()), date);
  assert.equal(review.status, "not_indexable");
  assert.equal(review.vibe.supportingCopyEn, "Too short");
  assert.equal(review.cards.length, 9);
  assert.equal(JSON.stringify(review).includes("source.example"), false);
  assert.deepEqual(await reviewArchivedPublication(store(null), date), {
    date, status: "missing_manifest",
  });
});

test("each of nine MEDIA deliveries is downloaded and compared against the immutable checksum", async () => {
  let calls = 0;
  const fetchImpl = async url => {
    assert.equal(url, delivery);
    calls += 1;
    return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
  };
  const review = await reviewArchivedPublication(store(manifest()), date, {
    checkMedia: true, fetchImpl,
  });
  assert.equal(calls, 9);
  assert.deepEqual(review.mediaChecks.map(check => check.status), Array(9).fill("verified"));
  assert.equal(review.indexable, false);
});

test("untrusted host, redirects, damaged bytes and oversized responses fail closed", async () => {
  const copy = manifest();
  copy.cards[0].media.deliveryUrl = "https://untrusted.example/images/sha256/" + checksum + ".jpg";
  const fetchImpl = async () => new Response(Buffer.from("damaged"), {
    headers: { "content-type": "image/jpeg" },
  });
  const review = await reviewArchivedPublication(store(copy), date, { checkMedia: true, fetchImpl });
  assert.equal(review.mediaChecks[0].status, "untrusted_delivery");
  assert.equal(review.mediaChecks[1].status, "wrong_size");
  const redirects = await reviewArchivedPublication(store(manifest()), date, {
    checkMedia: true,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: delivery } }),
  });
  assert.ok(redirects.mediaChecks.every(check => check.status === "unavailable"));
  const damaged = await reviewArchivedPublication(store(manifest()), date, {
    checkMedia: true,
    fetchImpl: async () => new Response(Buffer.alloc(bytes.length, 0), {
      headers: { "content-type": "image/jpeg" },
    }),
  });
  assert.ok(damaged.mediaChecks.every(check => check.status === "checksum_mismatch"));
});