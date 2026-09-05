import { createHash, createHmac } from "node:crypto";
import { isIP } from "node:net";
import { renderCanonicalOutput } from "./canonical-render.js";
import { validateGridEditorialContract } from "./grid-editorial-contract.js";
import { MAX_MEDIA_BYTES } from "./media-asset.js";
import {
  BOARD_CLASSIFICATIONS,
  approvedBoardAuthorityKey,
  classifySavedGrid,
  isReleaseCandidateIdentity,
} from "./approved-board-provenance.js";

export const CREATOR_DRAFT_SOURCE_SCHEMA = "fandom.creator-draft-source.v1";
export const WORKSTATION_DELIVERABLE_SCHEMA = "fandom.static-deliverable.v1";
export const WORKSTATION_WORKFLOW = "direct";
export const CREATOR_PLATFORMS = ["rednote", "weibo", "instagram"];
const COLLECTION_STORE = "fandom-user-collections";
const APPROVED_BOARD_AUTHORITY_STORE = "actor-audit";
const RECEIPT_STORE = "creator-draft-handoffs";
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_IMAGES = 12;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;
const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
const DEFAULT_WORKSTATION_URL = "https://workstation.justlikekatie.com/api/integrations/fandom/projects";
const DEFAULT_WORKSTATION_APP_URL = "https://workstation.justlikekatie.com";
const RENDER_CONTRACT = "fandom.idea-packet-output.v1";
const RENDER_VERSION = 1;
const OUTPUT_ID = "live-grid";
const RENDER_VARIANT = "vibe-atlas-grid-cover-v1";
const RENDER_WIDTH = 1080;
const RENDER_HEIGHT = 1350;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const locks = new Map();

export function isWorkstationDraftRequest(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && isRecord(value.source)
    && value.source.schema === CREATOR_DRAFT_SOURCE_SCHEMA
    && value.source.kind === "ordered-grid";
}

export function createWorkstationGridHandoffHandler({
  env = process.env,
  fetchImpl = fetch,
  getStore,
  now = () => new Date(),
  renderOutputImpl = renderCanonicalOutput,
} = {}) {
  return async function workstationGridHandoff(req, context, source, operator) {
    try {
      const accountId = operator?.user?.accountId;
      if (!accountId) {
        throw requestError(
          "A signed-in admin session is required for direct Workstation handoff.",
          401,
        );
      }
      validateSource(source);
      requireConfiguration(env);
      const accountScope = accountScopeFor(accountId);

      let collectionStore;
      let approvedBoardAuthorityStore;
      let receiptStore;
      try {
        collectionStore = getStore(COLLECTION_STORE, context);
        approvedBoardAuthorityStore = getStore(APPROVED_BOARD_AUTHORITY_STORE, context);
        receiptStore = getStore(RECEIPT_STORE, context);
      } catch {
        throw storageError();
      }
      return await withLock(receiptKey(accountScope, source), async () => {
        const grid = await resolveSavedGrid(collectionStore, accountId, source.sourceId);
        if (!grid) throw requestError("This saved grid is not available in the active account.", 404);
        const resolvedSource = await validateSourceAgainstGrid(source, grid, fetchImpl, env);
        await validateApprovedBoardAuthority(
          approvedBoardAuthorityStore,
          resolvedSource.boardProvenance,
          grid.releaseCandidateProvenance,
        );
        const key = receiptKey(accountScope, resolvedSource);
        const priorEntry = await getBlob(receiptStore, key);
        const prior = priorEntry?.data || priorEntry;
        if (isCompletedRecord(prior, resolvedSource)) {
          return jsonResponse(200, {
            source: resolvedSource,
            receipt: { ...prior.receipt, disposition: "replayed" },
            media: prior.media || [],
          });
        }

        const sourceVersion = numericSourceVersion(resolvedSource);
        const expectedSourceVersion = completedSourceVersion(prior);
        let pending = storedPendingHandoff(
          prior,
          resolvedSource,
          grid,
          sourceVersion,
          expectedSourceVersion,
        );
        let pendingEntry = priorEntry;
        if (!pending) {
          const bytes = await renderGrid(grid, resolvedSource, {
            requestUrl: req.url,
            renderOutputImpl,
          });
          const registration = await registerMedia(bytes, grid, resolvedSource, {
            env,
            fetchImpl,
            requestUrl: req.url,
          });
          pending = {
            registration,
            generatedAt: now().toISOString(),
            sourceVersion,
            expectedSourceVersion,
          };
          const pendingRecord = {
            state: "pending",
            sourceFingerprint: resolvedSource.sourceVersion,
            platforms: resolvedSource.platforms,
            sourceVersion,
            expectedSourceVersion,
            media: [registration],
            generatedAt: pending.generatedAt,
          };
          const pendingWrite = await persistHandoffRecord(receiptStore, key, pendingRecord, priorEntry);
          if (pendingWrite?.modified === false) {
            pendingEntry = await getBlob(receiptStore, key);
            const winner = pendingEntry?.data;
            if (isCompletedRecord(winner, resolvedSource)) {
              return jsonResponse(200, {
                source: resolvedSource,
                receipt: { ...winner.receipt, disposition: "replayed" },
                media: winner.media || [],
              });
            }
            pending = storedPendingHandoff(
              winner,
              resolvedSource,
              grid,
              sourceVersion,
              expectedSourceVersion,
            );
            if (!pending) {
              throw requestError(
                "Creator Draft handoff state changed. Retry the handoff.",
                409,
                "storage",
              );
            }
          } else {
            pendingEntry = {
              data: pendingRecord,
              etag: pendingWrite?.etag,
            };
          }
        }
        const envelope = buildWorkstationEnvelope(
          grid,
          resolvedSource,
          pending.registration,
          new Date(pending.generatedAt),
          pending.sourceVersion,
          pending.expectedSourceVersion,
        );
        const upstreamReceipt = await sendToWorkstation(envelope, {
          env,
          fetchImpl,
          timestampDate: now(),
        });
        const receipt = validateReceipt(
          upstreamReceipt,
          resolvedSource,
          envelope,
          env.WORKSTATION_APP_URL || DEFAULT_WORKSTATION_APP_URL,
        );
        const record = {
          state: "completed",
          sourceFingerprint: resolvedSource.sourceVersion,
          platforms: resolvedSource.platforms,
          sourceVersion: receipt.sourceVersion,
          receipt,
          media: [pending.registration],
        };
        const completedWrite = await persistHandoffRecord(receiptStore, key, record, pendingEntry);
        if (completedWrite?.modified === false) {
          const winner = (await getBlob(receiptStore, key))?.data;
          if (!isCompletedRecord(winner, resolvedSource)) {
            throw requestError(
              "Creator Draft handoff state changed. Retry the handoff.",
              409,
              "storage",
            );
          }
          return jsonResponse(200, {
            source: resolvedSource,
            receipt: { ...winner.receipt, disposition: "replayed" },
            media: winner.media || [],
          });
        }
        return jsonResponse(receipt.disposition === "created" ? 201 : 200, {
          source: resolvedSource,
          receipt,
          media: record.media,
        });
      });
    } catch (error) {
      if (error?.status) return jsonResponse(error.status, { error: error.message, stage: error.stage || "request" });
      console.error("[workstation-grid-handoff] unexpected error", error);
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
    || !Array.isArray(source.platforms)
    || !isBoardProvenance(source.boardProvenance)
    || (source.creativeContext.captionSeed !== undefined
      && typeof source.creativeContext.captionSeed !== "string")
    || (source.creativeContext.editorialMode !== undefined
      && !["event", "compiled"].includes(source.creativeContext.editorialMode))
    || (source.creativeContext.compositionSize !== undefined
      && ![9, 12].includes(source.creativeContext.compositionSize))
    || (source.creativeContext.arrangement !== undefined
      && !["automatic", "creator-arranged"].includes(source.creativeContext.arrangement))
    || (source.creativeContext.primaryFamily !== undefined
      && typeof source.creativeContext.primaryFamily !== "string")
    || (source.creativeContext.evidenceBasis !== undefined
      && !["persisted-event", "batch"].includes(source.creativeContext.evidenceBasis))
    || !Array.isArray(source.orderedImages)
    || source.orderedImages.length < 1
    || source.orderedImages.length > MAX_IMAGES
    || Object.keys(source).some(key => ![
      "schema", "kind", "sourceId", "sourceVersion", "idempotencyKey", "platforms",
      "boardProvenance", "actor", "creativeContext", "orderedImages",
    ].includes(key))
    || Object.keys(source.actor).some(key => !["id", "name", "nameEn"].includes(key))
    || Object.keys(source.creativeContext).some(key => ![
      "vibe", "vibeEn", "brief", "captionSeed",
      "editorialMode", "compositionSize", "arrangement", "primaryFamily",
      "evidenceBasis",
    ].includes(key))
  ) throw requestError("Creator Draft source is invalid.", 400);

  const platforms = normalizePlatforms(source.platforms);
  if (JSON.stringify(platforms) !== JSON.stringify(source.platforms)) {
    throw requestError("Creator Draft destinations must be a unique canonical platform list.", 400);
  }

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
      || (image.familyId !== undefined && typeof image.familyId !== "string")
      || (image.familyLabel !== undefined && typeof image.familyLabel !== "string")
      || (image.familyEvidence !== undefined
        && !["persisted-event", "batch", "publisher", "fallback"].includes(image.familyEvidence))
      || Object.keys(image).some(key => ![
        "position", "resultId", "sourceUrl", "title", "publisher", "batchKey",
        "familyId", "familyLabel", "familyEvidence",
      ].includes(key))
    ) throw requestError("Creator Draft ordered images are invalid.", 400);
    positions.add(image.position);
  }
  if (![...positions].sort((a, b) => a - b).every((position, index) => position === index)) {
    throw requestError("Creator Draft image positions must start at zero and be contiguous.", 400);
  }
}

async function resolveSavedGrid(store, accountId, sourceId) {
  let collection;
  try {
    collection = await store.get(`users/${accountId}`, {
      type: "json",
      consistency: "strong",
    });
  } catch {
    throw storageError();
  }
  const items = isRecord(collection?.items) ? Object.values(collection.items) : [];
  return items.find(item => (
    isRecord(item)
    && item.kind === "grid"
    && (item.artifactId === sourceId || item.id === sourceId)
  )) || null;
}

async function validateSourceAgainstGrid(source, grid, fetchImpl, env) {
  if (
    grid.schemaVersion !== 1
    || grid.rendererVersion !== "vibe-atlas-v1"
    || !Array.isArray(grid.images)
    || grid.images.length < 1
    || grid.images.length > MAX_IMAGES
    || validateGridEditorialContract(grid)
  ) throw requestError("The saved grid is invalid or incomplete.", 409);

  const ordered = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  const boardProvenance = await verifyApprovedBoardMedia(
    grid,
    classifySavedGrid(grid),
    fetchImpl,
    env,
  );
  if (boardProvenance.classification === BOARD_CLASSIFICATIONS.unverified) {
    throw requestError("Unverified saved grids cannot be handed off to Workstation.", 409);
  }
  const sourceVersion = sourceVersionForGrid(grid);
  const platforms = normalizePlatforms(source.platforms);
  if (source.sourceVersion !== sourceVersion) {
    throw requestError("This saved grid changed. Refresh the Collection before creating a Draft.", 409);
  }
  const unavailable = ordered.filter(image => !isValidCollectionMediaReference(image.media));
  if (unavailable.length > 0) {
    const positions = unavailable.map(image => image.gridPosition + 1).join(", ");
    const label = unavailable.length === 1 ? "position" : "positions";
    const verb = unavailable.length === 1 ? "is" : "are";
    throw requestError(
      `Grid ${label} ${positions} ${verb} not durably available in MEDIA. Retry asset preparation before handoff.`,
      409,
      "media-readiness",
    );
  }
  const expected = {
    schema: CREATOR_DRAFT_SOURCE_SCHEMA,
    kind: "ordered-grid",
    sourceId: grid.artifactId || grid.id,
    sourceVersion,
    idempotencyKey: `grid:${grid.artifactId || grid.id}:${stableHash(sourceVersion)}:${platforms.join("+")}`,
    platforms,
    boardProvenance,
    actor: { id: grid.actorId, name: grid.actor, nameEn: grid.actorEn },
    creativeContext: {
      vibe: grid.vibe,
      vibeEn: grid.vibeEn,
      brief: grid.generationPrompt || "",
      ...(grid.ctaSeed ? { captionSeed: grid.ctaSeed } : {}),
      ...(grid.editorial ? {
        editorialMode: grid.editorial.mode,
        compositionSize: grid.editorial.compositionSize,
        arrangement: grid.editorial.arrangement,
        ...(grid.editorial.primaryFamilyLabel ? { primaryFamily: grid.editorial.primaryFamilyLabel } : {}),
        ...(grid.editorial.evidenceBasis ? { evidenceBasis: grid.editorial.evidenceBasis } : {}),
      } : {}),
    },
    orderedImages: ordered.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      sourceUrl: image.sourceUrl,
      title: image.title,
      ...(image.publisher ? { publisher: image.publisher } : {}),
      ...(image.batchKey ? { batchKey: image.batchKey } : {}),
      ...(image.familyId ? { familyId: image.familyId } : {}),
      ...(image.familyLabel ? { familyLabel: image.familyLabel } : {}),
      ...(image.familyEvidence ? { familyEvidence: image.familyEvidence } : {}),
    })),
  };
  if (JSON.stringify(source) !== JSON.stringify(expected)) {
    throw requestError("The Creator Draft source does not match the saved grid.", 409);
  }
  return expected;
}

async function verifyApprovedBoardMedia(grid, boardProvenance, fetchImpl, env) {
  if (boardProvenance.classification !== BOARD_CLASSIFICATIONS.exact) {
    return boardProvenance;
  }
  const ordered = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  const uniqueMedia = new Map(ordered.map((image, index) => [
    `${image.media.deliveryUrl}\0${image.media.checksum}`,
    {
      media: image.media,
      expectedDigest: grid.releaseCandidateProvenance.candidates[index].imageDigest,
    },
  ]));
  if ([...uniqueMedia.values()].some(({ media }) =>
    !isTrustedMediaDeliveryUrl(media.deliveryUrl, env)
    || media.sizeBytes > MAX_MEDIA_BYTES)) {
    return withoutApprovalAuthority(boardProvenance);
  }
  try {
    const verified = await Promise.all([...uniqueMedia.values()].map(async ({
      media,
      expectedDigest,
    }) => {
      const response = await fetchImpl(media.deliveryUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        headers: { Accept: media.mimeType },
      });
      if (!response.ok) return false;
      const bytes = await readBoundedMediaBytes(response, media.sizeBytes);
      return bytes.byteLength === media.sizeBytes
        && sha256(bytes) === expectedDigest
        && media.checksum === expectedDigest;
    }));
    if (verified.every(Boolean)) return boardProvenance;
  } catch {
    // Authority fails closed when the durable media cannot be independently verified.
  }
  return withoutApprovalAuthority(boardProvenance);
}

function withoutApprovalAuthority(boardProvenance) {
  return {
    ...boardProvenance,
    classification: BOARD_CLASSIFICATIONS.derived,
    approvalAuthority: false,
    releaseCandidateIdentity: null,
  };
}

function isTrustedMediaDeliveryUrl(value, env) {
  if (!isStableMediaUrl(value)) return false;
  try {
    const configured = new URL(env.MEDIA_ASSETS_URL || DEFAULT_MEDIA_URL);
    return new URL(value).origin === configured.origin;
  } catch {
    return false;
  }
}

async function readBoundedMediaBytes(response, expectedSize) {
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_MEDIA_BYTES || declaredSize > expectedSize) {
    throw new TypeError("MEDIA response is too large.");
  }
  if (!response.body) throw new TypeError("MEDIA response body is missing.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_BYTES || total > expectedSize) {
      await reader.cancel();
      throw new TypeError("MEDIA response is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function sourceVersionForGrid(grid) {
  return `sha256:${sha256(canonicalJson(sourceVersionMaterial(grid)))}`;
}

function sourceVersionMaterial(grid) {
  const ordered = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  return {
    schemaVersion: grid.schemaVersion,
    rendererVersion: grid.rendererVersion,
    sourceId: grid.artifactId || grid.id,
    actorId: grid.actorId,
    vibeKey: grid.vibeKey || null,
    actor: grid.actor,
    actorEn: grid.actorEn,
    actorAccentColor: grid.actorAccentColor,
    vibe: grid.vibe,
    vibeEn: grid.vibeEn,
    vibeEmoji: grid.vibeEmoji,
    vibeSubtitle: grid.vibeSubtitle,
    searchSpell: grid.searchSpell,
    generationPrompt: grid.generationPrompt || "",
    ctaSeed: grid.ctaSeed || "",
    edition: {
      provider: grid.edition?.provider ?? null,
      misprint: Boolean(grid.edition?.misprint),
      legendary: Boolean(grid.edition?.legendary),
    },
    editorial: grid.editorial || null,
    capturedDate: grid.capturedDate,
    generatedAt: grid.generatedAt,
    sourceRoute: grid.sourceRoute || "/vibe-atlas",
    releaseCandidateProvenance: grid.releaseCandidateProvenance || null,
    images: ordered.map(image => ({
      position: image.gridPosition,
      resultId: image.resultId,
      imageUrl: image.imageUrl,
      sourceUrl: image.sourceUrl,
      title: image.title,
      publisher: image.publisher || "",
      batchKey: image.batchKey || "",
      familyId: image.familyId || "",
      familyLabel: image.familyLabel || "",
      familyEvidence: image.familyEvidence || "",
      batchRank: image.batchRank ?? null,
      mediaRecoverySourceUrl: image.mediaRecovery?.sourceUrl || "",
      media: image.media || null,
    })),
  };
}

async function renderGrid(grid, source, { requestUrl, renderOutputImpl }) {
  const renderGridRecord = {
    ...grid,
    id: source.sourceId,
    images: grid.images.map(image => ({
      ...image,
      imageUrl: image.media
        ? trustedMediaProxyUrl(image, requestUrl)
        : normalizedThumbnailProxyUrl(image.imageUrl, requestUrl),
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

function normalizedThumbnailProxyUrl(value, requestUrl) {
  let imageUrl;
  try {
    if (typeof value !== "string") throw new TypeError("Image URL must be a string.");
    imageUrl = new URL(value, requestUrl);
  } catch {
    throw requestError("The saved grid contains an invalid public image URL.", 409);
  }

  const requestOrigin = new URL(requestUrl).origin;
  if (
    imageUrl.origin === requestOrigin
    && ["/.netlify/functions/image-proxy", "/api/image-proxy"].includes(imageUrl.pathname)
  ) {
    if (!isOrdinaryPublicHttpsUrl(imageUrl.searchParams.get("url"))) {
      throw requestError("The saved grid contains an invalid public image URL.", 409);
    }
    return value;
  }

  if (!isOrdinaryPublicHttpsUrl(value)) {
    throw requestError("The saved grid contains an invalid public image URL.", 409);
  }
  const proxy = new URL("/.netlify/functions/image-proxy", requestUrl);
  proxy.searchParams.set("url", imageUrl.toString());
  return proxy.toString();
}

function isOrdinaryPublicHttpsUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !isIP(hostname)
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost");
  } catch {
    return false;
  }
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
      creatorDraft: { schema: source.schema, sourceFingerprint: source.sourceVersion },
    }),
    actor: [grid.actor, grid.actorEn].filter(Boolean),
    seriesTags: ["Fandom", "Workstation", "Vibe Atlas", `grid:${source.sourceId}`],
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
    sizeBytes: descriptor.sizeBytes,
    checksum: descriptor.checksum,
    deliveryUrl: descriptor.deliveryUrl,
    thumbnailUrl: descriptor.thumbnailUrl,
    dimensions: descriptor.dimensions,
    role: "cover",
    renderVariant: RENDER_VARIANT,
    position: 0,
    sourceCardIds: grid.images.map(image => image.resultId),
    provenance: {
      origin: "fandom-vibes",
      sourceKind: "ordered-grid",
      sourceId: source.sourceId,
      sourceFingerprint: source.sourceVersion,
      generatedAt: grid.generatedAt,
    },
    metadata,
  };
}

function buildWorkstationEnvelope(
  grid,
  source,
  registration,
  generatedAt,
  sourceVersion,
  expectedSourceVersion,
) {
  const title = `${source.actor.name} · ${source.creativeContext.vibeEn}`;
  const caption = source.creativeContext.captionSeed || source.creativeContext.brief || title;
  const outputId = OUTPUT_ID;
  const deliverableId = `fandom:grid:${source.sourceId}:${outputId}`;
  const idempotencyKey = `fandom/direct/grid/${source.sourceId}/${outputId}`;
  const ordered = [...grid.images].sort((a, b) => a.gridPosition - b.gridPosition);
  return {
    schema: WORKSTATION_DELIVERABLE_SCHEMA,
    workflow: WORKSTATION_WORKFLOW,
    origin: "fandom-vibes",
    directOrigin: { kind: "grid", id: source.sourceId },
    deliverableId,
    renderVariant: RENDER_VARIANT,
    sourceId: source.sourceId,
    sourceVersion,
    expectedSourceVersion,
    sourceFingerprint: source.sourceVersion,
    idempotencyKey,
    outputId,
    outputKind: "live_grid",
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
    boardProvenance: source.boardProvenance,
    generatedAt: generatedAt.toISOString(),
    sourceCards: ordered.map(image => ({
      id: image.resultId,
      order: image.gridPosition,
      imageUrl: image.media.deliveryUrl,
      sourceUrl: image.sourceUrl,
      ...(image.title ? { title: image.title } : {}),
      ...(image.publisher ? { creator: image.publisher } : {}),
      capturedAt: grid.generatedAt,
      provenance: JSON.stringify({
        collection: "saved-grid",
        gridId: source.sourceId,
        gridPosition: image.gridPosition,
        ...(image.batchKey ? { batchKey: image.batchKey } : {}),
        ...(image.familyId ? { familyId: image.familyId } : {}),
        ...(image.familyLabel ? { familyLabel: image.familyLabel } : {}),
        ...(image.familyEvidence ? { familyEvidence: image.familyEvidence } : {}),
      }),
      media: canonicalMediaReference(image.media),
    })),
    draft: {
      title,
      caption,
      captionSeed: caption,
      provenance: JSON.stringify({
        schema: source.schema,
        sourceId: source.sourceId,
        sourceVersion,
        sourceFingerprint: source.sourceVersion,
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
      distribution: {
        primaryPlatform: normalizePlatforms(source.platforms === undefined ? ["rednote"] : source.platforms)[0],
        platforms: normalizePlatforms(source.platforms === undefined ? ["rednote"] : source.platforms),
      },
      requiredAssets: [registration.assetId],
      captionBrief: caption,
      approvalAuthority: source.boardProvenance.approvalAuthority,
      approvalLanguage: source.boardProvenance.approvalAuthority
        ? "approved-publication-candidate"
        : "new-creative-source",
      tags: [],
      requirements: [
        "Use only the attached canonical MEDIA asset.",
        source.boardProvenance.approvalAuthority
          ? "Approval applies only to this exact ordered nine-card board and its verified board hash."
          : "This derivative is a new creative source and does not inherit the approval receipt.",
        "No scheduling or publishing action is authorized by this handoff.",
      ],
    },
    mediaAttachments: [registration],
  };
}

async function validateApprovedBoardAuthority(store, boardProvenance, provenance) {
  const identity = boardProvenance.sourceReleaseCandidateIdentity;
  const authority = await store.get(
    approvedBoardAuthorityKey(identity.auditRunId),
    { type: "json", consistency: "strong" },
  );
  if (!authority
    || canonicalJson(authority) !== canonicalJson(provenance)
    || canonicalJson(authority.identity) !== canonicalJson(identity)) {
    throw requestError("The saved grid's approved-board provenance could not be verified.", 409);
  }
}

function isBoardProvenance(value) {
  if (!isRecord(value)
    || !Object.values(BOARD_CLASSIFICATIONS).includes(value.classification)
    || typeof value.approvalAuthority !== "boolean"
    || (value.releaseCandidateIdentity !== null
      && !isReleaseCandidateIdentity(value.releaseCandidateIdentity))
    || (value.sourceReleaseCandidateIdentity !== null
      && !isReleaseCandidateIdentity(value.sourceReleaseCandidateIdentity))
    || Object.keys(value).some(key => ![
      "classification", "approvalAuthority", "releaseCandidateIdentity",
      "sourceReleaseCandidateIdentity",
    ].includes(key))) return false;
  if (value.classification === BOARD_CLASSIFICATIONS.exact) {
    return value.approvalAuthority === true
      && isReleaseCandidateIdentity(value.releaseCandidateIdentity)
      && canonicalJson(value.releaseCandidateIdentity)
        === canonicalJson(value.sourceReleaseCandidateIdentity);
  }
  if (value.classification === BOARD_CLASSIFICATIONS.derived) {
    return value.approvalAuthority === false
      && value.releaseCandidateIdentity === null
      && isReleaseCandidateIdentity(value.sourceReleaseCandidateIdentity);
  }
  return value.approvalAuthority === false
    && value.releaseCandidateIdentity === null
    && value.sourceReleaseCandidateIdentity === null;
}

async function sendToWorkstation(envelope, { env, fetchImpl, timestampDate }) {
  const rawBody = JSON.stringify(envelope);
  const timestamp = String(Math.floor(timestampDate.getTime() / 1000));
  const idempotencyKey = envelope.idempotencyKey;
  const digest = sha256(rawBody);
  const signature = createHmac("sha256", env.WORKSTATION_FANDOM_HMAC_SECRET)
    .update(`${timestamp}\n${idempotencyKey}\n${digest}`)
    .digest("hex");
  let response;
  try {
    response = await fetchImpl(env.WORKSTATION_FANDOM_INTAKE_URL || DEFAULT_WORKSTATION_URL, {
      method: "POST",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "X-Fandom-Key-Id": env.WORKSTATION_FANDOM_HMAC_KEY_ID,
        "X-Fandom-Timestamp": timestamp,
        "X-Fandom-Signature": `v1=${signature}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: rawBody,
    });
  } catch (error) {
    throw requestError(publicError(error, "Workstation intake failed."), 502, "workstation");
  }
  const payload = await readJson(response, "Workstation");
  if (!response.ok) {
    throw requestError(
      response.status === 409
        ? "Workstation already has a different draft for this request."
        : `Workstation rejected the draft handoff (HTTP ${response.status}).`,
      response.status === 409 ? 409 : 502,
      "workstation",
    );
  }
  return payload;
}

function validateReceipt(value, _source, envelope, workstationAppUrl) {
  const receipt = isRecord(value) && isRecord(value.receipt) ? value.receipt : value;
  if (
    !isRecord(receipt)
    || receipt.deliverableId !== envelope.deliverableId
    || typeof receipt.postId !== "string"
    || !receipt.postId
    || !isHttpsUrl(receipt.postUrl)
    || receipt.status !== "Draft"
    || !Number.isSafeInteger(receipt.sourceVersion)
    || receipt.sourceVersion < 0
    || receipt.sourceVersion !== envelope.sourceVersion
    || receipt.workflow !== WORKSTATION_WORKFLOW
    || !["created", "replayed", "updated"].includes(receipt.disposition)
    || !["synced", "operator-diverged"].includes(receipt.mediaSyncState)
    || !Array.isArray(receipt.warnings)
    || receipt.warnings.some(warning => typeof warning !== "string")
  ) throw requestError("Workstation returned an invalid Creator Draft receipt.", 502, "workstation");
  const deepLink = typeof receipt.deepLink === "string"
    ? trustedComposerUrl(receipt.deepLink, receipt.postId)
    : buildWorkstationDeepLink(receipt.postId, workstationAppUrl);
  return {
    deliverableId: receipt.deliverableId,
    postId: receipt.postId,
    postUrl: receipt.postUrl,
    deepLink,
    status: receipt.status,
    sourceVersion: receipt.sourceVersion,
    workflow: WORKSTATION_WORKFLOW,
    disposition: receipt.disposition,
    mediaSyncState: receipt.mediaSyncState,
    warnings: [...receipt.warnings],
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
  if (!env.WORKSTATION_FANDOM_HMAC_KEY_ID || !env.WORKSTATION_FANDOM_HMAC_SECRET) {
    throw requestError("Workstation Fandom HMAC credentials are not configured.", 503);
  }
}

function isCompletedRecord(record, source) {
  return isRecord(record)
    && (record.state === "completed" || record.state === undefined)
    && record.sourceFingerprint === source.sourceVersion
    && sameStrings(record.platforms, source.platforms)
    && isRecord(record.receipt)
    && Number.isSafeInteger(record.receipt.sourceVersion);
}

function storedPendingHandoff(record, source, grid, sourceVersion, expectedSourceVersion) {
  if (
    !isRecord(record)
    || record.state !== "pending"
    || record.sourceFingerprint !== source.sourceVersion
    || !sameStrings(record.platforms, source.platforms)
    || record.sourceVersion !== sourceVersion
    || record.expectedSourceVersion !== expectedSourceVersion
    || !Array.isArray(record.media)
    || record.media.length !== 1
    || typeof record.generatedAt !== "string"
    || !isCanonicalIsoDate(record.generatedAt)
  ) return null;

  const registration = record.media[0];
  const metadata = registration?.metadata;
  const expectedCardIds = grid.images.map(image => image.resultId);
  if (
    !isRecord(registration)
    || typeof registration.assetId !== "string"
    || !UUID_PATTERN.test(registration.assetId)
    || !isStableMediaUrl(registration.url)
    || typeof registration.filename !== "string"
    || registration.mimeType !== "image/png"
    || !Number.isInteger(registration.sizeBytes)
    || registration.sizeBytes < 8
    || typeof registration.checksum !== "string"
    || !/^[a-f0-9]{64}$/i.test(registration.checksum)
    || registration.role !== "cover"
    || registration.renderVariant !== RENDER_VARIANT
    || registration.position !== 0
    || registration.deliveryUrl !== registration.url
    || !isStableMediaUrl(registration.thumbnailUrl)
    || registration.dimensions?.width !== RENDER_WIDTH
    || registration.dimensions?.height !== RENDER_HEIGHT
    || !sameStrings(registration.sourceCardIds, expectedCardIds)
    || !isRecord(registration.provenance)
    || registration.provenance.origin !== "fandom-vibes"
    || registration.provenance.sourceKind !== "ordered-grid"
    || registration.provenance.sourceId !== source.sourceId
    || registration.provenance.sourceFingerprint !== source.sourceVersion
    || registration.provenance.generatedAt !== grid.generatedAt
    || !isRecord(metadata)
    || metadata.sourceType !== "fandom-creator-draft-grid"
    || !isHttpsUrl(metadata.sourceUrl)
    || metadata.origin !== "fandom-vibes"
    || metadata.rightsStatus !== "unknown"
    || typeof metadata.rightsNotes !== "string"
    || !sameStrings(metadata.actor, [grid.actor, grid.actorEn].filter(Boolean))
    || !sameStrings(metadata.seriesTags, ["Fandom", "Workstation", "Vibe Atlas", `grid:${source.sourceId}`])
    || !sameStrings(metadata.linkedPostIdentifiers, [
      `fandom/grid/${source.sourceId}`,
      `fandom/draft/${source.idempotencyKey}`,
    ])
  ) return null;

  // Normalize the persisted value so unrecognized stored fields never enter Workstation.
  return {
    generatedAt: record.generatedAt,
    sourceVersion,
    expectedSourceVersion,
    registration: {
      assetId: registration.assetId,
      url: registration.url,
      filename: registration.filename,
      mimeType: registration.mimeType,
      sizeBytes: registration.sizeBytes,
      checksum: registration.checksum,
      deliveryUrl: registration.deliveryUrl,
      thumbnailUrl: registration.thumbnailUrl,
      dimensions: {
        width: registration.dimensions.width,
        height: registration.dimensions.height,
      },
      role: "cover",
      renderVariant: RENDER_VARIANT,
      position: 0,
      sourceCardIds: [...registration.sourceCardIds],
      provenance: {
        origin: "fandom-vibes",
        sourceKind: "ordered-grid",
        sourceId: source.sourceId,
        sourceFingerprint: source.sourceVersion,
        generatedAt: grid.generatedAt,
      },
      metadata: {
        sourceType: "fandom-creator-draft-grid",
        sourceUrl: metadata.sourceUrl,
        origin: "fandom-vibes",
        rightsStatus: "unknown",
        rightsNotes: metadata.rightsNotes,
        actor: [...metadata.actor],
        seriesTags: [...metadata.seriesTags],
        linkedPostIdentifiers: [...metadata.linkedPostIdentifiers],
      },
    },
  };
}

function isCanonicalIsoDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function sameStrings(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => typeof item === "string" && item === expected[index]);
}

async function persistHandoffRecord(store, key, record, priorEntry) {
  try {
    const options = priorEntry?.etag
      ? { onlyIfMatch: priorEntry.etag }
      : priorEntry?.data
        ? null
        : { onlyIfNew: true };
    if (!options) {
      throw requestError(
        "Creator Draft handoff storage does not support safe updates.",
        503,
        "storage",
      );
    }
    return await store.setJSON(key, record, options);
  } catch {
    throw requestError("Creator Draft handoff state could not be persisted.", 502, "storage");
  }
}

async function getBlob(store, key) {
  try {
    if (typeof store.getWithMetadata === "function") {
      return await store.getWithMetadata(key, { type: "json", consistency: "strong" });
    }
    const data = await store.get(key, { type: "json", consistency: "strong" });
    return data ? { data } : null;
  } catch {
    throw storageError();
  }
}

function accountScopeFor(accountId) {
  return sha256(`creator-grid-handoff-account-v1\0${accountId}`);
}

function receiptKey(accountScope, source) {
  return `v2/${accountScope}/${sha256(`direct-grid\0${source.sourceId}\0${OUTPUT_ID}`)}`;
}

function completedSourceVersion(record) {
  return isRecord(record)
    && record.state === "completed"
    && Number.isSafeInteger(record.receipt?.sourceVersion)
    && record.receipt.sourceVersion >= 0
    ? record.receipt.sourceVersion
    : null;
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

function buildWorkstationDeepLink(postId, base) {
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

function publicError(error, fallback = "The upstream service could not complete the request.") {
  return fallback;
}

function requestError(message, status, stage) {
  const error = new Error(message);
  error.status = status;
  error.stage = stage;
  return error;
}

function storageError() {
  return requestError("Creator Draft handoff storage could not be read.", 502, "storage");
}

export function normalizePlatforms(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > CREATOR_PLATFORMS.length) {
    throw requestError("Creator Draft destinations must include Rednote, Weibo, Instagram, or a combination.", 400);
  }
  const unique = new Set(value);
  if (
    unique.size !== value.length
    || [...unique].some(platform => !CREATOR_PLATFORMS.includes(platform))
  ) {
    throw requestError("Creator Draft destinations must be a unique canonical platform list.", 400);
  }
  const normalized = CREATOR_PLATFORMS.filter(platform => unique.has(platform));
  if (JSON.stringify(normalized) !== JSON.stringify(value)) {
    throw requestError("Creator Draft destinations must be a unique canonical platform list.", 400);
  }
  return normalized;
}

function trustedComposerUrl(value, postId) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw requestError("Workstation returned an invalid composer URL.", 502, "workstation");
  }
  if (
    url.origin !== "https://workstation.justlikekatie.com"
    || url.username
    || url.password
    || url.hash
    || url.pathname !== "/compose"
    || [...url.searchParams.keys()].some(key => key !== "postId")
    || url.searchParams.getAll("postId").length !== 1
    || url.searchParams.get("postId") !== postId
  ) {
    throw requestError("Workstation returned an invalid composer URL.", 502, "workstation");
  }
  return url.toString();
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

function numericSourceVersion(source) {
  const material = canonicalJson({
    sourceFingerprint: source.sourceVersion,
    platforms: source.platforms,
    outputId: OUTPUT_ID,
  });
  const max = BigInt(Number.MAX_SAFE_INTEGER - 1);
  return Number(BigInt(`0x${sha256(material).slice(0, 16)}`) % max) + 1;
}

function isValidCollectionMediaReference(media) {
  return isRecord(media)
    && media.schemaVersion === 1
    && typeof media.assetId === "string"
    && UUID_PATTERN.test(media.assetId)
    && isStableMediaUrl(media.deliveryUrl)
    && isStableMediaUrl(media.thumbnailUrl)
    && ["image/png", "image/jpeg", "image/webp"].includes(media.mimeType)
    && Number.isInteger(media.sizeBytes)
    && media.sizeBytes > 0
    && typeof media.checksum === "string"
    && /^[a-f0-9]{64}$/i.test(media.checksum)
    && Number.isInteger(media.dimensions?.width)
    && media.dimensions.width > 0
    && Number.isInteger(media.dimensions?.height)
    && media.dimensions.height > 0
    && media.association?.type === "collection"
    && typeof media.association.id === "string"
    && typeof media.association.itemId === "string";
}

function canonicalMediaReference(media) {
  if (!isValidCollectionMediaReference(media)) {
    throw requestError("The saved grid contains an invalid trusted MEDIA reference.", 409, "media-readiness");
  }
  return {
    schemaVersion: 1,
    assetId: media.assetId,
    deliveryUrl: media.deliveryUrl,
    thumbnailUrl: media.thumbnailUrl,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    checksum: media.checksum,
    dimensions: {
      width: media.dimensions.width,
      height: media.dimensions.height,
    },
    association: {
      type: "collection",
      id: media.association.id,
      itemId: media.association.itemId,
    },
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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