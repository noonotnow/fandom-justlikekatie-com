import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createCreatorGridHandoffHandler,
  CREATOR_DRAFT_SOURCE_SCHEMA,
} from "./creator-grid-handoff.js";
import { createCreateHandoffHandler } from "./create-handoff.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const ENV = {
  MEDIA_ASSETS_TOKEN: "media-token",
  MEDIA_ASSETS_URL: "https://media.example/v1/assets/images",
  CREATE_FANDOM_INTAKE_URL: "https://create.example/api/integrations/fandom/projects",
  CREATE_FANDOM_HMAC_KEY_ID: "fandom-key",
  CREATE_FANDOM_HMAC_SECRET: "hmac-secret",
  CREATE_APP_URL: "https://create.justlikekatie.com",
};

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function grid() {
  return {
    kind: "grid",
    schemaVersion: 1,
    rendererVersion: "vibe-atlas-v1",
    id: "server-grid-1",
    artifactId: "grid-1",
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
    capturedDate: "2026-08-30",
    generatedAt: "2026-08-30T12:00:00.000Z",
    images: [{
      resultId: "result-1",
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fone.jpg",
      sourceUrl: "https://publisher.example/one",
      title: "One",
      publisher: "Publisher",
      batchKey: "batch-1",
      gridPosition: 0,
    }],
  };
}

function sourceFor(savedGrid = grid()) {
  const sourceVersion = `${savedGrid.schemaVersion}:${savedGrid.generatedAt}:${savedGrid.images.map(image => image.resultId).join("|")}`;
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: "ordered-grid",
    sourceId: savedGrid.artifactId,
    sourceVersion,
    idempotencyKey: `grid:${savedGrid.artifactId}:${stableHash(sourceVersion)}`,
    actor: { id: savedGrid.actorId, name: savedGrid.actor, nameEn: savedGrid.actorEn },
    creativeContext: { vibe: savedGrid.vibe, vibeEn: savedGrid.vibeEn, brief: "" },
    orderedImages: savedGrid.images.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      sourceUrl: image.sourceUrl,
      title: image.title,
      publisher: image.publisher,
      batchKey: image.batchKey,
    })),
  };
}

function memoryStore(initial = null) {
  const records = new Map(initial ? [["users/account-1", structuredClone(initial)]] : []);
  return {
    records,
    async get(key) {
      return structuredClone(records.get(key) ?? null);
    },
    async setJSON(key, value) {
      records.set(key, structuredClone(value));
    },
  };
}

function request(source) {
  return new Request(`${ORIGIN}/api/create-handoff`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
}

function directHandler({ collection, receipts, fetchImpl, renderOutputImpl } = {}) {
  return createCreatorGridHandoffHandler({
    env: ENV,
    getStore(name) {
      if (name === "fandom-user-collections") return collection;
      if (name === "creator-draft-handoffs") return receipts;
      throw new Error(`unexpected store: ${name}`);
    },
    fetchImpl,
    renderOutputImpl: renderOutputImpl || (async () => PNG),
  });
}

test("direct handoff authenticates, resolves the account grid, and replays without packet storage", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  let mediaCalls = 0;
  let createCalls = 0;
  const fetchImpl = async (url, options) => {
    if (url === ENV.MEDIA_ASSETS_URL) {
      mediaCalls += 1;
      const bytes = new Uint8Array(await options.body.get("file").arrayBuffer());
      return new Response(JSON.stringify({
        data: {
          version: 1,
          assetId: "11111111-1111-4111-8111-111111111111",
          fileUrl: "https://media.example/assets/grid.png",
          deliveryUrl: "https://media.example/assets/grid.png",
          thumbnailUrl: "https://media.example/assets/grid-thumb.png",
          mediaType: "image",
          mimeType: "image/png",
          sizeBytes: bytes.byteLength,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          dimensions: { width: 1080, height: 1350 },
        },
      }), { headers: { "Content-Type": "application/json" } });
    }
    createCalls += 1;
    const body = JSON.parse(options.body);
    return new Response(JSON.stringify({
      receipt: {
        postId: "draft-1",
        postUrl: "https://create.example/drafts/draft-1",
        status: "Draft",
        sourceVersion: body.sourceVersion,
        workflow: "creator-draft",
        disposition: "created",
        mediaSyncState: "synced",
        warnings: [],
      },
    }), { headers: { "Content-Type": "application/json" } });
  };
  const handler = directHandler({ collection, receipts, fetchImpl });
  const operator = { user: { accountId: "account-1" } };

  const first = await handler(request(sourceFor(savedGrid)), {}, sourceFor(savedGrid), operator);
  assert.equal(first.status, 201);
  assert.equal((await first.json()).receipt.sourceId, "grid-1");
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 1);

  const second = await handler(request(sourceFor(savedGrid)), {}, sourceFor(savedGrid), operator);
  assert.equal(second.status, 200);
  assert.equal((await second.json()).receipt.disposition, "replayed");
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 1);
});

test("direct handoff rejects stale versions and other accounts before upstream work", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  let upstreamCalls = 0;
  const handler = directHandler({
    collection,
    receipts: memoryStore(),
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("upstream must not be called");
    },
  });
  const stale = sourceFor({ ...savedGrid, generatedAt: "2026-08-30T13:00:00.000Z" });
  const staleResponse = await handler(request(stale), {}, stale, { user: { accountId: "account-1" } });
  assert.equal(staleResponse.status, 409);
  assert.match((await staleResponse.json()).error, /changed|match/i);

  const wrongAccount = await handler(
    request(sourceFor(savedGrid)),
    {},
    sourceFor(savedGrid),
    { user: { accountId: "account-2" } },
  );
  assert.equal(wrongAccount.status, 404);
  assert.equal(upstreamCalls, 0);
});

test("direct handoff requires a session account and never accepts token-only authorization", async () => {
  const savedGrid = grid();
  const handler = directHandler({
    collection: memoryStore({ schemaVersion: 1, accountId: "account-1", items: { "server-grid-1": savedGrid } }),
    receipts: memoryStore(),
    fetchImpl: async () => { throw new Error("upstream must not be called"); },
  });
  const response = await handler(request(sourceFor(savedGrid)), {}, sourceFor(savedGrid), { method: "operator-token" });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /signed-in admin session/i);
});

test("create-handoff routes an authenticated admin session into the direct path", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const handler = createCreateHandoffHandler({
    env: ENV,
    auth: {
      async authenticateAdmin() {
        return { user: { accountId: "account-1", email: "admin@example.test" } };
      },
    },
    getStore(name) {
      if (name === "fandom-user-collections") return collection;
      if (name === "creator-draft-handoffs") return memoryStore();
      throw new Error(`unexpected packet store access: ${name}`);
    },
    renderOutputImpl: async () => PNG,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        const bytes = new Uint8Array(await options.body.get("file").arrayBuffer());
        return Response.json({
          data: {
            version: 1,
            assetId: "11111111-1111-4111-8111-111111111111",
            fileUrl: "https://media.example/assets/grid.png",
            deliveryUrl: "https://media.example/assets/grid.png",
            thumbnailUrl: "https://media.example/assets/grid-thumb.png",
            mediaType: "image",
            mimeType: "image/png",
            sizeBytes: bytes.byteLength,
            checksum: createHash("sha256").update(bytes).digest("hex"),
            dimensions: { width: 1080, height: 1350 },
          },
        });
      }
      return Response.json({
        receipt: {
          postId: "draft-1",
          postUrl: "https://create.example/drafts/draft-1",
          status: "Draft",
          sourceVersion: sourceFor(savedGrid).sourceVersion,
          workflow: "creator-draft",
          disposition: "created",
          mediaSyncState: "synced",
          warnings: [],
        },
      });
    },
  });
  const response = await handler(request(sourceFor(savedGrid)), {});
  assert.equal(response.status, 201);
  assert.equal((await response.json()).receipt.workflow, "creator-draft");
});

test("server-side rendering accepts a trusted collection MEDIA image through the canonical proxy", async () => {
  const savedGrid = grid();
  const mediaUrl = "https://media.example/assets/saved-grid.png";
  savedGrid.images[0].imageUrl = mediaUrl;
  savedGrid.images[0].media = {
    schemaVersion: 1,
    assetId: "22222222-2222-4222-8222-222222222222",
    deliveryUrl: mediaUrl,
    thumbnailUrl: "https://media.example/assets/saved-grid-thumb.png",
    mimeType: "image/png",
    sizeBytes: PNG.byteLength,
    checksum: createHash("sha256").update(PNG).digest("hex"),
    dimensions: { width: 1080, height: 1350 },
    association: { type: "collection", id: "vibe-atlas", itemId: "grid-1" },
  };
  let renderedGridUrl = "";
  const handler = directHandler({
    collection: memoryStore({
      schemaVersion: 1,
      accountId: "account-1",
      items: { "server-grid-1": savedGrid },
    }),
    receipts: memoryStore(),
    renderOutputImpl: async packet => {
      renderedGridUrl = packet.grids[0].images[0].imageUrl;
      return PNG;
    },
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        const bytes = new Uint8Array(await options.body.get("file").arrayBuffer());
        return Response.json({
          data: {
            version: 1,
            assetId: "33333333-3333-4333-8333-333333333333",
            fileUrl: "https://media.example/assets/draft.png",
            deliveryUrl: "https://media.example/assets/draft.png",
            thumbnailUrl: "https://media.example/assets/draft-thumb.png",
            mediaType: "image",
            mimeType: "image/png",
            sizeBytes: bytes.byteLength,
            checksum: createHash("sha256").update(bytes).digest("hex"),
            dimensions: { width: 1080, height: 1350 },
          },
        });
      }
      return Response.json({
        receipt: {
          postId: "draft-2",
          postUrl: "https://create.example/drafts/draft-2",
          status: "Draft",
          sourceVersion: sourceFor(savedGrid).sourceVersion,
          workflow: "creator-draft",
          disposition: "created",
          mediaSyncState: "synced",
          warnings: [],
        },
      });
    },
  });
  const response = await handler(request(sourceFor(savedGrid)), {}, sourceFor(savedGrid), { user: { accountId: "account-1" } });
  assert.equal(response.status, 201);
  assert.equal(new URL(renderedGridUrl).pathname, "/.netlify/functions/image-proxy");
  assert.equal(new URL(renderedGridUrl).searchParams.get("url"), mediaUrl);
});