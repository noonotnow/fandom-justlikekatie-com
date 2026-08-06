import { randomUUID, timingSafeEqual } from "node:crypto";
import { HANDOFF_ATTEMPT_STORE, withHandoffLease } from "./handoff-lease.js";

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

export function createIdeaPacketsHandler({ env = process.env, getStore }) {
  return async function ideaPackets(req, context) {
    try {
      validateSameOrigin(req);
      validateAuthorization(req, env.PLAN_OPERATOR_TOKEN);
      if (!env.PLAN_OPERATOR_TOKEN) throw new RequestError("Idea Packets is not configured. Add PLAN_OPERATOR_TOKEN.", 503);
      const store = getStore(STORE_NAME, context);
      if (req.method === "GET") return jsonResponse(200, { packets: await listPackets(store) });
      if (req.method === "POST") {
        const body = await readBody(req);
        const packet = validatePacket(body.packet);
        return await withIdeaPacketLock(packet.id, async () => {
          if (await store.get(packet.id, { type: "json" })) throw new RequestError("Idea Packet already exists.", 409);
          await store.setJSON(packet.id, packet);
          return jsonResponse(201, { packet });
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
  if (!isRecord(packet.anchor) || !Array.isArray(packet.anchor.imageUrls) || packet.anchor.imageUrls.length === 0) {
    throw new RequestError("Packet anchor media is required.");
  }
  if (!Array.isArray(packet.media)) throw new RequestError("Packet media must be a list.");
  if (!Array.isArray(packet.sourceCards) || packet.sourceCards.length === 0) {
    throw new RequestError("Packet source cards are required.");
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
      || !["grid", "individual"].includes(output.kind)
      || !output.sourceId
      || typeof output.included !== "boolean"
    ) {
      throw new RequestError("Packet output is invalid.");
    }
    if (outputIds.has(output.id)) throw new RequestError("Packet outputs must be unique.");
    if (output.kind === "individual" && !packet.media.some(media => media.id === output.sourceId)) {
      throw new RequestError("Packet output references missing curated media.");
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
  const next = structuredClone(current);
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

function validateAuthorization(req, expectedToken) {
  if (!expectedToken) return;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const actual = Buffer.from(token);
  const expected = Buffer.from(expectedToken);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new RequestError("Fandom Admin authorization is required.", 401);
  }
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
