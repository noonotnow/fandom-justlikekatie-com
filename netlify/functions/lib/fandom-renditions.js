import { createHash } from "node:crypto";
import { secureEqual } from "./public-auth.js";

const MAX_REQUEST_BYTES = 256 * 1024;
const HANDOFF_SCHEMA = "create.fandom-rendition-handoff.v1";
const RECEIPT_SCHEMA = "create.fandom-rendition-receipt.v1";
const DESTINATION = "fandom-website";
const VERDICTS = new Set(["confirm", "stretch", "contradict", "propose"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PROPOSED_VIBE_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class RequestError extends Error {
  constructor(message, status = 400, code = "FANDOM_RENDITION_INVALID_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fandomRenditionHandoffKey = (renditionId, renditionVersion) =>
  `handoffs/${encodeURIComponent(renditionId)}/v${renditionVersion}`;

export const fandomRenditionReceiptKey = (renditionId, renditionVersion) =>
  `receipts/${encodeURIComponent(renditionId)}/v${renditionVersion}`;

export function createFandomRenditionsHandler({
  env = process.env,
  auth,
  getStore,
  actorPacks,
  now = () => new Date(),
} = {}) {
  const catalogue = buildCatalogue(actorPacks);

  return async function fandomRenditions(req, context) {
    try {
      if (req.method === "POST") {
        const authorization = await authorizeIntake(req, context, env, auth);
        const handoff = validateHandoff(await readJson(req), catalogue);
        const store = getStore(context);
        const key = fandomRenditionHandoffKey(
          handoff.renditionId,
          handoff.renditionVersion,
        );
        const digest = digestJson(handoff);
        const existing = await getJson(store, key);
        if (existing) {
          if (existing.handoffDigest !== digest) {
            throw new RequestError(
              "A different authorized handoff already exists for this Rendition version.",
              409,
              "FANDOM_RENDITION_HANDOFF_CONFLICT",
            );
          }
          return json(200, { rendition: publicRendition(existing) });
        }

        const record = {
          schemaVersion: 1,
          status: "authorized",
          handoff,
          handoffDigest: digest,
          targeting: projectTargeting(handoff.domainHints, catalogue),
          receivedAt: now().toISOString(),
          receivedBy: authorization,
        };
        const write = await store.setJSON(key, record, { onlyIfNew: true });
        const authoritative = write?.modified === false
          ? await getJson(store, key)
          : record;
        if (!authoritative || authoritative.handoffDigest !== digest) {
          throw new RequestError(
            "A different authorized handoff already exists for this Rendition version.",
            409,
            "FANDOM_RENDITION_HANDOFF_CONFLICT",
          );
        }
        return json(write?.modified === false ? 200 : 201, {
          rendition: publicRendition(authoritative),
        });
      }

      if (req.method === "PUT") {
        const operator = await authorizeAdminMutation(req, context, auth);
        const receipt = validateReceipt(await readJson(req), catalogue, env);
        const store = getStore(context);
        const handoffKey = fandomRenditionHandoffKey(
          receipt.renditionId,
          receipt.renditionVersion,
        );
        const handoffRecord = await getJson(store, handoffKey);
        if (!handoffRecord) {
          throw new RequestError(
            "The authorized Rendition version was not found.",
            404,
            "FANDOM_RENDITION_HANDOFF_NOT_FOUND",
          );
        }
        assertReceiptLineage(receipt, handoffRecord.handoff);

        const key = fandomRenditionReceiptKey(
          receipt.renditionId,
          receipt.renditionVersion,
        );
        const digest = digestJson(receipt);
        const existing = await getJson(store, key);
        if (existing) {
          if (existing.receiptDigest !== digest) {
            throw new RequestError(
              "A different publication receipt already exists for this Rendition version.",
              409,
              "FANDOM_RENDITION_RECEIPT_CONFLICT",
            );
          }
          return json(200, { receipt: existing.receipt });
        }

        const record = {
          schemaVersion: 1,
          receipt,
          receiptDigest: digest,
          recordedAt: now().toISOString(),
          recordedBy: operator,
        };
        const write = await store.setJSON(key, record, { onlyIfNew: true });
        const authoritative = write?.modified === false
          ? await getJson(store, key)
          : record;
        if (!authoritative || authoritative.receiptDigest !== digest) {
          throw new RequestError(
            "A different publication receipt already exists for this Rendition version.",
            409,
            "FANDOM_RENDITION_RECEIPT_CONFLICT",
          );
        }
        return json(write?.modified === false ? 200 : 201, {
          receipt: authoritative.receipt,
        });
      }

      if (req.method === "GET") {
        await authorizeAdmin(req, context, auth);
        const store = getStore(context);
        const url = new URL(req.url);
        const renditionId = url.searchParams.get("renditionId");
        const renditionVersion = Number(url.searchParams.get("renditionVersion"));
        if (renditionId !== null) {
          requireId(renditionId, "renditionId");
          requireVersion(renditionVersion, "renditionVersion");
          const record = await getJson(
            store,
            fandomRenditionHandoffKey(renditionId, renditionVersion),
          );
          if (!record) {
            throw new RequestError(
              "The authorized Rendition version was not found.",
              404,
              "FANDOM_RENDITION_HANDOFF_NOT_FOUND",
            );
          }
          const receipt = await getJson(
            store,
            fandomRenditionReceiptKey(renditionId, renditionVersion),
          );
          return json(200, {
            rendition: publicRendition(record, receipt?.receipt),
          });
        }

        const listing = await store.list({ prefix: "handoffs/" });
        const keys = (listing?.blobs ?? [])
          .map(blob => blob?.key)
          .filter(key => typeof key === "string")
          .sort()
          .reverse()
          .slice(0, 50);
        const records = await Promise.all(keys.map(key => getJson(store, key)));
        const validRecords = records.filter(Boolean);
        const receipts = await Promise.all(validRecords.map(record => getJson(
          store,
          fandomRenditionReceiptKey(
            record.handoff.renditionId,
            record.handoff.renditionVersion,
          ),
        )));
        return json(200, {
          renditions: validRecords.map((record, index) =>
            publicRendition(record, receipts[index]?.receipt)),
        });
      }

      return json(405, {
        error: "Method not allowed.",
        code: "FANDOM_RENDITION_METHOD_NOT_ALLOWED",
      }, { Allow: "GET, POST, PUT" });
    } catch (error) {
      if (error instanceof RequestError || Number.isInteger(error?.status)) {
        return json(error.status || 500, {
          error: error.message,
          code: error.code || "FANDOM_RENDITION_AUTHORIZATION_FAILED",
        });
      }
      console.error("[fandom-renditions] unexpected error", error);
      return json(500, {
        error: "Fandom Renditions are unavailable.",
        code: "FANDOM_RENDITION_INTERNAL_ERROR",
      });
    }
  };
}

async function authorizeIntake(req, context, env, auth) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (
    env.FANDOM_CREATE_INTEGRATION_TOKEN
    && secureEqual(token, env.FANDOM_CREATE_INTEGRATION_TOKEN)
  ) {
    return { method: "integration-token" };
  }
  validateSameOrigin(req);
  const authenticated = await authorizeAdmin(req, context, auth);
  return {
    method: "admin-session",
    accountId: authenticated?.user?.accountId || authenticated?.accountId || null,
  };
}

async function authorizeAdminMutation(req, context, auth) {
  validateSameOrigin(req);
  const authenticated = await authorizeAdmin(req, context, auth);
  return {
    method: "admin-session",
    accountId: authenticated?.user?.accountId || authenticated?.accountId || null,
  };
}

async function authorizeAdmin(req, context, auth) {
  if (!auth?.authenticateAdmin) {
    throw new RequestError(
      "Fandom admin authorization is not configured.",
      503,
      "FANDOM_RENDITION_AUTH_NOT_CONFIGURED",
    );
  }
  return auth.authenticateAdmin(req, context);
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    throw new RequestError(
      "Cross-origin Fandom Rendition mutations are not allowed.",
      403,
      "FANDOM_RENDITION_CROSS_ORIGIN",
    );
  }
}

async function readJson(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new RequestError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_REQUEST_BYTES) {
    throw new RequestError(
      "Fandom Rendition request is too large.",
      413,
      "FANDOM_RENDITION_REQUEST_TOO_LARGE",
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("Request body must be valid JSON.");
  }
}

function validateHandoff(value, catalogue) {
  requireRecord(value, "handoff");
  requireKeys(value, [
    "schemaVersion",
    "sourceArtifactId",
    "sourceArtifactVersion",
    "seriesId",
    "renditionId",
    "renditionVersion",
    "destination",
    "editorial",
    "domainHints",
  ]);
  if (value.schemaVersion !== HANDOFF_SCHEMA) {
    throw new RequestError(`schemaVersion must be ${HANDOFF_SCHEMA}.`);
  }
  if (value.destination !== DESTINATION) {
    throw new RequestError(`destination must be ${DESTINATION}.`);
  }
  requireId(value.sourceArtifactId, "sourceArtifactId");
  requireVersion(value.sourceArtifactVersion, "sourceArtifactVersion");
  if (value.seriesId !== undefined) requireId(value.seriesId, "seriesId");
  requireId(value.renditionId, "renditionId");
  requireVersion(value.renditionVersion, "renditionVersion");
  validateEditorial(value.editorial);
  validateDomainHints(value.domainHints, catalogue);
  return structuredClone(value);
}

function validateEditorial(value) {
  requireRecord(value, "editorial");
  requireKeys(value, [
    "type",
    "title",
    "thesis",
    "editorialPromise",
    "renditionTitle",
    "content",
  ]);
  requireText(value.type, "editorial.type", 80);
  requireText(value.title, "editorial.title", 300);
  requireText(value.thesis, "editorial.thesis", 4_000);
  requireText(value.editorialPromise, "editorial.editorialPromise", 4_000);
  if (value.renditionTitle !== undefined) {
    requireText(value.renditionTitle, "editorial.renditionTitle", 300);
  }
  requireText(value.content, "editorial.content", 220_000, true);
}

function validateDomainHints(value, catalogue) {
  requireRecord(value, "domainHints");
  requireKeys(value, ["drama", "actorIds", "vibePackKeys", "spoilerBoundary"]);
  if (value.drama !== undefined) requireText(value.drama, "domainHints.drama", 300);
  if (value.spoilerBoundary !== undefined) {
    requireText(value.spoilerBoundary, "domainHints.spoilerBoundary", 300);
  }
  requireStringArray(value.actorIds, "domainHints.actorIds", 20);
  requireStringArray(value.vibePackKeys, "domainHints.vibePackKeys", 40);
  for (const actorId of value.actorIds) {
    if (!catalogue.actorIds.has(actorId)) {
      throw new RequestError(`Unknown Fandom actorId: ${actorId}.`);
    }
  }
  for (const vibePackKey of value.vibePackKeys) {
    if (
      !catalogue.vibePackKeys.has(vibePackKey)
      && !PROPOSED_VIBE_KEY_RE.test(vibePackKey)
    ) {
      throw new RequestError(`Invalid Vibe Pack targeting key: ${vibePackKey}.`);
    }
    if (
      catalogue.vibePackKeys.has(vibePackKey)
      && !value.actorIds.includes(vibePackKey.split(":")[0])
    ) {
      throw new RequestError(
        `Vibe Pack targeting key ${vibePackKey} has no matching actorId hint.`,
      );
    }
  }
}

function validateReceipt(value, catalogue, env) {
  requireRecord(value, "receipt");
  requireKeys(value, [
    "schemaVersion",
    "sourceArtifactId",
    "sourceArtifactVersion",
    "seriesId",
    "renditionId",
    "renditionVersion",
    "publicationReceipt",
    "packVerdictProjections",
    "learningProjections",
  ]);
  if (value.schemaVersion !== RECEIPT_SCHEMA) {
    throw new RequestError(`schemaVersion must be ${RECEIPT_SCHEMA}.`);
  }
  requireId(value.sourceArtifactId, "sourceArtifactId");
  requireVersion(value.sourceArtifactVersion, "sourceArtifactVersion");
  if (value.seriesId !== undefined) requireId(value.seriesId, "seriesId");
  requireId(value.renditionId, "renditionId");
  requireVersion(value.renditionVersion, "renditionVersion");
  validatePublicationReceipt(value.publicationReceipt, env.FANDOM_PUBLIC_ORIGIN);
  if (!Array.isArray(value.packVerdictProjections) || value.packVerdictProjections.length > 40) {
    throw new RequestError("packVerdictProjections must be an array of at most 40 entries.");
  }
  for (const projection of value.packVerdictProjections) {
    validatePackVerdict(projection, catalogue);
  }
  requireRecord(value.learningProjections, "learningProjections");
  return structuredClone(value);
}

function validatePublicationReceipt(value, publicOrigin) {
  requireRecord(value, "publicationReceipt");
  requireKeys(value, ["url", "publishedAt", "publicationId", "contentHash"]);
  if (!isPublicHttpsUrl(value.url)) {
    throw new RequestError("publicationReceipt.url must be a public HTTPS URL.");
  }
  if (publicOrigin && new URL(value.url).origin !== new URL(publicOrigin).origin) {
    throw new RequestError("publicationReceipt.url must use the configured Fandom origin.");
  }
  if (!isTimezoneBearingInstant(value.publishedAt)) {
    throw new RequestError("publicationReceipt.publishedAt must be a timezone-bearing ISO instant.");
  }
  if (value.publicationId !== undefined) {
    requireText(value.publicationId, "publicationReceipt.publicationId", 200);
  }
  if (value.contentHash !== undefined) {
    requireText(value.contentHash, "publicationReceipt.contentHash", 200);
  }
}

function validatePackVerdict(value, catalogue) {
  requireRecord(value, "packVerdictProjection");
  requireKeys(value, ["actorId", "vibePackKey", "verdict", "evidence"]);
  if (!catalogue.actorIds.has(value.actorId)) {
    throw new RequestError(`Unknown Fandom actorId: ${value.actorId}.`);
  }
  if (!VERDICTS.has(value.verdict)) {
    throw new RequestError("Pack Verdict must be confirm, stretch, contradict, or propose.");
  }
  const known = catalogue.vibePackKeys.has(value.vibePackKey);
  if (!known && value.verdict !== "propose") {
    throw new RequestError(
      `Only a propose verdict may reference a new Vibe Pack key: ${value.vibePackKey}.`,
    );
  }
  if (!known && !PROPOSED_VIBE_KEY_RE.test(value.vibePackKey)) {
    throw new RequestError(`Invalid proposed Vibe Pack key: ${value.vibePackKey}.`);
  }
  if (known && !value.vibePackKey.startsWith(`${value.actorId}:`)) {
    throw new RequestError("Pack Verdict actorId and vibePackKey must identify the same actor.");
  }
  if (value.evidence !== undefined) {
    requireText(value.evidence, "packVerdictProjection.evidence", 8_000);
  }
}

function assertReceiptLineage(receipt, handoff) {
  for (const field of [
    "sourceArtifactId",
    "sourceArtifactVersion",
    "seriesId",
    "renditionId",
    "renditionVersion",
  ]) {
    if (receipt[field] !== handoff[field]) {
      throw new RequestError(
        `Receipt ${field} does not match the authorized handoff.`,
        409,
        "FANDOM_RENDITION_LINEAGE_CONFLICT",
      );
    }
  }
}

function projectTargeting(domainHints, catalogue) {
  return {
    actors: domainHints.actorIds.map(actorId => ({ actorId, status: "known" })),
    vibePacks: domainHints.vibePackKeys.map(vibePackKey => ({
      vibePackKey,
      status: catalogue.vibePackKeys.has(vibePackKey) ? "known" : "proposed",
    })),
  };
}

function publicRendition(record, receipt) {
  return {
    status: receipt ? "published" : "authorized",
    handoff: record.handoff,
    targeting: record.targeting,
    receivedAt: record.receivedAt,
    ...(receipt ? { receipt } : {}),
  };
}

function buildCatalogue(actorPacks) {
  if (!Array.isArray(actorPacks)) throw new Error("actorPacks must be configured.");
  const actorIds = new Set();
  const vibePackKeys = new Set();
  for (const actor of actorPacks) {
    if (!actor || typeof actor.id !== "string" || !Array.isArray(actor.vibes)) continue;
    actorIds.add(actor.id);
    actor.vibes.forEach((_, index) => vibePackKeys.add(`${actor.id}:${index}`));
  }
  return { actorIds, vibePackKeys };
}

function requireRecord(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(`${field} must be an object.`);
  }
}

function requireKeys(value, allowed) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find(key => !allowedSet.has(key));
  if (unknown) throw new RequestError(`Unknown field: ${unknown}.`);
}

function requireId(value, field) {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw new RequestError(`${field} must be a bounded opaque identifier.`);
  }
}

function requireVersion(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new RequestError(`${field} must be a positive integer.`);
  }
}

function requireText(value, field, maxLength, allowEmpty = false) {
  if (
    typeof value !== "string"
    || value.length > maxLength
    || (!allowEmpty && value.trim().length === 0)
  ) {
    throw new RequestError(`${field} must be a string of at most ${maxLength} characters.`);
  }
}

function requireStringArray(value, field, maxItems) {
  if (
    !Array.isArray(value)
    || value.length > maxItems
    || value.some(item => typeof item !== "string" || item.length === 0 || item.length > 200)
  ) {
    throw new RequestError(`${field} must be an array of at most ${maxItems} strings.`);
  }
}

function isPublicHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function isTimezoneBearingInstant(value) {
  return typeof value === "string"
    && /T\d{2}:\d{2}/.test(value)
    && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    && !Number.isNaN(Date.parse(value));
}

function digestJson(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function getJson(store, key) {
  return store.get(key, { type: "json", consistency: "strong" });
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}
