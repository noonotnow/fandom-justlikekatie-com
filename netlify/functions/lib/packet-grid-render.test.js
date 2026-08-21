/**
 * Security tests for the packet-grid-render Netlify function.
 *
 * Covers:
 *  - Method gating (405)
 *  - Key-ID rejection (401)
 *  - Wrong-secret / bad-signature rejection (401)
 *  - Clock-skew / timestamp rejection (401)
 *  - Nonce replay rejection (401) — same request cannot be accepted twice
 *  - Packet-ID substitution rejection (401) — valid sig cannot be reused for
 *    a different packetId
 *  - Missing nonce / bad nonce format (401)
 *  - Non-existent packetId (404)
 *  - Packet with no included grid output (404)
 *  - Happy path (200 image/png with correct body and headers)
 *  - Renderer failure (502 with a clean JSON error)
 */

import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { createPacketGridRenderHandler, canonicalizeQuery } from "../packet-grid-render.js";

const ORIGIN = "https://fandom.justlikekatie.com";
const PATH = "/api/internal/packet-grid-render";
const NOW = new Date("2026-08-10T05:00:00.000Z");
const ENV = {
  CREATE_FANDOM_PACKET_MIGRATION_KEY_ID: "render-key",
  CREATE_FANDOM_PACKET_MIGRATION_SECRET: "render-secret",
};

// Minimum PNG bytes (8-byte PNG magic number).
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EMPTY_BODY_DIGEST = createHash("sha256").update("").digest("hex");

let nonceCounter = 0;
function freshNonce() {
  nonceCounter += 1;
  // UUID-shaped, hex-only, satisfies VALID_NONCE /^[0-9a-f-]{32,73}$/i
  return `00000000-0000-0000-0000-${String(nonceCounter).padStart(12, "0")}`;
}

/**
 * Compute a v1= HMAC signature using the new payload format:
 *   <timestamp>\n<nonce>\nGET\n<path>\n<canonicalQuery>\n<bodyDigest>
 */
function sign({
  timestamp,
  nonce,
  packetId,
  secret = ENV.CREATE_FANDOM_PACKET_MIGRATION_SECRET,
} = {}) {
  const params = new URLSearchParams();
  if (packetId != null) params.set("packetId", packetId);
  const canonicalQuery = canonicalizeQuery(params);
  const hmac = createHmac("sha256", secret)
    .update(`${timestamp}\n${nonce}\nGET\n${PATH}\n${canonicalQuery}\n${EMPTY_BODY_DIGEST}`)
    .digest("hex");
  return `v1=${hmac}`;
}

/** Build a signed GET request. Override any field to simulate a tampered request. */
function signedRequest({
  packetId = "packet-1",
  method = "GET",
  keyId = ENV.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID,
  timestamp = String(Math.floor(NOW.getTime() / 1000)),
  nonce = freshNonce(),
  signature,
} = {}) {
  const url = new URL(`${ORIGIN}${PATH}`);
  if (packetId != null) url.searchParams.set("packetId", packetId);
  const sig = signature ?? sign({ timestamp, nonce, packetId });
  return new Request(url.toString(), {
    method,
    headers: {
      "X-Fandom-Key-Id": keyId,
      "X-Fandom-Timestamp": timestamp,
      "X-Fandom-Nonce": nonce,
      "X-Fandom-Signature": sig,
    },
  });
}

/** A minimal valid packet with an included grid output. */
function packetWithGrid(id = "packet-1") {
  return {
    id,
    version: `${id}-v1`,
    state: "collecting",
    createdAt: "2026-08-04T16:00:00.000Z",
    updatedAt: "2026-08-04T16:00:00.000Z",
    actor: { id: "actor-1", name: "Star", nameEn: "Star" },
    vibe: { label: "氛围", labelEn: "Vibe", emoji: "✨" },
    provenance: {
      sourceRoute: "/?admin=true",
      gridId: `grid-${id}`,
      generatedAt: "2026-08-04T15:00:00.000Z",
      resultIds: ["r1"],
      batchKeys: ["b1"],
    },
    anchor: { imageUrls: [], label: "Star · Vibe" },
    sourceCards: [{
      id: "card-1",
      order: 0,
      imageUrl: "https://example.com/img.jpg",
      sourceUrl: "https://example.com/card-1",
      title: "Card",
      capturedAt: "2026-08-04T15:00:00.000Z",
      resultId: "r1",
      provenance: "{}",
    }],
    media: [],
    outputs: [{
      id: "grid-output",
      kind: "grid",
      sourceId: `grid-${id}`,
      label: "Rendered grid PNG",
      included: true,
      addedAt: "2026-08-04T16:00:00.000Z",
    }],
    notes: "",
    workingAngle: "",
    captionSeeds: "",
    outputAngles: "",
  };
}

/**
 * In-memory nonce store that mirrors the Netlify Blobs conditional-write API.
 * `set` with `{ onlyIfNew: true }` returns `{ modified: false }` when the key
 * already exists, matching the production atomic-create-only behaviour.
 */
function makeNonceStore() {
  const db = new Map();
  return {
    db,
    async get(key, { type } = {}) {
      const raw = db.get(key);
      if (raw === undefined) return null;
      return type === "json" ? JSON.parse(raw) : raw;
    },
    async set(key, value, options = {}) {
      if (options.onlyIfNew && db.has(key)) {
        return { modified: false };
      }
      db.set(key, value);
      return { modified: true };
    },
  };
}

/** In-memory packet store. */
function makePacketStore(packets = new Map()) {
  return {
    async get(key, { type } = {}) {
      const value = packets.get(key);
      if (value === undefined) return null;
      return type === "json" ? value : value;
    },
  };
}

/**
 * Build a handler wired to in-memory stores.
 * Each call gets a fresh nonceStore unless one is shared explicitly.
 */
function makeHandler({
  packets = new Map(),
  render = async () => PNG_BYTES,
  now = () => NOW,
  env = ENV,
  sharedNonceStore = null,
} = {}) {
  const packetStore = makePacketStore(packets);
  const nonceStore = sharedNonceStore ?? makeNonceStore();
  return createPacketGridRenderHandler({
    env,
    now,
    getStore: name => name === "render-nonces" ? nonceStore : packetStore,
    render,
  });
}

// ---------------------------------------------------------------------------
// Method gating
// ---------------------------------------------------------------------------

test("non-GET method returns 405 with Allow header", async () => {
  const handler = makeHandler();
  const response = await handler(
    new Request(`${ORIGIN}${PATH}?packetId=x`, { method: "POST" }),
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET");
  const body = await response.json();
  assert.ok(body.error);
});

// ---------------------------------------------------------------------------
// Auth: key ID
// ---------------------------------------------------------------------------

test("wrong key ID is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const response = await handler(signedRequest({ keyId: "wrong-key-id", packetId: "p1" }));
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.ok(body.error);
});

test("missing key ID header is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const nonce = freshNonce();
  const req = new Request(`${ORIGIN}${PATH}?packetId=p1`, {
    method: "GET",
    headers: {
      "X-Fandom-Timestamp": timestamp,
      "X-Fandom-Nonce": nonce,
      "X-Fandom-Signature": sign({ timestamp, nonce, packetId: "p1" }),
    },
  });
  const response = await handler(req);
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// Auth: HMAC / secret
// ---------------------------------------------------------------------------

test("correct key ID but wrong secret is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const nonce = freshNonce();
  const badSig = sign({ timestamp, nonce, packetId: "p1", secret: "wrong-secret" });
  const response = await handler(signedRequest({ timestamp, nonce, signature: badSig, packetId: "p1" }));
  assert.equal(response.status, 401);
});

test("tampered signature prefix is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const nonce = freshNonce();
  const good = sign({ timestamp, nonce, packetId: "p1" });
  const tampered = `v2=${good.slice(3)}`; // wrong version prefix
  const response = await handler(signedRequest({ timestamp, nonce, signature: tampered, packetId: "p1" }));
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// Auth: packet-ID substitution
// ---------------------------------------------------------------------------

test("valid signature for packet-A cannot be substituted onto a request for packet-B", async () => {
  const packets = new Map([
    ["packet-a", packetWithGrid("packet-a")],
    ["packet-b", packetWithGrid("packet-b")],
  ]);
  // Both requests share a nonce store so the nonce from request-A is consumed.
  const sharedNonceStore = makeNonceStore();
  const handler = makeHandler({ packets, sharedNonceStore });

  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const nonce = freshNonce();

  // Sign for packet-a, send for packet-b (different canonical query).
  const sigForA = sign({ timestamp, nonce, packetId: "packet-a" });
  const response = await handler(signedRequest({
    timestamp,
    nonce,
    signature: sigForA,
    packetId: "packet-b",
  }));
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// Auth: nonce / replay
// ---------------------------------------------------------------------------

test("missing nonce header is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const req = new Request(`${ORIGIN}${PATH}?packetId=p1`, {
    method: "GET",
    headers: {
      "X-Fandom-Key-Id": ENV.CREATE_FANDOM_PACKET_MIGRATION_KEY_ID,
      "X-Fandom-Timestamp": timestamp,
      // No X-Fandom-Nonce
      "X-Fandom-Signature": sign({ timestamp, nonce: "", packetId: "p1" }),
    },
  });
  const response = await handler(req);
  assert.equal(response.status, 401);
});

test("replaying the exact same request a second time is rejected with 401", async () => {
  const packets = new Map([["p1", packetWithGrid("p1")]]);
  const sharedNonceStore = makeNonceStore();
  const handler = makeHandler({ packets, sharedNonceStore });

  const req = signedRequest({ packetId: "p1" });

  // First request: accepted.
  const first = await handler(req.clone());
  assert.equal(first.status, 200, "first request should succeed");

  // Second request with the same nonce: rejected.
  const second = await handler(req.clone());
  assert.equal(second.status, 401, "replayed request should be rejected");
});

test("concurrent requests with the same nonce: exactly one succeeds and one is rejected", async () => {
  const packets = new Map([["p1", packetWithGrid("p1")]]);
  const sharedNonceStore = makeNonceStore();
  const handler = makeHandler({ packets, sharedNonceStore });

  const nonce = freshNonce();
  const timestamp = String(Math.floor(NOW.getTime() / 1000));
  const sig = sign({ timestamp, nonce, packetId: "p1" });

  // Fire both requests simultaneously; they share the same signed nonce.
  const [r1, r2] = await Promise.all([
    handler(signedRequest({ timestamp, nonce, signature: sig, packetId: "p1" })),
    handler(signedRequest({ timestamp, nonce, signature: sig, packetId: "p1" })),
  ]);

  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 401], "exactly one request should succeed and one should be rejected");
});

test("a fresh nonce is accepted even after a prior nonce was consumed", async () => {
  const packets = new Map([["p1", packetWithGrid("p1")]]);
  const sharedNonceStore = makeNonceStore();
  const handler = makeHandler({ packets, sharedNonceStore });

  // First request with nonce-A: consumed.
  await handler(signedRequest({ packetId: "p1" }));

  // Second request with a different nonce: accepted.
  const response = await handler(signedRequest({ packetId: "p1" }));
  assert.equal(response.status, 200);
});

// ---------------------------------------------------------------------------
// Auth: clock-skew boundary
// ---------------------------------------------------------------------------

test("timestamp at exactly the 5-minute boundary (300 s) is accepted", async () => {
  const packets = new Map([["p1", packetWithGrid("p1")]]);
  const handler = makeHandler({ packets });
  // Exactly 300 000 ms before NOW — still within the non-strict > check.
  const skewedMs = NOW.getTime() - 300_000;
  const timestamp = String(Math.floor(skewedMs / 1000));
  const nonce = freshNonce();
  const response = await handler(signedRequest({
    timestamp,
    nonce,
    signature: sign({ timestamp, nonce, packetId: "p1" }),
    packetId: "p1",
  }));
  assert.equal(response.status, 200);
});

test("timestamp 1 second past the 5-minute boundary (301 s ago) is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const oldMs = NOW.getTime() - 301_000;
  const timestamp = String(Math.floor(oldMs / 1000));
  const nonce = freshNonce();
  const response = await handler(signedRequest({
    timestamp,
    nonce,
    signature: sign({ timestamp, nonce, packetId: "p1" }),
    packetId: "p1",
  }));
  assert.equal(response.status, 401);
});

test("timestamp 1 second past the 5-minute boundary in the future (301 s ahead) is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const futureMs = NOW.getTime() + 301_000;
  const timestamp = String(Math.floor(futureMs / 1000));
  const nonce = freshNonce();
  const response = await handler(signedRequest({
    timestamp,
    nonce,
    signature: sign({ timestamp, nonce, packetId: "p1" }),
    packetId: "p1",
  }));
  assert.equal(response.status, 401);
});

test("non-numeric timestamp is rejected with 401", async () => {
  const handler = makeHandler({ packets: new Map([["p1", packetWithGrid("p1")]]) });
  const response = await handler(
    signedRequest({ timestamp: "not-a-number", signature: "v1=anything", packetId: "p1" }),
  );
  assert.equal(response.status, 401);
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("valid request with correct HMAC returns 200 image/png with expected headers", async () => {
  const packets = new Map([["p1", packetWithGrid("p1")]]);
  let renderCalled = false;
  const handler = makeHandler({
    packets,
    render: async (packet, output) => {
      renderCalled = true;
      assert.equal(packet.id, "p1");
      assert.equal(output.kind, "grid");
      assert.equal(output.included, true);
      return PNG_BYTES;
    },
  });

  const response = await handler(signedRequest({ packetId: "p1" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Content-Length"), String(PNG_BYTES.byteLength));
  assert.ok(renderCalled, "render should have been called");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(bytes, PNG_BYTES);
});

test("renderer failure returns 502 with a clean JSON error", async () => {
  const packetId = "render-fails";
  const packets = new Map([[packetId, packetWithGrid(packetId)]]);
  const renderError = new Error("renderer exploded");
  let loggedArgs;
  const originalConsoleError = console.error;
  console.error = (...args) => {
    loggedArgs = args;
  };

  try {
    const handler = makeHandler({
      packets,
      render: async () => {
        throw renderError;
      },
    });
    const response = await handler(signedRequest({ packetId }));

    assert.equal(response.status, 502);
    assert.equal(response.headers.get("Content-Type"), "application/json");
    assert.deepEqual(await response.json(), { error: "Grid render failed." });
    assert.deepEqual(loggedArgs, [
      "[packet-grid-render] render failed",
      { packetId, error: String(renderError) },
    ]);
  } finally {
    console.error = originalConsoleError;
  }
});

test("a fresh signed request can retry after a render failure, but the failed request remains a replay", async () => {
  const packetId = "render-retry";
  const packets = new Map([[packetId, packetWithGrid(packetId)]]);
  const sharedNonceStore = makeNonceStore();
  let renderAttempts = 0;
  const handler = makeHandler({
    packets,
    sharedNonceStore,
    render: async () => {
      renderAttempts += 1;
      if (renderAttempts === 1) {
        throw new Error("transient renderer failure");
      }
      return PNG_BYTES;
    },
  });

  const failedRequest = signedRequest({ packetId });
  const failedResponse = await handler(failedRequest.clone());
  assert.equal(failedResponse.status, 502);

  const retryResponse = await handler(signedRequest({ packetId }));
  assert.equal(retryResponse.status, 200);
  assert.deepEqual(Buffer.from(await retryResponse.arrayBuffer()), PNG_BYTES);

  const replayResponse = await handler(failedRequest.clone());
  assert.equal(replayResponse.status, 401);
  assert.equal(renderAttempts, 2, "replaying the failed request must not invoke the renderer");
});

// ---------------------------------------------------------------------------
// 404 paths
// ---------------------------------------------------------------------------

test("GET for a non-existent packetId returns 404", async () => {
  const handler = makeHandler({ packets: new Map() });
  const response = await handler(signedRequest({ packetId: "does-not-exist" }));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.ok(body.error);
});

test("GET for a packet with no included grid output returns 404", async () => {
  const id = "no-grid";
  const p = packetWithGrid(id);
  p.outputs = [{ id: "grid-output", kind: "grid", sourceId: `grid-${id}`, included: false, addedAt: "2026-08-04T16:00:00.000Z" }];
  const packets = new Map([[id, p]]);
  const handler = makeHandler({ packets });
  const response = await handler(signedRequest({ packetId: id }));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.ok(body.error);
});

test("GET for a packet with an empty outputs array returns 404", async () => {
  const p = packetWithGrid("empty-outputs");
  p.outputs = [];
  const packets = new Map([["empty-outputs", p]]);
  const handler = makeHandler({ packets });
  const response = await handler(signedRequest({ packetId: "empty-outputs" }));
  assert.equal(response.status, 404);
});
