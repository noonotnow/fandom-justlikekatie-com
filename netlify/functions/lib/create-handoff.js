import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { upgradeLegacyPacket, withIdeaPacketLock } from "./idea-packets.js";

const PACKET_STORE = "idea-packets";
const MAX_OUTPUTS = 10;
const MAX_PNG_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_MEDIA_URL = "https://media.justlikekatie.com/v1/assets/images";
const DEFAULT_CREATE_URL = "https://create.justlikekatie.com/api/integrations/fandom/projects";
const DEFAULT_CREATE_APP_URL = "https://create.justlikekatie.com";

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
} = {}) {
  return async function createHandoff(req, context) {
    if (req.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "POST" });
    }
    try {
      validateSameOrigin(req);
      validateAuthorization(req, env.PLAN_OPERATOR_TOKEN);
      requireConfiguration(env);
      const form = await readForm(req);
      const manifest = parseManifest(form.get("manifest"));
      const store = getStore(PACKET_STORE, context);
      const result = await withIdeaPacketLock(manifest.packetId, async () => {
        const packet = upgradeLegacyPacket(await store.get(manifest.packetId, { type: "json" }));
        validatePacketForHandoff(packet, manifest);
        const files = await validateFiles(form, manifest.outputs);
        const fingerprint = handoffFingerprint(packet, files);
        const replayRecord = packet.handoff?.fingerprint === fingerprint
          ? packet.handoff
          : packet.handoffAttempt?.fingerprint === fingerprint
            ? packet.handoffAttempt
            : null;
        const replay = Boolean(replayRecord);
        const sourceVersion = replay ? replayRecord.sourceVersion : (packet.handoff?.sourceVersion || 0) + 1;
        const expectedSourceVersion = replay
          ? replayRecord.expectedSourceVersion
          : packet.handoff?.sourceVersion ?? null;
        const packetVersion = replay ? replayRecord.packetVersion : packet.version;
        const generatedAt = replay ? replayRecord.generatedAt : now().toISOString();
        const attempt = {
          sourceVersion,
          expectedSourceVersion,
          packetVersion,
          fingerprint,
          generatedAt,
        };
        if (
          packet.handoff?.fingerprint !== fingerprint
          && packet.handoffAttempt?.fingerprint !== fingerprint
        ) {
          try {
            await store.setJSON(packet.id, { ...packet, handoffAttempt: attempt });
          } catch {
            throw new UpstreamError(
              "Fandom could not persist the CREATE retry record. Nothing was sent.",
              502,
              "storage",
            );
          }
        }

        const registered = [];
        for (let index = 0; index < files.length; index += 1) {
          try {
            registered.push(await registerMedia(files[index], packet, manifest.outputs[index], {
              env,
              fetchImpl,
              requestUrl: req.url,
            }));
          } catch (error) {
            throw new UpstreamError(
              publicError(error, `MEDIA registration failed for output ${index + 1}`),
              502,
              "media",
              { registered },
            );
          }
        }

        const envelope = buildCreateEnvelope({
          packet,
          outputs: manifest.outputs,
          files,
          registered,
          sourceVersion,
          expectedSourceVersion,
          packetVersion,
          generatedAt,
          requestUrl: req.url,
        });
        let receipt;
        try {
          receipt = await sendToCreate(envelope, { env, fetchImpl, timestampDate: now() });
        } catch (error) {
          throw new UpstreamError(
            publicError(error, "CREATE intake failed"),
            error instanceof RequestError ? error.status : 502,
            "create",
            { registered },
          );
        }
        let exactReceipt;
        try {
          const createUrl = buildCreateDeepLink(receipt.postId, env.CREATE_APP_URL || DEFAULT_CREATE_APP_URL);
          exactReceipt = validateReceipt({ ...receipt, createUrl }, packet.id, sourceVersion);
        } catch (error) {
          throw new UpstreamError(
            publicError(error, "CREATE accepted a response that Fandom could not validate."),
            502,
            "create",
            { registered, receipt },
          );
        }
        const completedAt = now().toISOString();
        const current = await store.get(packet.id, { type: "json" });
        if (!isRecord(current) || current.version !== packet.version) {
          throw new RequestError(
            "CREATE accepted the Draft, but this Idea Packet changed before its receipt could be stored. Refresh before retrying.",
            409,
            "packet",
            { registered, receipt: exactReceipt },
          );
        }
        const { handoffAttempt: _attempt, ...currentPacket } = current;
        const saved = {
          ...currentPacket,
          handoff: {
            sourceVersion,
            expectedSourceVersion,
            packetVersion,
            fingerprint,
            generatedAt,
            completedAt,
            receipt: exactReceipt,
          },
          updatedAt: completedAt,
          version: `${completedAt}-${createHash("sha256").update(fingerprint).digest("hex").slice(0, 12)}`,
        };
        try {
          await store.setJSON(packet.id, saved);
        } catch {
          throw new UpstreamError(
            "CREATE accepted the Draft, but Fandom could not persist its receipt. Retry safely to recover it.",
            502,
            "storage",
            { registered, receipt: exactReceipt },
          );
        }
        return { packet: saved, receipt: exactReceipt, media: registered };
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

async function validateFiles(form, outputs) {
  const files = [];
  for (const output of outputs) {
    const file = form.get(output.fileField);
    if (!(file instanceof File)) throw new RequestError(`Missing PNG for ${output.outputId}.`);
    if (file.type !== "image/png" || file.size < 8 || file.size > MAX_PNG_BYTES) {
      throw new RequestError(`Output ${output.outputId} must be a valid PNG under ${MAX_PNG_BYTES} bytes.`, 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPng(bytes)) throw new RequestError(`Output ${output.outputId} does not contain PNG bytes.`);
    files.push({
      bytes,
      checksum: sha256(bytes),
      sizeBytes: bytes.byteLength,
      filename: output.filename,
    });
  }
  return files;
}

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
    || !["synced", "operator-diverged"].includes(receipt.mediaSyncState)
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
    || !isHttpsUrl(descriptor.fileUrl)
    || !isHttpsUrl(descriptor.deliveryUrl)
    || !isHttpsUrl(descriptor.thumbnailUrl)
    || !Number.isInteger(descriptor.dimensions?.width)
    || !Number.isInteger(descriptor.dimensions?.height)
  ) {
    throw new UpstreamError("MEDIA returned an invalid or mismatched image descriptor.", 502, "media");
  }
  return descriptor;
}

function parseManifest(value) {
  if (typeof value !== "string") throw new RequestError("A handoff manifest is required.");
  let manifest;
  try { manifest = JSON.parse(value); } catch { throw new RequestError("Handoff manifest must be valid JSON."); }
  if (
    !isRecord(manifest)
    || typeof manifest.packetId !== "string"
    || typeof manifest.expectedVersion !== "string"
    || !Array.isArray(manifest.outputs)
    || manifest.outputs.length < 1
    || manifest.outputs.length > MAX_OUTPUTS
  ) {
    throw new RequestError("Handoff manifest is invalid.");
  }
  const fields = new Set();
  for (const output of manifest.outputs) {
    if (
      !isRecord(output)
      || typeof output.outputId !== "string"
      || !["grid", "individual"].includes(output.kind)
      || typeof output.sourceId !== "string"
      || typeof output.filename !== "string"
      || !output.filename.endsWith(".png")
      || !/^output-\d+$/.test(output.fileField)
      || fields.has(output.fileField)
    ) throw new RequestError("Handoff output manifest is invalid.");
    fields.add(output.fileField);
  }
  return manifest;
}

async function readForm(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new RequestError("Content-Type must be multipart/form-data.");
  }
  try { return await req.formData(); } catch { throw new RequestError("Handoff request is malformed."); }
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

function handoffFingerprint(packet, files) {
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
