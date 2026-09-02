import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  boardHash,
  gridManifestKey,
  gridPendingKey,
  isGridManifest,
  manifestPayload,
  materializePublicationManifest,
} from "./publication-manifest.js";

const ENV = {
  MEDIA_ASSETS_TOKEN: "media-token",
  MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
};

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) {
      return structuredClone(records.get(key) || null);
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value));
      return { modified: true };
    },
    async delete(key) {
      records.delete(key);
    },
  };
}

function publicationInput(overrides = {}) {
  const date = "2026-09-03";
  return {
    date,
    actor: {
      id: "liu-xueyi",
      name: "刘学义",
      nameEn: "Liu Xueyi",
      accentColor: "#8d2638",
    },
    vibe: {
      key: "liu-xueyi:3",
      idx: 3,
      label: "破碎感美人",
      labelEn: "Professionally Devastated",
      emoji: "🌙",
      subtitle: "为爱受苦",
      subtitleEn: "Born to suffer beautifully.",
      supportingCopy: "",
      supportingCopyEn: "",
      generationPrompt: "editorial",
    },
    board: {
      mode: "operator_rescue",
      candidates: Array.from({ length: 9 }, (_, position) => ({
        candidateId: `candidate-${position}`,
        title: `Frame ${position}`,
        thumbnail: `https://images.example/frame-${position}.png`,
        link: `https://publisher.example/story-${position}`,
        source: `publisher-${position}`,
        query: `query-${position}`,
      })),
    },
    provenance: {
      runId: "run-1",
      rescueReceiptId: "receipt-1",
      feedbackHash: "feedback-1",
    },
    resolveHost: async () => [{ address: "8.8.8.8", family: 4 }],
    ...overrides,
  };
}

function mediaHarness({ failSourcePosition = null, mismatchChecksum = false } = {}) {
  let sourceCalls = 0;
  let mediaCalls = 0;
  const metadata = [];
  const idempotencyKeys = [];
  const fetchImpl = async (url, init = {}) => {
    if (url === ENV.MEDIA_ASSETS_URL) {
      mediaCalls += 1;
      const file = init.body.get("file");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const checksum = createHash("sha256").update(bytes).digest("hex");
      metadata.push(JSON.parse(init.body.get("metadata")));
      idempotencyKeys.push(init.headers["Idempotency-Key"]);
      return new Response(JSON.stringify({
        data: {
          version: 1,
          assetId: `00000000-0000-4000-8000-${String(mediaCalls).padStart(12, "0")}`,
          mediaType: "image",
          mimeType: file.type,
          sizeBytes: bytes.byteLength,
          checksum: mismatchChecksum ? "0".repeat(64) : checksum,
          deliveryUrl: `https://media.example/assets/${checksum}.png`,
          thumbnailUrl: `https://media.example/thumbs/${checksum}.png`,
          dimensions: { width: 1200, height: 1200 },
        },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    sourceCalls += 1;
    const position = Number(String(url).match(/frame-(\d+)/)?.[1]);
    if (position === failSourcePosition) {
      return new Response("gone", { status: 404 });
    }
    return new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, position]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  };
  return {
    fetchImpl,
    metadata,
    idempotencyKeys,
    stats: () => ({ sourceCalls, mediaCalls }),
    clearFailure: () => {
      failSourcePosition = null;
    },
  };
}

test("materializes an immutable nine-card MEDIA manifest and reuses it idempotently", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  const input = publicationInput();
  const first = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
    now: () => "2026-09-03T04:00:00.000Z",
  });

  assert.equal(isGridManifest(first.manifest), true);
  assert.equal(first.manifest.boardHash, boardHash(input.board));
  assert.equal(first.manifest.cards.length, 9);
  assert.equal(first.manifest.heroPosition, 4);
  assert.deepEqual(first.manifest.cards.map(card => card.position), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(first.manifest.cards.every(card => card.media.association.type === "publication"));
  assert.ok(first.payload.displayResults.every(result => result.thumbnail.startsWith("https://media.example/thumbs/")));
  assert.equal(first.payload.displayResults[4].title, "Frame 4");
  assert.deepEqual(media.stats(), { sourceCalls: 9, mediaCalls: 9 });
  assert.equal(store.records.has(gridPendingKey(input.date)), false);
  assert.ok(store.records.has(gridManifestKey(input.date)));
  assert.equal(media.metadata[0].sourceType, "fandom-vibe-atlas-daily-drop");
  assert.match(media.metadata[0].linkedPostIdentifiers[0], /2026-09-03/);
  assert.equal(new Set(media.idempotencyKeys).size, 9);

  const second = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });
  assert.equal(second.manifest.manifestId, first.manifest.manifestId);
  assert.deepEqual(media.stats(), { sourceCalls: 9, mediaCalls: 9 });
});

test("partial MEDIA failure publishes no manifest and retries only unfinished cards", async () => {
  const store = memoryStore();
  const media = mediaHarness({ failSourcePosition: 3 });
  const input = publicationInput();

  await assert.rejects(
    materializePublicationManifest({
      store,
      ...input,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    /could not be reached/i,
  );
  assert.equal(store.records.has(gridManifestKey(input.date)), false);
  assert.equal(store.records.get(gridPendingKey(input.date)).assets.length, 8);
  assert.equal(store.records.get(gridPendingKey(input.date)).failedPosition, 3);

  media.clearFailure();
  const recovered = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });
  assert.equal(isGridManifest(recovered.manifest), true);
  assert.deepEqual(media.stats(), { sourceCalls: 10, mediaCalls: 9 });
});

test("a checksum mismatch or different board cannot replace a published date", async () => {
  const brokenStore = memoryStore();
  const brokenMedia = mediaHarness({ mismatchChecksum: true });
  const input = publicationInput();
  await assert.rejects(
    materializePublicationManifest({
      store: brokenStore,
      ...input,
      env: ENV,
      fetchImpl: brokenMedia.fetchImpl,
    }),
    /mismatched image descriptor/i,
  );
  assert.equal(brokenStore.records.has(gridManifestKey(input.date)), false);

  const store = memoryStore();
  const media = mediaHarness();
  const published = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });
  const changed = publicationInput({
    board: {
      ...input.board,
      candidates: input.board.candidates.map((candidate, position) =>
        position === 0 ? { ...candidate, candidateId: "different-candidate" } : candidate),
    },
  });
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...changed,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    /different immutable board/i,
  );
  assert.equal(manifestPayload(store.records.get(gridManifestKey(input.date))).displayResults[0].title,
    published.payload.displayResults[0].title);
});

test("conditional writes are verified by strong read even when the Blob API returns undefined", async () => {
  const store = memoryStore();
  const originalSet = store.setJSON.bind(store);
  const input = publicationInput();
  store.setJSON = async (key, value, options = {}) => {
    if (key === gridManifestKey(input.date) && options.onlyIfNew) {
      store.records.set(key, {
        ...structuredClone(value),
        manifestId: "competing-manifest",
        boardHash: "b".repeat(64),
      });
      return undefined;
    }
    return originalSet(key, value, options);
  };
  const media = mediaHarness();
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...input,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    /another board won/i,
  );
  assert.equal(store.records.get(gridManifestKey(input.date)).manifestId, "competing-manifest");
});

test("the publication lock serializes concurrent boards and source redirects cannot reach private hosts", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  const first = publicationInput();
  const second = publicationInput({
    board: {
      ...first.board,
      candidates: first.board.candidates.map((candidate, position) =>
        position === 0 ? { ...candidate, candidateId: "competing-candidate" } : candidate),
    },
  });
  const outcomes = await Promise.allSettled([
    materializePublicationManifest({
      store,
      ...first,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
    materializePublicationManifest({
      store,
      ...second,
      env: ENV,
      fetchImpl: media.fetchImpl,
    }),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter(outcome => outcome.status === "rejected").length, 1);
  assert.equal(media.stats().mediaCalls, 9);

  let fetchCalls = 0;
  const redirectingFetch = async () => {
    fetchCalls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/private-image.jpg" },
    });
  };
  await assert.rejects(
    materializePublicationManifest({
      store: memoryStore(),
      ...publicationInput({ date: "2026-09-04" }),
      env: ENV,
      fetchImpl: redirectingFetch,
    }),
    /host is not public/i,
  );
  assert.equal(fetchCalls, 9);
});