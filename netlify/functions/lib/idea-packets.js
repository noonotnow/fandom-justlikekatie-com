import { randomUUID, timingSafeEqual } from "node:crypto";

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
        return await withPacketLock(packet.id, async () => {
          if (await store.get(packet.id, { type: "json" })) throw new RequestError("Idea Packet already exists.", 409);
          await store.setJSON(packet.id, packet);
          return jsonResponse(201, { packet });
        });
      }
      if (req.method === "PATCH") {
        const body = await readBody(req);
        const id = requireString(body.id, "A packet id is required.");
        return await withPacketLock(id, async () => {
          const current = await store.get(id, { type: "json" });
          if (!current) throw new RequestError("Idea Packet was deleted or is no longer available.", 404);
          if (body.expectedVersion !== current.version) throw new RequestError("This packet changed. Refresh before applying your edit.", 409);
          const packet = applyAction(current, body.action);
          await store.setJSON(packet.id, packet);
          return jsonResponse(200, { packet });
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
  const ids = new Set();
  for (const media of packet.media) {
    if (!isRecord(media) || !media.id || !media.imageUrl || !media.resultId) throw new RequestError("Packet media is invalid.");
    if (ids.has(media.resultId)) throw new RequestError("That exact media is already in this packet.", 409);
    ids.add(media.resultId);
  }
  for (const field of ["notes", "workingAngle", "captionSeeds", "outputAngles"]) {
    if (typeof packet[field] !== "string" || packet[field].length > 8000) throw new RequestError(`${field} is invalid.`);
  }
  if (packet.state === "media_compiled" && packet.media.length === 0) {
    throw new RequestError("Add at least one media item before marking media compiled.");
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
    next.state = "collecting";
  } else if (action.type === "remove_media") {
    next.media = next.media.filter(item => item.id !== action.mediaId);
    next.state = "collecting";
  } else if (action.type === "move_media") {
    const index = next.media.findIndex(item => item.id === action.mediaId);
    const target = index + Number(action.direction);
    if (index < 0 || ![-1, 1].includes(Number(action.direction)) || target < 0 || target >= next.media.length) {
      throw new RequestError("Media cannot move in that direction.");
    }
    [next.media[index], next.media[target]] = [next.media[target], next.media[index]];
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
  return packets.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

async function withPacketLock(id, work) {
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

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
