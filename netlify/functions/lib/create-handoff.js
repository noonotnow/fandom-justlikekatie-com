import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  RENDER_CONTRACT,
  RENDER_HEIGHT,
  RENDER_VERSION,
  RENDER_WIDTH,
  renderCanonicalOutput,
} from "./canonical-render.js";
import { HANDOFF_ATTEMPT_STORE, withHandoffLease } from "./handoff-lease.js";
import { upgradeLegacyPacket, withIdeaPacketLock } from "./idea-packets.js";

const PACKET_STORE = "idea-packets";
const ATTEMPT_SCHEMA_VERSION = 1;
const UPSTREAM_TIMEOUT_MS = 30_000;
const MAX_OUTPUTS = 10;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
const DEFAULT_CREATE_URL = "https://create.justlikekatie.com/api/integrations/fandom/projects";
const DEFAULT_CREATE_APP_URL = "https://create.justlikekatie.com";
// Pre-PR8 handoffAttempt pointers were exactly this shape: no schemaVersion/artifactKey,
// because the checkpointed-artifact retry pipeline (PR8) did not exist yet.
const LEGACY_ATTEMPT_POINTER_KEYS = new Set([
  "sourceVersion",
  "expectedSourceVersion",
  "packetVersion",
  "fingerprint",
  "generatedAt",
]);
const HEX64_PATTERN = /^[0-9a-f]{64}$/;

class RequestError extends Error {
  constructor(message, status = 400, stage = "request", details) {
    super(message);
    this.status = status;
    this.stage = stage;
    this.details = details;
  }
}

class UpstreamError extends RequestError {
  constructor(message, status = 502, stage, details) {
    super(message, status, stage, details);
  }
}

export function createCreateHandoffHandler({
  env = process.env,
  fetchImpl = fetch,
  getStore,
  now = () => new Date(),
  renderOutputImpl = renderCanonicalOutput,
} = {}) {
  return async function createHandoff(req, context) {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    try {
      validateSameOrigin(req);
      validateAuthorization(req, env.PLAN_OPERATOR_TOKEN);
      requireConfiguration(env);
      const manifest = await readManifest(req);
      const store = getStore(PACKET_STORE, context);
      const attemptStore = getStore(HANDOFF_ATTEMPT_STORE, context);
      const result = await withIdeaPacketLock(manifest.packetId, async () => {
        return withHandoffLease(attemptStore, manifest.packetId, async ({ renew }) => {
          const packetEntry = await getBlobWithMetadata(store, manifest.packetId);
          const packet = upgradeLegacyPacket(packetEntry?.data);
          validatePacketForHandoff(packet, manifest);
          let attempt = await loadReplayAttempt(packet, manifest, attemptStore, req.url);
          const legacyMigration = attempt?.legacyMigration ?? null;
          if (legacyMigration) attempt = null;
        if (!attempt) {
          const files = await renderFiles(packet, manifest.outputs, {
            renderOutputImpl,
            requestUrl: req.url,
            renew,
          });
        await renew();
          attempt = createAttemptSnapshot(packet, manifest, files, now().toISOString());
          if (legacyMigration) {
            // Pre-PR8 pointers carry no bytes/checksums/manifest to replay, so we render
            // fresh and mint a normal PR8 artifact — but the source CAS chain (sourceVersion/
            // expectedSourceVersion) and generatedAt must come from the legacy pointer itself,
            // not be recomputed, since CREATE may already have seen that exact source version.
            attempt.sourceVersion = legacyMigration.sourceVersion;
            attempt.expectedSourceVersion = legacyMigration.expectedSourceVersion;
            attempt.generatedAt = legacyMigration.generatedAt;
          } else if (isCompletedReplay(packet, attempt.fingerprint)) {
            attempt.sourceVersion = packet.handoff.sourceVersion;
            attempt.expectedSourceVersion = packet.handoff.expectedSourceVersion;
            attempt.sourcePacketVersion = packet.handoff.packetVersion;
            attempt.generatedAt = packet.handoff.generatedAt;
          }
          let pointerSaved;
          try {
            await attemptStore.setJSON(attempt.artifactKey, serializeAttempt(attempt));
            pointerSaved = await setJSONIfMatch(store, packet.id, {
              ...packet,
              handoffAttempt: attemptPointer(attempt),
            }, packetEntry?.etag);
          } catch {
            throw new UpstreamError(
              "Fandom could not persist the CREATE retry record. Nothing was sent.",
              502,
              "storage",
            );
          }
          if (!pointerSaved) {
            await removeCompletedAttempt(attemptStore, attempt.artifactKey);
            throw new RequestError(
              "This Idea Packet changed. Refresh before sending to CREATE.",
              409,
              "packet",
            );
          }
        }

        for (let index = attempt.registered.length; index < attempt.files.length; index += 1) {
          await renew();
          let registration;
          try {
            registration = await registerMedia(
              attempt.files[index],
              attempt.packet,
              attempt.outputs[index],
              {
                env,
                fetchImpl,
                requestUrl: req.url,
              },
            );
          } catch (error) {
            throw new UpstreamError(
              publicError(error, `MEDIA registration failed for output ${index + 1}`),
              error instanceof RequestError ? error.status : 502,
              error instanceof RequestError ? error.stage : "media",
              { registered: attempt.registered },
            );
          }
          await renew();
          attempt.registered.push(registration);
          try {
            await attemptStore.setJSON(attempt.artifactKey, serializeAttempt(attempt));
          } catch {
            throw new UpstreamError(
              "MEDIA accepted an asset, but Fandom could not checkpoint its retry descriptor.",
              502,
              "storage",
              { registered: attempt.registered },
            );
          }
        }

        const envelope = buildCreateEnvelope({
          packet: attempt.packet,
          outputs: attempt.outputs,
          files: attempt.files,
          registered: attempt.registered,
          sourceVersion: attempt.sourceVersion,
          expectedSourceVersion: attempt.expectedSourceVersion,
          packetVersion: attempt.sourcePacketVersion,
          generatedAt: attempt.generatedAt,
          requestUrl: req.url,
        });
        await renew();
        let receipt;
        try {
          receipt = await sendToCreate(envelope, { env, fetchImpl, timestampDate: now() });
        } catch (error) {
          throw new UpstreamError(
            publicError(error, "CREATE intake failed"),
            error instanceof RequestError ? error.status : 502,
            "create",
            { registered: attempt.registered },
          );
        }
        await renew();
        let exactReceipt;
        try {
          const createUrl = buildCreateDeepLink(receipt.postId, env.CREATE_APP_URL || DEFAULT_CREATE_APP_URL);
          exactReceipt = validateReceipt({ ...receipt, createUrl }, packet.id, attempt.sourceVersion);
        } catch (error) {
          throw new UpstreamError(
            publicError(error, "CREATE accepted a response that Fandom could not validate."),
            error instanceof RequestError ? error.status : 502,
            "create",
            { registered: attempt.registered, receipt },
          );
        }
        const completedAt = now().toISOString();
        const currentEntry = await getBlobWithMetadata(store, packet.id);
        const current = currentEntry?.data;
        if (!isRecord(current) || current.version !== packet.version) {
          throw new RequestError(
            "CREATE accepted the Draft, but this Idea Packet changed before its receipt could be stored. Refresh before retrying.",
            409,
            "packet",
            { registered: attempt.registered, receipt: exactReceipt },
          );
        }
        const { handoffAttempt: _attempt, ...currentPacket } = current;
        const saved = {
          ...currentPacket,
          handoff: {
            sourceVersion: attempt.sourceVersion,
            expectedSourceVersion: attempt.expectedSourceVersion,
            packetVersion: attempt.sourcePacketVersion,
            fingerprint: attempt.fingerprint,
            generatedAt: attempt.generatedAt,
            completedAt,
            receipt: exactReceipt,
          },
          updatedAt: completedAt,
          version: `${completedAt}-${createHash("sha256").update(attempt.fingerprint).digest("hex").slice(0, 12)}`,
        };
        let receiptSaved;
        try {
          receiptSaved = await setJSONIfMatch(store, packet.id, saved, currentEntry?.etag);
        } catch {
          throw new UpstreamError(
            "CREATE accepted the Draft, but Fandom could not persist its receipt. Retry safely to recover it.",
            502,
            "storage",
            { registered: attempt.registered, receipt: exactReceipt },
          );
        }
        if (!receiptSaved) {
          throw new RequestError(
            "CREATE accepted the Draft, but this Idea Packet changed before its receipt could be stored. Refresh before retrying.",
            409,
            "packet",
            { registered: attempt.registered, receipt: exactReceipt },
          );
        }
        await removeCompletedAttempt(attemptStore, attempt.artifactKey);
          return { packet: saved, receipt: exactReceipt, media: attempt.registered };
        }, {
          conflict: message => new RequestError(message, 409, "storage"),
        });
      });
      return jsonResponse(result.receipt.disposition === "created" ? 201 : 200, result);
    } catch (error) {
      if (error instanceof RequestError) {
        return jsonResponse(error.status, {
          error: error.message,
          stage: error.stage,
          ...(error.details ? { details: error.details } : {}),
        });
      }
      console.error("[create-handoff] unexpected error", error);
      return jsonResponse(500, { error: "Internal server error", stage: "server" });
    }
  };
}

function validatePacketForHandoff(packet, manifest) {
  if (!isRecord(packet)) throw new RequestError("Idea Packet was not found.", 404, "packet");
  if (packet.version !== manifest.expectedVersion) {
    throw new RequestError("This Idea Packet changed. Refresh before sending to CREATE.", 409, "packet");
  }
  if (packet.state !== "media_compiled") {
    throw new RequestError("Mark media compiled before sending this Idea Packet.", 409, "packet");
  }
  const expected = (packet.outputs || []).filter(output => output.included);
  if (expected.length === 0) throw new RequestError("Include at least one packet output.", 400, "packet");
  if (
    expected.length !== manifest.outputs.length
    || expected.some((output, index) => (
      output.id !== manifest.outputs[index].outputId
      || output.kind !== manifest.outputs[index].kind
      || output.sourceId !== manifest.outputs[index].sourceId
    ))
  ) {
    throw new RequestError("Selected outputs do not match the current Idea Packet.", 409, "packet");
  }
}

async function getBlobWithMetadata(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

async function setJSONIfMatch(store, key, value, etag) {
  if (!etag) {
    await store.setJSON(key, value);
    return true;
  }
  const result = await store.setJSON(key, value, { onlyIfMatch: etag });
  if (result?.modified === false) return false;
  if (result?.modified === true) return true;
  const stored = await getBlobWithMetadata(store, key);
  return JSON.stringify(stored?.data) === JSON.stringify(value);
}

async function removeCompletedAttempt(store, artifactKey) {
  if (typeof store.delete !== "function") return;
  try {
    await store.delete(artifactKey);
  } catch (error) {
    console.error("[create-handoff] could not remove completed attempt artifact", error);
  }
}

function createAttemptSnapshot(packet, manifest, files, generatedAt) {
  const snapshot = structuredClone(packet);
  delete snapshot.handoff;
  delete snapshot.handoffAttempt;
  const outputs = structuredClone(manifest.outputs);
  const inputFingerprint = handoffInputFingerprint(snapshot, outputs);
  const fingerprint = handoffFingerprint(inputFingerprint, files);
  return {
    schemaVersion: ATTEMPT_SCHEMA_VERSION,
    artifactKey: `${safeFilenameSegment(packet.id)}/${sha256(`${packet.version}\n${inputFingerprint}`)}`,
    packet: snapshot,
    outputs,
    files,
    registered: [],
    sourceVersion: (packet.handoff?.sourceVersion || 0) + 1,
    expectedSourceVersion: packet.handoff?.sourceVersion ?? null,
    packetVersion: packet.version,
    sourcePacketVersion: packet.version,
    inputFingerprint,
    fingerprint,
    generatedAt,
  };
}

async function loadReplayAttempt(packet, manifest, attemptStore, requestUrl) {
  const pointer = packet.handoffAttempt;
  if (pointer === undefined) return null;
  if (!isRecord(pointer)) throw invalidAttemptState();
  if (isLegacyAttemptPointerShape(pointer)) {
    const legacyState = validateLegacyAttemptPointer(pointer, packet);
    // A legacy pointer whose packetVersion no longer matches the current packet is stale:
    // safely supersede it exactly like an absent pointer, so a normal fresh attempt is made.
    if (legacyState === "stale") return null;
    return { legacyMigration: pointer };
  }
  if (
    pointer.schemaVersion !== ATTEMPT_SCHEMA_VERSION
    || typeof pointer.artifactKey !== "string"
    || typeof pointer.inputFingerprint !== "string"
    || typeof pointer.packetVersion !== "string"
    || pointer.artifactKey !== `${safeFilenameSegment(packet.id)}/${sha256(`${pointer.packetVersion}\n${pointer.inputFingerprint}`)}`
    || typeof pointer.fingerprint !== "string"
    || typeof pointer.generatedAt !== "string"
    || !Number.isFinite(Date.parse(pointer.generatedAt))
    || typeof pointer.sourcePacketVersion !== "string"
    || !Number.isInteger(pointer.sourceVersion)
    || pointer.sourceVersion < 1
    || (
      pointer.expectedSourceVersion !== null
      && (!Number.isInteger(pointer.expectedSourceVersion) || pointer.expectedSourceVersion < 1)
    )
  ) {
    throw invalidAttemptState();
  }
  if (pointer.packetVersion !== packet.version) return null;
  let storedAttempt;
  try {
    storedAttempt = (await getBlobWithMetadata(attemptStore, pointer.artifactKey))?.data;
  } catch {
    throw new UpstreamError(
      "Fandom could not read the persisted CREATE retry state.",
      502,
      "storage",
    );
  }
  const attempt = deserializeAttempt(storedAttempt);
  if (
    attempt.artifactKey !== pointer.artifactKey
    || attempt.packetVersion !== pointer.packetVersion
    || attempt.sourcePacketVersion !== pointer.sourcePacketVersion
    || attempt.inputFingerprint !== pointer.inputFingerprint
    || attempt.fingerprint !== pointer.fingerprint
    || attempt.generatedAt !== pointer.generatedAt
    || attempt.sourceVersion !== pointer.sourceVersion
    || attempt.expectedSourceVersion !== pointer.expectedSourceVersion
    || attempt.packet.id !== packet.id
    || JSON.stringify(attempt.outputs) !== JSON.stringify(manifest.outputs)
    || handoffInputFingerprint(packet, manifest.outputs) !== attempt.inputFingerprint
    || handoffInputFingerprint(attempt.packet, attempt.outputs) !== attempt.inputFingerprint
    || handoffFingerprint(attempt.inputFingerprint, attempt.files) !== attempt.fingerprint
  ) {
    throw invalidAttemptState();
  }
  for (let index = 0; index < attempt.registered.length; index += 1) {
    const registration = attempt.registered[index];
    if (!isRecord(registration)) throw invalidAttemptState();
    try {
      validateMediaDescriptor({ data: registration.descriptor }, attempt.files[index]);
    } catch {
      throw invalidAttemptState();
    }
    if (
      typeof registration.deduplicated !== "boolean"
      || JSON.stringify(registration.metadata)
        !== JSON.stringify(buildMediaMetadata(attempt.packet, attempt.outputs[index], requestUrl))
    ) {
      throw invalidAttemptState();
    }
  }
  return attempt;
}

function attemptPointer(attempt) {
  return {
    schemaVersion: attempt.schemaVersion,
    artifactKey: attempt.artifactKey,
    sourceVersion: attempt.sourceVersion,
    expectedSourceVersion: attempt.expectedSourceVersion,
    packetVersion: attempt.packetVersion,
    sourcePacketVersion: attempt.sourcePacketVersion,
    inputFingerprint: attempt.inputFingerprint,
    fingerprint: attempt.fingerprint,
    generatedAt: attempt.generatedAt,
  };
}

function serializeAttempt(attempt) {
  return {
    ...attempt,
    files: attempt.files.map(file => ({
      checksum: file.checksum,
      sizeBytes: file.sizeBytes,
      filename: file.filename,
      bytesBase64: Buffer.from(file.bytes).toString("base64"),
    })),
  };
}

function deserializeAttempt(value) {
  if (
    !isRecord(value)
    || value.schemaVersion !== ATTEMPT_SCHEMA_VERSION
    || !isRecord(value.packet)
    || !Array.isArray(value.outputs)
    || !Array.isArray(value.files)
    || !Array.isArray(value.registered)
    || value.registered.length > value.files.length
  ) {
    throw invalidAttemptState();
  }
  const files = value.files.map(file => {
    if (
      !isRecord(file)
      || typeof file.bytesBase64 !== "string"
      || typeof file.checksum !== "string"
      || typeof file.filename !== "string"
      || !Number.isInteger(file.sizeBytes)
    ) {
      throw invalidAttemptState();
    }
    const bytes = new Uint8Array(Buffer.from(file.bytesBase64, "base64"));
    if (
      Buffer.from(bytes).toString("base64") !== file.bytesBase64
      || bytes.byteLength !== file.sizeBytes
      || sha256(bytes) !== file.checksum
      || bytes.byteLength < 8
      || bytes.byteLength > MAX_PNG_BYTES
      || !isPng(bytes)
    ) {
      throw invalidAttemptState();
    }
    return {
      bytes,
      checksum: file.checksum,
      sizeBytes: file.sizeBytes,
      filename: file.filename,
    };
  });
  return { ...structuredClone(value), files };
}

function invalidAttemptState() {
  return new RequestError(
    "The persisted CREATE retry state is invalid. Change the packet to supersede it before retrying.",
    409,
    "storage",
  );
}

// A pre-PR8 pointer is recognizable only by its exact legacy shape: precisely the five
// fields below, with no schemaVersion/artifactKey (those did not exist before PR8). Anything
// else — extra fields, missing fields, or a schemaVersion/artifactKey present but invalid —
// is NOT treated as a recognizable legacy pointer and falls through to fail closed instead.
function isLegacyAttemptPointerShape(pointer) {
  const keys = Object.keys(pointer);
  return !("schemaVersion" in pointer)
    && !("artifactKey" in pointer)
    && keys.length === LEGACY_ATTEMPT_POINTER_KEYS.size
    && keys.every(key => LEGACY_ATTEMPT_POINTER_KEYS.has(key));
}

// Validates a recognized legacy pointer strictly, then classifies it as either "stale"
// (packetVersion no longer matches the current packet, so it can be safely superseded by a
// normal fresh attempt) or "current" (matches the current packet and chains correctly from
// the persisted completed handoff, so it is safe to migrate in place). Anything else —
// malformed fields or a current-version pointer whose source CAS chain does not match the
// persisted packet.handoff — fails closed before any render or upstream call.
function validateLegacyAttemptPointer(pointer, packet) {
  if (
    !Number.isInteger(pointer.sourceVersion)
    || pointer.sourceVersion < 1
    || (
      pointer.expectedSourceVersion !== null
      && (!Number.isInteger(pointer.expectedSourceVersion) || pointer.expectedSourceVersion < 1)
    )
    || typeof pointer.packetVersion !== "string"
    || !pointer.packetVersion
    || typeof pointer.fingerprint !== "string"
    || !HEX64_PATTERN.test(pointer.fingerprint)
    || typeof pointer.generatedAt !== "string"
    || !Number.isFinite(Date.parse(pointer.generatedAt))
  ) {
    throw invalidAttemptState();
  }
  if (pointer.packetVersion !== packet.version) return "stale";
  const expectedSourceVersion = (packet.handoff?.sourceVersion || 0) + 1;
  const expectedPriorSourceVersion = packet.handoff?.sourceVersion ?? null;
  if (
    pointer.sourceVersion !== expectedSourceVersion
    || pointer.expectedSourceVersion !== expectedPriorSourceVersion
  ) {
    throw invalidAttemptState();
  }
  return "current";
}

async function renderFiles(packet, outputs, { renderOutputImpl, requestUrl, renew }) {
  const files = [];
  for (const output of outputs) {
    await renew?.();
    const selected = packet.outputs.find(candidate => candidate.id === output.outputId);
    let bytes;
    try {
      bytes = new Uint8Array(await renderOutputImpl(packet, selected, { requestUrl }));
    } catch (error) {
      throw new RequestError(
        `Canonical render failed for ${selected.label}: ${publicError(error, "source image could not be rendered")}`,
        422,
        "render",
      );
    }
    if (bytes.byteLength < 8 || bytes.byteLength > MAX_PNG_BYTES || !isPng(bytes)) {
      throw new RequestError(`Canonical render for ${output.outputId} did not produce a valid PNG.`, 502, "render");
    }
    files.push({
      bytes,
      checksum: sha256(bytes),
      sizeBytes: bytes.byteLength,
      filename: `idea-packet-${safeFilenameSegment(packet.id)}-${safeFilenameSegment(output.outputId)}.png`,
    });
    await renew?.();
  }
  return files;
}

// Legacy pre-PR8 state (including the migration path above) never carries a MEDIA
// descriptor, checksum, or asset id to reuse — only identifiers/provenance (packet id,
// output id, source card ids, actor/vibe labels) that describe *intent*, not *bytes*.
// Identifiers/provenance alone are never sufficient to safely reuse a MEDIA descriptor:
// they don't prove the asset behind them still exists, wasn't replaced, or matches the
// bytes we would render today. So registerMedia always POSTs the freshly rendered bytes;
// MEDIA itself deduplicates by checksum server-side and returns the canonical descriptor
// for identical bytes. If bytes differ (e.g. re-rendered from changed source content),
// MEDIA mints one new canonical asset — never a second parallel "migrated" asset set.
async function registerMedia(file, packet, output, { env, fetchImpl, requestUrl }) {
  const sourceCards = output.kind === "grid"
    ? packet.sourceCards
    : packet.sourceCards.filter(card => card.id === output.sourceId);
  const sourceUrl = absoluteHttpsUrl(
    sourceCards[0]?.sourceUrl || packet.provenance.sourceRoute,
    requestUrl,
  );
  const metadata = {
    sourceType: "fandom-idea-packet-output",
    sourceUrl,
    origin: "fandom-vibes",
    rightsStatus: "unknown",
    rightsNotes: JSON.stringify({
      schema: "fandom.media-provenance.v1",
      source: "Fandom",
      resultIds: sourceCards.map(card => card.resultId),
      starDateShanghai: shanghaiDay(packet.provenance.generatedAt),
      collection: {
        route: packet.provenance.sourceRoute,
        gridId: packet.provenance.gridId,
        generatedAt: packet.provenance.generatedAt,
      },
      packet: { id: packet.id, version: packet.version, status: packet.state },
      output: { id: output.outputId, kind: output.kind, sourceId: output.sourceId },
    }),
    actor: [packet.actor.name, packet.actor.nameEn].filter(Boolean),
    seriesTags: [
      "Fandom",
      "Idea Packet",
      `packet:${packet.id}`,
      `output:${output.outputId}`,
      `star-day:${shanghaiDay(packet.provenance.generatedAt)}`,
    ],
    linkedPostIdentifiers: [
      `fandom/project/${packet.id}`,
      `fandom/deliverable/${packet.id}/idea-packet-main`,
      ...sourceCards.map(card => `fandom/source-card/${card.id}`),
    ],
  };
  const body = new FormData();
  body.append("file", new File([file.bytes], file.filename, { type: "image/png" }));
  body.append("metadata", JSON.stringify(metadata));
  const response = await fetchImpl(env.MEDIA_ASSETS_URL || DEFAULT_MEDIA_URL, {
    method: "POST",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${env.MEDIA_ASSETS_TOKEN}` },
    body,
  });
  const payload = await readJson(response, "MEDIA");
  if (!response.ok) throw new UpstreamError(errorMessage(payload, `MEDIA returned HTTP ${response.status}`), 502, "media");
  const descriptor = validateMediaDescriptor(payload, file);
  return {
    descriptor,
    deduplicated: payload.meta?.deduplicated === true,
    metadata,
  };
}

function buildMediaMetadata(packet, output, requestUrl) {
  const sourceCards = output.kind === "grid"
    ? packet.sourceCards
    : packet.sourceCards.filter(card => card.id === output.sourceId);
  return {
    sourceType: "fandom-idea-packet-output",
    sourceUrl: absoluteHttpsUrl(
      sourceCards[0]?.sourceUrl || packet.provenance.sourceRoute,
      requestUrl,
    ),
    origin: "fandom-vibes",
    rightsStatus: "unknown",
    rightsNotes: JSON.stringify({
      schema: "fandom.media-provenance.v1",
      source: "Fandom",
      resultIds: sourceCards.map(card => card.resultId),
      starDateShanghai: shanghaiDay(packet.provenance.generatedAt),
      collection: {
        route: packet.provenance.sourceRoute,
        gridId: packet.provenance.gridId,
        generatedAt: packet.provenance.generatedAt,
      },
      packet: { id: packet.id, version: packet.version, status: packet.state },
      output: { id: output.outputId, kind: output.kind, sourceId: output.sourceId },
    }),
    actor: [packet.actor.name, packet.actor.nameEn].filter(Boolean),
    seriesTags: [
      "Fandom",
      "Idea Packet",
      `packet:${packet.id}`,
      `output:${output.outputId}`,
      `star-day:${shanghaiDay(packet.provenance.generatedAt)}`,
    ],
    linkedPostIdentifiers: [
      `fandom/project/${packet.id}`,
      `fandom/deliverable/${packet.id}/idea-packet-main`,
      ...sourceCards.map(card => `fandom/source-card/${card.id}`),
    ],
  };
}

function buildCreateEnvelope({
  packet,
  outputs,
  files,
  registered,
  sourceVersion,
  expectedSourceVersion,
  packetVersion,
  generatedAt,
  requestUrl,
}) {
  const sourceCards = packet.sourceCards.map(card => ({
    id: card.id,
    order: card.order,
    imageUrl: absoluteHttpsUrl(card.imageUrl, requestUrl),
    sourceUrl: absoluteHttpsUrl(card.sourceUrl, requestUrl),
    title: card.title,
    ...(card.creator ? { creator: card.creator } : {}),
    capturedAt: card.capturedAt,
    provenance: card.provenance,
  }));
  const attachments = outputs.map((output, position) => {
    const registration = registered[position];
    const sourceCardIds = output.kind === "grid"
      ? sourceCards.map(card => card.id)
      : [output.sourceId];
    return {
      assetId: registration.descriptor.assetId,
      url: registration.descriptor.deliveryUrl,
      filename: files[position].filename,
      nameTag: output.kind === "grid" ? "Idea Packet grid" : "Idea Packet image",
      mimeType: "image/png",
      role: position === 0 ? "cover" : "slide",
      position,
      sourceCardIds,
      provenance: {
        origin: "fandom-vibes",
        sourceKind: output.kind === "grid" ? "grid" : "card",
        sourceId: output.sourceId,
        packetId: packet.id,
        deliverableId: "idea-packet-main",
        generatedAt,
      },
    };
  });
  const captionSeed = packet.captionSeeds.trim();
  const angles = splitLines(packet.outputAngles);
  return {
    schemaVersion: "fandom.static-deliverable.v1",
    workflow: "packet",
    origin: "fandom-vibes",
    outputId: "idea-packet-main",
    outputKind: attachments.length > 1
      ? "packet_carousel"
      : outputs[0].kind === "grid"
        ? "packet_combined_grid"
        : "packet_single",
    renderVariant: outputs.map(output => output.kind).join("+"),
    renderVersion: 1,
    sourceVersion,
    expectedSourceVersion,
    packetId: packet.id,
    packetVersion,
    packetStatus: "media_compiled",
    deliverableId: "idea-packet-main",
    starDateShanghai: shanghaiDay(packet.provenance.generatedAt),
    route: packet.provenance.sourceRoute,
    grid: packet.provenance.gridId,
    generatedAt,
    actor: { id: packet.actor.id, label: packet.actor.name },
    vibe: { id: stableSegment(packet.vibe.labelEn), label: `${packet.vibe.emoji} ${packet.vibe.label}` },
    anchor: packet.anchor.label,
    sourceCards,
    concept: packet.workingAngle.trim() || packet.anchor.label,
    angles: angles.length ? angles : ["Static card"],
    ...(packet.notes.trim() ? { notes: packet.notes.trim() } : {}),
    draft: {
      title: `${packet.actor.name} · ${packet.vibe.labelEn}`,
      caption: captionSeed,
      provenance: JSON.stringify({
        schema: "fandom.idea-packet.snapshot.v1",
        packetId: packet.id,
        packetVersion,
        gridId: packet.provenance.gridId,
        sourceVersion,
      }),
      captionSeed: captionSeed || "Develop caption from the Idea Packet working angle.",
      tags: [],
      series: ["A·Vibe"],
      type: "static",
    },
    publicationBrief: {
      type: "static",
      format: attachments.length > 1 ? "carousel" : "static-card",
      template: "Fandom Idea Packet",
      series: ["A·Vibe"],
      distribution: { primaryPlatform: "rednote", platforms: ["rednote"] },
      requiredAssets: attachments.map(attachment => attachment.assetId),
      captionBrief: captionSeed || "Develop caption from the Idea Packet working angle.",
      tags: [],
      requirements: [
        "Use only the attached canonical MEDIA assets.",
        "No scheduling or publishing action is authorized by this handoff.",
      ],
    },
    mediaAttachments: attachments,
  };
}

async function sendToCreate(envelope, { env, fetchImpl, timestampDate }) {
  const rawBody = JSON.stringify(envelope);
  const timestamp = String(Math.floor(timestampDate.getTime() / 1000));
  const idempotencyKey = `fandom/deliverable/${envelope.packetId}/${envelope.deliverableId}`;
  const bodyDigest = sha256(rawBody);
  const signature = createHmac("sha256", env.CREATE_FANDOM_HMAC_SECRET)
    .update(`${timestamp}\n${idempotencyKey}\n${bodyDigest}`)
    .digest("hex");
  const response = await fetchImpl(env.CREATE_FANDOM_INTAKE_URL || DEFAULT_CREATE_URL, {
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
  const payload = await readJson(response, "CREATE");
  if (!response.ok) {
    throw new UpstreamError(errorMessage(payload, `CREATE returned HTTP ${response.status}`), response.status === 409 ? 409 : 502, "create");
  }
  return payload;
}

function validateReceipt(receipt, packetId, sourceVersion) {
  if (receipt?.mediaSyncState === "operator-diverged") {
    throw new UpstreamError(
      "CREATE reported operator-diverged media. Resolve the operator-owned Draft conflict in CREATE before retrying.",
      409,
      "create",
    );
  }
  if (
    !isRecord(receipt)
    || typeof receipt.postId !== "string"
    || !receipt.postId
    || !isHttpsUrl(receipt.postUrl)
    || !isValidCreateUrl(receipt.createUrl, receipt.postId)
    || receipt.status !== "Draft"
    || receipt.sourceVersion !== sourceVersion
    || receipt.workflow !== "packet"
    || !["created", "replayed", "updated"].includes(receipt.disposition)
    || receipt.packetReceipt?.packetId !== packetId
    || receipt.packetReceipt?.deliverableId !== "idea-packet-main"
    || receipt.packetReceipt?.accepted !== true
    || receipt.mediaSyncState !== "synced"
    || !Array.isArray(receipt.warnings)
  ) {
    throw new UpstreamError("CREATE returned an invalid Draft receipt.", 502, "create");
  }
  return receipt;
}

function validateMediaDescriptor(payload, file) {
  const descriptor = payload?.data;
  if (
    !isRecord(descriptor)
    || descriptor.version !== 1
    || typeof descriptor.assetId !== "string"
    || !descriptor.assetId
    || descriptor.mediaType !== "image"
    || descriptor.mimeType !== "image/png"
    || descriptor.sizeBytes !== file.sizeBytes
    || descriptor.checksum !== file.checksum
    || !isPersistableMediaUrl(descriptor.fileUrl)
    || !isPersistableMediaUrl(descriptor.deliveryUrl)
    || !isPersistableMediaUrl(descriptor.thumbnailUrl)
    || !Number.isInteger(descriptor.dimensions?.width)
    || !Number.isInteger(descriptor.dimensions?.height)
  ) {
    throw new UpstreamError("MEDIA returned an invalid or mismatched image descriptor.", 502, "media");
  }
  return descriptor;
}

function isPersistableMediaUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function parseManifest(value) {
  const manifest = value;
  if (
    !isRecord(manifest)
    || typeof manifest.packetId !== "string"
    || !manifest.packetId
    || typeof manifest.expectedVersion !== "string"
    || !Array.isArray(manifest.outputs)
    || manifest.outputs.length < 1
    || manifest.outputs.length > MAX_OUTPUTS
    || Object.keys(manifest).some(key => !["packetId", "expectedVersion", "outputs"].includes(key))
  ) {
    throw new RequestError("Handoff manifest is invalid.");
  }
  for (const output of manifest.outputs) {
    if (
      !isRecord(output)
      || typeof output.outputId !== "string"
      || !output.outputId
      || !["grid", "individual"].includes(output.kind)
      || typeof output.sourceId !== "string"
      || !output.sourceId
      || output.renderContract !== RENDER_CONTRACT
      || output.renderVersion !== RENDER_VERSION
      || output.width !== RENDER_WIDTH
      || output.height !== RENDER_HEIGHT
      || Object.keys(output).some(key => ![
        "outputId",
        "kind",
        "sourceId",
        "renderContract",
        "renderVersion",
        "width",
        "height",
      ].includes(key))
    ) throw new RequestError("Handoff output manifest is invalid.");
  }
  return manifest;
}

async function readManifest(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new RequestError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new RequestError("Handoff request is too large.", 413);
  try { return parseManifest(JSON.parse(text)); } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Handoff manifest must be valid JSON.");
  }
}

async function readJson(response, label) {
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new UpstreamError(`${label} response is too large.`, 502, label.toLowerCase());
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new UpstreamError(`${label} returned invalid JSON.`, 502, label.toLowerCase()); }
}

function requireConfiguration(env) {
  if (!env.PLAN_OPERATOR_TOKEN) throw new RequestError("PLAN_OPERATOR_TOKEN is not configured.", 503);
  if (!env.MEDIA_ASSETS_TOKEN) throw new RequestError("MEDIA_ASSETS_TOKEN is not configured.", 503);
  if (!env.CREATE_FANDOM_HMAC_KEY_ID || !env.CREATE_FANDOM_HMAC_SECRET) {
    throw new RequestError("CREATE Fandom HMAC credentials are not configured.", 503);
  }
  buildCreateDeepLink("configuration-check", env.CREATE_APP_URL || DEFAULT_CREATE_APP_URL);
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    throw new RequestError("Cross-origin CREATE handoff requests are not allowed.", 403);
  }
}

function validateAuthorization(req, expectedToken) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const actual = Buffer.from(token);
  const expected = Buffer.from(expectedToken || "");
  if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new RequestError("Fandom Admin authorization is required.", 401);
  }
}

function handoffInputFingerprint(packet, outputs) {
  return sha256(JSON.stringify({
    packet: {
      id: packet.id,
      state: packet.state,
      actor: packet.actor,
      vibe: packet.vibe,
      provenance: packet.provenance,
      anchor: packet.anchor,
      sourceCards: packet.sourceCards,
      media: packet.media,
      outputs: packet.outputs,
      notes: packet.notes,
      workingAngle: packet.workingAngle,
      captionSeeds: packet.captionSeeds,
      outputAngles: packet.outputAngles,
    },
    outputs,
  }));
}

function isCompletedReplay(packet, fingerprint) {
  const handoff = packet.handoff;
  return isRecord(handoff)
    && handoff.fingerprint === fingerprint
    && packet.version === `${handoff.completedAt}-${sha256(fingerprint).slice(0, 12)}`;
}

function handoffFingerprint(inputFingerprint, files) {
  return sha256(JSON.stringify({
    inputFingerprint,
    files: files.map(file => ({ checksum: file.checksum, sizeBytes: file.sizeBytes })),
  }));
}

function buildCreateDeepLink(postId, base) {
  const url = new URL("/compose", base);
  if (url.protocol !== "https:" || url.hostname !== "create.justlikekatie.com") {
    throw new RequestError("CREATE_APP_URL must be https://create.justlikekatie.com.", 500, "server");
  }
  url.searchParams.set("postId", postId);
  return url.toString();
}

function isValidCreateUrl(value, postId) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "create.justlikekatie.com"
      && url.pathname === "/compose"
      && url.searchParams.get("postId") === postId;
  } catch {
    return false;
  }
}

function absoluteHttpsUrl(value, requestUrl) {
  const url = new URL(value, requestUrl);
  if (url.protocol !== "https:") throw new RequestError("Fandom source URLs must resolve to HTTPS.", 400, "packet");
  return url.toString();
}

function shanghaiDay(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function splitLines(value) {
  return String(value || "").split(/\n+/).map(line => line.trim()).filter(Boolean);
}

function stableSegment(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "vibe";
}

function safeFilenameSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "output";
}

function isPng(bytes) {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isHttpsUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function errorMessage(value, fallback) {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

function publicError(error, fallback) {
  return error instanceof Error && error.message ? error.message.slice(0, 500) : fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
