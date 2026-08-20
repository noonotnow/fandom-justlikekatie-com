import { randomUUID, timingSafeEqual } from "node:crypto";
import { HANDOFF_ATTEMPT_STORE, withHandoffLease } from "./handoff-lease.js";
import {
  IdeaPacketModeError,
  ideaPacketDeprecationHeaders,
  ideaPacketInvalidModeResponse,
  ideaPacketReadOnlyResponse,
  isIdeaPacketReadOnly,
} from "./idea-packet-cutover.js";
import {
  AESTHETIC_NAMES,
  ARTIFACT_TYPE_NAMES,
  MEME_FLAVOR_NAMES,
} from "./middle-earth-creative-grammar.js";
import { REFERENCE_STILL_FAMILY_SET } from "./middle-earth-reference-stills.js";

const STORE_NAME = "idea-packets";
const MAX_BODY_BYTES = 256 * 1024;
const STATES = new Set(["collecting", "media_compiled"]);
const mutationLocks = new Map();

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function createIdeaPacketsHandler({ env = process.env, getStore, auth }) {
  return async function ideaPackets(req, context) {
    try {
      validateSameOrigin(req);
      await validateAuthorization(req, env.PLAN_OPERATOR_TOKEN, auth, context);
      if (!env.PLAN_OPERATOR_TOKEN && !auth) {
        throw new RequestError("Idea Packets authorization is not configured.", 503);
      }
      const store = getStore(STORE_NAME, context);
      if (req.method === "GET") {
        return jsonResponse(200, { packets: await listPackets(store) }, ideaPacketDeprecationHeaders());
      }
      if (req.method === "POST" || req.method === "PATCH") {
        try {
          if (isIdeaPacketReadOnly(env)) return ideaPacketReadOnlyResponse();
        } catch (error) {
          if (error instanceof IdeaPacketModeError) return ideaPacketInvalidModeResponse();
          throw error;
        }
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const packet = validatePacket(body.packet);
        return await withIdeaPacketLock(packet.id, async () => {
          const leaseStore = getStore(HANDOFF_ATTEMPT_STORE, context);
          return withHandoffLease(leaseStore, packet.id, async () => {
            if (await store.get(packet.id, { type: "json" })) throw new RequestError("Idea Packet already exists.", 409);
            await store.setJSON(packet.id, packet);
            return jsonResponse(201, { packet });
          }, {
            conflict: message => new RequestError(message, 409),
          });
        });
      }
      if (req.method === "PATCH") {
        const body = await readBody(req);
        const id = requireString(body.id, "A packet id is required.");
        return await withIdeaPacketLock(id, async () => {
          const leaseStore = getStore(HANDOFF_ATTEMPT_STORE, context);
          return withHandoffLease(leaseStore, id, async () => {
            const entry = await getPacketWithMetadata(store, id);
            const current = upgradeLegacyPacket(entry?.data);
            if (!current) throw new RequestError("Idea Packet was deleted or is no longer available.", 404);
            if (body.expectedVersion !== current.version) throw new RequestError("This packet changed. Refresh before applying your edit.", 409);
            const packet = applyAction(current, body.action);
            if (!await setPacketIfMatch(store, packet.id, packet, entry?.etag)) {
              throw new RequestError("This packet changed. Refresh before applying your edit.", 409);
            }
            return jsonResponse(200, { packet });
          }, {
            conflict: message => new RequestError(message, 409),
          });
        });
      }
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "GET, POST, PATCH" });
    } catch (error) {
      if (error instanceof RequestError) return jsonResponse(error.status, { error: error.message });
      console.error("[idea-packets] unexpected error", error);
      return jsonResponse(500, { error: "Internal server error" });
    }
  };
}

export function validatePacket(input) {
  if (!isRecord(input)) throw new RequestError("A valid Idea Packet is required.");
  const packet = structuredClone(input);
  requireString(packet.id, "Packet id is required.");
  requireString(packet.createdAt, "Created date is required.");
  requireString(packet.version, "Packet version is required.");
  if (!STATES.has(packet.state)) throw new RequestError("Packet state is invalid.");
  if (!isRecord(packet.actor) || !packet.actor.id || !packet.actor.name) throw new RequestError("Packet actor is required.");
  if (!isRecord(packet.vibe) || !packet.vibe.label) throw new RequestError("Packet vibe is required.");
  if (!isRecord(packet.provenance) || !packet.provenance.sourceRoute || !packet.provenance.gridId) {
    throw new RequestError("Packet provenance is required.");
  }
  if (!isRecord(packet.anchor) || !Array.isArray(packet.anchor.imageUrls)) {
    throw new RequestError("Packet anchor media is required.");
  }
  if (!Array.isArray(packet.media)) throw new RequestError("Packet media must be a list.");
  if (!Array.isArray(packet.sourceCards) || packet.sourceCards.length === 0) {
    throw new RequestError("Packet source cards are required.");
  }
  // Determine whether this is a Middle-earth-only packet (all outputs are meme/spellbook).
  // For such packets grids may be empty. For all other packets we synthesize a legacy grid.
  const isMiddleEarthOnlyCandidate = Array.isArray(packet.outputs) && packet.outputs.length > 0
    && packet.outputs.every(o => o.kind === "meme" || o.kind === "spellbook");
  if (!isMiddleEarthOnlyCandidate) {
    // Require at least one anchor image for non-Middle-earth packets
    if (packet.anchor.imageUrls.length === 0) {
      throw new RequestError("Packet anchor media is required.");
    }
    packet.grids ||= [legacyGridForPacket(packet)];
  } else {
    packet.grids ||= [];
  }
  if (!Array.isArray(packet.grids)) throw new RequestError("Packet grids must be a list.");
  if (!isMiddleEarthOnlyCandidate && packet.grids.length === 0) {
    throw new RequestError("Packet grids are required.");
  }
  const gridIds = new Set();
  for (const grid of packet.grids) {
    if (
      !isRecord(grid)
      || !grid.id
      || grid.kind !== "grid"
      || grid.schemaVersion !== 1
      || grid.rendererVersion !== "vibe-atlas-v1"
      || !Array.isArray(grid.images)
      || grid.images.length === 0
      || grid.images.length > 9
    ) throw new RequestError("Packet grid is invalid.");
    if (gridIds.has(grid.id)) throw new RequestError("That grid is already in this packet.", 409);
    gridIds.add(grid.id);
  }
  // Optional workspace/content metadata — no constraints beyond string length
  if (packet.workspace !== undefined && (typeof packet.workspace !== "string" || packet.workspace.length > 200)) {
    throw new RequestError("Packet workspace is invalid.");
  }
  if (packet.content !== undefined && (typeof packet.content !== "string" || packet.content.length > 200)) {
    throw new RequestError("Packet content is invalid.");
  }
  // Optional structured Middle-earth content — validate shape if present
  if (packet.middleEarthContent !== undefined) {
    if (!isRecord(packet.middleEarthContent)) throw new RequestError("Packet middleEarthContent is invalid.");
    for (const [key, value] of Object.entries(packet.middleEarthContent)) {
      if (
        !isRecord(value)
        || !["meme", "spellbook"].includes(value.kind)
        || typeof value.title !== "string"
        || value.title.length > 120
        || typeof value.text !== "string"
        || value.text.length > 700
        || typeof value.tone !== "string"
        || value.tone.length > 80
        || typeof value.layout !== "string"
        || value.layout.length > 80
        || (value.secondaryText !== undefined && (typeof value.secondaryText !== "string" || value.secondaryText.length > 240))
        || (value.character !== undefined && (typeof value.character !== "string" || value.character.length > 80))
         || (value.memeFlavor !== undefined && (typeof value.memeFlavor !== "string" || !MEME_FLAVOR_NAMES.has(value.memeFlavor)))
         || (value.aesthetic !== undefined && (typeof value.aesthetic !== "string" || !AESTHETIC_NAMES.has(value.aesthetic)))
         || (value.artifactType !== undefined && (typeof value.artifactType !== "string" || !ARTIFACT_TYPE_NAMES.has(value.artifactType)))
          || (value.referenceStillFamily !== undefined && (typeof value.referenceStillFamily !== "string" || !REFERENCE_STILL_FAMILY_SET.has(value.referenceStillFamily)))
          || (value.referenceStillQuery !== undefined && (typeof value.referenceStillQuery !== "string" || !value.referenceStillQuery.trim() || value.referenceStillQuery.length > 200))
      ) {
        throw new RequestError(`Packet middleEarthContent entry "${key}" is invalid.`);
      }
      if (value.aiGeneration !== undefined && (
        !isRecord(value.aiGeneration)
        || value.aiGeneration.provider !== "xai"
        || typeof value.aiGeneration.generatedAt !== "string"
        || !Number.isFinite(Date.parse(value.aiGeneration.generatedAt))
        || (value.aiGeneration.model !== undefined && (
          typeof value.aiGeneration.model !== "string"
          || value.aiGeneration.model.length > 120
        ))
      )) {
        throw new RequestError(`Packet middleEarthContent entry "${key}" has invalid AI provenance.`);
      }
      if (value.rednoteCopy !== undefined) {
        const copy = value.rednoteCopy;
        if (
          !isRecord(copy)
          || typeof copy.title !== "string"
          || !copy.title.trim()
          || copy.title.length > 120
          || typeof copy.caption !== "string"
          || !copy.caption.trim()
          || copy.caption.length > 2200
          || !Array.isArray(copy.tags)
          || copy.tags.length < 3
          || copy.tags.length > 8
          || copy.tags.some(tag => typeof tag !== "string" || !/^#[^\s#,]{1,49}$/u.test(tag))
          || typeof copy.character !== "string"
          || !copy.character.trim()
          || copy.character.length > 80
          || copy.provider !== "xai"
          || typeof copy.generatedAt !== "string"
          || !Number.isFinite(Date.parse(copy.generatedAt))
          || (copy.model !== undefined && (typeof copy.model !== "string" || copy.model.length > 120))
        ) {
          throw new RequestError(`Packet middleEarthContent entry "${key}" has invalid Rednote copy.`);
        }
      }
    }
  }
  if (!Array.isArray(packet.outputs) || packet.outputs.length === 0) {
    throw new RequestError("Packet outputs are required.");
  }
  const ids = new Set();
  for (const media of packet.media) {
    if (!isRecord(media) || !media.id || !media.imageUrl || !media.resultId) throw new RequestError("Packet media is invalid.");
    if (ids.has(media.resultId)) throw new RequestError("That exact media is already in this packet.", 409);
    ids.add(media.resultId);
  }
  const outputIds = new Set();
  for (const output of packet.outputs) {
    if (
      !isRecord(output)
      || !output.id
      || !["grid", "individual", "meme", "spellbook"].includes(output.kind)
      || !output.sourceId
      || typeof output.included !== "boolean"
    ) {
      throw new RequestError("Packet output is invalid.");
    }
    if (outputIds.has(output.id)) throw new RequestError("Packet outputs must be unique.");
    if (output.kind === "individual" && !packet.media.some(media => media.id === output.sourceId)) {
      throw new RequestError("Packet output references missing curated media.");
    }
    if (output.kind === "grid" && !packet.grids.some(grid => grid.id === output.sourceId)) {
      throw new RequestError("Packet output references a missing grid.");
    }
    // meme/spellbook outputs must have a matching source card
    if ((output.kind === "meme" || output.kind === "spellbook") && !packet.sourceCards.some(card => card.id === output.sourceId)) {
      throw new RequestError("Packet output references a missing source card.");
    }
    outputIds.add(output.id);
  }
  for (const field of ["notes", "workingAngle", "captionSeeds", "outputAngles"]) {
    if (typeof packet[field] !== "string" || packet[field].length > 8000) throw new RequestError(`${field} is invalid.`);
  }
  if (packet.state === "media_compiled" && !packet.outputs.some(output => output.included)) {
    throw new RequestError("Include at least one output before marking media compiled.");
  }
  return packet;
}

export function applyAction(current, action) {
  if (!isRecord(action)) throw new RequestError("A packet action is required.");
  const next = structuredClone(upgradeLegacyPacket(current));
  if (action.type === "add_media") {
    if (!isRecord(action.media)) throw new RequestError("Media is required.");
    if (next.media.some(item => item.resultId === action.media.resultId)) {
      throw new RequestError("That exact media is already in this packet.", 409);
    }
    next.media.push(action.media);
    if (!next.sourceCards.some(card => card.id === action.media.id)) {
      next.sourceCards.push({
        id: action.media.id,
        order: next.sourceCards.length,
        imageUrl: action.media.imageUrl,
        sourceUrl: action.media.sourceUrl,
        title: action.media.title,
        ...(action.media.publisher ? { creator: action.media.publisher } : {}),
        capturedAt: action.media.addedAt,
        resultId: action.media.resultId,
        provenance: JSON.stringify({
          collection: "curated-media",
          batchKey: action.media.batchKey,
          gridPosition: action.media.gridPosition,
        }),
      });
    }
    next.outputs.push({
      id: `individual-${action.media.id}`,
      kind: "individual",
      sourceId: action.media.id,
      label: action.media.title,
      included: true,
      addedAt: new Date().toISOString(),
    });
    next.state = "collecting";
  } else if (action.type === "add_grid") {
    if (!isRecord(action.grid)) throw new RequestError("Grid is required.");
    if (next.grids.some(grid => grid.id === action.grid.id)) {
      throw new RequestError("That grid is already in this packet.", 409);
    }
    next.grids.push(action.grid);
    for (const image of action.grid.images) {
      if (next.sourceCards.some(card => card.resultId === image.resultId)) continue;
      next.sourceCards.push({
        id: stableId(image.resultId),
        order: next.sourceCards.length,
        imageUrl: image.imageUrl,
        sourceUrl: image.sourceUrl,
        title: image.title,
        ...(image.publisher ? { creator: image.publisher } : {}),
        capturedAt: action.grid.generatedAt,
        resultId: image.resultId,
        provenance: JSON.stringify({
          collection: "saved-grid",
          gridId: action.grid.id,
          batchKey: image.batchKey,
          gridPosition: image.gridPosition,
        }),
      });
    }
    next.outputs.push({
      id: `grid-${stableId(action.grid.id)}`,
      kind: "grid",
      sourceId: action.grid.id,
      label: `${action.grid.vibeEmoji} ${action.grid.actor} · ${action.grid.vibe} grid`,
      included: true,
      addedAt: new Date().toISOString(),
    });
    next.state = "collecting";
  } else if (action.type === "remove_media") {
    next.media = next.media.filter(item => item.id !== action.mediaId);
    next.outputs = next.outputs.filter(output => output.sourceId !== action.mediaId);
    next.state = "collecting";
  } else if (action.type === "move_media") {
    const index = next.media.findIndex(item => item.id === action.mediaId);
    const target = index + Number(action.direction);
    if (index < 0 || ![-1, 1].includes(Number(action.direction)) || target < 0 || target >= next.media.length) {
      throw new RequestError("Media cannot move in that direction.");
    }
    [next.media[index], next.media[target]] = [next.media[target], next.media[index]];
    next.state = "collecting";
  } else if (action.type === "toggle_output") {
    const output = next.outputs.find(item => item.id === action.outputId);
    if (!output) throw new RequestError("Packet output was not found.");
    output.included = Boolean(action.included);
    next.state = "collecting";
  } else if (action.type === "move_output") {
    const index = next.outputs.findIndex(item => item.id === action.outputId);
    const target = index + Number(action.direction);
    if (index < 0 || ![-1, 1].includes(Number(action.direction)) || target < 0 || target >= next.outputs.length) {
      throw new RequestError("Output cannot move in that direction.");
    }
    [next.outputs[index], next.outputs[target]] = [next.outputs[target], next.outputs[index]];
    next.state = "collecting";
  } else if (action.type === "update_context") {
    for (const field of ["notes", "workingAngle", "captionSeeds", "outputAngles"]) {
      if (Object.hasOwn(action, field)) next[field] = action[field];
    }
  } else if (action.type === "set_state") {
    next.state = action.state;
  } else {
    throw new RequestError("Packet action is invalid.");
  }
  next.updatedAt = new Date().toISOString();
  next.version = `${next.updatedAt}-${randomUUID()}`;
  return validatePacket(next);
}

async function listPackets(store) {
  const result = await store.list();
  const packets = await Promise.all((result.blobs || []).map(blob => store.get(blob.key, { type: "json" })));
  return packets.filter(Boolean).map(upgradeLegacyPacket).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upgradeLegacyPacket(packet) {
  if (!packet) return packet;
  const next = structuredClone(packet);
  // Legacy packets that carry no workspace/content metadata default to cdrama
  if (next.workspace === undefined) next.workspace = "cdrama";
  if (next.content === undefined) next.content = "cdrama";
  next.grids ||= [legacyGridForPacket(next)];
  next.sourceCards ||= (next.anchor?.imageUrls || []).map((imageUrl, order) => {
    const resultId = next.provenance?.resultIds?.[order] || `${next.provenance?.gridId || next.id}:${order}`;
    return {
      id: stableId(resultId),
      order,
      imageUrl,
      sourceUrl: imageUrl,
      title: `Grid result ${order + 1}`,
      capturedAt: next.provenance?.generatedAt || next.createdAt,
      resultId,
      provenance: JSON.stringify({ collection: "legacy-idea-packet", gridPosition: order }),
    };
  });
  for (const media of next.media || []) {
    if (next.sourceCards.some(card => card.id === media.id)) continue;
    next.sourceCards.push({
      id: media.id,
      order: next.sourceCards.length,
      imageUrl: media.imageUrl,
      sourceUrl: media.sourceUrl,
      title: media.title,
      capturedAt: media.addedAt || next.provenance?.generatedAt || next.createdAt,
      resultId: media.resultId,
      provenance: JSON.stringify({ collection: "legacy-idea-packet", curatedMediaId: media.id }),
    });
  }
  next.outputs ||= [
    {
      id: `grid-${stableId(next.provenance?.gridId || next.id)}`,
      kind: "grid",
      sourceId: next.provenance?.gridId || next.id,
      label: "Rendered grid PNG",
      included: true,
      addedAt: next.createdAt,
    },
    ...(next.media || []).map(media => ({
      id: `individual-${media.id}`,
      kind: "individual",
      sourceId: media.id,
      label: media.title,
      included: true,
      addedAt: media.addedAt,
    })),
  ];
  return next;
}

function legacyGridForPacket(packet) {
  const sourceCards = Array.isArray(packet.sourceCards) && packet.sourceCards.length > 0
    ? packet.sourceCards
    : (packet.anchor?.imageUrls || []).map((imageUrl, gridPosition) => ({
      resultId: packet.provenance?.resultIds?.[gridPosition] || `${packet.id}:${gridPosition}`,
      imageUrl,
      sourceUrl: imageUrl,
      title: `Grid result ${gridPosition + 1}`,
      gridPosition,
    }));
  return {
    kind: "grid",
    schemaVersion: 1,
    rendererVersion: "vibe-atlas-v1",
    id: packet.provenance?.gridId || packet.id,
    actorId: packet.actor?.id || "legacy-actor",
    actor: packet.actor?.name || "Unknown actor",
    actorEn: packet.actor?.nameEn || packet.actor?.name || "Unknown actor",
    actorAccentColor: "#c9a96e",
    vibe: packet.vibe?.label || "Saved vibe",
    vibeEn: packet.vibe?.labelEn || packet.vibe?.label || "Saved vibe",
    vibeEmoji: packet.vibe?.emoji || "✨",
    vibeSubtitle: packet.captionSeeds || "",
    vibeSubtitleEn: "",
    searchSpell: packet.provenance?.batchKeys?.[0] || "",
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: String(packet.provenance?.generatedAt || packet.createdAt).slice(0, 10),
    generatedAt: packet.provenance?.generatedAt || packet.createdAt,
    savedAt: packet.createdAt,
    sourceRoute: packet.provenance?.sourceRoute || "/",
    images: sourceCards.slice(0, 9).map((card, gridPosition) => ({
      resultId: card.resultId || packet.provenance?.resultIds?.[gridPosition] || `${packet.id}:${gridPosition}`,
      imageUrl: card.imageUrl,
      sourceUrl: card.sourceUrl || card.imageUrl,
      title: card.title || `Grid result ${gridPosition + 1}`,
      ...(card.creator ? { publisher: card.creator } : {}),
      batchKey: packet.provenance?.batchKeys?.[0],
      gridPosition,
    })),
  };
}

function stableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function readBody(req) {
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new RequestError("Request body is too large.", 413);
  try { return JSON.parse(text); } catch { throw new RequestError("Request body must be valid JSON."); }
}

function validateSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin && req.method === "GET") return;
  if (!origin || origin !== new URL(req.url).origin) throw new RequestError("Cross-origin packet requests are not allowed.", 403);
}

async function validateAuthorization(req, expectedToken, auth, context) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const actual = Buffer.from(token);
  const expected = Buffer.from(expectedToken || "");
  if (expected.length && actual.length === expected.length && timingSafeEqual(actual, expected)) return;
  if (auth) {
    try {
      await auth.authenticateAdmin(req, context);
      return;
    } catch (error) {
      if (error?.status === 401) {
        throw new RequestError("Sign in to packet staging again to save Idea Packets.", 401);
      }
      if (error?.status === 403) {
        throw new RequestError("An admin account is required to save Idea Packets.", 403);
      }
      throw new RequestError("Packet staging could not verify your admin session. Try again.", 503);
    }
  }
  throw new RequestError("Idea Packet operator authorization is required.", 401);
}

function requireString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(message);
  return value;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function withIdeaPacketLock(id, work) {
  const previous = mutationLocks.get(id) || Promise.resolve();
  let release;
  const current = new Promise(resolve => { release = resolve; });
  const queued = previous.then(() => current);
  mutationLocks.set(id, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (mutationLocks.get(id) === queued) mutationLocks.delete(id);
  }
}

async function getPacketWithMetadata(store, id) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(id, { type: "json", consistency: "strong" });
  }
  const data = await store.get(id, { type: "json", consistency: "strong" });
  return data ? { data } : null;
}

async function setPacketIfMatch(store, id, packet, etag) {
  if (!etag) {
    await store.setJSON(id, packet);
    return true;
  }
  const result = await store.setJSON(id, packet, { onlyIfMatch: etag });
  if (result?.modified === false) return false;
  if (result?.modified === true) return true;
  const stored = await getPacketWithMetadata(store, id);
  return JSON.stringify(stored?.data) === JSON.stringify(packet);
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
