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
 *  - Append behaviour: second write appends rather than replacing
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
    async setJSON(key, value) {
      db.set(key, JSON.stringify(value));
    },
    /** Read back stored JSON for assertions. */
    _read(key) {
      const raw = db.get(key);
      return raw ? JSON.parse(raw) : null;
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
  const stored = store._read(`${grid.gridId}:grid_export`);
  assert.ok(Array.isArray(stored), "stored value must be an array");
  assert.equal(stored.length, 1);
  assert.deepEqual(stored[0].grid, grid);
  assert.ok(stored[0].timestamp, "entry must have a timestamp");
});

test("grid_export: second write appends rather than replacing", async () => {
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

  await handler(req({ event: "grid_export", batchKey: grid.gridId, grid }), context);
  await handler(req({ event: "grid_export", batchKey: grid.gridId, grid: { ...grid, variant: "teaser" } }), context);

  const stored = store._read(`${grid.gridId}:grid_export`);
  assert.equal(stored.length, 2, "second export must be appended, not overwritten");
  assert.equal(stored[0].grid.variant, "full");
  assert.equal(stored[1].grid.variant, "teaser");
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

  const stored = store._read("2026-08-01:Liu Xueyi:grid-export");
  assert.ok(Array.isArray(stored));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].actor, "刘学义");
  assert.equal(stored[0].vibe, "破碎感美人");
  assert.equal(stored[0].editionTier, "standard");
  assert.equal(stored[0].resultPositions.length, 2);
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
  const stored = store._read("batch-1:save");
  assert.ok(Array.isArray(stored));
  assert.equal(stored[0].imageUrl, "https://images.example/card.png");
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
