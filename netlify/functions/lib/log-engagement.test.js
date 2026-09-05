/**
 * Handler tests for log-engagement.js.
 *
 * Stubs Netlify Blobs via the context.blobs.getStore() interface that
 * blob-store.js prefers when running inside a V2 Netlify Function.
 * Each test gets a fresh in-memory store so assertions are isolated.
 *
 * Covers:
 *  - Module load (no syntax errors, import resolution)
 *  - Happy-path: grid_export, grid-export, single-card — 200 + persisted entry
 *  - Immutable behaviour: concurrent writes remain distinct
 *  - Validation short-circuits: bad event, missing batchKey, invalid grid
 *  - Contract: the exact payload shape from gridExportEventFromRecord passes
 */

import test from "node:test";
import assert from "node:assert/strict";
import { validateGridPayload } from "./grid-export-validation.js";

// ---------------------------------------------------------------------------
// Import the handler (smoke-tests module load)
// ---------------------------------------------------------------------------
const { default: handler } = await import("../log-engagement.js");

test("handler module loads and exports a default function", () => {
  assert.equal(typeof handler, "function");
});

// ---------------------------------------------------------------------------
// In-memory blob store stub
// ---------------------------------------------------------------------------

/** Creates a fresh in-memory store and a matching Netlify-V2 context stub. */
function makeStoreContext() {
  const db = new Map();

  const store = {
    async get(key, opts) {
      const raw = db.get(key) ?? null;
      if (raw === null) return null;
      if (opts && opts.type === "json") return JSON.parse(raw);
      return raw;
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && db.has(key)) return { modified: false };
      db.set(key, JSON.stringify(value));
      return { modified: true };
    },
    /** Read back stored JSON for assertions. */
    _read(key) {
      const raw = db.get(key);
      return raw ? JSON.parse(raw) : null;
    },
    _values(prefix) {
      return [...db.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, raw]) => JSON.parse(raw));
    },
    _keys(prefix) {
      return [...db.keys()].filter(key => key.startsWith(prefix));
    },
  };

  const context = {
    blobs: {
      getStore(_name) { return store; },
    },
  };

  return { store, context };
}

/** Minimal POST request stub. */
function req(body) {
  return { method: "POST", async json() { return body; } };
}

// ---------------------------------------------------------------------------
// Happy path — grid_export
// ---------------------------------------------------------------------------

test("grid_export: valid payload returns 200 and stores the grid artifact", async () => {
  const { store, context } = makeStoreContext();

  const grid = {
    gridId: "vibe-atlas-2026-08-01-actor-1",
    date: "2026-08-01",
    actorId: "actor-1",
    actor: "刘学义",
    actorEn: "Liu Xueyi",
    vibe: "破碎感美人",
    vibeEn: "Shattered Beauty",
    searchSpell: "刘学义 破碎感",
    tier: "standard",
    variant: "full",
    imageIds: ["https://images.example/0.jpg", "https://images.example/1.jpg"],
    ctaSeed: "cta-abc",
  };

  const res = await handler(
    req({ event: "grid_export", batchKey: grid.gridId, grid }),
    context,
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  // Verify the entry was persisted with the grid artifact.
  const [stored] = store._values(`${grid.gridId}:grid_export:`);
  assert.deepEqual(stored.grid, grid);
  assert.equal(stored.event, "grid_export");
  assert.equal(stored.batchKey, grid.gridId);
  assert.ok(stored.timestamp, "entry must have a timestamp");
});

test("grid_export: concurrent writes persist as distinct immutable records", async () => {
  const { store, context } = makeStoreContext();

  const grid = {
    gridId: "vibe-atlas-2026-08-01-actor-1",
    date: "2026-08-01",
    actorId: "actor-1",
    actor: "刘学义",
    actorEn: "Liu Xueyi",
    vibe: "破碎感美人",
    vibeEn: "Shattered Beauty",
    searchSpell: "刘学义 破碎感",
    tier: "standard",
    variant: "full",
    imageIds: ["https://images.example/0.jpg"],
  };

  await Promise.all([
    handler(req({ event: "grid_export", batchKey: grid.gridId, grid }), context),
    handler(req({ event: "grid_export", batchKey: grid.gridId, grid: { ...grid, variant: "teaser" } }), context),
  ]);

  const stored = store._values(`${grid.gridId}:grid_export:`);
  assert.equal(stored.length, 2, "both exports must remain available");
  assert.deepEqual(stored.map(entry => entry.grid.variant).sort(), ["full", "teaser"]);
});

// ---------------------------------------------------------------------------
// Happy path — legacy grid-export (sent by saveShareCard in exportCanvas.ts)
// ---------------------------------------------------------------------------

test("grid-export (legacy): valid payload returns 200 and stores metadata", async () => {
  const { store, context } = makeStoreContext();

  const res = await handler(
    req({
      event: "grid-export",
      batchKey: "2026-08-01:Liu Xueyi",
      actor: "刘学义",
      vibe: "破碎感美人",
      editionTier: "standard",
      resultPositions: [
        { position: 0, thumbnail: "https://images.example/0.jpg", source: "Publisher" },
        { position: 1, thumbnail: "https://images.example/1.jpg", source: null },
      ],
    }),
    context,
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  const [stored] = store._values("2026-08-01:Liu Xueyi:grid-export:");
  assert.equal(stored.actor, "刘学义");
  assert.equal(stored.vibe, "破碎感美人");
  assert.equal(stored.editionTier, "standard");
  assert.equal(stored.resultPositions.length, 2);
});

// ---------------------------------------------------------------------------
// Happy path — single-card events
// ---------------------------------------------------------------------------

test("save event: valid payload returns 200 and stores imageUrl", async () => {
  const { store, context } = makeStoreContext();

  const res = await handler(
    req({ event: "save", batchKey: "batch-1", imageUrl: "https://images.example/card.png" }),
    context,
  );

  assert.equal(res.status, 200);
  const [stored] = store._values("batch-1:save:");
  assert.equal(stored.imageUrl, "https://images.example/card.png");
});

test("collection_save and plan_add preserve bounded attribution fields", async () => {
  const { store, context } = makeStoreContext();
  const payload = {
    actor: "Liu Xueyi",
    vibe: "Shattered Beauty",
    imageUrl: "https://images.example/card.png",
    batchKey: "batch-1",
    capturedDate: "2026-09-05",
  };

  await handler(req({ event: "collection_save", ...payload }), context);
  await handler(req({ event: "plan_add", ...payload }), context);

  for (const event of ["collection_save", "plan_add"]) {
    const [stored] = store._values(`batch-1:${event}:`);
    assert.equal(stored.actor, payload.actor);
    assert.equal(stored.vibe, payload.vibe);
    assert.equal(stored.capturedDate, payload.capturedDate);
    assert.equal(stored.imageUrl, payload.imageUrl);
  }
});

test("Daily Drop events persist only their bounded measurement fields", async () => {
  const { store, context } = makeStoreContext();
  const batchKey = "vibe-atlas:2026-08-31";

  await handler(req({
    event: "daily_drop_engaged",
    batchKey,
    editionDate: "2026-08-31",
    engagementReason: "three_cards",
    email: "must-not-be-stored@example.com",
  }), context);
  await handler(req({
    event: "daily_drop_card_save",
    batchKey,
    editionDate: "2026-08-31",
    position: 4,
    saved: true,
    imageUrl: "https://images.example/private-card.png",
  }), context);

  const [engaged] = store._values(`${batchKey}:daily_drop_engaged:`);
  assert.equal(engaged.editionDate, "2026-08-31");
  assert.equal(engaged.engagementReason, "three_cards");
  assert.equal(engaged.email, undefined);

  const [saved] = store._values(`${batchKey}:daily_drop_card_save:`);
  assert.equal(saved.position, 4);
  assert.equal(saved.saved, true);
  assert.equal(saved.imageUrl, undefined);
});

test("concurrent Daily Drop events are stored as distinct immutable records", async () => {
  const { store, context } = makeStoreContext();
  const payload = {
    event: "daily_drop_view",
    batchKey: "vibe-atlas:2026-08-31",
    editionDate: "2026-08-31",
  };

  await Promise.all([
    handler(req(payload), context),
    handler(req(payload), context),
  ]);

  assert.equal(
    store._values(`${payload.batchKey}:${payload.event}:`).length,
    2,
  );
});

test("Daily Drop events reject invalid dates and unbounded dimensions", async () => {
  const { context } = makeStoreContext();
  const invalidDate = await handler(req({
    event: "daily_drop_view",
    batchKey: "vibe-atlas:today",
    editionDate: "today",
  }), context);
  const invalidPosition = await handler(req({
    event: "daily_drop_card_save",
    batchKey: "vibe-atlas:2026-08-31",
    editionDate: "2026-08-31",
    position: 99,
    saved: true,
  }), context);
  const impossibleDate = await handler(req({
    event: "daily_drop_view",
    batchKey: "vibe-atlas:2026-99-99",
    editionDate: "2026-99-99",
  }), context);
  const invalidReason = await handler(req({
    event: "daily_drop_engaged",
    batchKey: "vibe-atlas:2026-08-31",
    editionDate: "2026-08-31",
    engagementReason: "arbitrary-user-input",
  }), context);

  assert.equal(invalidDate.status, 400);
  assert.equal(impossibleDate.status, 400);
  assert.equal(invalidPosition.status, 400);
  assert.equal(invalidReason.status, 400);
});

test("public fandom game event stores only its bounded content fields", async () => {
  const { store, context } = makeStoreContext();
  const res = await handler(
    req({
      event: "fandom_game_share",
      batchKey: "c-drama-fandom-lg01",
      contentId: "lg01-v1",
      outcomeId: "bamboo-recluse",
      source: "direct",
      email: "must-not-be-stored@example.com",
      collectionId: "private-collection",
    }),
    context,
  );

  assert.equal(res.status, 200);
  const [stored] = store._values("c-drama-fandom-lg01:fandom_game_share:");
  assert.equal(stored.contentId, "lg01-v1");
  assert.equal(stored.outcomeId, "bamboo-recluse");
  assert.equal(stored.source, "direct");
  assert.equal(stored.email, undefined);
  assert.equal(stored.collectionId, undefined);
});

test("public fandom game events reject unbounded outcomes and batch keys", async () => {
  const { context } = makeStoreContext();
  const wrongOutcome = await handler(
    req({
      event: "fandom_game_reveal",
      batchKey: "c-drama-fandom-lg01",
      contentId: "lg01-v1",
      outcomeId: "arbitrary-user-data",
    }),
    context,
  );
  const wrongBatch = await handler(
    req({
      event: "fandom_game_start",
      batchKey: "user-controlled-key",
      contentId: "lg01-v1",
    }),
    context,
  );

  assert.equal(wrongOutcome.status, 400);
  assert.equal(wrongBatch.status, 400);
});

test("public fandom outcome events require a selected fate while start does not", async () => {
  const { context } = makeStoreContext();
  const missingOutcome = await handler(
    req({
      event: "fandom_game_share",
      batchKey: "c-drama-fandom-lg01",
      contentId: "lg01-v1",
      source: "direct",
    }),
    context,
  );
  const startWithoutOutcome = await handler(
    req({
      event: "fandom_game_start",
      batchKey: "c-drama-fandom-lg01",
      contentId: "lg01-v1",
      source: "direct",
    }),
    context,
  );

  assert.equal(missingOutcome.status, 400);
  assert.equal(startWithoutOutcome.status, 200);
});

// ---------------------------------------------------------------------------
// Validation short-circuits (no store interaction needed)
// ---------------------------------------------------------------------------

test("rejects non-POST with 405", async () => {
  const { context } = makeStoreContext();
  const res = await handler({ method: "GET", async json() { return {}; } }, context);
  assert.equal(res.status, 405);
});

test("rejects invalid JSON body with 400", async () => {
  const { context } = makeStoreContext();
  const badReq = { method: "POST", async json() { throw new SyntaxError("bad json"); } };
  const res = await handler(badReq, context);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid JSON/);
});

test("rejects unknown event with 400", async () => {
  const { context } = makeStoreContext();
  const res = await handler(req({ event: "unknown", batchKey: "key-1" }), context);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /Invalid event type/);
});

test("rejects missing batchKey with 400", async () => {
  const { context } = makeStoreContext();
  const res = await handler(req({ event: "save" }), context);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /batchKey/);
});

test("rejects grid_export with invalid grid payload — 400", async () => {
  const { context } = makeStoreContext();
  const res = await handler(
    req({ event: "grid_export", batchKey: "key-1", grid: { gridId: "x" } }),
    context,
  );
  assert.equal(res.status, 400);
});

test("rejects grid_export with unknown grid field — 400", async () => {
  const { context } = makeStoreContext();
  const res = await handler(
    req({
      event: "grid_export",
      batchKey: "vibe-atlas-2026-08-01-actor-1",
      grid: {
        gridId: "vibe-atlas-2026-08-01-actor-1",
        date: "2026-08-01",
        actorId: "actor-1",
        actor: "刘学义",
        actorEn: "Liu Xueyi",
        vibe: "破碎感美人",
        vibeEn: "Shattered Beauty",
        searchSpell: "刘学义 破碎感",
        tier: "standard",
        variant: "full",
        imageIds: ["https://images.example/0.jpg"],
        unrecognisedField: "surprise",
      },
    }),
    context,
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /unknown grid field/);
});

// ---------------------------------------------------------------------------
// Contract: gridExportEventFromRecord payload shape passes validateGridPayload
// ---------------------------------------------------------------------------

test("gridExportEventFromRecord-shaped payload (with ctaSeed) passes server validation", () => {
  const payload = {
    gridId: "vibe-atlas-2026-08-01-actor-1",
    date: "2026-08-01",
    actorId: "actor-1",
    actor: "刘学义",
    actorEn: "Liu Xueyi",
    vibe: "破碎感美人",
    vibeEn: "Shattered Beauty",
    searchSpell: "刘学义 破碎感",
    tier: "standard",
    variant: "full",
    imageIds: ["https://images.example/0.jpg", "https://images.example/1.jpg"],
    ctaSeed: "cta-abc123",
  };
  assert.equal(validateGridPayload(payload), null);
});

test("gridExportEventFromRecord-shaped payload (without ctaSeed) passes server validation", () => {
  const payload = {
    gridId: "vibe-atlas-2026-08-01-actor-1",
    date: "2026-08-01",
    actorId: "actor-1",
    actor: "刘学义",
    actorEn: "Liu Xueyi",
    vibe: "破碎感美人",
    vibeEn: "Shattered Beauty",
    searchSpell: "刘学义 破碎感",
    tier: "standard",
    variant: "teaser",
    imageIds: ["https://images.example/0.jpg"],
  };
  assert.equal(validateGridPayload(payload), null);
});
