import { getBlobStore } from "./lib/blob-store.js";

// Lightweight batch-level engagement counters.
//
// POST /.netlify/functions/batch-metrics
//   Body: { "batchKey": "<date>:<actorId>:<vibeIdx>:<rankIdx>", "event": "save"|"share"|"click" }
//   → Increments the counter for that event type on that batch.
//
// GET /.netlify/functions/batch-metrics?key=<batchKey>
//   → Returns current counters: { saves: N, shares: N, clicks: N }
//
// Privacy-first: no user identifiers stored, only aggregate counts per batch.
// Failure never blocks card export — fire-and-forget from client.

const STORE_NAME = "batch-metrics";
const VALID_EVENTS = ["save", "share", "click"];

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function emptyCounters() {
  return { saves: 0, shares: 0, clicks: 0 };
}

function eventToField(event) {
  if (event === "save") return "saves";
  if (event === "share") return "shares";
  if (event === "click") return "clicks";
  return null;
}

export default async (req, context) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return jsonResponse(204, null);
  }

  const store = getBlobStore(STORE_NAME, context);

  // GET — read counters for a batch
  if (req.method === "GET") {
    const url = new URL(req.url);
    const key = url.searchParams.get("key");
    if (!key) {
      return jsonResponse(400, { error: "Missing ?key= parameter" });
    }
    try {
      const data = await store.get(key, { type: "json" });
      return jsonResponse(200, data || emptyCounters());
    } catch (e) {
      return jsonResponse(200, emptyCounters());
    }
  }

  // POST — increment a counter
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return jsonResponse(400, { error: "Invalid JSON body" });
    }

    const { batchKey, event } = body || {};
    if (!batchKey || typeof batchKey !== "string") {
      return jsonResponse(400, { error: "Missing or invalid batchKey" });
    }
    if (!VALID_EVENTS.includes(event)) {
      return jsonResponse(400, { error: "Invalid event. Must be: save, share, or click" });
    }

    const field = eventToField(event);

    // Read-increment-write (best-effort, not atomic — acceptable for counters
    // where occasional double-count from races is fine).
    let counters;
    try {
      counters = await store.get(batchKey, { type: "json" });
    } catch (e) {
      counters = null;
    }
    counters = counters || emptyCounters();
    counters[field] = (counters[field] || 0) + 1;

    await store.setJSON(batchKey, counters);
    return jsonResponse(200, { ok: true, counters });
  }

  return jsonResponse(405, { error: "Method not allowed" });
};
