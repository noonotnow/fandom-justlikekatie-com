import { createHash, createHmac } from "node:crypto";
import { renderCanonicalOutput } from "./canonical-render.js";

export const CREATOR_DRAFT_SOURCE_SCHEMA = "fandom.creator-draft-source.v1";
export const CREATOR_DRAFT_WORKFLOW = "creator-draft";
const COLLECTION_STORE = "fandom-user-collections";
const RECEIPT_STORE = "creator-draft-handoffs";
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_IMAGES = 9;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
const DEFAULT_CREATE_URL = "https://create.justlikekatie.com/api/integrations/fandom/projects";
const DEFAULT_CREATE_APP_URL = "https://create.justlikekatie.com";
const RENDER_CONTRACT = "fandom.idea-packet-output.v1";
const RENDER_VERSION = 1;
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1350;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const locks = new Map();

export function isCreatorDraftRequest(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && isRecord(value.source)
    && value.source.schema === CREATOR_DRAFT_SOURCE_SCHEMA
    && value.source.kind === "ordered-grid";
}

export function createCreatorGridHandoffHandler({
  env = process.env,
  fetchImpl = fetch,
  getStore,
  now = () => new Date(),
  renderOutputImpl = renderCanonicalOutput,
} = {}) {
  return async function creatorGridHandoff(req, context, source, operator) {
    try {
      const accountId = operator?.user?.accountId;
      if (!accountId) {
        throw requestError(
          "A signed-in admin session is required for direct Creator OS handoff.",
          401,
        );
      }
      validateSource(source);
      requireConfiguration(env);

      const collectionStore = getStore(COLLECTION_STORE, context);
      const receiptStore = getStore(RECEIPT_STORE, context);
      return await withLock(source.sourceId, async () => {
        const grid = await resolveSavedGrid(collectionStore, accountId, source.sourceId);
        if (!grid) throw requestError("This saved grid is not available in the active account.", 404);
        const resolvedSource = validateSourceAgainstGrid(source, grid);
        const priorEntry = await getBlob(receiptStore, receiptKey(source));
        const prior = priorEntry?.data || priorEntry;
        if (prior?.sourceVersion === resolvedSource.sourceVersion && prior.receipt) {
          return jsonResponse(200, {
            source: resolvedSource,
            receipt: { ...prior.receipt, disposition: "replayed" },
            media: prior.media || [],
          });
        }

        const bytes = await renderGrid(grid, resolvedSource, {
          requestUrl: req.url,
          renderOutputImpl,
        });
        const registration = await registerMedia(bytes, grid, resolvedSource, {
          env,
          fetchImpl,
          requestUrl: req.url,
        });
        const envelope = buildCreateEnvelope(grid, resolvedSource, registration, now());
        const upstreamReceipt = await sendToCreate(envelope, {
          env,
          fetchImpl,
          timestampDate: now(),
        });
        const receipt = validateReceipt(
          upstreamReceipt,
          resolvedSource,
          env.CREATE_APP_URL || DEFAULT_CREATE_APP_URL,
        );
        const record = { sourceVersion: resolvedSource.sourceVersion, receipt, media: [registration] };
        await receiptStore.setJSON(receiptKey(resolvedSource), record);
        return jsonResponse(receipt.disposition === "created" ? 201 : 200, {
          source: resolvedSource,
          receipt,
          media: record.media,
        });
      });
    } catch (error) {
      if (error?.status) return jsonResponse(error.status, { error: error.message, stage: error.stage || "request" });
      console.error("[creator-grid-handoff] unexpected error", error);
      return jsonResponse(500, { error: "Internal server error", stage: "server" });
    }
  };
}

function validateSource(source) {
  if (
    !isRecord(source)
    || source.schema !== CREATOR_DRAFT_SOURCE_SCHEMA
    || source.kind !== "ordered-grid"
    || typeof source.sourceId !== "string"
    || !source.sourceId
    || typeof source.sourceVersion !== "string"
    || !source.sourceVersion
    || typeof source.idempotencyKey !== "string"
    || !source.idempotencyKey
    || !isRecord(source.actor)
    || typeof source.actor.id !== "string"
    || typeof source.actor.name !== "string"
    || typeof source.actor.nameEn !== "string"
    || !isRecord(source.creativeContext)
    || typeof source.creativeContext.vibe !== "string"
    || typeof source.creativeContext.vibeEn !== "string"
    || typeof source.creativeContext.brief !== "string"
    || (source.creativeContext.captionSeed !== undefined
      && typeof source.creativeContext.captionSeed !== "string")
    || !Array.isArray(source.orderedImages)
    || source.orderedImages.length < 1
    || source.orderedImages.length > MAX_IMAGES
    || Object.keys(source).some(key => ![
      "schema", "kind", "sourceId", "sourceVersion", "idempotencyKey",
      "actor", "creativeContext", "orderedImages",
    ].includes(key))
    || Object.keys(source.actor).some(key => !["id", "name", "nameEn"].includes(key))
    || Object.keys(source.creativeContext).some(key => !["vibe", "vibeEn", "brief", "captionSeed"].includes(key))
  ) throw requestError("Creator Draft source is invalid.", 400);

  const positions = new Set();
  for (const image of source.orderedImages) {
    if (
      !isRecord(image)
      || !Number.isInteger(image.position)
      || image.position < 0
      || image.position >= MAX_IMAGES
      || positions.has(image.position)
      || typeof image.resultId !== "string"
      || !image.resultId
      || typeof image.sourceUrl !== "string"
      || typeof image.title !== "string"
      || (image.publisher !== undefined && typeof image.publisher !== "string")
      || (image.batchKey !== undefined && typeof image.batchKey !== "string")
      || Object.keys(image).some(key => ![
        "position", "resultId", "sourceUrl", "title", "publisher", "batchKey",
      ].includes(key))
    ) throw requestError("Creator Draft ordered images are invalid.", 400);
    positions.add(image.position);
  }
  if (![...positions].sort((a, b) => a - b).every((position, index) => position === index)) {
    throw requestError("Creator Draft image positions must start at zero and be contiguous.", 400);
  }
}

async function resolveSavedGrid(store, accountId, sourceId) {
  const collection = await store.get(`users/${accountId}`, {
    type: "json",
    consistency: "strong",
  });
  const items = isRecord(collection?.items) ? Object.values(collection.items) : [];
  return items.find(item => (
    isRecord(item)
    && item.kind === "grid"
    && (item.artifactId === sourceId || item.id === sourceId)
  )) || null;
}

function validateSourceAgainstGrid(source, grid) {
  if (
    grid.schemaVersion !== 1
    || grid.rendererVersion !== "vibe-atlas-v1"
    || !Array.isArray(grid.images)
    || grid.images.length < 1
    || grid.images.length > MAX_IMAGES
  ) throw requestError("The saved grid is invalid or incomplete.", 409);

  const ordered = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  const sourceVersion = `${grid.schemaVersion}:${grid.generatedAt}:${ordered.map(image => image.resultId).join("|")}`;
  if (source.sourceVersion !== sourceVersion) {
    throw requestError("This saved grid changed. Refresh the Collection before creating a Draft.", 409);
  }
  const expected = {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: "ordered-grid",
    sourceId: grid.artifactId || grid.id,
    sourceVersion,
    idempotencyKey: `grid:${grid.artifactId || grid.id}:${stableHash(sourceVersion)}`,
    actor: { id: grid.actorId, name: grid.actor, nameEn: grid.actorEn },
    creativeContext: {
      vibe: grid.vibe,
      vibeEn: grid.vibeEn,
      brief: grid.generationPrompt || "",
      ...(grid.ctaSeed ? { captionSeed: grid.ctaSeed } : {}),
    },
    orderedImages: ordered.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      sourceUrl: image.sourceUrl,
      title: image.title,
      ...(image.publisher ? { publisher: image.publisher } : {}),
      ...(image.batchKey ? { batchKey: image.batchKey } : {}),
    })),
  };
  if (JSON.stringify(source) !== JSON.stringify(expected)) {
    throw requestError("The Creator Draft source does not match the saved grid.", 409);
  }
  return expected;
}

async function renderGrid(grid, source, { requestUrl, renderOutputImpl }) {
  const renderGridRecord = {
    ...grid,
    images: grid.images.map(image => ({
      ...image,
      ...(image.media ? { imageUrl: trustedMediaProxyUrl(image, requestUrl) } : {}),
    })),
  };
  const packet = {
    id: `creator-grid-${stableHash(source.idempotencyKey)}`,
    actor: source.actor,
    vibe: { label: source.creativeContext.vibe, labelEn: source.creativeContext.vibeEn, emoji: grid.vibeEmoji || "✨" },
    provenance: {
      sourceRoute: grid.sourceRoute || "/vibe-atlas",
      gridId: source.sourceId,
      generatedAt: grid.generatedAt,
      batchKeys: grid.images.map(image => image.batchKey).filter(Boolean),
    },
    grids: [renderGridRecord],
    sourceCards: renderGridRecord.images.map((image, order) => ({
      id: `source-${stableHash(image.resultId)}`,
      order,
      ...image,
      capturedAt: grid.generatedAt,
      provenance: JSON.stringify({ collection: "saved-grid", gridId: source.sourceId, gridPosition: image.gridPosition }),
    })),
  };
  const output = {
    id: "creator-grid-main",
    kind: "grid",
    sourceId: grid.id,
    included: true,
  };
  let bytes;
  try {
    bytes = new Uint8Array(await renderOutputImpl(packet, output, { requestUrl }));
  } catch (error) {
    throw requestError(`The saved grid could not be rendered: ${publicError(error)}`, 422, "render");
  }
  if (bytes.byteLength < 8 || bytes.byteLength > MAX_PNG_BYTES || !isPng(bytes)) {
    throw requestError("The saved grid renderer did not produce a valid PNG.", 502, "render");
  }
  return bytes;
}

function trustedMediaProxyUrl(image, requestUrl) {
  const media = image.media;
  if (
    !isRecord(media)
    || media.schemaVersion !== 1
    || typeof media.assetId !== "string"
    || !UUID_PATTERN.test(media.assetId)
    || !isStableMediaUrl(media.deliveryUrl)
    || image.imageUrl !== media.deliveryUrl
    || media.association?.type !== "collection"
  ) {
    throw requestError("The saved grid contains an invalid trusted MEDIA reference.", 409);
  }
  const proxy = new URL("/.netlify/functions/image-proxy", requestUrl);
  proxy.searchParams.set("url", media.deliveryUrl);
  return proxy.toString();
}

async function registerMedia(bytes, grid, source, { env, fetchImpl, requestUrl }) {
  const metadata = {
    sourceType: "fandom-creator-draft-grid",
    sourceUrl: absoluteHttpsUrl(grid.sourceRoute || "/vibe-atlas", requestUrl),
    origin: "fandom-vibes",
    rightsStatus: "unknown",
    rightsNotes: JSON.stringify({
      schema: "fandom.media-provenance.v2",
      source: "Fandom",
      collection: { gridId: source.sourceId, generatedAt: grid.generatedAt },
      creatorDraft: { schema: source.schema, sourceVersion: source.sourceVersion },
    }),
    actor: [grid.actor, grid.actorEn].filter(Boolean),
    seriesTags: ["Fandom", "Creator OS", "Vibe Atlas", `grid:${source.sourceId}`],
    linkedPostIdentifiers: [`fandom/grid/${source.sourceId}`, `fandom/draft/${source.idempotencyKey}`],
  };
  const body = new FormData();
  body.append("file", new File([bytes], `creator-grid-${safeSegment(source.sourceId)}.png`, { type: "image/png" }));
  body.append("metadata", JSON.stringify(metadata));
  let response;
  try {
    response = await fetchImpl(env.MEDIA_ASSETS_URL || DEFAULT_MEDIA_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${env.MEDIA_ASSETS_TOKEN}` },
      body,
    });
  } catch (error) {
    throw requestError(publicError(error, "MEDIA registration failed."), 502, "media");
  }
  const payload = await readJson(response, "MEDIA");
  if (!response.ok) throw requestError(errorMessage(payload, "MEDIA registration failed."), 502, "media");
  const descriptor = validateMediaDescriptor(payload?.data, bytes);
  return {
    assetId: descriptor.assetId,
    url: descriptor.deliveryUrl,
    filename: `creator-grid-${safeSegment(source.sourceId)}.png`,
    mimeType: descriptor.mimeType,
    checksum: descriptor.checksum,
    role: "cover",
    position: 0,
    sourceCardIds: grid.images.map(image => image.resultId),
    provenance: {
      origin: "fandom-vibes",
      sourceKind: "ordered-grid",
      sourceId: source.sourceId,
      sourceVersion: source.sourceVersion,
      generatedAt: grid.generatedAt,
    },
    metadata,
  };
}

function buildCreateEnvelope(grid, source, registration, generatedAt) {
  const title = `${source.actor.name} · ${source.creativeContext.vibeEn}`;
  const caption = source.creativeContext.captionSeed || source.creativeContext.brief || title;
  return {
    schemaVersion: "fandom.creator-draft.v1",
    workflow: CREATOR_DRAFT_WORKFLOW,
    origin: "fandom-vibes",
    source,
    sourceId: source.sourceId,
    sourceVersion: source.sourceVersion,
    idempotencyKey: source.idempotencyKey,
    outputId: "creator-grid-main",
    outputKind: "creator_grid",
    renderContract: RENDER_CONTRACT,
    renderVersion: RENDER_VERSION,
    width: RENDER_WIDTH,
    height: RENDER_HEIGHT,
    actor: source.actor,
    vibe: { id: stableSegment(source.creativeContext.vibeEn), label: `${grid.vibeEmoji || "✨"} ${source.creativeContext.vibe}` },
    grid: {
      id: source.sourceId,
      generatedAt: grid.generatedAt,
      capturedDate: grid.capturedDate,
      imageCount: source.orderedImages.length,
    },
    creativeContext: source.creativeContext,
    generatedAt: generatedAt.toISOString(),
    draft: {
      title,
      caption,
      captionSeed: caption,
      provenance: JSON.stringify({
        schema: source.schema,
        sourceId: source.sourceId,
        sourceVersion: source.sourceVersion,
      }),
      tags: [],
      series: ["A·Vibe"],
      type: "static",
    },
    publicationBrief: {
      type: "static",
      format: "static-card",
      template: "Vibe Atlas Creator Draft",
      series: ["A·Vibe"],
      distribution: { primaryPlatform: "rednote", platforms: ["rednote"] },
      requiredAssets: [registration.assetId],
      captionBrief: caption,
      tags: [],
      requirements: [
        "Use only the attached canonical MEDIA asset.",
        "No scheduling or publishing action is authorized by this handoff.",
      ],
    },
    mediaAttachments: [registration],
  };
}

async function sendToCreate(envelope, { env, fetchImpl, timestampDate }) {
  const rawBody = JSON.stringify(envelope);
  const timestamp = String(Math.floor(timestampDate.getTime() / 1000));
  const idempotencyKey = envelope.idempotencyKey;
  const digest = sha256(rawBody);
  const signature = createHmac("sha256", env.CREATE_FANDOM_HMAC_SECRET)
    .update(`${timestamp}\n${idempotencyKey}\n${digest}`)
    .digest("hex");
  let response;
  try {
    response = await fetchImpl(env.CREATE_FANDOM_INTAKE_URL || DEFAULT_CREATE_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "X-Fandom-Key-Id": env.CREATE_FANDOM_HMAC_KEY_ID,
        "X-Fandom-Timestamp": timestamp,
        "X-Fandom-Signature": `v1=${signature}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: rawBody,
    });
  } catch (error) {
    throw requestError(publicError(error, "CREATE intake failed."), 502, "create");
  }
  const payload = await readJson(response, "CREATE");
  if (!response.ok) throw requestError(errorMessage(payload, `CREATE returned HTTP ${response.status}`), response.status === 409 ? 409 : 502, "create");
  return payload;
}

function validateReceipt(value, source, createAppUrl) {
  const receipt = isRecord(value) && isRecord(value.receipt) ? value.receipt : value;
  if (
    !isRecord(receipt)
    || typeof receipt.postId !== "string"
    || !receipt.postId
    || !isHttpsUrl(receipt.postUrl)
    || receipt.status !== "Draft"
    || receipt.sourceVersion !== source.sourceVersion
    || receipt.workflow !== CREATOR_DRAFT_WORKFLOW
    || !["created", "replayed", "updated"].includes(receipt.disposition)
    || receipt.mediaSyncState !== "synced"
    || !Array.isArray(receipt.warnings)
  ) throw requestError("CREATE returned an invalid Creator Draft receipt.", 502, "create");
  return {
    ...receipt,
    sourceId: source.sourceId,
    createUrl: buildCreateDeepLink(receipt.postId, createAppUrl),
  };
}

function validateMediaDescriptor(descriptor, bytes) {
  const checksum = sha256(bytes);
  if (
    !isRecord(descriptor)
    || descriptor.version !== 1
    || typeof descriptor.assetId !== "string"
    || !UUID_PATTERN.test(descriptor.assetId)
    || descriptor.mediaType !== "image"
    || descriptor.mimeType !== "image/png"
    || descriptor.sizeBytes !== bytes.byteLength
    || descriptor.checksum !== checksum
    || !isStableMediaUrl(descriptor.fileUrl)
    || !isStableMediaUrl(descriptor.deliveryUrl)
    || !isStableMediaUrl(descriptor.thumbnailUrl)
    || !Number.isInteger(descriptor.dimensions?.width)
    || descriptor.dimensions.width !== RENDER_WIDTH
    || !Number.isInteger(descriptor.dimensions?.height)
    || descriptor.dimensions.height !== RENDER_HEIGHT
  ) throw requestError("MEDIA returned an invalid or mismatched image descriptor.", 502, "media");
  return descriptor;
}

function requireConfiguration(env) {
  if (!env.MEDIA_ASSETS_TOKEN) throw requestError("MEDIA_ASSETS_TOKEN is not configured.", 503);
  if (!env.CREATE_FANDOM_HMAC_KEY_ID || !env.CREATE_FANDOM_HMAC_SECRET) {
    throw requestError("CREATE Fandom HMAC credentials are not configured.", 503);
  }
}

async function getBlob(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

function receiptKey(source) {
  return `${safeSegment(source.sourceId)}/${stableHash(source.idempotencyKey)}`;
}

async function withLock(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  locks.set(key, previous.then(() => current));
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

function buildCreateDeepLink(postId, base) {
  const url = new URL("/compose", base);
  url.searchParams.set("postId", postId);
  return url.toString();
}

function absoluteHttpsUrl(value, requestUrl) {
  const url = new URL(value, requestUrl);
  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") throw requestError("Fandom source URLs must resolve to HTTPS.", 400);
  return url.toString();
}

function isStableMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function isPng(bytes) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

async function readJson(response, label) {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw requestError(`${label} response is too large.`, 502, label.toLowerCase());
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw requestError(`${label} returned invalid JSON.`, 502, label.toLowerCase()); }
}

function errorMessage(value, fallback) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function publicError(error, fallback = "The upstream service could not complete the request.") {
  return error instanceof Error && error.message ? error.message.slice(0, 500) : fallback;
}

function requestError(message, status, stage) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  return error;
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "grid";
}

function stableSegment(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vibe";
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}