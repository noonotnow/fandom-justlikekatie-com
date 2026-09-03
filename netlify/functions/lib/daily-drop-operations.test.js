import test from "node:test";
import assert from "node:assert/strict";
import {
  createDailyDropOperationsHandler,
  dailyDropReceiptKey,
} from "./daily-drop-operations.js";
import { gridManifestKey } from "./publication-manifest.js";

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.get(key) ?? null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); },
    async list({ prefix }) {
      return {
        blobs: [...values.keys()]
          .filter(key => key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
  };
}

function manifest(date = "2026-08-31") {
  return {
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: `vibe-atlas-${date}-board`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: `${date}T04:00:00.000Z`,
    boardHash: "a".repeat(64),
    actor: {
      id: "actor-1",
      name: "演员",
      nameEn: "Actor",
      accentColor: "#c9a96e",
    },
    vibe: { key: "actor-1:0", idx: 0, label: "氛围", labelEn: "Vibe" },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds: Array.from({ length: 9 }, (_, index) => `c-${index}`) },
    cards: Array.from({ length: 9 }, (_, position) => ({
      position,
      candidateId: `c-${position}`,
      title: `Card ${position}`,
      link: "https://example.com/card",
      source: "Example",
      sourceUrl: `https://example.com/${position}.jpg`,
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position).padStart(12, "0")}`,
        deliveryUrl: `https://media.example.com/${position}.jpg`,
        thumbnailUrl: `https://media.example.com/thumb-${position}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100,
        checksum: "b".repeat(64),
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

function request(method = "GET", body) {
  return {
    method,
    url: "https://example.com/.netlify/functions/daily-drop-operations",
    async json() { return body; },
  };
}

function harness() {
  const publicationStore = memoryStore();
  const operationsStore = memoryStore();
  const handler = createDailyDropOperationsHandler({
    auth: { async authenticateAdmin() { return { accountId: "operator-1" }; } },
    getPublicationStore: () => publicationStore,
    getOperationsStore: () => operationsStore,
    now: () => new Date("2026-09-01T10:00:00.000Z"),
    createReceiptId: () => "receipt-1",
  });
  return { handler, publicationStore, operationsStore };
}

test("lists immutable Daily Drop editions with attached publication receipts", async () => {
  const { handler, publicationStore, operationsStore } = harness();
  const edition = manifest();
  await publicationStore.setJSON(gridManifestKey(edition.publicationDate), edition);
  await operationsStore.setJSON(dailyDropReceiptKey(edition.publicationDate, "rednote"), {
    receiptId: "receipt-existing",
    channel: "rednote",
    publicUrl: "https://www.xiaohongshu.com/explore/post-1",
  });

  const response = await handler(request(), {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.editions[0].editionId, edition.idempotencyKey);
  assert.equal(body.editions[0].boardHash, edition.boardHash);
  assert.equal(body.editions[0].publicationReceipts[0].channel, "rednote");
});

test("records one idempotent manual publication receipt per channel", async () => {
  const { handler, publicationStore, operationsStore } = harness();
  const edition = manifest();
  await publicationStore.setJSON(gridManifestKey(edition.publicationDate), edition);
  const payload = {
    action: "record_publication_receipt",
    publicationDate: edition.publicationDate,
    channel: "rednote",
    publicUrl: "https://www.xiaohongshu.com/explore/post-1",
  };

  const created = await handler(request("POST", payload), {});
  const repeated = await handler(request("POST", payload), {});
  const receipt = await operationsStore.get(
    dailyDropReceiptKey(edition.publicationDate, "rednote"),
  );

  assert.equal(created.status, 201);
  assert.equal(repeated.status, 200);
  assert.equal(receipt.manifestId, edition.manifestId);
  assert.equal(receipt.channel, "rednote");
});

test("rejects receipts without a manifest or with conflicting channel lineage", async () => {
  const { handler, publicationStore } = harness();
  const missing = await handler(request("POST", {
    action: "record_publication_receipt",
    publicationDate: "2026-08-31",
    channel: "rednote",
    publicUrl: "https://www.xiaohongshu.com/explore/post-1",
  }), {});
  const edition = manifest();
  await publicationStore.setJSON(gridManifestKey(edition.publicationDate), edition);
  await handler(request("POST", {
    action: "record_publication_receipt",
    publicationDate: "2026-08-31",
    channel: "rednote",
    publicUrl: "https://www.xiaohongshu.com/explore/post-1",
  }), {});
  const conflict = await handler(request("POST", {
    action: "record_publication_receipt",
    publicationDate: "2026-08-31",
    channel: "rednote",
    publicUrl: "https://www.xiaohongshu.com/explore/post-2",
  }), {});

  assert.equal(missing.status, 404);
  assert.equal(conflict.status, 409);
});
