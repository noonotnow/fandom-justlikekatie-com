import { json } from "./public-auth.js";
import { GRID_ALLOWED_FIELDS } from "./grid-export-validation.js";

const STORE_NAME = "engagement";
const RECORD_FIELDS = [
  "schemaVersion",
  "timestamp",
  "imageUrl",
  "actor",
  "vibe",
  "capturedDate",
  "editionTier",
  "contentId",
  "outcomeId",
  "source",
  "editionDate",
  "position",
  "saved",
  "engagementReason",
  "shareMethod",
];

export function createEngagementExportHandler({
  auth,
  getStore,
  now = () => new Date(),
}) {
  return async (req, context) => {
    try {
      await auth.authenticateAdmin(req, context);
      if (req.method !== "GET") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET" });
      }

      const store = getStore(STORE_NAME, context);
      const blobs = await listAllBlobs(store);
      const normalized = await Promise.all(blobs.map(blob => normalizeBlob(store, blob)));
      const records = normalized.flatMap(item => item.records);
      const summary = summarize(normalized, records);
      const url = new URL(req.url);
      const includeRecords = url.searchParams.get("records") !== "0";
      const payload = {
        schemaVersion: 1,
        generatedAt: now().toISOString(),
        store: STORE_NAME,
        summary,
        ...(includeRecords ? { records } : {}),
      };
      const headers = url.searchParams.get("download") === "1"
        ? { "Content-Disposition": `attachment; filename="fandom-engagement-${payload.generatedAt.slice(0, 10)}.json"` }
        : {};
      return json(200, payload, headers);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      if (status === 500) console.error("[engagement-export] request failed", error);
      return json(status, { error: status === 500 ? "Engagement export unavailable." : error.message });
    }
  };
}

async function listAllBlobs(store) {
  const listing = store.list({ paginate: true });
  if (listing && typeof listing[Symbol.asyncIterator] === "function") {
    const blobs = [];
    for await (const page of listing) blobs.push(...(page.blobs ?? []));
    return blobs;
  }
  return (await listing)?.blobs ?? [];
}

async function normalizeBlob(store, blob) {
  const key = typeof blob?.key === "string" ? blob.key : "";
  if (!key) return { key, storage: "malformed", records: [] };
  let value;
  try {
    value = await store.get(key, { type: "json", consistency: "strong" });
  } catch {
    return { key, storage: "malformed", records: [] };
  }
  if (Array.isArray(value)) {
    return {
      key,
      storage: "legacy-array",
      records: value
        .filter(entry => entry && typeof entry === "object")
        .map(entry => normalizeRecord(entry, key)),
    };
  }
  if (value && typeof value === "object") {
    return { key, storage: "immutable", records: [normalizeRecord(value, key)] };
  }
  return { key, storage: "malformed", records: [] };
}

function normalizeRecord(entry, key) {
  const event = typeof entry.event === "string" ? entry.event : eventFromLegacyKey(key);
  const batchKey = typeof entry.batchKey === "string"
    ? entry.batchKey
    : event && key.endsWith(`:${event}`)
      ? key.slice(0, -(event.length + 1))
      : null;
  const record = {
    event,
    batchKey,
    storageKey: key,
  };
  for (const field of RECORD_FIELDS) {
    if (entry[field] !== undefined) record[field] = entry[field];
  }
  if (Array.isArray(entry.resultPositions)) {
    record.resultPositions = entry.resultPositions.map(position => ({
      position: position?.position,
      thumbnail: position?.thumbnail,
      source: position?.source ?? null,
    }));
  }
  if (entry.grid && typeof entry.grid === "object" && !Array.isArray(entry.grid)) {
    record.grid = Object.fromEntries(
      Object.entries(entry.grid).filter(([field]) => GRID_ALLOWED_FIELDS.has(field)),
    );
  }
  return record;
}

function eventFromLegacyKey(key) {
  const segments = key.split(":");
  const immutableSuffix = segments.length >= 3 && /^\d{10,}$/.test(segments.at(-2) ?? "");
  return immutableSuffix ? segments.at(-3) ?? null : segments.at(-1) ?? null;
}

function summarize(blobs, records) {
  const eventCounts = {};
  let firstTimestamp = null;
  let lastTimestamp = null;
  let missingEvent = 0;
  let missingBatchKey = 0;
  let unattributedCollectionEvents = 0;

  for (const record of records) {
    if (record.event) eventCounts[record.event] = (eventCounts[record.event] ?? 0) + 1;
    else missingEvent += 1;
    if (!record.batchKey) missingBatchKey += 1;
    if (
      (record.event === "collection_save" || record.event === "plan_add")
      && (!record.actor || !record.vibe)
    ) unattributedCollectionEvents += 1;
    if (typeof record.timestamp === "string" && Number.isFinite(Date.parse(record.timestamp))) {
      if (!firstTimestamp || record.timestamp < firstTimestamp) firstTimestamp = record.timestamp;
      if (!lastTimestamp || record.timestamp > lastTimestamp) lastTimestamp = record.timestamp;
    }
  }

  return {
    blobCount: blobs.length,
    recordCount: records.length,
    storage: {
      immutableBlobCount: blobs.filter(item => item.storage === "immutable").length,
      legacyArrayBlobCount: blobs.filter(item => item.storage === "legacy-array").length,
      malformedBlobCount: blobs.filter(item => item.storage === "malformed").length,
    },
    eventCounts,
    firstTimestamp,
    lastTimestamp,
    dataQuality: {
      missingEvent,
      missingBatchKey,
      unattributedCollectionEvents,
    },
  };
}
