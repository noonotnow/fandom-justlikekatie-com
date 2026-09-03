import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  CREATOR_DRAFT_SOURCE_SCHEMA,
  createWorkstationGridHandoffHandler,
  sourceVersionForGrid,
} from "./workstation-grid-handoff.js";
import { createWorkstationHandoffHandler } from "./workstation-handoff.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ENV = {
  MEDIA_ASSETS_TOKEN: "media-token",
  MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
  WORKSTATION_FANDOM_INTAKE_URL: "https://workstation.example/api/integrations/fandom/projects",
  WORKSTATION_FANDOM_HMAC_KEY_ID: "fandom-key",
  WORKSTATION_FANDOM_HMAC_SECRET: "hmac-secret",
  WORKSTATION_APP_URL: "https://workstation.justlikekatie.com",
};

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sourceMedia() {
  return {
    schemaVersion: 1,
    assetId: "22222222-2222-4222-8222-222222222222",
    deliveryUrl: "https://media.example/assets/source.png",
    thumbnailUrl: "https://media.example/assets/source-thumb.png",
    mimeType: "image/png",
    sizeBytes: 1234,
    checksum: "a".repeat(64),
    dimensions: { width: 1200, height: 1500 },
    association: { type: "collection", id: "vibe-atlas", itemId: "grid-local-0" },
  };
}

function grid(overrides = {}) {
  const media = sourceMedia();
  return {
    kind: "grid",
    schemaVersion: 1,
    rendererVersion: "vibe-atlas-v1",
    id: "server-grid-1",
    artifactId: "grid-1",
    localId: "grid-local",
    actorId: "actor-1",
    actor: "演员",
    actorEn: "Actor",
    actorAccentColor: "#c9a96e",
    vibe: "氛围",
    vibeEn: "Vibe",
    vibeEmoji: "✨",
    vibeSubtitle: "",
    vibeSubtitleEn: "",
    searchSpell: "soft light",
    generationPrompt: "Preserve the visual evidence.",
    capturedDate: "2026-08-30",
    generatedAt: "2026-08-30T12:00:00.000Z",
    sourceRoute: "/vibe-atlas",
    images: [{
      resultId: "result-1",
      imageUrl: media.deliveryUrl,
      sourceUrl: "https://publisher.example/one",
      title: "One",
      publisher: "Publisher",
      batchKey: "batch-1",
      familyId: "family-1",
      familyLabel: "Soft light",
      familyEvidence: "batch",
      gridPosition: 0,
      media,
    }],
    ...overrides,
  };
}

function sourceFor(savedGrid = grid(), platforms = ["rednote"]) {
  const sourceVersion = sourceVersionForGrid(savedGrid);
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: "ordered-grid",
    sourceId: savedGrid.artifactId,
    sourceVersion,
    idempotencyKey: `grid:${savedGrid.artifactId}:${stableHash(sourceVersion)}:${platforms.join("+")}`,
    platforms,
    actor: { id: savedGrid.actorId, name: savedGrid.actor, nameEn: savedGrid.actorEn },
    creativeContext: {
      vibe: savedGrid.vibe,
      vibeEn: savedGrid.vibeEn,
      brief: savedGrid.generationPrompt || "",
    },
    orderedImages: savedGrid.images.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      sourceUrl: image.sourceUrl,
      title: image.title,
      publisher: image.publisher,
      batchKey: image.batchKey,
      familyId: image.familyId,
      familyLabel: image.familyLabel,
      familyEvidence: image.familyEvidence,
    })),
  };
}

function memoryStore(initial = null) {
  const records = new Map(initial ? [["users/account-1", structuredClone(initial)]] : []);
  const etags = new Map(initial ? [["users/account-1", "etag-1"]] : []);
  let revision = initial ? 1 : 0;
  return {
    records,
    async get(key) {
      return structuredClone(records.get(key) ?? null);
    },
    async getWithMetadata(key) {
      return records.has(key)
        ? { data: structuredClone(records.get(key)), etag: etags.get(key) }
        : null;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== etags.get(key)) return { modified: false };
      records.set(key, structuredClone(value));
      revision += 1;
      const etag = `etag-${revision}`;
      etags.set(key, etag);
      return { modified: true, etag };
    },
  };
}

function request(source) {
  return new Request(`${ORIGIN}/api/workstation-handoff`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
}

function mediaResponse(bytes) {
  return Response.json({
    data: {
      version: 1,
      assetId: "11111111-1111-4111-8111-111111111111",
      fileUrl: "https://media.example/assets/cover.png",
      deliveryUrl: "https://media.example/assets/cover.png",
      thumbnailUrl: "https://media.example/assets/cover-thumb.png",
      mediaType: "image",
      mimeType: "image/png",
      sizeBytes: bytes.byteLength,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      dimensions: { width: 1080, height: 1350 },
    },
  });
}

function receiptFor(body, disposition = "created", mediaSyncState = "synced", warnings = []) {
  return {
    receipt: {
      deliverableId: body.deliverableId,
      postId: "draft-1",
      postUrl: "https://workstation.justlikekatie.com/drafts/draft-1",
      deepLink: "https://workstation.justlikekatie.com/compose?postId=draft-1",
      status: "Draft",
      sourceVersion: body.sourceVersion,
      workflow: "direct",
      disposition,
      mediaSyncState,
      warnings,
    },
  };
}

function directHandler({ collection, receipts, fetchImpl, now } = {}) {
  return createWorkstationGridHandoffHandler({
    env: ENV,
    getStore(name) {
      if (name === "fandom-user-collections") return collection;
      if (name === "creator-draft-handoffs") return receipts;
      throw new Error(`unexpected store: ${name}`);
    },
    fetchImpl,
    ...(now ? { now } : {}),
    renderOutputImpl: async () => PNG,
  });
}

test("emits the exact direct live_grid contract and replays its durable receipt", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  const workstationCalls = [];
  let mediaCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        return mediaResponse(new Uint8Array(await options.body.get("file").arrayBuffer()));
      }
      const body = JSON.parse(options.body);
      workstationCalls.push({ url, options, body });
      return Response.json(receiptFor(body));
    },
  });
  const source = sourceFor(savedGrid, ["rednote", "weibo"]);
  const operator = { user: { accountId: "account-1" } };

  const first = await handler(request(source), {}, source, operator);
  assert.equal(first.status, 201);
  assert.equal(mediaCalls, 1);
  assert.equal(workstationCalls.length, 1);

  const { url, options, body } = workstationCalls[0];
  assert.equal(url, ENV.WORKSTATION_FANDOM_INTAKE_URL);
  assert.equal(body.schema, "fandom.static-deliverable.v1");
  assert.equal(body.workflow, "direct");
  assert.equal(body.outputKind, "live_grid");
  assert.deepEqual(body.directOrigin, { kind: "grid", id: "grid-1" });
  assert.equal(body.outputId, "live-grid");
  assert.equal(body.deliverableId, "fandom:grid:grid-1:live-grid");
  assert.equal(body.renderVariant, "vibe-atlas-grid-cover-v1");
  assert.ok(Number.isSafeInteger(body.sourceVersion));
  assert.ok(body.sourceVersion > 0);
  assert.equal(body.expectedSourceVersion, null);
  assert.equal(body.sourceFingerprint, source.sourceVersion);
  assert.equal(body.idempotencyKey, "fandom/direct/grid/grid-1/live-grid");
  assert.equal(options.headers["Idempotency-Key"], body.idempotencyKey);
  assert.equal(body.mediaAttachments.length, 1);
  assert.equal(body.mediaAttachments[0].role, "cover");
  assert.equal(body.mediaAttachments[0].renderVariant, body.renderVariant);
  assert.equal(body.sourceCards.length, 1);
  assert.deepEqual(body.sourceCards[0], {
    id: "result-1",
    order: 0,
    imageUrl: savedGrid.images[0].media.deliveryUrl,
    sourceUrl: "https://publisher.example/one",
    title: "One",
    creator: "Publisher",
    capturedAt: savedGrid.generatedAt,
    provenance: JSON.stringify({
      collection: "saved-grid",
      gridId: "grid-1",
      gridPosition: 0,
      batchKey: "batch-1",
      familyId: "family-1",
      familyLabel: "Soft light",
      familyEvidence: "batch",
    }),
    media: savedGrid.images[0].media,
  });

  const firstBody = await first.json();
  assert.deepEqual(Object.keys(firstBody.receipt).sort(), [
    "deepLink",
    "deliverableId",
    "disposition",
    "mediaSyncState",
    "postId",
    "postUrl",
    "sourceVersion",
    "status",
    "warnings",
    "workflow",
  ]);

  const replay = await handler(request(source), {}, source, operator);
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).receipt.disposition, "replayed");
  assert.equal(mediaCalls, 1);
  assert.equal(workstationCalls.length, 1);
});

test("retries a pending handoff with the original canonical cover provenance", async () => {
  const savedGrid = grid();
  let mediaCalls = 0;
  let workstationCalls = 0;
  let retriedEnvelope;
  const handler = directHandler({
    collection: memoryStore({
      schemaVersion: 1,
      accountId: "account-1",
      items: { "server-grid-1": savedGrid },
    }),
    receipts: memoryStore(),
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        return mediaResponse(new Uint8Array(await options.body.get("file").arrayBuffer()));
      }
      workstationCalls += 1;
      const body = JSON.parse(options.body);
      if (workstationCalls === 1) return Response.json({ error: "retry" }, { status: 503 });
      retriedEnvelope = body;
      return Response.json(receiptFor(body));
    },
  });
  const source = sourceFor(savedGrid);
  const operator = { user: { accountId: "account-1" } };

  assert.equal((await handler(request(source), {}, source, operator)).status, 502);
  assert.equal((await handler(request(source), {}, source, operator)).status, 201);
  assert.equal(mediaCalls, 1);
  assert.equal(workstationCalls, 2);
  assert.equal(
    retriedEnvelope.mediaAttachments[0].provenance.sourceFingerprint,
    source.sourceVersion,
  );
  assert.equal(retriedEnvelope.mediaAttachments[0].provenance.sourceVersion, undefined);
});

test("uses the prior receipt sourceVersion as CAS state for updates", async () => {
  const firstGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": firstGrid },
  });
  const receipts = memoryStore();
  const bodies = [];
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return mediaResponse(new Uint8Array(await options.body.get("file").arrayBuffer()));
      }
      const body = JSON.parse(options.body);
      bodies.push(body);
      return Response.json(receiptFor(body, bodies.length === 1 ? "created" : "updated"));
    },
  });
  const operator = { user: { accountId: "account-1" } };
  const firstSource = sourceFor(firstGrid);
  assert.equal((await handler(request(firstSource), {}, firstSource, operator)).status, 201);

  const changedGrid = grid({ generationPrompt: "A changed curator brief." });
  collection.records.set("users/account-1", {
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": changedGrid },
  });
  const changedSource = sourceFor(changedGrid);
  const updated = await handler(request(changedSource), {}, changedSource, operator);

  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).receipt.disposition, "updated");
  assert.notEqual(bodies[1].sourceVersion, bodies[0].sourceVersion);
  assert.equal(bodies[1].expectedSourceVersion, bodies[0].sourceVersion);
  assert.equal(bodies[1].idempotencyKey, bodies[0].idempotencyKey);
});

test("accepts operator divergence and preserves bounded warnings", async () => {
  const savedGrid = grid();
  const handler = directHandler({
    collection: memoryStore({
      schemaVersion: 1,
      accountId: "account-1",
      items: { "server-grid-1": savedGrid },
    }),
    receipts: memoryStore(),
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return mediaResponse(new Uint8Array(await options.body.get("file").arrayBuffer()));
      }
      const body = JSON.parse(options.body);
      return Response.json(receiptFor(
        body,
        "updated",
        "operator-diverged",
        ["Operator-selected media was preserved."],
      ));
    },
  });
  const source = sourceFor(savedGrid);
  const response = await handler(request(source), {}, source, { user: { accountId: "account-1" } });
  const receipt = (await response.json()).receipt;

  assert.equal(response.status, 200);
  assert.equal(receipt.mediaSyncState, "operator-diverged");
  assert.deepEqual(receipt.warnings, ["Operator-selected media was preserved."]);
});

test("rejects incomplete MEDIA readiness before rendering or upstream calls", async () => {
  const savedGrid = grid();
  delete savedGrid.images[0].media;
  savedGrid.images[0].imageUrl = "https://images.example/raw.jpg";
  let upstreamCalls = 0;
  const handler = directHandler({
    collection: memoryStore({
      schemaVersion: 1,
      accountId: "account-1",
      items: { "server-grid-1": savedGrid },
    }),
    receipts: memoryStore(),
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("upstream must not be called");
    },
  });
  const source = sourceFor(savedGrid);
  const response = await handler(request(source), {}, source, { user: { accountId: "account-1" } });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.stage, "media-readiness");
  assert.match(body.error, /position 1.*not durably available/i);
  assert.equal(upstreamCalls, 0);
});

test("same-origin Workstation route authenticates the admin session", async () => {
  const savedGrid = grid();
  const handler = createWorkstationHandoffHandler({
    env: ENV,
    auth: {
      async authenticateAdmin() {
        return { user: { accountId: "account-1" } };
      },
    },
    getStore(name) {
      if (name === "fandom-user-collections") {
        return memoryStore({
          schemaVersion: 1,
          accountId: "account-1",
          items: { "server-grid-1": savedGrid },
        });
      }
      return memoryStore();
    },
    renderOutputImpl: async () => PNG,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        return mediaResponse(new Uint8Array(await options.body.get("file").arrayBuffer()));
      }
      const body = JSON.parse(options.body);
      return Response.json(receiptFor(body));
    },
  });
  const response = await handler(request(sourceFor(savedGrid)), {});
  assert.equal(response.status, 201);
  assert.equal((await response.json()).receipt.workflow, "direct");
});
