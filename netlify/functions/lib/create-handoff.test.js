import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { createCreateHandoffHandler } from "./create-handoff.js";
import { upgradeLegacyPacket } from "./idea-packets.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ENV = {
  PLAN_OPERATOR_TOKEN: "operator-token",
  MEDIA_ASSETS_TOKEN: "media-token",
  MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
  CREATE_FANDOM_INTAKE_URL: "https://create.example/api/integrations/fandom/projects",
  CREATE_FANDOM_HMAC_KEY_ID: "fandom-key",
  CREATE_FANDOM_HMAC_SECRET: "hmac-secret",
  CREATE_APP_URL: "https://create.justlikekatie.com",
};

function testHandler(options) {
  return createCreateHandoffHandler({
    renderOutputImpl: async () => PNG,
    ...options,
  });
}

function packet() {
  return {
    id: "packet-1",
    version: "packet-version-1",
    state: "media_compiled",
    createdAt: "2026-08-05T12:00:00.000Z",
    updatedAt: "2026-08-05T12:00:00.000Z",
    actor: { id: "star", name: "明星", nameEn: "Star" },
    vibe: { label: "氛围", labelEn: "Vibe", emoji: "✨" },
    provenance: {
      sourceRoute: "/?admin=true",
      gridId: "grid-1",
      generatedAt: "2026-08-05T12:00:00.000Z",
      resultIds: ["result-1"],
      batchKeys: ["batch-1"],
    },
    anchor: { imageUrls: ["/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fone.jpg"], label: "Star · Vibe" },
    sourceCards: [{
      id: "media-1",
      order: 0,
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fone.jpg",
      sourceUrl: "https://publisher.example/one",
      title: "One",
      capturedAt: "2026-08-05T12:00:00.000Z",
      resultId: "result-1",
      provenance: "{}",
    }],
    media: [{
      id: "media-1",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fone.jpg",
      sourceUrl: "https://publisher.example/one",
      title: "One",
      resultId: "result-1",
      addedAt: "2026-08-05T12:00:00.000Z",
    }],
    outputs: [
      {
        id: "grid-output",
        kind: "grid",
        sourceId: "grid-1",
        label: "Rendered grid PNG",
        included: true,
        addedAt: "2026-08-05T12:00:00.000Z",
      },
      {
        id: "individual-output",
        kind: "individual",
        sourceId: "media-1",
        label: "One",
        included: true,
        addedAt: "2026-08-05T12:00:00.000Z",
      },
    ],
    notes: "Packet note",
    workingAngle: "One canonical Draft",
    captionSeeds: "Caption seed",
    outputAngles: "Carousel",
  };
}

function memoryStore(initial = packet()) {
  const records = new Map([[initial.id, structuredClone(initial)]]);
  return {
    records,
    async get(key) { return structuredClone(records.get(key) ?? null); },
    async setJSON(key, value) { records.set(key, structuredClone(value)); },
    async delete(key) { records.delete(key); },
  };
}

function conditionalMemoryStore(initial) {
  const records = new Map(initial ? [[initial.id, structuredClone(initial)]] : []);
  const etags = new Map(initial ? [[initial.id, "etag-1"]] : []);
  let revision = 1;
  return {
    records,
    async get(key) { return structuredClone(records.get(key) ?? null); },
    async getWithMetadata(key) {
      if (!records.has(key)) return null;
      return {
        data: structuredClone(records.get(key)),
        etag: etags.get(key),
      };
    },
    async setJSON(key, value, options = {}) {
      const currentEtag = etags.get(key);
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== currentEtag) return { modified: false };
      revision += 1;
      const etag = `etag-${revision}`;
      records.set(key, structuredClone(value));
      etags.set(key, etag);
      return { modified: true, etag };
    },
    async delete(key) {
      records.delete(key);
      etags.delete(key);
    },
  };
}

function request(current, outputIds = ["grid-output", "individual-output"]) {
  const outputs = outputIds.map(id => {
    const output = current.outputs.find(candidate => candidate.id === id);
    return {
      outputId: output.id,
      kind: output.kind,
      sourceId: output.sourceId,
      renderContract: "fandom.idea-packet-output.v1",
      renderVersion: 1,
      width: 1080,
      height: 1350,
    };
  });
  const manifest = {
    packetId: current.id,
    expectedVersion: current.version,
    outputs,
  };
  return new Request(`${ORIGIN}/api/create-handoff`, {
    method: "POST",
    headers: { Origin: ORIGIN, Authorization: "Bearer operator-token" },
    body: new Blob([JSON.stringify(manifest)], { type: "application/json" }),
  });
}

function mediaDescriptor(index, bytes = PNG) {
  return {
    version: 1,
    assetId: `asset-${index}`,
    fileUrl: `https://media.example/assets/${index}.png`,
    deliveryUrl: `https://media.example/assets/${index}.png`,
    thumbnailUrl: `https://media.example/assets/${index}.png`,
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: bytes.byteLength,
    dimensions: { width: 1080, height: 1350 },
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

function createReceipt(disposition = "created", sourceVersion = 1, packetId = "packet-1") {
  return {
    deliverableId: "idea-packet-main",
    postId: "12345678-1234-1234-1234-123456789012",
    postUrl: "https://www.notion.so/12345678123412341234123456789012",
    status: "Draft",
    sourceVersion,
    workflow: "packet",
    disposition,
    packetReceipt: { packetId, deliverableId: "idea-packet-main", accepted: true },
    mediaSyncState: "synced",
    warnings: [],
  };
}

const INCIDENT_PACKET_ID = "94a5581e-e2e4-4c14-b904-48e77ce1e5f0";

// Pre-PR8 `handoffAttempt` pointers were exactly this shape: no schemaVersion/artifactKey,
// no bytes/checksums/manifest/MEDIA descriptors — only the source CAS chain and a bare
// fingerprint that cannot be reused (there is nothing behind it to trust).
function legacyPointer(overrides = {}) {
  return {
    sourceVersion: 1,
    expectedSourceVersion: null,
    packetVersion: "packet-version-1",
    fingerprint: createHash("sha256").update("pre-pr8-legacy-state").digest("hex"),
    generatedAt: "2026-07-01T09:30:00.000Z",
    ...overrides,
  };
}

function incidentPacket() {
  const current = packet();
  current.id = INCIDENT_PACKET_ID;
  current.outputs[1].included = false;
  return current;
}

test("registers exact mixed PNGs in MEDIA and signs one canonical CREATE Draft", async () => {
  const store = memoryStore();
  const mediaCalls = [];
  let createCall;
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        const form = init.body;
        const file = form.get("file");
        const metadata = JSON.parse(form.get("metadata"));
        mediaCalls.push({ bytes: new Uint8Array(await file.arrayBuffer()), metadata });
        return Response.json({
          data: mediaDescriptor(mediaCalls.length),
          meta: { deduplicated: mediaCalls.length === 2 },
        }, { status: mediaCalls.length === 2 ? 200 : 201 });
      }
      createCall = { url, init, envelope: JSON.parse(init.body) };
      return Response.json(createReceipt(), { status: 201 });
    },
  });

  const response = await handler(request(packet()));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.receipt.postId, createReceipt().postId);
  assert.equal(body.receipt.createUrl, `https://create.justlikekatie.com/compose?postId=${createReceipt().postId}`);
  assert.equal(mediaCalls.length, 2);
  assert.deepEqual(mediaCalls[0].bytes, PNG);
  assert.deepEqual(mediaCalls[1].bytes, PNG);
  const provenance = JSON.parse(mediaCalls[0].metadata.rightsNotes);
  assert.equal(provenance.source, "Fandom");
  assert.equal(provenance.starDateShanghai, "2026-08-05");
  assert.equal(provenance.packet.id, "packet-1");
  assert.equal(provenance.output.id, "grid-output");
  assert.equal(mediaCalls[1].metadata.linkedPostIdentifiers.includes("fandom/source-card/media-1"), true);

  assert.equal(createCall.url, ENV.CREATE_FANDOM_INTAKE_URL);
  assert.equal(createCall.envelope.schemaVersion, "fandom.static-deliverable.v1");
  assert.equal(createCall.envelope.packetStatus, "media_compiled");
  assert.equal(createCall.envelope.outputKind, "packet_carousel");
  assert.deepEqual(createCall.envelope.publicationBrief.distribution, {
    primaryPlatform: "rednote",
    platforms: ["rednote"],
  });

  test("upgrades legacy HTTP publisher links to HTTPS during handoff", async () => {
    const current = packet();
    current.sourceCards[0].sourceUrl = "http://publisher.example/one";
    const store = memoryStore(current);
    const mediaMetadata = [];
    let envelope;
    const handler = testHandler({
      env: ENV,
      getStore: () => store,
      fetchImpl: async (url, init) => {
        if (url === ENV.MEDIA_ASSETS_URL) {
          mediaMetadata.push(JSON.parse(init.body.get("metadata")));
          return Response.json({ data: mediaDescriptor(mediaMetadata.length) }, { status: 201 });
        }
        envelope = JSON.parse(init.body);
        return Response.json(createReceipt(), { status: 201 });
      },
    });

    const response = await handler(request(current));
    assert.equal(response.status, 201);
    assert.equal(mediaMetadata[0].sourceUrl, "https://publisher.example/one");
    assert.equal(envelope.sourceCards[0].sourceUrl, "https://publisher.example/one");
  });
  assert.equal("scheduledDate" in createCall.envelope, false);
  assert.equal(createCall.envelope.mediaAttachments[0].role, "cover");
  assert.equal(createCall.envelope.mediaAttachments[1].role, "slide");
  assert.equal(createCall.envelope.draft.caption, "Caption seed");
  const timestamp = createCall.init.headers["X-Fandom-Timestamp"];
  const idempotencyKey = "fandom/deliverable/packet-1/idea-packet-main";
  const digest = createHash("sha256").update(createCall.init.body).digest("hex");
  const signature = createHmac("sha256", ENV.CREATE_FANDOM_HMAC_SECRET)
    .update(`${timestamp}\n${idempotencyKey}\n${digest}`)
    .digest("hex");
  assert.equal(createCall.init.headers["X-Fandom-Signature"], `v1=${signature}`);
  assert.equal(createCall.init.headers["Idempotency-Key"], idempotencyKey);
});

test("replays the same source version and relies on MEDIA checksum dedupe", async () => {
  const singleOutputPacket = packet();
  singleOutputPacket.outputs[1].included = false;
  const store = memoryStore(singleOutputPacket);
  const envelopes = [];
  const times = [
    "2026-08-05T18:00:00.000Z",
    "2026-08-05T18:00:01.000Z",
    "2026-08-05T18:00:02.000Z",
    "2026-08-05T19:00:00.000Z",
    "2026-08-05T19:00:01.000Z",
    "2026-08-05T19:00:02.000Z",
  ];
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date(times.shift()),
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      const envelope = JSON.parse(init.body);
      envelopes.push(envelope);
      return Response.json(createReceipt(envelopes.length === 1 ? "created" : "replayed", envelope.sourceVersion), {
        status: envelopes.length === 1 ? 201 : 200,
      });
    },
  });
  const first = await handler(request(singleOutputPacket, ["grid-output"]));
  assert.equal(first.status, 201);
  const saved = store.records.get("packet-1");
  const second = await handler(request(saved, ["grid-output"]));
  assert.equal(second.status, 200);
  assert.equal((await second.json()).receipt.disposition, "replayed");
  assert.equal(envelopes[0].sourceVersion, 1);
  assert.equal(envelopes[1].sourceVersion, 1);
  assert.equal(envelopes[0].expectedSourceVersion, null);
  assert.equal(envelopes[1].expectedSourceVersion, null);
  assert.deepEqual(envelopes[0], envelopes[1]);
  assert.equal(envelopes[1].generatedAt, "2026-08-05T18:00:00.000Z");
});

test("increments source version with prior-version CAS after packet content changes", async () => {
  const store = memoryStore();
  const envelopes = [];
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      const envelope = JSON.parse(init.body);
      envelopes.push(envelope);
      return Response.json(createReceipt(envelopes.length === 1 ? "created" : "updated", envelope.sourceVersion), {
        status: envelopes.length === 1 ? 201 : 200,
      });
    },
  });
  await handler(request(packet()));
  const changed = store.records.get("packet-1");
  changed.captionSeeds = "A revised seed";
  changed.version = "packet-version-2";
  store.records.set(changed.id, changed);
  const response = await handler(request(changed));
  assert.equal(response.status, 200);
  assert.equal(envelopes[1].sourceVersion, 2);
  assert.equal(envelopes[1].expectedSourceVersion, 1);
  assert.equal(envelopes[1].draft.caption, "A revised seed");
});

test("surfaces partial MEDIA and CREATE failures without success-shaped receipts", async () => {
  for (const failureStage of ["media", "create"]) {
    const store = memoryStore();
    let mediaCount = 0;
    const handler = testHandler({
      env: ENV,
      getStore: () => store,
      now: () => new Date("2026-08-05T18:00:00.000Z"),
      fetchImpl: async (url) => {
        if (url === ENV.MEDIA_ASSETS_URL) {
          mediaCount += 1;
          if (failureStage === "media" && mediaCount === 2) {
            return Response.json({ error: "MEDIA unavailable" }, { status: 503 });
          }
          return Response.json({ data: mediaDescriptor(mediaCount), meta: { deduplicated: false } }, { status: 201 });
        }
        return Response.json({ error: "CREATE unavailable" }, { status: 503 });
      },
    });
    const response = await handler(request(packet()));
    const body = await response.json();
    assert.equal(response.ok, false);
    assert.equal(body.stage, failureStage);
    assert.equal("receipt" in body, false);
    assert.equal(body.details.registered.length, failureStage === "media" ? 1 : 2);
    assert.equal(store.records.get("packet-1").handoff, undefined);
    assert.equal(store.records.get("packet-1").handoffAttempt.sourceVersion, 1);
  }
});

test("retries CREATE 503 and 409 with exact attempt bytes and prior MEDIA registrations", async () => {
  for (const createStatus of [503, 409]) {
    const singleOutputPacket = packet();
    singleOutputPacket.outputs[1].included = false;
    const store = memoryStore(singleOutputPacket);
    let renderCalls = 0;
    let mediaCalls = 0;
    let createCalls = 0;
    const envelopes = [];
    const generatedTimes = [
      "2026-08-06T11:22:17.014Z",
      "2026-08-06T11:22:18.000Z",
      "2026-08-06T11:23:00.000Z",
      "2026-08-06T11:23:01.000Z",
    ];
    const handler = createCreateHandoffHandler({
      env: ENV,
      getStore: () => store,
      now: () => new Date(generatedTimes.shift()),
      renderOutputImpl: async () => {
        renderCalls += 1;
        return renderCalls === 1 ? PNG : new Uint8Array([...PNG, 99]);
      },
      fetchImpl: async (url, init) => {
        if (url === ENV.MEDIA_ASSETS_URL) {
          mediaCalls += 1;
          return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: false } }, { status: 201 });
        }
        createCalls += 1;
        envelopes.push(JSON.parse(init.body));
        if (createCalls === 1) {
          return Response.json({ error: "CREATE unavailable" }, { status: createStatus });
        }
        return Response.json(createReceipt("replayed"), { status: 200 });
      },
    });

    const first = await handler(request(singleOutputPacket, ["grid-output"]));
    assert.equal(first.status, createStatus === 409 ? 409 : 502);
    const pointer = store.records.get(singleOutputPacket.id).handoffAttempt;
    const artifact = store.records.get(pointer.artifactKey);
    assert.equal(artifact.files[0].checksum, mediaDescriptor(1).checksum);
    assert.equal(artifact.registered[0].descriptor.assetId, "asset-1");

    const second = await handler(request(store.records.get(singleOutputPacket.id), ["grid-output"]));
    assert.equal(second.status, 200);
    assert.equal(renderCalls, 1);
    assert.equal(mediaCalls, 1);
    assert.equal(createCalls, 2);
    assert.deepEqual(envelopes[1], envelopes[0]);
    assert.equal(envelopes[1].generatedAt, "2026-08-06T11:22:17.014Z");
    assert.equal(store.records.get(singleOutputPacket.id).handoffAttempt, undefined);
  }
});

test("coalesces concurrent retries onto one durable render and MEDIA registration", async () => {
  const singleOutputPacket = packet();
  singleOutputPacket.outputs[1].included = false;
  const store = memoryStore(singleOutputPacket);
  let renderCalls = 0;
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-06T11:22:17.014Z"),
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async (url) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: false } }, { status: 201 });
      }
      createCalls += 1;
      if (createCalls === 1) {
        return Response.json({ error: "CREATE unavailable" }, { status: 503 });
      }
      return Response.json(createReceipt("replayed"), { status: 200 });
    },
  });

  const [first, second] = await Promise.all([
    handler(request(singleOutputPacket, ["grid-output"])),
    handler(request(singleOutputPacket, ["grid-output"])),
  ]);
  assert.equal(first.status, 502);
  assert.equal(second.status, 200);
  assert.equal(renderCalls, 1);
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 2);
});

test("supersedes a failed attempt after an explicit packet version change", async () => {
  const singleOutputPacket = packet();
  singleOutputPacket.outputs[1].included = false;
  const store = memoryStore(singleOutputPacket);
  const secondPng = new Uint8Array([...PNG, 99]);
  let renderCalls = 0;
  let mediaCalls = 0;
  const envelopes = [];
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date(renderCalls === 0 ? "2026-08-06T11:22:17.014Z" : "2026-08-06T11:23:17.014Z"),
    renderOutputImpl: async () => {
      renderCalls += 1;
      return renderCalls === 1 ? PNG : secondPng;
    },
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        const bytes = new Uint8Array(await init.body.get("file").arrayBuffer());
        return Response.json({ data: mediaDescriptor(mediaCalls, bytes), meta: { deduplicated: false } }, { status: 201 });
      }
      const envelope = JSON.parse(init.body);
      envelopes.push(envelope);
      if (envelopes.length === 1) return Response.json({ error: "CREATE unavailable" }, { status: 503 });
      return Response.json(createReceipt("created"), { status: 201 });
    },
  });

  const first = await handler(request(singleOutputPacket, ["grid-output"]));
  assert.equal(first.status, 502);
  const firstFingerprint = store.records.get(singleOutputPacket.id).handoffAttempt.fingerprint;
  const changed = store.records.get(singleOutputPacket.id);
  changed.captionSeeds = "Changed after failed attempt";
  changed.version = "packet-version-2";
  store.records.set(changed.id, changed);

  const second = await handler(request(changed, ["grid-output"]));
  assert.equal(second.status, 201);
  assert.equal(renderCalls, 2);
  assert.equal(mediaCalls, 2);
  assert.notEqual(store.records.get(changed.id).handoff.fingerprint, firstFingerprint);
  assert.equal(envelopes[1].packetVersion, "packet-version-2");
  assert.equal(envelopes[1].draft.caption, "Changed after failed attempt");
  assert.equal(envelopes[1].sourceVersion, 1);
  assert.equal(envelopes[1].expectedSourceVersion, null);
});

test("fails closed when the current packet retry pointer is malformed", async () => {
  const current = packet();
  current.handoffAttempt = {
    schemaVersion: 1,
    packetVersion: current.version,
    sourceVersion: 1,
  };
  const store = memoryStore(current);
  let upstreamCalls = 0;
  let renderCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("must not call upstream");
    },
  });
  const response = await handler(request(current));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.stage, "storage");
  assert.equal(renderCalls, 0);
  assert.equal(upstreamCalls, 0);
});

test("rejects a cross-instance retry while a durable handoff lease is active", async () => {
  const store = memoryStore();
  store.records.set("locks/packet-1", {
    owner: "other-instance",
    acquiredAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    state: "active",
  });
  let calls = 0;
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not call upstream");
    },
  });
  const response = await handler(request(packet()));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.stage, "storage");
  assert.match(body.error, /already in progress/);
  assert.equal(calls, 0);
});

test("rejects operator-diverged receipts as conflicts without storing or exposing success", async () => {
  const store = memoryStore();
  let createCalls = 0;
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      createCalls += 1;
      return Response.json({ ...createReceipt(), mediaSyncState: "operator-diverged" }, { status: 200 });
    },
  });
  const response = await handler(request(packet()));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.stage, "create");
  assert.match(body.error, /operator-diverged/);
  assert.equal("receipt" in body, false);
  assert.equal("createUrl" in body.details.receipt, false);
  assert.equal(store.records.get("packet-1").handoff, undefined);
  assert.equal(createCalls, 1);
});

test("rejects render descriptor mismatches and arbitrary browser PNGs before MEDIA", async () => {
  let upstreamCalls = 0;
  let renderCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => memoryStore(),
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("must not call upstream");
    },
  });

  const valid = request(packet());
  const mismatched = await valid.clone().json();
  mismatched.outputs[0].width = 999;
  const mismatchResponse = await handler(new Request(valid.url, {
    method: "POST",
    headers: valid.headers,
    body: JSON.stringify(mismatched),
  }));
  assert.equal(mismatchResponse.status, 400);

  const form = new FormData();
  form.append("manifest", JSON.stringify(mismatched));
  form.append("output-0", new File([PNG], "arbitrary.png", { type: "image/png" }));
  const arbitraryResponse = await handler(new Request(valid.url, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: `Bearer ${ENV.PLAN_OPERATOR_TOKEN}`,
    },
    body: form,
  }));
  assert.equal(arbitraryResponse.status, 400);
  assert.equal(renderCalls, 0);
  assert.equal(upstreamCalls, 0);
});

test("rejects persisted non-proxy source URLs before MEDIA registration", async () => {
  let upstreamCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => memoryStore({
      ...packet(),
      sourceCards: packet().sourceCards.map(card => ({ ...card, imageUrl: "https://attacker.example/arbitrary.png" })),
    }),
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("must not call MEDIA or CREATE");
    },
  });
  const response = await handler(request(packet()));
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.stage, "render");
  assert.match(body.error, /same-origin image proxy/);
  assert.equal(upstreamCalls, 0);
});

test("keeps an incident-shaped render failure retryable and aborts before MEDIA or CREATE", async () => {
  const incident = packet();
  incident.id = "94a5581e-e2e4-4c14-b904-48e77ce1e5f0";
  incident.actor = { id: "liu-yuning", name: "刘宇宁", nameEn: "Liu Yuning" };
  incident.vibe = { label: "摩天能量", labelEn: "Skyscraper Energy", emoji: "⚡" };
  incident.sourceCards = Array.from({ length: 4 }, (_, index) => ({
    ...packet().sourceCards[0],
    id: `media-${index + 1}`,
    order: index,
    resultId: `result-${index + 1}`,
    title: index === 0
      ? "风掠过塞纳河，攀上埃菲尔铁塔。驻足塔边，赴一场与@摩登兄弟刘宇宁 的巴黎之约。#地球超新鲜, Cr.刘宇宁LYN工作室"
      : `Source ${index + 1}`,
    imageUrl: `/.netlify/functions/image-proxy?url=${encodeURIComponent(`https://images.example/${index + 1}.jpg`)}`,
  }));
  incident.outputs = [
    incident.outputs[0],
    ...incident.sourceCards.map((card, index) => ({
      id: `individual-output-${index + 1}`,
      kind: "individual",
      sourceId: card.id,
      label: card.title,
      included: true,
      addedAt: "2026-08-05T12:00:00.000Z",
    })),
  ];
  const store = memoryStore(incident);
  let renderCalls = 0;
  let upstreamCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    renderOutputImpl: async () => {
      renderCalls += 1;
      if (renderCalls === 1) throw new Error("getaddrinfo ENOTFOUND images.example");
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("must not call MEDIA or CREATE");
    },
  });
  const outputIds = incident.outputs.map(output => output.id);

  const failed = await handler(request(incident, outputIds));
  assert.equal(failed.status, 422);
  assert.equal((await failed.json()).stage, "render");
  assert.equal(upstreamCalls, 0);
  assert.equal(store.records.get(incident.id).handoffAttempt, undefined);

  renderCalls = 1;
  const retry = await handler(request(incident, outputIds));
  assert.equal((await retry.json()).stage, "media");
  assert.equal(renderCalls, 6);
  assert.equal(upstreamCalls, 1);
  assert.equal(store.records.get(incident.id).handoffAttempt.sourceVersion, 1);
});

test("recovers with the exact signed envelope when receipt persistence fails after CREATE", async () => {
  const singleOutputPacket = packet();
  singleOutputPacket.outputs[1].included = false;
  const base = memoryStore(singleOutputPacket);
  let failReceiptWrite = true;
  const store = {
    ...base,
    async setJSON(key, value) {
      if (value.handoff && failReceiptWrite) {
        failReceiptWrite = false;
        throw new Error("temporary blob failure");
      }
      await base.setJSON(key, value);
    },
  };
  const envelopes = [];
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      envelopes.push(JSON.parse(init.body));
      return Response.json(createReceipt(envelopes.length === 1 ? "created" : "replayed"), {
        status: envelopes.length === 1 ? 201 : 200,
      });
    },
  });
  const first = await handler(request(singleOutputPacket, ["grid-output"]));
  const failed = await first.json();
  assert.equal(first.status, 502);
  assert.equal(failed.stage, "storage");
  assert.equal(failed.details.receipt.postId, createReceipt().postId);
  assert.equal(base.records.get("packet-1").handoffAttempt.fingerprint.length, 64);
  const artifactKey = base.records.get("packet-1").handoffAttempt.artifactKey;

  const second = await handler(request(base.records.get("packet-1"), ["grid-output"]));
  assert.equal(second.status, 200);
  assert.deepEqual(envelopes[0], envelopes[1]);
  assert.equal(base.records.get("packet-1").handoff.receipt.disposition, "replayed");
  assert.equal(base.records.get("packet-1").handoffAttempt, undefined);
  assert.equal(base.records.has(artifactKey), false);
});

test("does not overwrite a concurrent packet edit after CREATE accepts the Draft", async () => {
  const store = conditionalMemoryStore(packet());
  const attemptStore = conditionalMemoryStore();
  const handler = testHandler({
    env: ENV,
    getStore: name => name === "idea-packets" ? store : attemptStore,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      await store.setJSON("packet-1", {
        ...store.records.get("packet-1"),
        notes: "Concurrent edit survives",
        version: "concurrent-version",
      });
      return Response.json(createReceipt(), { status: 201 });
    },
  });
  const response = await handler(request(packet()));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.stage, "packet");
  assert.equal(body.details.receipt.postId, createReceipt().postId);
  assert.equal(store.records.get("packet-1").notes, "Concurrent edit survives");
  assert.equal(store.records.get("packet-1").handoff, undefined);
});

test("does not attach an attempt pointer over a cross-instance packet edit", async () => {
  const store = conditionalMemoryStore(packet());
  const attemptStore = conditionalMemoryStore();
  let upstreamCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: name => name === "idea-packets" ? store : attemptStore,
    renderOutputImpl: async () => {
      await store.setJSON("packet-1", {
        ...store.records.get("packet-1"),
        notes: "Edit during render",
        version: "concurrent-version",
      });
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("must not call upstream");
    },
  });
  const response = await handler(request(packet()));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.stage, "packet");
  assert.equal(store.records.get("packet-1").notes, "Edit during render");
  assert.equal(store.records.get("packet-1").handoffAttempt, undefined);
  assert.equal(upstreamCalls, 0);
});

test("fails closed on stale packet versions before calling MEDIA or CREATE", async () => {
  let calls = 0;
  const handler = testHandler({
    env: ENV,
    getStore: () => memoryStore(),
    fetchImpl: async () => {
      calls += 1;
      throw new Error("must not call upstream");
    },
  });
  const stale = packet();
  stale.version = "stale-version";
  const response = await handler(request(stale));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).stage, "packet");
  assert.equal(calls, 0);
});

test("hands off upgraded saved-history packets with curated-media provenance intact", async () => {
  const legacy = packet();
  delete legacy.sourceCards;
  delete legacy.outputs;
  const store = memoryStore(legacy);
  const upgraded = upgradeLegacyPacket(legacy);
  let envelope;
  let individualMetadata;
  const handler = testHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        const metadata = JSON.parse(init.body.get("metadata"));
        if (metadata.linkedPostIdentifiers.includes("fandom/source-card/media-1")) {
          individualMetadata = metadata;
        }
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      envelope = JSON.parse(init.body);
      return Response.json(createReceipt(), { status: 201 });
    },
  });
  const response = await handler(request(upgraded, upgraded.outputs.map(output => output.id)));
  assert.equal(response.status, 201);
  assert.ok(envelope.sourceCards.some(card => card.id === "media-1"));
  assert.ok(envelope.mediaAttachments[1].sourceCardIds.includes("media-1"));
  assert.equal(individualMetadata.sourceUrl, "https://publisher.example/one");
});

test("migrates an unchanged pre-PR8 legacy handoffAttempt pointer with one render and one MEDIA registration", async () => {
  const current = incidentPacket();
  current.handoffAttempt = legacyPointer();
  // A real packet-entry ETag is required so the pointer swap below is a genuine CAS, not
  // an unconditional overwrite -- exercising the exact guarantee the incident fix requires.
  const store = conditionalMemoryStore(current);
  let renderCalls = 0;
  let mediaCalls = 0;
  let envelope;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: false } }, { status: 201 });
      }
      envelope = JSON.parse(init.body);
      return Response.json(createReceipt("created", 1, current.id), { status: 201 });
    },
  });

  const response = await handler(request(current, ["grid-output"]));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(renderCalls, 1);
  assert.equal(mediaCalls, 1);
  assert.equal(body.receipt.postId, createReceipt().postId);
  // The legacy pointer's source CAS chain and generatedAt are preserved exactly, not
  // recomputed, because CREATE may already have observed that exact source version.
  assert.equal(envelope.sourceVersion, 1);
  assert.equal(envelope.expectedSourceVersion, null);
  assert.equal(envelope.generatedAt, "2026-07-01T09:30:00.000Z");
  const saved = store.records.get(current.id);
  assert.equal(saved.handoffAttempt, undefined);
  assert.equal(saved.handoff.sourceVersion, 1);
  assert.equal(saved.handoff.expectedSourceVersion, null);
  assert.equal(saved.handoff.generatedAt, "2026-07-01T09:30:00.000Z");
  // Fingerprint is never trusted from legacy state — it is recomputed from the actual
  // re-rendered bytes because legacy pointers carry no checksums to validate against.
  assert.notEqual(saved.handoff.fingerprint, legacyPointer().fingerprint);
});

test("coalesces concurrent legacy-pointer migrations onto one durable render and MEDIA registration", async () => {
  const current = incidentPacket();
  current.handoffAttempt = legacyPointer();
  const store = conditionalMemoryStore(current);
  let renderCalls = 0;
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-06T12:00:00.000Z"),
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async (url) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 5));
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: false } }, { status: 201 });
      }
      createCalls += 1;
      if (createCalls === 1) return Response.json({ error: "CREATE unavailable" }, { status: 503 });
      return Response.json(createReceipt("replayed", 1, current.id), { status: 200 });
    },
  });

  const [first, second] = await Promise.all([
    handler(request(current, ["grid-output"])),
    handler(request(current, ["grid-output"])),
  ]);
  assert.equal(first.status, 502);
  assert.equal(second.status, 200);
  assert.equal(renderCalls, 1);
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 2);
  assert.equal(store.records.get(current.id).handoffAttempt, undefined);
});

test("fails closed on malformed or CAS-mismatched current-version legacy pointers before render or upstream calls", async () => {
  const cases = [
    { name: "non-hex fingerprint", overrides: { fingerprint: "not-a-valid-fingerprint" } },
    { name: "fingerprint wrong length", overrides: { fingerprint: "abc123" } },
    { name: "non-integer sourceVersion", overrides: { sourceVersion: 1.5 } },
    { name: "sourceVersion below 1", overrides: { sourceVersion: 0 } },
    { name: "expectedSourceVersion wrong type", overrides: { expectedSourceVersion: "0" } },
    // Source CAS chain mismatch: no prior packet.handoff, so sourceVersion must be 1 and
    // expectedSourceVersion must be null — this pointer claims a chain that never happened.
    { name: "sourceVersion CAS mismatch", overrides: { sourceVersion: 2 } },
    { name: "expectedSourceVersion CAS mismatch", overrides: { expectedSourceVersion: 5 } },
    { name: "invalid generatedAt", overrides: { generatedAt: "not-a-date" } },
    { name: "empty packetVersion", overrides: { packetVersion: "" } },
  ];
  for (const { name, overrides } of cases) {
    const current = incidentPacket();
    current.handoffAttempt = legacyPointer(overrides);
    const store = conditionalMemoryStore(current);
    let renderCalls = 0;
    let upstreamCalls = 0;
    const handler = createCreateHandoffHandler({
      env: ENV,
      getStore: () => store,
      renderOutputImpl: async () => {
        renderCalls += 1;
        return PNG;
      },
      fetchImpl: async () => {
        upstreamCalls += 1;
        throw new Error("must not call upstream");
      },
    });
    const response = await handler(request(current, ["grid-output"]));
    const body = await response.json();
    assert.equal(response.status, 409, name);
    assert.equal(body.stage, "storage", name);
    assert.equal(renderCalls, 0, name);
    assert.equal(upstreamCalls, 0, name);
  }
});

test("keeps a migrated legacy attempt exactly replayable after MEDIA success and CREATE 503/409", async () => {
  for (const createStatus of [503, 409]) {
    const current = incidentPacket();
    current.handoffAttempt = legacyPointer();
    const store = conditionalMemoryStore(current);
    let renderCalls = 0;
    let mediaCalls = 0;
    let createCalls = 0;
    const envelopes = [];
    const generatedTimes = [
      "2026-08-06T12:00:00.000Z",
      "2026-08-06T12:00:01.000Z",
      "2026-08-06T13:00:00.000Z",
      "2026-08-06T13:00:01.000Z",
    ];
    const handler = createCreateHandoffHandler({
      env: ENV,
      getStore: () => store,
      now: () => new Date(generatedTimes.shift()),
      renderOutputImpl: async () => {
        renderCalls += 1;
        return renderCalls === 1 ? PNG : new Uint8Array([...PNG, 42]);
      },
      fetchImpl: async (url, init) => {
        if (url === ENV.MEDIA_ASSETS_URL) {
          mediaCalls += 1;
          return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: false } }, { status: 201 });
        }
        createCalls += 1;
        envelopes.push(JSON.parse(init.body));
        if (createCalls === 1) return Response.json({ error: "CREATE unavailable" }, { status: createStatus });
        return Response.json(createReceipt("replayed", 1, current.id), { status: 200 });
      },
    });

    const first = await handler(request(current, ["grid-output"]));
    assert.equal(first.status, createStatus === 409 ? 409 : 502);
    const migrated = store.records.get(current.id).handoffAttempt;
    // The legacy pointer is now a normal PR8 attempt pointer with checkpointed bytes.
    assert.equal(migrated.schemaVersion, 1);
    assert.equal(typeof migrated.artifactKey, "string");
    assert.equal(migrated.sourceVersion, 1);
    assert.equal(migrated.expectedSourceVersion, null);
    assert.equal(migrated.generatedAt, "2026-07-01T09:30:00.000Z");
    const artifact = store.records.get(migrated.artifactKey);
    assert.equal(artifact.files[0].checksum, mediaDescriptor(1).checksum);
    assert.equal(artifact.registered[0].descriptor.assetId, "asset-1");

    const second = await handler(request(store.records.get(current.id), ["grid-output"]));
    assert.equal(second.status, 200);
    assert.equal(renderCalls, 1);
    assert.equal(mediaCalls, 1);
    assert.equal(createCalls, 2);
    assert.deepEqual(envelopes[1], envelopes[0]);
    assert.equal(envelopes[1].generatedAt, "2026-07-01T09:30:00.000Z");
    assert.equal(store.records.get(current.id).handoffAttempt, undefined);
  }
});

test("safely supersedes a legacy pointer whose packetVersion no longer matches the current packet", async () => {
  const current = incidentPacket();
  current.handoffAttempt = legacyPointer({ packetVersion: "packet-version-0" });
  const store = conditionalMemoryStore(current);
  let renderCalls = 0;
  let mediaCalls = 0;
  let envelope;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-06T14:00:00.000Z"),
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async (url, init) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: false } }, { status: 201 });
      }
      envelope = JSON.parse(init.body);
      return Response.json(createReceipt("created", 1, current.id), { status: 201 });
    },
  });

  const response = await handler(request(current, ["grid-output"]));
  assert.equal(response.status, 201);
  assert.equal(renderCalls, 1);
  assert.equal(mediaCalls, 1);
  // A stale legacy pointer is disregarded entirely, not migrated: the new attempt is a
  // normal fresh attempt with a freshly computed generatedAt, not the stale pointer's value.
  assert.equal(envelope.generatedAt, "2026-08-06T14:00:00.000Z");
  assert.equal(envelope.sourceVersion, 1);
  assert.equal(envelope.expectedSourceVersion, null);
  const saved = store.records.get(current.id);
  assert.equal(saved.handoffAttempt, undefined);
  assert.notEqual(saved.handoff.fingerprint, legacyPointer().fingerprint);
});

test("fails closed on a current-version legacy pointer when the packet entry has no ETag to CAS against", async () => {
  const current = incidentPacket();
  current.handoffAttempt = legacyPointer();
  // A plain store with no getWithMetadata support never yields an ETag, so the pointer
  // swap could only ever be an unconditional overwrite -- never a real CAS. Migration
  // must refuse before rendering rather than silently downgrading that guarantee.
  const store = memoryStore(current);
  let renderCalls = 0;
  let upstreamCalls = 0;
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("must not call upstream");
    },
  });

  const response = await handler(request(current, ["grid-output"]));
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.stage, "storage");
  assert.equal(renderCalls, 0);
  assert.equal(upstreamCalls, 0);
  // The unmigrated legacy pointer is left exactly as-is; nothing was written.
  assert.deepEqual(store.records.get(current.id).handoffAttempt, legacyPointer());
});
