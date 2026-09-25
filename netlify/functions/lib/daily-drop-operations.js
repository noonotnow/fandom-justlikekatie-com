import { randomUUID } from "node:crypto";
import {
  GRID_MANIFEST_PREFIX,
  gridManifestKey,
  isGridManifest,
  manifestPayload,
} from "./publication-manifest.js";
import { archiveReaderLinkDiagnostic } from "./archive-access.js";

const RECEIPT_PREFIX = "vibeAtlas:publication-receipts:v1:";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNELS = ["rednote", "weibo", "instagram"];
const CHANNEL_SET = new Set(CHANNELS);

export const dailyDropReceiptKey = (date, channel) =>
  `${RECEIPT_PREFIX}${date}:${channel}`;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isPublicUrl(value) {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function manifestEditionProjection(manifest, payload, receipts) {
  return {
    schemaVersion: 1,
    editionId: manifest.idempotencyKey,
    publicationDate: manifest.publicationDate,
    publishedAt: manifest.publishedAt,
    manifestId: manifest.manifestId,
    boardHash: manifest.boardHash,
    actor: {
      id: manifest.actor.id,
      name: manifest.actor.name,
      shortNameEn: manifest.actor.nameEn,
    },
    vibe: {
      key: manifest.vibe.key,
      label: manifest.vibe.label,
      labelEn: manifest.vibe.labelEn,
    },
    cardCount: manifest.cardCount,
    readerLinks: archiveReaderLinkDiagnostic(payload),
    publicationReceipts: receipts,
  };
}

function historicalEditionProjection(payload, version, receipts) {
  return {
    schemaVersion: 1,
    editionId: `starOfDay:${version}:${payload.date}`,
    publicationDate: payload.date,
    publishedAt: payload.generatedAt,
    manifestId: null,
    boardHash: null,
    actor: {
      id: payload.actorId,
      name: payload.actorName,
      shortNameEn: payload.actorShortNameEn,
    },
    vibe: {
      key: typeof payload.actorId === "string" && Number.isInteger(payload.vibeIdx)
        ? `${payload.actorId}:${payload.vibeIdx}`
        : null,
      label: payload.vibeLabel,
      labelEn: payload.vibeLabelEn,
    },
    cardCount: Array.isArray(payload.displayResults) ? payload.displayResults.length : 0,
    readerLinks: archiveReaderLinkDiagnostic(payload),
    publicationReceipts: receipts,
  };
}

async function readReceipts(store, date) {
  const values = await Promise.all(CHANNELS.map(channel =>
    store.get(dailyDropReceiptKey(date, channel), {
      type: "json",
      consistency: "strong",
    })));
  return values.filter(value => value && typeof value === "object");
}

async function readStoredArchivePayload(store, date) {
  const listing = await store.list({ prefix: "starOfDay:" });
  let selected = null;
  for (const blob of listing?.blobs ?? []) {
    const match = String(blob?.key || "").match(/^starOfDay:(v(\d+)):(\d{4}-\d{2}-\d{2})$/);
    if (!match || match[3] !== date) continue;
    if (!selected || Number(match[2]) > selected.number) {
      selected = { key: blob.key, number: Number(match[2]) };
    }
  }
  return selected
    ? store.get(selected.key, { type: "json", consistency: "strong" })
    : null;
}

async function listEditions(publicationStore, operationsStore, limit) {
  const [manifestListing, historicalListing] = await Promise.all([
    publicationStore.list({ prefix: GRID_MANIFEST_PREFIX }),
    publicationStore.list({ prefix: "starOfDay:" }),
  ]);
  const manifestKeys = new Map((manifestListing?.blobs ?? [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string" && key.startsWith(GRID_MANIFEST_PREFIX))
    .map(key => [key.slice(GRID_MANIFEST_PREFIX.length), key]));
  const historicalKeys = new Map();
  for (const blob of historicalListing?.blobs ?? []) {
    const match = String(blob?.key || "").match(/^starOfDay:(v(\d+)):(\d{4}-\d{2}-\d{2})$/);
    if (!match) continue;
    const current = historicalKeys.get(match[3]);
    if (!current || Number(match[2]) > current.number) {
      historicalKeys.set(match[3], {
        key: blob.key,
        version: match[1],
        number: Number(match[2]),
      });
    }
  }
  const dates = [...new Set([...manifestKeys.keys(), ...historicalKeys.keys()])]
    .sort()
    .reverse()
    .slice(0, limit);
  const records = await Promise.all(dates.map(async date => {
    const [manifest, payload, receipts] = await Promise.all([
      manifestKeys.has(date)
        ? publicationStore.get(manifestKeys.get(date), {
          type: "json",
          consistency: "strong",
        })
        : null,
      historicalKeys.has(date)
        ? publicationStore.get(historicalKeys.get(date).key, {
          type: "json",
          consistency: "strong",
        })
        : null,
      readReceipts(operationsStore, date),
    ]);
    if (isGridManifest(manifest)) {
      return manifestEditionProjection(manifest, payload ?? manifestPayload(manifest), receipts);
    }
    if (payload?.date === date && payload?.actorName && payload?.vibeLabel) {
      return historicalEditionProjection(payload, historicalKeys.get(date).version, receipts);
    }
    return null;
  }));
  return records.filter(Boolean);
}

export function createDailyDropOperationsHandler({
  auth,
  getPublicationStore,
  getOperationsStore,
  now = () => new Date(),
  createReceiptId = randomUUID,
}) {
  return async (req, context) => {
    try {
      await auth.authenticateAdmin(req, context);
      const publicationStore = getPublicationStore(context);
      const operationsStore = getOperationsStore(context);

      if (req.method === "GET") {
        const url = new URL(req.url);
        const requestedLimit = Number(url.searchParams.get("limit") ?? 14);
        const limit = Number.isInteger(requestedLimit)
          ? Math.min(Math.max(requestedLimit, 1), 31)
          : 14;
        return json(200, {
          schemaVersion: 1,
          editions: await listEditions(publicationStore, operationsStore, limit),
        });
      }

      if (req.method !== "POST") return json(405, { error: "Method not allowed." });
      let body;
      try {
        body = await req.json();
      } catch {
        return json(400, { error: "Invalid JSON." });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return json(400, { error: "Invalid request body." });
      }
      if (body?.action !== "record_publication_receipt") {
        return json(400, { error: "Unknown Daily Drop operation." });
      }

      const { publicationDate, channel, publicUrl } = body;
      if (
        !DATE_RE.test(publicationDate)
        || !CHANNEL_SET.has(channel)
        || !isPublicUrl(publicUrl)
        || (body.publishedAt !== undefined
          && (typeof body.publishedAt !== "string"
            || !Number.isFinite(Date.parse(body.publishedAt))))
      ) {
        return json(400, { error: "Publication date, channel, or public URL is invalid." });
      }

      const manifest = await publicationStore.get(gridManifestKey(publicationDate), {
        type: "json",
        consistency: "strong",
      });
      if (!isGridManifest(manifest)) {
        return json(404, { error: "No immutable Daily Drop manifest exists for that date." });
      }

      const receiptKey = dailyDropReceiptKey(publicationDate, channel);
      const existing = await operationsStore.get(receiptKey, {
        type: "json",
        consistency: "strong",
      });
      if (existing) {
        if (existing.publicUrl !== publicUrl) {
          return json(409, {
            error: `A ${channel} publication receipt is already attached to this edition.`,
          });
        }
        const storedPayload = await readStoredArchivePayload(
          publicationStore,
          publicationDate,
        );
        return json(200, {
          edition: manifestEditionProjection(
            manifest,
            storedPayload ?? manifestPayload(manifest),
            await readReceipts(operationsStore, publicationDate),
          ),
        });
      }

      const receipt = {
        schemaVersion: 1,
        receiptId: createReceiptId(),
        editionId: manifest.idempotencyKey,
        manifestId: manifest.manifestId,
        channel,
        publicUrl,
        publishedAt: typeof body.publishedAt === "string"
          && Number.isFinite(Date.parse(body.publishedAt))
          ? new Date(body.publishedAt).toISOString()
          : now().toISOString(),
        recordedAt: now().toISOString(),
      };
      await operationsStore.setJSON(receiptKey, receipt, { onlyIfNew: true });
      const authoritative = await operationsStore.get(receiptKey, {
        type: "json",
        consistency: "strong",
      });
      if (!authoritative || authoritative.publicUrl !== publicUrl) {
        return json(409, {
          error: `A ${channel} publication receipt is already attached to this edition.`,
        });
      }
      const storedPayload = await readStoredArchivePayload(
        publicationStore,
        publicationDate,
      );
      return json(201, {
          edition: manifestEditionProjection(
            manifest,
          storedPayload ?? manifestPayload(manifest),
          await readReceipts(operationsStore, publicationDate),
        ),
      });
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : 500;
      return json(status, {
        error: status === 500
          ? "Daily Drop operations are unavailable."
          : error.message,
      });
    }
  };
}
