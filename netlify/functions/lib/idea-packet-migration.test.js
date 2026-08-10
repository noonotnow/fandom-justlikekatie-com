import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import {
  buildMigrationExport,
  canonicalChecksum,
  createIdeaPacketMigrationHandler,
} from "./idea-packet-migration.js";
import { applyAction } from "./idea-packets.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const PATH = "/api/internal/idea-packet-migration";
const NOW = new Date("2026-08-10T05:00:00.000Z");
const ENV = {
  FANDOM_IDEA_PACKETS_MODE: "read-only",
  CREATE_FANDOM_PACKET_MIGRATION_KEY_ID: "migration-key",
  CREATE_FANDOM_PACKET_MIGRATION_SECRET: "migration-secret",
};

function packet(id, overrides = {}) {
  return {
    id,
    version: `${id}-version-1`,
    state: "collecting",
    createdAt: "2026-08-04T16:00:00.000Z",
    updatedAt: "2026-08-04T16:00:00.000Z",
    actor: { id: "actor-1", name: "Star", nameEn: "Star" },
    vibe: { label: "氛围", labelEn: "Vibe", emoji: "✨" },
    provenance: {
      sourceRoute: "/?admin=true",
      gridId: `grid-${id}`,
      generatedAt: "2026-08-04T15:00:00.000Z",
      resultIds: ["result-1"],
      batchKeys: ["batch-1"],
    },
    anchor: { imageUrls: ["https://example.com/anchor.jpg"], label: "Star · Vibe" },
    sourceCards: [{
      id: "card-1",
      order: 0,
      imageUrl: "https://example.com/anchor.jpg",
      sourceUrl: "https://example.com/source/card-1",
      title: "Anchor",
      capturedAt: "2026-08-04T15:00:00.000Z",
      resultId: "result-1",
      provenance: JSON.stringify({ batchKey: "batch-1" }),
    }],
    media: [{
      id: "media-1",
      imageUrl: "https://example.com/media.jpg",
      sourceUrl: "https://example.com/source/media",
      title: "Media",
      resultId: "result-media",
      addedAt: "2026-08-04T16:01:00.000Z",
    }],
    outputs: [{
      id: "grid-output",
      kind: "grid",
      sourceId: `grid-${id}`,
      label: "Rendered grid PNG",
      included: true,
      addedAt: "2026-08-04T16:00:00.000Z",
    }],
    notes: "",
    workingAngle: "",
    captionSeeds: "",
    outputAngles: "",
    ...overrides,
  };
}

function modernPointer(packetId, packetVersion = `${packetId}-version-1`, artifactKey = `${packetId}/attempt`) {
  return {
    schemaVersion: 1,
    artifactKey,
    sourceVersion: 2,
    expectedSourceVersion: 1,
    packetVersion,
    sourcePacketVersion: packetVersion,
    inputFingerprint: `${packetId}-input`,
    fingerprint: `${packetId}-fingerprint`,
    generatedAt: "2026-08-09T12:00:00.000Z",
  };
}

function attemptArtifact(packetId, pointer = modernPointer(packetId)) {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  return {
    ...pointer,
    packet: packet(packetId),
    outputs: [{
      outputId: "grid-output",
      kind: "grid",
      sourceId: `grid-${packetId}`,
    }],
    files: [{
      filename: `${packetId}.png`,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      bytesBase64: bytes.toString("base64"),
    }],
    registered: [{
      descriptor: {
        assetId: "asset-1",
        checksum: createHash("sha256").update(bytes).digest("hex"),
        deliveryUrl: "https://media.example/asset-1.png",
      },
      deduplicated: false,
      metadata: { sourceType: "fandom-idea-packet-output" },
    }],
  };
}

function completedHandoff(packetId) {
  return {
    sourceVersion: 1,
    expectedSourceVersion: null,
    packetVersion: `${packetId}-version-0`,
    fingerprint: "f".repeat(64),
    generatedAt: "2026-08-04T17:00:00.000Z",
    completedAt: "2026-08-04T17:01:00.000Z",
    receipt: {
      deliverableId: "idea-packet-main",
      postId: "post-1",
      postUrl: "https://www.notion.so/post-1",
      createUrl: "https://create.justlikekatie.com/compose?postId=post-1",
      status: "Draft",
      sourceVersion: 1,
      workflow: "packet",
      disposition: "created",
      packetReceipt: { packetId, deliverableId: "idea-packet-main", accepted: true },
      mediaSyncState: "synced",
      warnings: [],
    },
  };
}

function packetWithCompletedHandoff(packetId, handoff = completedHandoff(packetId)) {
  const versionSuffix = createHash("sha256").update(handoff.fingerprint).digest("hex").slice(0, 12);
  return packet(packetId, {
    state: "media_compiled",
    version: `${handoff.completedAt}-${versionSuffix}`,
    updatedAt: handoff.completedAt,
    handoff,
  });
}

function paginatedStore(entries = [], pageSize = 2, activity = null) {
  const records = new Map(entries);
  const etags = new Map([...records.keys()].map(key => [key, `etag-${key}-1`]));
  let revision = 1;
  const calls = { list: 0, getWithMetadata: 0 };
  const store = {
    records,
    etags,
    calls,
    onList: null,
    onGet: null,
    list() {
      calls.list += 1;
      const call = calls.list;
      return {
        async *[Symbol.asyncIterator]() {
          await trackActivity(activity, "list");
          await store.onList?.({ call, store });
          const blobs = [...records.keys()].map(key => ({ key, etag: etags.get(key) }));
          for (let index = 0; index < blobs.length; index += pageSize) {
            yield { blobs: blobs.slice(index, index + pageSize), directories: [] };
          }
        },
      };
    },
    async getWithMetadata(key) {
      calls.getWithMetadata += 1;
      const call = calls.getWithMetadata;
      await trackActivity(activity, "getWithMetadata");
      await store.onGet?.({ call, key, store });
      if (!records.has(key)) return null;
      return { data: structuredClone(records.get(key)), etag: etags.get(key), metadata: {} };
    },
    set(key, value) {
      revision += 1;
      records.set(key, structuredClone(value));
      etags.set(key, `etag-${key}-${revision}`);
    },
    delete(key) {
      records.delete(key);
      etags.delete(key);
    },
  };
  return store;
}

async function trackActivity(activity, kind) {
  if (!activity) return;
  activity.current[kind] += 1;
  activity.max[kind] = Math.max(activity.max[kind], activity.current[kind]);
  await new Promise(resolve => setTimeout(resolve, 5));
  activity.current[kind] -= 1;
}

function signedRequest({
  env = ENV,
  path = PATH,
  method = "GET",
  timestamp = String(Math.floor(NOW.getTime() / 1000)),
  keyId = env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID,
  secret = env.CREATE_FANDOM_PACKET_MIGRATION_SECRET,
  bearer,
} = {}) {
  const digest = createHash("sha256").update("").digest("hex");
  const signature = createHmac("sha256", secret || "")
    .update(`${timestamp}\nGET\n${PATH}\n${digest}`)
    .digest("hex");
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(keyId ? { "X-Fandom-Key-Id": keyId } : {}),
      "X-Fandom-Timestamp": timestamp,
      "X-Fandom-Signature": `v1=${signature}`,
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
  });
}

function handlerFor(packetStore, attemptStore, env = ENV) {
  return createIdeaPacketMigrationHandler({
    env,
    logger: { info() {}, error() {} },
    now: () => NOW,
    getStore: name => name === "idea-packets" ? packetStore : attemptStore,
  });
}

test("exports exact packets, receipt identity, provenance, checksums, and byte-free quarantine", async () => {
  const completed = packetWithCompletedHandoff("packet-completed");
  const currentPointer = modernPointer("packet-current");
  const current = packet("packet-current", { handoffAttempt: currentPointer });
  const artifact = attemptArtifact("packet-current", currentPointer);
  const packetStore = paginatedStore([
    [current.id, current],
    [completed.id, completed],
  ], 1);
  const attemptStore = paginatedStore([
    [currentPointer.artifactKey, artifact],
    ["orphan/artifact", attemptArtifact("packet-orphan")],
    ["locks/packet-old", {
      owner: "old-owner",
      state: "released",
      acquiredAt: NOW.getTime() - 60_000,
      expiresAt: NOW.getTime() - 30_000,
      releasedAt: NOW.getTime() - 20_000,
    }],
  ], 1);

  const response = await handlerFor(packetStore, attemptStore)(signedRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schemaVersion, "fandom.idea-packet-migration.v1");
  assert.match(
    response.headers.get("server-timing"),
    /^initial-inventory;dur=.+, body-read;dur=.+, compile;dur=.+, final-inventory;dur=.+, total;dur=.+$/,
  );
  assert.equal(body.snapshot.packetCount, 2);
  assert.equal(body.snapshot.completedHandoffCount, 1);
  assert.equal(body.snapshot.unresolvedAttemptCount, 1);
  assert.equal(body.snapshot.orphanAttemptCount, 1);
  assert.equal(body.snapshot.expiredOrReleasedLeaseCount, 1);
  assert.equal(body.snapshot.stateCounts.collecting, 1);
  assert.equal(body.snapshot.stateCounts.media_compiled, 1);
  assert.equal(body.snapshot.mediaCount, 2);
  assert.equal(body.snapshot.selectedOutputCount, 2);
  assert.equal(response.headers.get("etag"), `"${body.snapshot.checksum}"`);
  assert.deepEqual(body.packets.map(item => item.packetId), ["packet-completed", "packet-current"]);

  const exportedCompleted = body.packets[0];
  assert.deepEqual(exportedCompleted.storedPacket, completed);
  assert.deepEqual(
    exportedCompleted.normalizedPacket.sourceCards.slice(0, completed.sourceCards.length),
    completed.sourceCards,
  );
  assert.deepEqual(exportedCompleted.selectedMediaIds, ["media-1"]);
  assert.deepEqual(exportedCompleted.selectedOutputIds, ["grid-output"]);
  assert.equal(
    exportedCompleted.createIdentity.idempotencyKey,
    "fandom/deliverable/packet-completed/idea-packet-main",
  );
  assert.deepEqual(
    exportedCompleted.createIdentity.completedHandoff.receipt,
    completed.handoff.receipt,
  );
  assert.equal(exportedCompleted.storedChecksum, canonicalChecksum(completed));

  const currentQuarantine = body.quarantine.find(item => item.kind === "current-attempt");
  assert.equal(currentQuarantine.replayAllowed, false);
  assert.deepEqual(currentQuarantine.pointer, currentPointer);
  assert.equal(currentQuarantine.artifactChecksum, canonicalChecksum(artifact));
  assert.deepEqual(currentQuarantine.artifact.registered, artifact.registered);
  assert.deepEqual(currentQuarantine.artifact.files, [{
    filename: "packet-current.png",
    checksum: artifact.files[0].checksum,
    sizeBytes: artifact.files[0].sizeBytes,
    bytesOmitted: true,
  }]);
  assert.equal(JSON.stringify(body).includes(artifact.files[0].bytesBase64), false);
  assert.equal(body.quarantine.some(item => item.kind === "orphan-artifact"), true);
  assert.equal(body.quarantine.some(item => item.kind === "released-lease"), true);
  assert.equal(
    body.snapshot.checksum,
    canonicalChecksum({ packets: body.packets, quarantine: body.quarantine }),
  );
});

test("normalizes legacy packets without changing their exact stored representation", async () => {
  const legacy = packet("packet-legacy");
  delete legacy.sourceCards;
  delete legacy.outputs;
  const result = await buildMigrationExport(
    paginatedStore([[legacy.id, legacy]]),
    paginatedStore(),
    NOW,
  );
  assert.equal("sourceCards" in result.packets[0].storedPacket, false);
  assert.equal(result.packets[0].normalizedPacket.sourceCards.length, 2);
  assert.equal(result.packets[0].normalizedPacket.outputs.length, 2);
  assert.notEqual(result.packets[0].storedChecksum, result.packets[0].normalizedChecksum);
});

test("uses two parallel inventory waves and one bounded body-read wave", async () => {
  const activity = {
    current: { list: 0, getWithMetadata: 0 },
    max: { list: 0, getWithMetadata: 0 },
  };
  const packetEntries = Array.from(
    { length: 8 },
    (_, index) => [`packet-${index}`, packet(`packet-${index}`)],
  );
  const attemptEntries = Array.from(
    { length: 8 },
    (_, index) => [`orphan-${index}`, attemptArtifact(`orphan-${index}`)],
  );
  const packetStore = paginatedStore(packetEntries, 2, activity);
  const attemptStore = paginatedStore(attemptEntries, 2, activity);

  await buildMigrationExport(packetStore, attemptStore, NOW);

  assert.deepEqual(packetStore.calls, { list: 2, getWithMetadata: 8 });
  assert.deepEqual(attemptStore.calls, { list: 2, getWithMetadata: 8 });
  assert.equal(activity.max.list, 2);
  assert.equal(activity.max.getWithMetadata, 12);
});

test("quarantines malformed packets and keeps every checksum reproducible after JSON serialization", async () => {
  const malformed = {
    id: "packet-malformed",
    version: "version-1",
    createdAt: "2026-08-04T16:00:00.000Z",
    updatedAt: "2026-08-04T16:00:00.000Z",
    media: [],
  };
  const result = await buildMigrationExport(
    paginatedStore([
      ["packet-good", packet("packet-good")],
      [malformed.id, malformed],
    ]),
    paginatedStore(),
    NOW,
  );
  assert.equal(result.packets.length, 1);
  const invalid = result.quarantine.find(item => item.kind === "invalid-packet");
  assert.equal(invalid.packetId, malformed.id);
  const transmitted = JSON.parse(JSON.stringify(result));
  assert.equal(
    transmitted.snapshot.checksum,
    canonicalChecksum({ packets: transmitted.packets, quarantine: transmitted.quarantine }),
  );
});

test("classifies stale, legacy, malformed, missing, orphan, and expired records as non-replayable", async () => {
  const stalePointer = modernPointer("stale", "stale-version");
  const missingPointer = modernPointer("missing");
  const legacyPointer = {
    sourceVersion: 1,
    expectedSourceVersion: null,
    packetVersion: "legacy-version",
    fingerprint: "f".repeat(64),
    generatedAt: "2026-08-01T12:00:00.000Z",
  };
  const packetStore = paginatedStore([
    ["stale", packet("stale", { handoffAttempt: stalePointer })],
    ["legacy", packet("legacy", { handoffAttempt: legacyPointer })],
    ["invalid", packet("invalid", { handoffAttempt: { schemaVersion: 1 } })],
    ["missing", packet("missing", { handoffAttempt: missingPointer })],
  ]);
  const attemptStore = paginatedStore([
    [stalePointer.artifactKey, attemptArtifact("stale", stalePointer)],
    ["orphan/key", attemptArtifact("orphan")],
    ["locks/expired", {
      owner: "expired",
      state: "active",
      acquiredAt: NOW.getTime() - 600_000,
      expiresAt: NOW.getTime() - 1,
    }],
  ]);
  const result = await buildMigrationExport(packetStore, attemptStore, NOW);
  assert.deepEqual(
    [...new Set(result.quarantine.map(item => item.kind))].sort(),
    [
      "expired-lease",
      "invalid-attempt",
      "legacy-attempt",
      "missing-artifact",
      "orphan-artifact",
      "stale-attempt",
    ],
  );
  assert.equal(result.quarantine.every(item => item.replayAllowed === false), true);
  assert.equal(result.snapshot.unresolvedAttemptCount, 4);
});

test("quarantines malformed completed handoffs without suppressing future CREATE work", async () => {
  const valid = packetWithCompletedHandoff("valid");
  const empty = packet("empty", { handoff: {} });
  const badCasHandoff = completedHandoff("bad-cas");
  badCasHandoff.sourceVersion = 3;
  badCasHandoff.receipt.sourceVersion = 3;
  const badCas = packet("bad-cas", { handoff: badCasHandoff });
  const badReceiptHandoff = completedHandoff("bad-receipt");
  badReceiptHandoff.receipt.deliverableId = "wrong-deliverable";
  const badReceipt = packet("bad-receipt", { handoff: badReceiptHandoff });
  const impossibleVersion = packetWithCompletedHandoff("impossible-version");
  impossibleVersion.handoff.packetVersion = impossibleVersion.version;
  const malformedEditVersion = packetWithCompletedHandoff("malformed-edit-version");
  malformedEditVersion.updatedAt = "2026-08-05T17:01:00.000Z";
  malformedEditVersion.version = `${malformedEditVersion.updatedAt}-garbage`;

  const result = await buildMigrationExport(
    paginatedStore([
      [valid.id, valid],
      [empty.id, empty],
      [badCas.id, badCas],
      [badReceipt.id, badReceipt],
      [impossibleVersion.id, impossibleVersion],
      [malformedEditVersion.id, malformedEditVersion],
    ]),
    paginatedStore(),
    NOW,
  );

  assert.equal(result.snapshot.completedHandoffCount, 1);
  assert.equal(result.snapshot.unresolvedAttemptCount, 5);
  assert.equal(result.quarantine.filter(item => item.kind === "invalid-handoff").length, 5);
  assert.equal(
    result.packets
      .filter(item => item.packetId !== "valid")
      .every(item => item.createIdentity.completedHandoff === null),
    true,
  );
  assert.deepEqual(
    result.packets.find(item => item.packetId === "valid").createIdentity.completedHandoff,
    valid.handoff,
  );
  assert.equal(result.quarantine.every(item => item.replayAllowed === false), true);
});

test("preserves valid completed identity after one or multiple normal packet edits", async () => {
  const completed = packetWithCompletedHandoff("completed");
  const editedOnce = applyAction(
    packetWithCompletedHandoff("edited-once"),
    { type: "update_context", notes: "First edit after handoff" },
  );
  const editedTwice = applyAction(
    applyAction(
      packetWithCompletedHandoff("edited-twice"),
      { type: "update_context", notes: "First edit after handoff" },
    ),
    { type: "update_context", notes: "Second edit after handoff" },
  );
  const sameTimestampEdit = packetWithCompletedHandoff("same-timestamp-edit");
  sameTimestampEdit.version = `${sameTimestampEdit.updatedAt}-123e4567-e89b-42d3-a456-426614174000`;
  sameTimestampEdit.notes = "An edit committed in the completion millisecond";

  const result = await buildMigrationExport(
    paginatedStore([
      [completed.id, completed],
      [editedOnce.id, editedOnce],
      [editedTwice.id, editedTwice],
      [sameTimestampEdit.id, sameTimestampEdit],
    ]),
    paginatedStore(),
    NOW,
  );

  assert.equal(result.snapshot.completedHandoffCount, 4);
  assert.equal(result.quarantine.some(item => item.kind === "invalid-handoff"), false);
  for (const source of [completed, editedOnce, editedTwice, sameTimestampEdit]) {
    const exported = result.packets.find(item => item.packetId === source.id);
    assert.deepEqual(exported.storedPacket, source);
    assert.deepEqual(exported.createIdentity.completedHandoff, source.handoff);
    assert.equal(exported.createIdentity.completedHandoff.sourceVersion, 1);
    assert.equal(exported.createIdentity.completedHandoff.expectedSourceVersion, null);
    assert.equal(
      exported.createIdentity.idempotencyKey,
      `fandom/deliverable/${source.id}/idea-packet-main`,
    );
  }
  assert.notEqual(editedOnce.version, completedHandoff("edited-once").packetVersion);
  assert.notEqual(editedTwice.version, completedHandoff("edited-twice").packetVersion);
});

test("blocks export while an unexpired durable handoff lease is active", async () => {
  const response = await handlerFor(
    paginatedStore([["packet-1", packet("packet-1")]]),
    paginatedStore([["locks/packet-1", {
      owner: "active",
      state: "active",
      acquiredAt: NOW.getTime(),
      expiresAt: NOW.getTime() + 60_000,
    }]]),
  )(signedRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "PACKET_MIGRATION_HANDOFF_ACTIVE");
});

test("rejects a packet receipt race that changes an ETag during inventory", async () => {
  const packetStore = paginatedStore([["packet-1", packet("packet-1")]]);
  const attemptStore = paginatedStore();
  attemptStore.onList = ({ call }) => {
    if (call === 2) packetStore.set("packet-1", packetWithCompletedHandoff("packet-1"));
  };

  const response = await handlerFor(packetStore, attemptStore)(signedRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "PACKET_MIGRATION_SNAPSHOT_CHANGED");
});

test("rejects a packet change between its inventory listing and metadata read", async () => {
  const packetStore = paginatedStore([["packet-1", packet("packet-1")]]);
  packetStore.onGet = ({ call }) => {
    if (call === 1) packetStore.set("packet-1", packetWithCompletedHandoff("packet-1"));
  };

  const response = await handlerFor(packetStore, paginatedStore())(signedRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "PACKET_MIGRATION_SNAPSHOT_CHANGED");
});

test("rejects a lease that is created and released during packet inventory", async () => {
  const packetStore = paginatedStore([["packet-1", packet("packet-1")]]);
  const attemptStore = paginatedStore();
  packetStore.onGet = ({ call }) => {
    if (call !== 1) return;
    attemptStore.set("locks/packet-1", {
      owner: "racing-handoff",
      state: "active",
      acquiredAt: NOW.getTime(),
      expiresAt: NOW.getTime() + 60_000,
    });
    attemptStore.set("locks/packet-1", {
      owner: "racing-handoff",
      state: "released",
      acquiredAt: NOW.getTime(),
      expiresAt: NOW.getTime() + 60_000,
      releasedAt: NOW.getTime(),
    });
  };

  const response = await handlerFor(packetStore, attemptStore)(signedRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "PACKET_MIGRATION_SNAPSHOT_CHANGED");
});

test("rejects a lease rewrite between its inventory listing and metadata read", async () => {
  const key = "locks/packet-1";
  const released = {
    owner: "racing-handoff",
    state: "released",
    acquiredAt: NOW.getTime() - 1_000,
    expiresAt: NOW.getTime() + 60_000,
    releasedAt: NOW.getTime(),
  };
  const attemptStore = paginatedStore([[key, released]]);
  attemptStore.onGet = ({ call }) => {
    if (call === 1) attemptStore.set(key, { ...released, releasedAt: NOW.getTime() + 1 });
  };

  const response = await handlerFor(
    paginatedStore([["packet-1", packet("packet-1")]]),
    attemptStore,
  )(signedRequest());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "PACKET_MIGRATION_SNAPSHOT_CHANGED");
});

test("requires the dedicated GET-only HMAC scope and read-only mode", async () => {
  const packetStore = paginatedStore();
  const attemptStore = paginatedStore();
  const handler = handlerFor(packetStore, attemptStore);

  assert.equal((await handler(signedRequest())).status, 200);
  assert.equal((await handler(signedRequest({ method: "POST" }))).status, 405);
  assert.equal((await handler(signedRequest({ secret: "wrong" }))).status, 401);
  assert.equal((await handler(signedRequest({ keyId: "collection-read-key" }))).status, 401);
  assert.equal((await handler(signedRequest({
    timestamp: String(Math.floor((NOW.getTime() - 6 * 60 * 1000) / 1000)),
  }))).status, 401);
  assert.equal((await handler(signedRequest({ path: `${PATH}?cursor=1` }))).status, 400);
  assert.equal((await handlerFor(packetStore, attemptStore, {
    ...ENV,
    FANDOM_IDEA_PACKETS_MODE: "active",
  })(signedRequest())).status, 409);
  for (const value of ["", "  ", "broken"]) {
    assert.equal((await handlerFor(packetStore, attemptStore, {
      ...ENV,
      FANDOM_IDEA_PACKETS_MODE: value,
    })(signedRequest())).status, 503);
  }

  const bearerOnly = signedRequest({
    keyId: "",
    secret: "",
    bearer: "operator-token",
  });
  assert.equal((await handler(bearerOnly)).status, 401);
});

test("canonical checksums ignore object insertion order but preserve array order", () => {
  assert.equal(
    canonicalChecksum({ second: 2, first: { beta: true, alpha: false } }),
    canonicalChecksum({ first: { alpha: false, beta: true }, second: 2 }),
  );
  assert.notEqual(canonicalChecksum(["a", "b"]), canonicalChecksum(["b", "a"]));
});

test("fails the whole export when a Blob read fails", async () => {
  const packetStore = paginatedStore([["packet-1", packet("packet-1")]]);
  packetStore.getWithMetadata = async () => {
    throw new Error("storage unavailable");
  };
  const response = await handlerFor(packetStore, paginatedStore())(signedRequest());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, "PACKET_MIGRATION_EXPORT_UNAVAILABLE");
  assert.equal("packets" in body, false);
});
