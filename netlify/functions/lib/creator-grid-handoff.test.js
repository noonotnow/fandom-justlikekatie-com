import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createCreatorGridHandoffHandler,
  CREATOR_DRAFT_SOURCE_SCHEMA,
  sourceVersionForGrid,
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

function sourceFor(savedGrid = grid(), platforms) {
  const sourceVersion = sourceVersionForGrid(savedGrid);
  const orderedImages = [...savedGrid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  return {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: "ordered-grid",
    sourceId: savedGrid.artifactId,
    sourceVersion,
    idempotencyKey: `grid:${savedGrid.artifactId}:${stableHash(sourceVersion)}${platforms ? `:${platforms.join("+")}` : ""}`,
    ...(platforms ? { platforms } : {}),
    actor: { id: savedGrid.actorId, name: savedGrid.actor, nameEn: savedGrid.actorEn },
    creativeContext: {
      vibe: savedGrid.vibe,
      vibeEn: savedGrid.vibeEn,
      brief: savedGrid.generationPrompt || "",
      ...(savedGrid.ctaSeed ? { captionSeed: savedGrid.ctaSeed } : {}),
    },
    orderedImages: orderedImages.map(image => ({
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

function directHandler({ collection, receipts, fetchImpl, renderOutputImpl, now } = {}) {
  return createCreatorGridHandoffHandler({
    env: ENV,
    getStore(name) {
      if (name === "fandom-user-collections") return collection;
      if (name === "creator-draft-handoffs") return receipts;
      throw new Error(`unexpected store: ${name}`);
    },
    fetchImpl,
    ...(now ? { now } : {}),
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

test("direct handoff scopes CREATE idempotency and receipt reuse to the authenticated account", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  // Both accounts intentionally have byte-for-byte identical deterministic grid sources.
  collection.records.set("users/account-2", structuredClone({
    schemaVersion: 1,
    accountId: "account-2",
    items: { "server-grid-1": savedGrid },
  }));
  const receipts = memoryStore();
  const createKeys = [];
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
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
      createCalls += 1;
      createKeys.push(options.headers["Idempotency-Key"]);
      const body = JSON.parse(options.body);
      return Response.json({
        receipt: {
          postId: `draft-${createCalls}`,
          postUrl: `https://create.example/drafts/draft-${createCalls}`,
          status: "Draft",
          sourceVersion: body.sourceVersion,
          workflow: "creator-draft",
          disposition: "created",
          mediaSyncState: "synced",
          warnings: [],
          distribution: body.publicationBrief.distribution,
        },
      });
    },
  });
  const source = sourceFor(savedGrid);
  const accountOne = { user: { accountId: "account-1" } };
  const accountTwo = { user: { accountId: "account-2" } };

  const first = await handler(request(source), {}, source, accountOne);
  const second = await handler(request(source), {}, source, accountTwo);
  const firstReceipt = (await first.json()).receipt;
  const secondReceipt = (await second.json()).receipt;

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(createCalls, 2);
  assert.equal(mediaCalls, 2);
  assert.notEqual(createKeys[0], createKeys[1]);
  assert.notEqual(firstReceipt.postId, secondReceipt.postId);
  assert.notEqual(firstReceipt.postUrl, secondReceipt.postUrl);
  assert.notEqual(firstReceipt.createUrl, secondReceipt.createUrl);
  assert.equal(receipts.records.size, 2);
  assert.ok([...receipts.records.keys()].every(key => !key.includes("account-1") && !key.includes("account-2")));

  const replay = await handler(request(source), {}, source, accountOne);
  const replayReceipt = (await replay.json()).receipt;
  assert.equal(replay.status, 200);
  assert.equal(replayReceipt.disposition, "replayed");
  assert.equal(replayReceipt.postId, firstReceipt.postId);
  assert.equal(replayReceipt.postUrl, firstReceipt.postUrl);
  assert.equal(createCalls, 2);
  assert.equal(mediaCalls, 2);
});

test("platform selection is canonical, reaches the publication brief, and separates replay identity", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  const distributions = [];
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        const bytes = new Uint8Array(await options.body.get("file").arrayBuffer());
        return Response.json({
          data: {
            version: 1,
            assetId: `11111111-1111-4111-8111-${String(mediaCalls).padStart(12, "0")}`,
            fileUrl: `https://media.example/assets/grid-${mediaCalls}.png`,
            deliveryUrl: `https://media.example/assets/grid-${mediaCalls}.png`,
            thumbnailUrl: `https://media.example/assets/grid-${mediaCalls}-thumb.png`,
            mediaType: "image",
            mimeType: "image/png",
            sizeBytes: bytes.byteLength,
            checksum: createHash("sha256").update(bytes).digest("hex"),
            dimensions: { width: 1080, height: 1350 },
          },
        });
      }
      createCalls += 1;
      const body = JSON.parse(options.body);
      distributions.push(body.publicationBrief.distribution);
      return Response.json({
        receipt: {
          postId: `draft-${createCalls}`,
          postUrl: `https://create.example/drafts/draft-${createCalls}`,
          status: "Draft",
          sourceVersion: body.sourceVersion,
          workflow: "creator-draft",
          disposition: "created",
          mediaSyncState: "synced",
          warnings: [],
          distribution: body.publicationBrief.distribution,
        },
      });
    },
  });
  const operator = { user: { accountId: "account-1" } };
  const rednote = sourceFor(savedGrid, ["rednote"]);
  const both = sourceFor(savedGrid, ["rednote", "weibo", "instagram"]);

  const first = await handler(request(rednote), {}, rednote, operator);
  const replay = await handler(request(rednote), {}, rednote, operator);
  const crossPost = await handler(request(both), {}, both, operator);

  assert.equal(first.status, 201);
  assert.equal(replay.status, 200);
  assert.equal(crossPost.status, 201);
  assert.deepEqual(distributions, [
    { primaryPlatform: "rednote", platforms: ["rednote"] },
    { primaryPlatform: "rednote", platforms: ["rednote", "weibo", "instagram"] },
  ]);
  assert.equal(createCalls, 2);
  assert.equal(mediaCalls, 2);
  assert.deepEqual((await crossPost.json()).receipt.distribution.platforms, ["rednote", "weibo", "instagram"]);

  const duplicate = sourceFor(savedGrid, ["rednote", "rednote"]);
  const invalid = await handler(request(duplicate), {}, duplicate, operator);
  assert.equal(invalid.status, 400);
  assert.match((await invalid.json()).error, /unique canonical/i);
});

test("malformed Workstation responses stay bounded and do not leak upstream HTML", async () => {
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
      return new Response("<html><body>private proxy failure</body></html>", {
        status: 502,
        headers: { "Content-Type": "text/html" },
      });
    },
  });
  const source = sourceFor(savedGrid, ["weibo"]);
  const response = await handler(request(source), {}, source, { user: { accountId: "account-1" } });
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.equal(body.error, "CREATE returned invalid JSON.");
  assert.doesNotMatch(JSON.stringify(body), /private proxy failure/);
});

test("a receipt storage failure retries CREATE with the pending MEDIA registration", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  const setJSON = receipts.setJSON.bind(receipts);
  let writes = 0;
  receipts.setJSON = async (key, value) => {
    writes += 1;
    if (writes === 2) throw new Error("receipt store unavailable");
    await setJSON(key, value);
  };
  let mediaCalls = 0;
  let createCalls = 0;
  const createBodies = [];
  const bodyByIdempotencyKey = new Map();
  const fetchImpl = async (url, options) => {
    if (url === ENV.MEDIA_ASSETS_URL) {
      mediaCalls += 1;
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
    createCalls += 1;
    createBodies.push(options.body);
    const idempotencyKey = options.headers["Idempotency-Key"];
    const acceptedBody = bodyByIdempotencyKey.get(idempotencyKey);
    if (acceptedBody && acceptedBody !== options.body) {
      return Response.json({ error: "idempotency body mismatch" }, { status: 409 });
    }
    bodyByIdempotencyKey.set(idempotencyKey, options.body);
    const body = JSON.parse(options.body);
    return Response.json({
      receipt: {
        postId: "draft-1",
        postUrl: "https://create.example/drafts/draft-1",
        status: "Draft",
        sourceVersion: body.sourceVersion,
        workflow: "creator-draft",
        disposition: createCalls === 1 ? "created" : "replayed",
        mediaSyncState: "synced",
        warnings: [],
      },
    });
  };
  let nowCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl,
    now: () => new Date(`2026-08-30T12:00:0${nowCalls++}.000Z`),
  });
  const source = sourceFor(savedGrid);
  const operator = { user: { accountId: "account-1" } };

  const first = await handler(request(source), {}, source, operator);
  assert.equal(first.status, 502);
  assert.equal((await first.json()).stage, "storage");
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 1);

  const retry = await handler(request(source), {}, source, operator);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).receipt.disposition, "replayed");
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 2);
  assert.equal(createBodies[1], createBodies[0]);
});

test("mutable grid content gets a new source version instead of replaying a stale receipt", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
        const bytes = new Uint8Array(await options.body.get("file").arrayBuffer());
        const suffix = String(mediaCalls).padStart(12, "0");
        return Response.json({
          data: {
            version: 1,
            assetId: `11111111-1111-4111-8111-${suffix}`,
            fileUrl: `https://media.example/assets/grid-${mediaCalls}.png`,
            deliveryUrl: `https://media.example/assets/grid-${mediaCalls}.png`,
            thumbnailUrl: `https://media.example/assets/grid-${mediaCalls}-thumb.png`,
            mediaType: "image",
            mimeType: "image/png",
            sizeBytes: bytes.byteLength,
            checksum: createHash("sha256").update(bytes).digest("hex"),
            dimensions: { width: 1080, height: 1350 },
          },
        });
      }
      createCalls += 1;
      const body = JSON.parse(options.body);
      return Response.json({
        receipt: {
          postId: `draft-${createCalls}`,
          postUrl: `https://create.example/drafts/draft-${createCalls}`,
          status: "Draft",
          sourceVersion: body.sourceVersion,
          workflow: "creator-draft",
          disposition: "created",
          mediaSyncState: "synced",
          warnings: [],
        },
      });
    },
  });
  const operator = { user: { accountId: "account-1" } };
  const originalSource = sourceFor(savedGrid);
  const first = await handler(request(originalSource), {}, originalSource, operator);
  assert.equal(first.status, 201);

  const changedGrid = {
    ...savedGrid,
    actor: "Different Actor",
    vibe: "Different Vibe",
    generationPrompt: "A different creative context.",
    images: savedGrid.images.map(image => ({
      ...image,
      imageUrl: "/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Freplacement.jpg",
      sourceUrl: "https://publisher.example/replacement",
      title: "Replacement",
    })),
  };
  collection.records.set("users/account-1", {
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": changedGrid },
  });
  const changedSource = sourceFor(changedGrid);
  assert.notEqual(changedSource.sourceVersion, originalSource.sourceVersion);
  assert.notEqual(changedSource.idempotencyKey, originalSource.idempotencyKey);

  const second = await handler(request(changedSource), {}, changedSource, operator);
  const secondBody = await second.json();
  assert.equal(second.status, 201, JSON.stringify(secondBody));
  assert.equal(secondBody.receipt.postId, "draft-2");
  assert.equal(mediaCalls, 2);
  assert.equal(createCalls, 2);
});

test("a pending storage failure prevents CREATE acceptance", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  receipts.setJSON = async () => { throw new Error("pending store unavailable"); };
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
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
      createCalls += 1;
      throw new Error("CREATE must not be called");
    },
  });
  const source = sourceFor(savedGrid);
  const response = await handler(request(source), {}, source, { user: { accountId: "account-1" } });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).stage, "storage");
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 0);
});

test("a collection grid read failure returns storage 502 before render or upstream work", async () => {
  const collection = memoryStore();
  collection.get = async () => { throw new Error("collection store unavailable"); };
  const receipts = memoryStore();
  let renderCalls = 0;
  let upstreamCalls = 0;
  const savedGrid = grid();
  const handler = directHandler({
    collection,
    receipts,
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("upstream must not be called");
    },
  });

  const response = await handler(
    request(sourceFor(savedGrid)),
    {},
    sourceFor(savedGrid),
    { user: { accountId: "account-1" } },
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).stage, "storage");
  assert.equal(renderCalls, 0);
  assert.equal(upstreamCalls, 0);
});

test("a receipt read failure returns storage 502 before render or upstream work", async () => {
  const savedGrid = grid();
  const collection = memoryStore({
    schemaVersion: 1,
    accountId: "account-1",
    items: { "server-grid-1": savedGrid },
  });
  const receipts = memoryStore();
  receipts.get = async () => { throw new Error("receipt store unavailable"); };
  let renderCalls = 0;
  let upstreamCalls = 0;
  const handler = directHandler({
    collection,
    receipts,
    renderOutputImpl: async () => {
      renderCalls += 1;
      return PNG;
    },
    fetchImpl: async () => {
      upstreamCalls += 1;
      throw new Error("upstream must not be called");
    },
  });

  const response = await handler(
    request(sourceFor(savedGrid)),
    {},
    sourceFor(savedGrid),
    { user: { accountId: "account-1" } },
  );
  assert.equal(response.status, 502);
  assert.equal((await response.json()).stage, "storage");
  assert.equal(renderCalls, 0);
  assert.equal(upstreamCalls, 0);
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

test("direct handoff proxies raw Lightbox-style grid thumbnails before rendering and completes MEDIA and CREATE", async () => {
  const savedGrid = grid();
  const thumbnailUrl = "https://images.example/lightbox-card.jpg?width=1200&quality=85";
  savedGrid.images[0].imageUrl = thumbnailUrl;
  let renderPacket;
  let mediaCalls = 0;
  let createCalls = 0;
  const handler = directHandler({
    collection: memoryStore({
      schemaVersion: 1,
      accountId: "account-1",
      items: { "server-grid-1": savedGrid },
    }),
    receipts: memoryStore(),
    renderOutputImpl: async packet => {
      renderPacket = packet;
      return PNG;
    },
    fetchImpl: async (url, options) => {
      if (url === ENV.MEDIA_ASSETS_URL) {
        mediaCalls += 1;
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
      createCalls += 1;
      const body = JSON.parse(options.body);
      return Response.json({
        receipt: {
          postId: "draft-lightbox-1",
          postUrl: "https://create.example/drafts/draft-lightbox-1",
          status: "Draft",
          sourceVersion: body.sourceVersion,
          workflow: "creator-draft",
          disposition: "created",
          mediaSyncState: "synced",
          warnings: [],
        },
      });
    },
  });
  const source = sourceFor(savedGrid);
  const response = await handler(request(source), {}, source, { user: { accountId: "account-1" } });

  const expectedProxy = new URL("/.netlify/functions/image-proxy", ORIGIN);
  expectedProxy.searchParams.set("url", thumbnailUrl);
  assert.equal(response.status, 201);
  assert.equal(renderPacket.grids[0].images[0].imageUrl, expectedProxy.toString());
  assert.equal(renderPacket.sourceCards[0].imageUrl, expectedProxy.toString());
  assert.equal(mediaCalls, 1);
  assert.equal(createCalls, 1);
});

test("direct handoff rejects unsafe raw grid thumbnails before rendering or upstream work", async () => {
  for (const imageUrl of [
    "http://images.example/card.jpg",
    "https://user:password@images.example/card.jpg",
    "data:image/png;base64,AAAA",
    "blob:https://fandom.justlikekatie.com/card",
    "https://127.0.0.1/card.jpg",
    "https://[::1]/card.jpg",
    "https://localhost/card.jpg",
    "not a URL",
  ]) {
    const savedGrid = grid();
    savedGrid.images[0].imageUrl = imageUrl;
    let renderCalls = 0;
    let upstreamCalls = 0;
    const handler = directHandler({
      collection: memoryStore({
        schemaVersion: 1,
        accountId: "account-1",
        items: { "server-grid-1": savedGrid },
      }),
      receipts: memoryStore(),
      renderOutputImpl: async () => {
        renderCalls += 1;
        return PNG;
      },
      fetchImpl: async () => {
        upstreamCalls += 1;
        throw new Error("upstream must not be called");
      },
    });
    const source = sourceFor(savedGrid);
    const response = await handler(request(source), {}, source, { user: { accountId: "account-1" } });
    assert.equal(response.status, 409, imageUrl);
    assert.match((await response.json()).error, /invalid public image URL/i);
    assert.equal(renderCalls, 0, imageUrl);
    assert.equal(upstreamCalls, 0, imageUrl);
  }
});