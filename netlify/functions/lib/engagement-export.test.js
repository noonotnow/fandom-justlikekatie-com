import test from "node:test";
import assert from "node:assert/strict";
import { createEngagementExportHandler } from "./engagement-export.js";

function memoryStore(seed = {}) {
  const values = new Map(Object.entries(seed));
  let writes = 0;
  return {
    async get(key) { return structuredClone(values.get(key) ?? null); },
    async list() {
      return { blobs: [...values.keys()].map(key => ({ key })) };
    },
    async setJSON() { writes += 1; },
    _writes() { return writes; },
  };
}

function request(query = "") {
  return {
    method: "GET",
    url: `https://example.com/.netlify/functions/engagement-export${query}`,
  };
}

test("exports normalized legacy and immutable engagement records for an admin", async () => {
  const store = memoryStore({
    "legacy:grid-export": [{
      timestamp: "2026-08-01T00:00:00.000Z",
      actor: "Actor",
      vibe: "Vibe",
      email: "private@example.com",
      accountId: "private-account",
      sessionToken: "private-token",
      collection: { cards: ["private-card"] },
      resultPositions: [{
        position: 0,
        thumbnail: "https://images.example/card.jpg",
        source: "Publisher",
        privateNote: "do not export",
      }],
    }],
    "vibe-atlas:2026-09-01:daily_drop_view:1788278400000:event-1": {
      schemaVersion: 2,
      event: "daily_drop_view",
      batchKey: "vibe-atlas:2026-09-01",
      editionDate: "2026-09-01",
      timestamp: "2026-09-01T00:00:00.000Z",
      credential: "private-credential",
    },
  });
  const handler = createEngagementExportHandler({
    auth: { async authenticateAdmin() {} },
    getStore: () => store,
    now: () => new Date("2026-09-05T12:00:00.000Z"),
  });

  const response = await handler(request());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.summary.blobCount, 2);
  assert.equal(body.summary.recordCount, 2);
  assert.equal(body.summary.storage.legacyArrayBlobCount, 1);
  assert.equal(body.summary.storage.immutableBlobCount, 1);
  assert.equal(body.summary.eventCounts["grid-export"], 1);
  assert.equal(body.summary.eventCounts.daily_drop_view, 1);
  assert.equal(body.records[0].batchKey, "legacy");
  assert.equal(body.records[0].email, undefined);
  assert.equal(body.records[0].accountId, undefined);
  assert.equal(body.records[0].sessionToken, undefined);
  assert.equal(body.records[0].collection, undefined);
  assert.equal(body.records[0].resultPositions[0].privateNote, undefined);
  assert.equal(body.records[1].credential, undefined);
  assert.equal(store._writes(), 0, "normalization must never rewrite historical blobs");
});

test("structured grid exports retain only the validated analytics contract", async () => {
  const store = memoryStore({
    "grid-1:grid_export:1788278400000:event-1": {
      event: "grid_export",
      batchKey: "grid-1",
      timestamp: "2026-09-01T00:00:00.000Z",
      grid: {
        gridId: "grid-1",
        date: "2026-09-01",
        actorId: "actor-1",
        actor: "Actor",
        actorEn: "Actor",
        vibe: "Vibe",
        vibeEn: "Vibe",
        searchSpell: "Actor Vibe",
        tier: "standard",
        variant: "full",
        imageIds: ["image-1"],
        accountId: "private-account",
        privateCollection: ["private-card"],
      },
    },
  });
  const handler = createEngagementExportHandler({
    auth: { async authenticateAdmin() {} },
    getStore: () => store,
  });

  const body = await (await handler(request())).json();
  assert.equal(body.records[0].grid.actorId, "actor-1");
  assert.equal(body.records[0].grid.accountId, undefined);
  assert.equal(body.records[0].grid.privateCollection, undefined);
  assert.equal(store._writes(), 0);
});

test("supports summary-only responses and downloadable exports", async () => {
  const handler = createEngagementExportHandler({
    auth: { async authenticateAdmin() {} },
    getStore: () => memoryStore(),
    now: () => new Date("2026-09-05T12:00:00.000Z"),
  });

  const summary = await handler(request("?records=0"));
  assert.equal((await summary.json()).records, undefined);

  const download = await handler(request("?download=1"));
  assert.match(download.headers.get("Content-Disposition"), /fandom-engagement-2026-09-05\.json/);
});

test("requires admin authentication", async () => {
  const handler = createEngagementExportHandler({
    auth: { async authenticateAdmin() { throw Object.assign(new Error("Admin access is required."), { status: 403 }); } },
    getStore: () => memoryStore(),
  });

  const response = await handler(request());
  assert.equal(response.status, 403);
});
