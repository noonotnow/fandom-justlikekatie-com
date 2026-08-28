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
    if (item.media !== undefined) validateCollectionMedia(item.media);
    if (item.misprintMetadata !== undefined) validateMisprintMetadata(item.misprintMetadata);
    for (const image of item.images) {
      if (image.legendaryMisprint !== undefined) validateLegendaryMisprint(image.legendaryMisprint);
    }
    if (item.images.some(image => image.media !== undefined)) {
      for (const image of item.images) {
        if (image.media !== undefined) {
          validateCollectionMedia(image.media);
          if (image.imageUrl !== image.media.deliveryUrl) {
            throw new TypeError("Collection MEDIA URLs do not match the saved descriptor.");
          }
        }
      }
    }
    if (item.media !== undefined && item.images[0].imageUrl !== item.media.deliveryUrl) {
      throw new TypeError("Collection MEDIA URLs do not match the saved descriptor.");
    }
    return;
  }
  if (
    !item
    || typeof item.imageUrl !== "string"
    || typeof item.thumbnailUrl !== "string"
    || item.imageUrl.startsWith("data:")
    || item.thumbnailUrl.startsWith("data:")
    || item.imageUrl.length > 4096
    || item.thumbnailUrl.length > 4096
    || (item.resultId != null && (typeof item.resultId !== "string" || item.resultId.length > 4096))
  ) throw new TypeError("Collection item is invalid.");
  if (item.media !== undefined) {
    validateCollectionMedia(item.media, item.localId);
    if (item.imageUrl !== item.media.deliveryUrl || item.thumbnailUrl !== item.media.thumbnailUrl) {
      throw new TypeError("Collection MEDIA URLs do not match the saved descriptor.");
    }
  }
  if (item.legendaryMisprint !== undefined) validateLegendaryMisprint(item.legendaryMisprint);
}

function validateMisprintMetadata(metadata) {
  if (
    !metadata
    || metadata.confirmedByCreator !== true
    || !Array.isArray(metadata.intendedIdentities)
    || !Array.isArray(metadata.unexpectedImageIdentities)
    || !Array.isArray(metadata.sourceResultIds)
    || [...metadata.intendedIdentities, ...metadata.unexpectedImageIdentities, ...metadata.sourceResultIds]
      .some(value => typeof value !== "string" || value.length > 4096)
  ) throw new TypeError("Legendary Misprint metadata is invalid.");
}

function validateLegendaryMisprint(misprint) {
  if (
    !misprint
    || misprint.kind !== "legendary-misprint"
    || misprint.confirmedByCreator !== true
    || typeof misprint.markedAt !== "string"
    || typeof misprint.intendedIdentity?.actor !== "string"
    || typeof misprint.intendedIdentity?.actorEn !== "string"
    || typeof misprint.intendedIdentity?.vibe !== "string"
    || typeof misprint.intendedIdentity?.vibeEn !== "string"
    || !["vibe-atlas", "middle-earth"].includes(misprint.intendedIdentity?.collectionScope)
    || typeof misprint.unexpectedImageIdentity?.label !== "string"
    || misprint.unexpectedImageIdentity.label.length < 1
    || misprint.unexpectedImageIdentity.label.length > 160
    || typeof misprint.provenance?.imageUrl !== "string"
    || misprint.provenance.imageUrl.length > 4096
  ) throw new TypeError("Legendary Misprint provenance is invalid.");
}

function validateCollectionMedia(media, localId) {
  if (
    !media
    || media.schemaVersion !== 1
    || typeof media.assetId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(media.assetId)
    || typeof media.deliveryUrl !== "string"
    || typeof media.thumbnailUrl !== "string"
    || !["image/png", "image/jpeg", "image/webp"].includes(media.mimeType)
    || !Number.isInteger(media.sizeBytes)
    || media.sizeBytes < 1
    || typeof media.checksum !== "string"
    || !/^[0-9a-f]{64}$/.test(media.checksum)
    || !Number.isInteger(media.dimensions?.width)
    || !Number.isInteger(media.dimensions?.height)
    || media.dimensions.width < 1
    || media.dimensions.height < 1
    || media.association?.type !== "collection"
    || typeof media.association.id !== "string"
    || typeof media.association.itemId !== "string"
    || (localId && media.association.itemId !== localId)
  ) throw new TypeError("Collection MEDIA reference is invalid.");
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
