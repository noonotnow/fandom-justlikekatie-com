import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getBlobStore } from "./lib/blob-store.js";
import { upgradeLegacyPacket } from "./lib/idea-packets.js";
import { renderCanonicalOutput } from "./lib/canonical-render.js";

const PACKET_STORE = "idea-packets";
const NONCE_STORE = "render-nonces";
const GRID_RENDER_PATH = "/api/internal/packet-grid-render";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EMPTY_BODY_DIGEST = createHash("sha256").update("").digest("hex");
const STABLE_PACKET_ID = /^[A-Za-z0-9._:/-]{1,200}$/;
// Nonces: UUID v4 or 64-character hex, to prevent ambiguous values.
const VALID_NONCE = /^[0-9a-f-]{32,73}$/i;

/**
 * Renders the composed grid PNG for a migrated Idea Packet and returns it as
 * image/png.  Authenticated with the same HMAC key as the migration export so
 * CREATE can fetch the render at import time and register it with MEDIA,
 * making promotion of a migrated grid packet one-click.
 *
 * Route: GET /api/internal/packet-grid-render?packetId=...
 * Auth:  X-Fandom-Key-Id / X-Fandom-Timestamp / X-Fandom-Nonce /
 *        X-Fandom-Signature (same key pair as the idea-packet-migration
 *        endpoint; nonce and query string are added to the signed payload to
 *        prevent packet-ID substitution and replay within the clock-skew
 *        window).
 *
 * HMAC payload (sha-256, hex):
 *   <unix-timestamp-seconds>\n<nonce>\nGET\n<path>\n<canonical-query>\n<body-digest>
 *
 * canonical-query: URLSearchParams with keys sorted ascending, serialized.
 */
export function createPacketGridRenderHandler({
  env = process.env,
  now = () => new Date(),
  getStore = (name, context, opts) => getBlobStore(name, context, opts),
  render = renderCanonicalOutput,
} = {}) {
  return async function packetGridRender(req, context) {
    if (req.method !== "GET") {
      return jsonError(405, "Method not allowed", { Allow: "GET" });
    }

    try {
      const nonceStore = getStore(NONCE_STORE, context, { consistency: "strong" });
      await validateAuth(req, env, now(), nonceStore);
    } catch {
      return jsonError(401, "Idea Packet grid render authorization failed.");
    }

    const url = new URL(req.url);
    const packetId = url.searchParams.get("packetId");
    if (!packetId || !STABLE_PACKET_ID.test(packetId)) {
      return jsonError(400, "packetId is required and must be a stable identifier.");
    }

    try {
      const store = getStore(PACKET_STORE, context, { consistency: "strong" });
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

      const bytes = await render(packet, gridOutput, { requestUrl: req.url });

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
  };
}

/**
 * Validates the HMAC auth headers and consumes the nonce (best-effort
 * single-use enforcement via the nonce blob store).
 *
 * Throws on any auth failure.
 */
export async function validateAuth(req, env, now, nonceStore) {
  const keyId = req.headers.get("x-fandom-key-id") || "";
  const timestamp = req.headers.get("x-fandom-timestamp") || "";
  const nonce = req.headers.get("x-fandom-nonce") || "";
  const signature = req.headers.get("x-fandom-signature") || "";

  // Key ID check first — constant-time comparison.
  if (
    !env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID
    || !env.CREATE_FANDOM_PACKET_MIGRATION_SECRET
    || !secureEqual(keyId, env.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID)
  ) {
    throw new Error("unauthorized: bad key id");
  }

  // Clock-skew check.
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(now.getTime() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw new Error("unauthorized: clock skew");
  }

  // Nonce format check.
  if (!nonce || !VALID_NONCE.test(nonce)) {
    throw new Error("unauthorized: bad nonce");
  }

  // HMAC verification — canonical query keeps packetId inside the MAC so a
  // valid signature cannot be substituted onto a different packetId.
  const url = new URL(req.url);
  const canonicalQuery = canonicalizeQuery(url.searchParams);
  const expected = createHmac("sha256", env.CREATE_FANDOM_PACKET_MIGRATION_SECRET)
    .update(`${timestamp}\n${nonce}\nGET\n${GRID_RENDER_PATH}\n${canonicalQuery}\n${EMPTY_BODY_DIGEST}`)
    .digest("hex");
  if (!secureEqual(signature, `v1=${expected}`)) {
    throw new Error("unauthorized: bad signature");
  }

  // Nonce replay prevention — atomic create-only write.  The store rejects
  // the write (modified: false) if the nonce key already exists, which closes
  // the read-then-write race that a non-atomic get+set approach would have.
  //
  // Nonce blobs are tiny (~30 bytes) and the endpoint is low-traffic.  Any
  // nonce whose stored usedAt is older than MAX_CLOCK_SKEW_MS is inert
  // (the timestamp check would reject a new request with that timestamp), so
  // operators may safely delete nonce blobs older than MAX_CLOCK_SKEW_MS
  // during routine maintenance without affecting security.
  const noncePayload = JSON.stringify({ usedAt: now.getTime() });
  const claimResult = await nonceStore.set(nonce, noncePayload, { onlyIfNew: true });
  if (!claimResult.modified) {
    throw new Error("unauthorized: nonce already used");
  }
}

/**
 * Sorts URL search params by key (ascending) and serializes them so the
 * canonical query is deterministic regardless of insertion order.
 */
export function canonicalizeQuery(searchParams) {
  const entries = [...searchParams.entries()];
  entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return new URLSearchParams(entries).toString();
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

export default createPacketGridRenderHandler();
