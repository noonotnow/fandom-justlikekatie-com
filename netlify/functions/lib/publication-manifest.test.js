import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  boardHash,
  gridCorrectionPrefix,
  gridManifestKey,
  gridPendingKey,
  isGridManifest,
  manifestPayload,
  materializePublicationManifest,
  publicationActorIndexKey,
  publicationManifestCatalogKey,
  publicationJoinReceipt,
  readPublicationCorrections,
  recordPublicationCorrectionsForMisprint,
  readLatestPublicationDatesByActor,
  rebuildPublicationActorIndex,
} from "./publication-manifest.js";

test("publication join receipt preserves matched, missing, ambiguous, and unavailable audit occurrences", () => {
  const input = publicationInput();
  const cards = input.board.candidates.map((candidate, position) => ({
    position,
    candidateId: candidate.candidateId,
    sourceUrl: candidate.thumbnail,
    media: { checksum: `digest-${position}` },
  }));
  const manifest = {
    publicationDate: "2026-09-03",
    manifestId: "manifest-1",
    boardHash: "a".repeat(64),
    actor: input.actor,
    vibe: input.vibe,
    cards,
  };
  const receipt = publicationJoinReceipt({
    runId: "run-1",
    completedAt: "2026-09-01T00:00:00.000Z",
    rawResults: [
      { provisionalCandidateId: "occurrence-0", candidateId: "candidate-0", thumbnail: input.board.candidates[0].thumbnail },
      { candidateId: "candidate-missing", thumbnail: "https://images.example/missing.png" },
      {},
      { candidateId: "candidate-1" },
    ],
  }, {
    actor: input.actor,
    vibeKey: input.vibe.key,
  }, [manifest, { ...manifest, manifestId: "manifest-2", publicationDate: "2026-09-04" }]);

  assert.deepEqual(receipt.counts, {
    matched: 0,
    missing: 1,
    ambiguous: 2,
    identity_unavailable: 1,
  });
  assert.equal(receipt.occurrences[0].auditOccurrenceId, "occurrence-0");
  assert.deepEqual(receipt.occurrences.map(item => item.status), [
    "ambiguous", "missing", "identity_unavailable", "ambiguous",
  ]);
  assert.deepEqual(receipt.occurrences[0].matches.map(match => match.publicationDate), [
    "2026-09-03", "2026-09-04",
  ]);
});

test("publication join uses the Shanghai audit date at the UTC day boundary", () => {
  const input = publicationInput();
  const card = {
    position: 0,
    candidateId: "candidate-0",
    sourceUrl: input.board.candidates[0].thumbnail,
    media: { checksum: "digest-0" },
  };
  const manifestFor = publicationDate => ({
    publicationDate,
    manifestId: `manifest-${publicationDate}`,
    boardHash: "a".repeat(64),
    actor: input.actor,
    vibe: input.vibe,
    cards: [card],
  });
  const pair = { actor: input.actor, vibeKey: input.vibe.key };
  const run = {
    runId: "run-boundary",
    rawResults: [{
      candidateId: card.candidateId,
      thumbnail: card.sourceUrl,
    }],
  };
  const manifests = [
    manifestFor("2026-09-03"),
    manifestFor("2026-09-04"),
    manifestFor("2026-09-05"),
  ];

  const beforeRollover = publicationJoinReceipt({
    ...run,
    completedAt: "2026-09-03T15:59:59.999Z",
  }, pair, manifests);
  assert.equal(beforeRollover.source.auditDate, "2026-09-03");
  assert.deepEqual(beforeRollover.occurrences[0].matches.map(match => match.publicationDate), [
    "2026-09-03", "2026-09-04", "2026-09-05",
  ]);

  const afterRollover = publicationJoinReceipt({
    ...run,
    completedAt: "2026-09-03T16:00:00.000Z",
  }, pair, manifests);
  assert.equal(afterRollover.source.auditDate, "2026-09-04");
  assert.deepEqual(afterRollover.occurrences[0].matches.map(match => match.publicationDate), [
    "2026-09-04", "2026-09-05",
  ]);

  const invalidTimestamp = publicationJoinReceipt({
    ...run,
    completedAt: "not-a-timestamp",
  }, pair, manifests);
  assert.equal(invalidTimestamp.source.auditDate, null);
  assert.equal(invalidTimestamp.occurrences[0].status, "missing");
  assert.deepEqual(invalidTimestamp.occurrences[0].matches, []);
});

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
    async list({ prefix } = {}) {
      return {
        blobs: [...records.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
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

function storedPublicationManifest(date, actorId) {
  const sourceCandidateIds = Array.from({ length: 9 }, (_, position) => `candidate-${actorId}-${position}`);
  return {
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: `manifest-${actorId}-${date}`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: `${date}T04:00:00.000Z`,
    boardHash: "a".repeat(64),
    actor: {
      id: actorId,
      name: actorId,
      nameEn: actorId,
      accentColor: "#8d2638",
    },
    vibe: {
      key: `${actorId}:0`,
      idx: 0,
      label: "氛围",
      labelEn: "Vibe",
    },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    cards: sourceCandidateIds.map((candidateId, position) => ({
      position,
      candidateId,
      title: `Frame ${position}`,
      source: "publisher.example",
      link: `https://publisher.example/${position}`,
      sourceUrl: `https://images.example/${actorId}-${date}-${position}.jpg`,
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
        deliveryUrl: `https://media.example/assets/${actorId}-${date}-${position}.jpg`,
        thumbnailUrl: `https://media.example/thumbs/${actorId}-${date}-${position}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100 + position,
        checksum: String(position).padStart(64, "0"),
        dimensions: { width: 1200, height: 1200 },
        association: {
          type: "publication",
          id: `vibe-atlas:daily-drop:${date}`,
          itemId: `card-${position}`,
        },
      },
    })),
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
  assert.equal(
    store.records.get(publicationActorIndexKey()).actors["liu-xueyi"].latestPublicationDate,
    input.date,
  );
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

test("publication revalidates eligibility inside the shared correction lock", async () => {
  const store = memoryStore();
  const media = mediaHarness();
  await assert.rejects(
    materializePublicationManifest({
      store,
      ...publicationInput(),
      env: ENV,
      fetchImpl: media.fetchImpl,
      validateBeforeCommit: async () => {
        const error = new Error("Approval was invalidated.");
        error.status = 409;
        throw error;
      },
    }),
    error => error?.status === 409 && /invalidated/i.test(error.message),
  );
  assert.equal(store.records.has(gridManifestKey("2026-09-03")), false);
  assert.deepEqual(media.stats(), { sourceCalls: 0, mediaCalls: 0 });
});

test("publication corrections are append-only notices over immutable manifests", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-09-03", "liu-xueyi");
  const frozen = structuredClone(manifest);
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  const correction = {
    receiptId: "misprint-receipt-1",
    status: "active",
    futureExclusion: true,
    actorId: "liu-xueyi",
    vibeKey: "liu-xueyi:0",
    reason: "wrong_actor",
    correctionScope: "actor_identity",
    markedAt: "2026-09-04T04:00:00.000Z",
    candidate: {
      candidateId: manifest.cards[2].candidateId,
    },
  };
  const first = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (_sourceCorrection, candidate) =>
      candidate.candidateId === correction.candidate.candidateId,
    now: () => "2026-09-04T04:01:00.000Z",
  });
  const second = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (_sourceCorrection, candidate) =>
      candidate.candidateId === correction.candidate.candidateId,
    now: () => "2026-09-04T04:02:00.000Z",
  });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(first[0].receiptId, second[0].receiptId);
  assert.deepEqual(first[0].affectedPositions, [2]);
  assert.equal(first[0].resolution, "requires_explicit_supersession");
  assert.deepEqual(store.records.get(gridManifestKey(manifest.publicationDate)), frozen);
  assert.equal(
    [...store.records.keys()]
      .filter(key => key.startsWith(gridCorrectionPrefix(manifest.publicationDate))).length,
    1,
  );
  assert.deepEqual(
    await readPublicationCorrections(store, manifest.publicationDate),
    [first[0]],
  );
});

test("publication corrections strongly read indexed manifests when blob listings lag", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-08-04", "liu-xueyi");
  const newerManifest = storedPublicationManifest("2026-09-04", "liu-xueyi");
  newerManifest.cards[0] = {
    ...newerManifest.cards[0],
    candidateId: "newer-candidate-0",
  };
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  await store.setJSON(gridManifestKey(newerManifest.publicationDate), newerManifest);
  await rebuildPublicationActorIndex(store);
  await store.setJSON(publicationManifestCatalogKey(), {
    schemaVersion: 1,
    catalogVersion: "v1",
    kind: "vibe-atlas-publication-manifest-catalog",
    dates: [manifest.publicationDate, newerManifest.publicationDate],
    updatedAt: "2026-09-04T12:00:00.000Z",
  });
  const list = store.list.bind(store);
  store.list = async options => options?.prefix === gridManifestKey("")
    ? { blobs: [] }
    : list(options);
  const correction = {
    receiptId: "listing-lag-misprint",
    status: "active",
    futureExclusion: true,
    actorId: manifest.actor.id,
    vibeKey: manifest.vibe.key,
    reason: "wrong_actor",
    correctionScope: "actor_identity",
    candidate: {
      candidateId: manifest.cards[0].candidateId,
    },
  };

  const receipts = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (sourceCorrection, candidate) =>
      sourceCorrection.candidate.candidateId === candidate.candidateId,
  });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].manifestId, manifest.manifestId);
});

test("vibe-local publication corrections do not annotate another vibe for the same actor", async () => {
  const store = memoryStore();
  const matchingVibe = storedPublicationManifest("2026-09-03", "liu-xueyi");
  const otherVibe = {
    ...storedPublicationManifest("2026-09-04", "liu-xueyi"),
    vibe: {
      ...matchingVibe.vibe,
      key: "liu-xueyi:1",
      idx: 1,
    },
  };
  otherVibe.cards[2] = {
    ...otherVibe.cards[2],
    candidateId: matchingVibe.cards[2].candidateId,
  };
  await store.setJSON(gridManifestKey(matchingVibe.publicationDate), matchingVibe);
  await store.setJSON(gridManifestKey(otherVibe.publicationDate), otherVibe);
  const correction = {
    receiptId: "vibe-local-misprint",
    status: "active",
    futureExclusion: true,
    actorId: "liu-xueyi",
    vibeKey: "liu-xueyi:0",
    reason: "wrong_vibe",
    correctionScope: "actor_vibe",
    markedAt: "2026-09-05T04:00:00.000Z",
    candidate: {
      candidateId: matchingVibe.cards[2].candidateId,
    },
  };

  const receipts = await recordPublicationCorrectionsForMisprint({
    store,
    correction,
    matchesCandidate: (_sourceCorrection, candidate) =>
      candidate.candidateId === correction.candidate.candidateId,
    now: () => "2026-09-05T04:01:00.000Z",
  });

  assert.deepEqual(
    receipts.map(receipt => receipt.publicationDate),
    [matchingVibe.publicationDate],
  );
  assert.deepEqual(
    await readPublicationCorrections(store, otherVibe.publicationDate),
    [],
  );
});

test("reads latest actor dates from the index and rebuilds missing or stale data from manifests", async () => {
  const store = memoryStore();
  const manifests = [
    storedPublicationManifest("2026-07-01", "actor-a"),
    storedPublicationManifest("2026-08-30", "actor-a"),
    storedPublicationManifest("2026-08-20", "actor-b"),
  ];
  for (const manifest of manifests) {
    await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  }

  const rebuilt = await rebuildPublicationActorIndex(store, {
    throughDate: "2026-08-31",
    now: () => "2026-08-31T04:00:00.000Z",
  });
  assert.equal(rebuilt.actors["actor-a"].latestPublicationDate, "2026-08-30");
  assert.equal(rebuilt.actors["actor-b"].latestPublicationDate, "2026-08-20");

  const indexed = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.deepEqual([...indexed], [
    ["actor-a", "2026-08-30"],
    ["actor-b", "2026-08-20"],
  ]);

  await store.setJSON(publicationActorIndexKey(), {
    ...rebuilt,
    actors: {
      ...rebuilt.actors,
      "actor-a": {
        ...rebuilt.actors["actor-a"],
        manifestId: "stale-manifest",
      },
    },
  });
  const repaired = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(repaired.get("actor-a"), "2026-08-30");
  assert.equal(
    store.records.get(publicationActorIndexKey()).actors["actor-a"].manifestId,
    "manifest-actor-a-2026-08-30",
  );
});

test("a later complete listing repairs an older manifest omitted during bootstrap", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-07-01", "actor-a");
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  const completeList = store.list;
  store.list = async () => ({ blobs: [] });

  const incomplete = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(incomplete.has("actor-a"), false);

  store.list = completeList;
  const repaired = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(repaired.get("actor-a"), "2026-07-01");
});

test("cutoff reads keep the latest actor date at or before the requested day", async () => {
  const store = memoryStore();
  await store.setJSON(
    gridManifestKey("2026-08-01"),
    storedPublicationManifest("2026-08-01", "actor-a"),
  );
  await store.setJSON(
    gridManifestKey("2026-09-01"),
    storedPublicationManifest("2026-09-01", "actor-a"),
  );

  const first = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(first.get("actor-a"), "2026-08-01");
  assert.equal(
    store.records.get(publicationActorIndexKey()).actorDateThrough,
    "2026-08-31",
  );

  const originalList = store.list;
  let listCalls = 0;
  store.list = async options => {
    listCalls += 1;
    return originalList(options);
  };
  const second = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(second.get("actor-a"), "2026-08-01");
  assert.equal(listCalls, 1);
});

test("rebuild uses strong recent-date reads when the manifest listing lags", async () => {
  const store = memoryStore();
  const manifest = storedPublicationManifest("2026-08-30", "actor-a");
  await store.setJSON(gridManifestKey(manifest.publicationDate), manifest);
  store.list = async () => ({ blobs: [] });

  const dates = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });

  assert.equal(dates.get("actor-a"), "2026-08-30");
  assert.equal(
    store.records.get(publicationActorIndexKey()).actors["actor-a"].manifestId,
    manifest.manifestId,
  );
});

test("rebuild ignores malformed manifest-shaped blobs", async () => {
  const store = memoryStore();
  const verified = storedPublicationManifest("2026-08-20", "actor-a");
  await store.setJSON(gridManifestKey(verified.publicationDate), verified);
  await store.setJSON(gridManifestKey("2026-08-30"), {
    publicationDate: "2026-08-30",
    actor: { id: "actor-a" },
  });

  const rebuilt = await rebuildPublicationActorIndex(store, {
    throughDate: "2026-08-31",
  });

  assert.equal(rebuilt.actors["actor-a"].latestPublicationDate, "2026-08-20");
  const originalList = store.list;
  let listCalls = 0;
  store.list = async options => {
    listCalls += 1;
    return originalList(options);
  };
  const dates = await readLatestPublicationDatesByActor(store, {
    throughDate: "2026-08-31",
  });
  assert.equal(dates.get("actor-a"), "2026-08-20");
  assert.equal(listCalls, 1);
});

test("a derived index write failure cannot fail an already committed publication", async () => {
  const store = memoryStore();
  const originalSetJSON = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => {
    if (key === publicationActorIndexKey()) {
      throw new Error("simulated index outage");
    }
    return originalSetJSON(key, value, options);
  };
  const media = mediaHarness();
  const input = publicationInput();

  const published = await materializePublicationManifest({
    store,
    ...input,
    env: ENV,
    fetchImpl: media.fetchImpl,
  });

  assert.equal(isGridManifest(published.manifest), true);
  assert.equal(store.records.has(gridManifestKey(input.date)), true);
  assert.equal(store.records.has(publicationActorIndexKey()), false);
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