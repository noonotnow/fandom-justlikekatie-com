import { getBlobStore } from "./lib/blob-store.js";

/**
 * Log engagement events (save, share, click, export) to Netlify Blobs.
 * Payload: { event: string, batchKey: string, imageUrl: string }
 */

const VALID_EVENTS = ["save", "share", "click", "export"];
const STORE_NAME = "engagement";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { event, batchKey, imageUrl } = body;

  if (!event || !VALID_EVENTS.includes(event)) {
    return new Response(
      JSON.stringify({ error: `Invalid event type. Must be one of: ${VALID_EVENTS.join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!batchKey) {
    return new Response(
      JSON.stringify({ error: "batchKey is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const store = getBlobStore(STORE_NAME, context);

    // Append to a per-batch engagement log
    const key = `${batchKey}:${event}`;
    const existing = await store.get(key, { type: "json" }).catch(() => null);
    const entries = Array.isArray(existing) ? existing : [];

    entries.push({
      imageUrl: imageUrl || null,
      timestamp: new Date().toISOString(),
    });

    await store.setJSON(key, entries);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("log-engagement error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
