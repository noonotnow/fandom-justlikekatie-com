import { randomUUID } from "node:crypto";
import {
  GRID_MANIFEST_PREFIX,
  gridManifestKey,
  isGridManifest,
} from "./publication-manifest.js";

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

function editionProjection(manifest, receipts) {
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

async function listEditions(publicationStore, operationsStore, limit) {
  const listing = await publicationStore.list({ prefix: GRID_MANIFEST_PREFIX });
  const keys = (listing?.blobs ?? [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string")
    .sort()
    .reverse()
    .slice(0, limit);
  const manifests = await Promise.all(keys.map(key => publicationStore.get(key, {
    type: "json",
    consistency: "strong",
  })));
  const valid = manifests.filter(isGridManifest);
  const receipts = await Promise.all(
    valid.map(manifest => readReceipts(operationsStore, manifest.publicationDate)),
  );
  return valid.map((manifest, index) => editionProjection(manifest, receipts[index]));
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
        return json(200, {
          edition: editionProjection(
            manifest,
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
      return json(201, {
        edition: editionProjection(
          manifest,
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
