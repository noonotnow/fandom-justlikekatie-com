import { randomUUID } from "node:crypto";

const MAX_OPERATIONS = 100;

export async function syncCollection(store, accountId, input, now = () => new Date()) {
  validateSync(input);
  const key = `users/${accountId}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithMetadata(store, key);
    const collection = entry?.data || emptyCollection(accountId);
    const next = structuredClone(collection);
    const mappings = {};
    for (const operation of input.operations) applyOperation(next, operation, mappings, now());
    const result = await store.setJSON(
      key,
      next,
      entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
    );
    if (result?.modified === false) continue;
    const verified = await getWithMetadata(store, key);
    if (verified?.data && operationsPresent(verified.data, input.operations)) {
      return delta(
        verified.data,
        input.cursor,
        mappings,
        input.operations.map(operation => operation.mutationId),
      );
    }
  }
  throw new Error("Collection changed too frequently. Retry the sync.");
}

export async function readCollection(store, accountId, cursor = 0) {
  const data = await store.get(`users/${accountId}`, { type: "json", consistency: "strong" });
  return delta(data || emptyCollection(accountId), cursor, {});
}

function applyOperation(collection, operation, mappings, current) {
  const replay = collection.processed[operation.mutationId];
  if (replay) {
    if (replay.serverId) mappings[operation.localId] = replay.serverId;
    return;
  }
  collection.revision += 1;
  const revision = collection.revision;
  if (operation.type === "upsert") {
    const sourceKey = operation.item.kind === "grid"
      ? `grid:${operation.item.id}`
      : operation.item.resultId
        ? `result:${operation.item.resultId}`
        : `local:${operation.localId}`;
    const existing = Object.values(collection.items).find(item => item.sourceKey === sourceKey);
    const serverId = existing?.id || randomUUID();
    collection.items[serverId] = {
      ...operation.item,
      ...(operation.item.kind === "grid" ? { artifactId: operation.item.id } : {}),
      id: serverId,
      localId: operation.localId,
      sourceKey,
      createdAt: existing?.createdAt || current.toISOString(),
      updatedAt: current.toISOString(),
      revision,
    };
    delete collection.tombstones[serverId];
    mappings[operation.localId] = serverId;
    collection.processed[operation.mutationId] = { revision, serverId };
  } else {
    const serverId = operation.serverId
      || Object.values(collection.items).find(item => item.localId === operation.localId)?.id;
    if (serverId) {
      delete collection.items[serverId];
      collection.tombstones[serverId] = {
        id: serverId,
        localId: operation.localId,
        revision,
        deletedAt: current.toISOString(),
      };
    }
    collection.processed[operation.mutationId] = { revision, serverId: serverId || null };
  }
}

function delta(collection, cursor, mappings, acknowledgedMutationIds = []) {
  const normalizedCursor = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
  return {
    schemaVersion: 1,
    revision: collection.revision,
    cursor: collection.revision,
    items: Object.values(collection.items).filter(item => item.revision > normalizedCursor),
    tombstones: Object.values(collection.tombstones).filter(item => item.revision > normalizedCursor),
    mappings,
    acknowledgedMutationIds,
  };
}

function emptyCollection(accountId) {
  return {
    schemaVersion: 1,
    accountId,
    revision: 0,
    items: {},
    tombstones: {},
    processed: {},
  };
}

function validateSync(input) {
  if (!input || input.schemaVersion !== 1 || typeof input.clientId !== "string") {
    throw new TypeError("Collection sync request is invalid.");
  }
  if (!Array.isArray(input.operations) || input.operations.length > MAX_OPERATIONS) {
    throw new TypeError("Collection operations are invalid.");
  }
  for (const operation of input.operations) {
    if (
      !operation
      || !["upsert", "delete"].includes(operation.type)
      || typeof operation.mutationId !== "string"
      || typeof operation.localId !== "string"
      || operation.mutationId.length > 120
      || operation.localId.length > 120
    ) throw new TypeError("Collection mutation is invalid.");
    if (operation.type === "upsert") validateItem(operation.item);
  }
}

function validateItem(item) {
  if (item?.kind === "grid") {
    if (
      typeof item.id !== "string"
      || item.id.length > 512
      || item.schemaVersion !== 1
      || item.rendererVersion !== "vibe-atlas-v1"
      || !Array.isArray(item.images)
      || item.images.length < 1
      || item.images.length > 9
      || item.images.some(image => (
        !image
        || typeof image.resultId !== "string"
        || typeof image.imageUrl !== "string"
        || image.resultId.length > 4096
        || image.imageUrl.length > 4096
      ))
    ) throw new TypeError("Collection grid is invalid.");
    return;
  }
  if (
    !item
    || typeof item.imageUrl !== "string"
    || typeof item.thumbnailUrl !== "string"
    || item.imageUrl.length > 4096
    || item.thumbnailUrl.length > 4096
    || (item.resultId != null && (typeof item.resultId !== "string" || item.resultId.length > 4096))
  ) throw new TypeError("Collection item is invalid.");
}

function operationsPresent(collection, operations) {
  return operations.every(operation => collection.processed[operation.mutationId]);
}

async function getWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}
