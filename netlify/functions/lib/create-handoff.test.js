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
    anchor: { imageUrls: ["https://images.example/one.jpg"], label: "Star · Vibe" },
    sourceCards: [{
      id: "media-1",
      order: 0,
      imageUrl: "https://images.example/one.jpg",
      sourceUrl: "https://publisher.example/one",
      title: "One",
      capturedAt: "2026-08-05T12:00:00.000Z",
      resultId: "result-1",
      provenance: "{}",
    }],
    media: [{
      id: "media-1",
      imageUrl: "https://images.example/one.jpg",
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
  };
}

function request(current, outputIds = ["grid-output", "individual-output"]) {
  const form = new FormData();
  const outputs = outputIds.map((id, index) => {
    const output = current.outputs.find(candidate => candidate.id === id);
    const fileField = `output-${index}`;
    form.append(fileField, new File([PNG], `${id}.png`, { type: "image/png" }));
    return {
      outputId: output.id,
      kind: output.kind,
      sourceId: output.sourceId,
      filename: `${id}.png`,
      fileField,
    };
  });
  form.append("manifest", JSON.stringify({
    packetId: current.id,
    expectedVersion: current.version,
    outputs,
  }));
  return new Request(`${ORIGIN}/api/create-handoff`, {
    method: "POST",
    headers: { Origin: ORIGIN, Authorization: "Bearer operator-token" },
    body: form,
  });
}

function mediaDescriptor(index) {
  return {
    version: 1,
    assetId: `asset-${index}`,
    fileUrl: `https://media.example/assets/${index}.png`,
    deliveryUrl: `https://media.example/assets/${index}.png`,
    thumbnailUrl: `https://media.example/assets/${index}.png`,
    mediaType: "image",
    mimeType: "image/png",
    sizeBytes: PNG.byteLength,
    dimensions: { width: 1080, height: 1350 },
    checksum: createHash("sha256").update(PNG).digest("hex"),
  };
}

function createReceipt(disposition = "created", sourceVersion = 1) {
  return {
    deliverableId: "idea-packet-main",
    postId: "12345678-1234-1234-1234-123456789012",
    postUrl: "https://www.notion.so/12345678123412341234123456789012",
    status: "Draft",
    sourceVersion,
    workflow: "packet",
    disposition,
    packetReceipt: { packetId: "packet-1", deliverableId: "idea-packet-main", accepted: true },
    mediaSyncState: "synced",
    warnings: [],
  };
}

test("registers exact mixed PNGs in MEDIA and signs one canonical CREATE Draft", async () => {
  const store = memoryStore();
  const mediaCalls = [];
  let createCall;
  const handler = createCreateHandoffHandler({
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
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
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
});

test("increments source version with prior-version CAS after packet content changes", async () => {
  const store = memoryStore();
  const envelopes = [];
  const handler = createCreateHandoffHandler({
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
    const handler = createCreateHandoffHandler({
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

test("recovers with the exact signed envelope when receipt persistence fails after CREATE", async () => {
  const singleOutputPacket = packet();
  singleOutputPacket.outputs[1].included = false;
  const base = memoryStore(singleOutputPacket);
  let writes = 0;
  const store = {
    ...base,
    async setJSON(key, value) {
      writes += 1;
      if (writes === 2) throw new Error("temporary blob failure");
      await base.setJSON(key, value);
    },
  };
  const envelopes = [];
  const handler = createCreateHandoffHandler({
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

  const second = await handler(request(base.records.get("packet-1"), ["grid-output"]));
  assert.equal(second.status, 200);
  assert.deepEqual(envelopes[0], envelopes[1]);
  assert.equal(base.records.get("packet-1").handoff.receipt.disposition, "replayed");
  assert.equal(base.records.get("packet-1").handoffAttempt, undefined);
});

test("does not overwrite a concurrent packet edit after CREATE accepts the Draft", async () => {
  const store = memoryStore();
  const handler = createCreateHandoffHandler({
    env: ENV,
    getStore: () => store,
    now: () => new Date("2026-08-05T18:00:00.000Z"),
    fetchImpl: async (url) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return Response.json({ data: mediaDescriptor(1), meta: { deduplicated: true } });
      }
      store.records.set("packet-1", {
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

test("fails closed on stale packet versions before calling MEDIA or CREATE", async () => {
  let calls = 0;
  const handler = createCreateHandoffHandler({
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
  const handler = createCreateHandoffHandler({
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
