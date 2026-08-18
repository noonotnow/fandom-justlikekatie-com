import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getBlobStore } from "./lib/blob-store.js";
import { upgradeLegacyPacket } from "./lib/idea-packets.js";
import { renderCanonicalOutput } from "./lib/canonical-render.js";

const PACKET_STORE = "idea-packets";
const GRID_RENDER_PATH = "/api/internal/packet-grid-render";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EMPTY_BODY_DIGEST = createHash("sha256").update("").digest("hex");
const STABLE_PACKET_ID = /^[A-Za-z0-9._:/-]{1,200}$/;

/**
 * Renders the composed grid PNG for a migrated Idea Packet and returns it as
 * image/png.  Authenticated with the same HMAC key as the migration export so
 * CREATE can fetch the render at import time and register it with MEDIA,
 * making promotion of a migrated grid packet one-click.
 *
 * Route: GET /api/internal/packet-grid-render?packetId=...
 * Auth:  X-Fandom-Key-Id / X-Fandom-Timestamp / X-Fandom-Signature (same as
 *        the idea-packet-migration endpoint).
 */
export default async function handler(req, context) {
  if (req.method !== "GET") {
    return jsonError(405, "Method not allowed", { Allow: "GET" });
  }

  try {
    validateAuth(req, process.env, new Date());
  } catch {
    return jsonError(401, "Idea Packet grid render authorization failed.");
  }

  const url = new URL(req.url);
  const packetId = url.searchParams.get("packetId");
  if (!packetId || !STABLE_PACKET_ID.test(packetId)) {
    return jsonError(400, "packetId is required and must be a stable identifier.");
  }

  try {
    const store = getBlobStore(PACKET_STORE, context, { consistency: "strong" });
    const data = await store.get(packetId, { type: "json" });
    if (!data) {
      return jsonError(404, "Packet not found.");
    }

    const packet = upgradeLegacyPacket(data);
    if (!packet) {
      return jsonError(422, "Packet could not be normalized.");
    }

    const gridOutput = Array.isArray(packet.outputs)
      ? packet.outputs.find(o => o?.kind === "grid" && o?.included === true)
      : null;
    if (!gridOutput) {
      return jsonError(404, "Packet has no included grid output.");
    }

    const bytes = await renderCanonicalOutput(packet, gridOutput, { requestUrl: req.url });

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error("[packet-grid-render] render failed", { packetId, error: String(error) });
    return jsonError(502, "Grid render failed.");
  }
}

function validateAuth(req, env, now) {
  const keyId = req.headers.get("x-fandom-key-id") || "";
  const timestamp = req.headers.get("x-fandom-timestamp") || "";
  const signature = req.headers.get("x-fandom-signature") || "";

  if (
    !env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID
    || !env.CREATE_FANDOM_PACKET_MIGRATION_SECRET
    || !secureEqual(keyId, env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID)
  ) {
    throw new Error("unauthorized");
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw new Error("unauthorized");
  }

  const expected = createHmac("sha256", env.CREATE_FANDOM_PACKET_MIGRATION_SECRET)
    .update(`${timestamp}\nGET\n${GRID_RENDER_PATH}\n${EMPTY_BODY_DIGEST}`)
    .digest("hex");
  if (!secureEqual(signature, `v1=${expected}`)) {
    throw new Error("unauthorized");
  }
}

function secureEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    // Still run timingSafeEqual on buffers of equal synthetic length to avoid
    // timing leaks through the length branch.
    timingSafeEqual(aBuffer, Buffer.alloc(aBuffer.length));
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}

function jsonError(status, message, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      ...extraHeaders,
    },
  });
}
