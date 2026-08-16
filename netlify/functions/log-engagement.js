import { getBlobStore } from "./lib/blob-store.js";

/**
 * Log engagement events to Netlify Blobs.
 *
 * Single-card events (save, share, click, export):
 *   Payload: { event, batchKey, imageUrl }
 *
 * Full 3×3 grid exports (grid-export):
 *   Payload: { event: "grid-export", batchKey, actor, vibe, editionTier, resultPositions }
 *   resultPositions: [{ position: 0..8, thumbnail: string, source: string|null }]
 *   Exported grids are stored so the best grids can inform future curation.
 */

const VALID_EVENTS = ["save", "share", "click", "export", "grid-export", "grid_export"];
const STORE_NAME = "engagement";
const MAX_GRID_PAYLOAD_BYTES = 8192;

const GRID_STRING_FIELDS = [
  "gridId", "date", "actorId", "actor", "actorEn",
  "vibe", "vibeEn", "searchSpell", "tier",
];
const GRID_ALLOWED_FIELDS = new Set([...GRID_STRING_FIELDS, "variant", "imageIds", "ctaSeed"]);

/**
 * Validate the structured `grid` payload for grid_export events.
 * Returns an error string, or null when valid.
 */
function validateGridPayload(grid) {
  if (!grid || typeof grid !== "object" || Array.isArray(grid)) return "grid payload must be an object";
  for (const field of GRID_STRING_FIELDS) {
    if (typeof grid[field] !== "string") return `grid.${field} must be a string`;
  }
  if (grid.variant !== "full" && grid.variant !== "teaser") return "grid.variant must be 'full' or 'teaser'";
  if (!Array.isArray(grid.imageIds) || grid.imageIds.length < 1 || grid.imageIds.length > 9
    || !grid.imageIds.every((id) => typeof id === "string")) {
    return "grid.imageIds must be 1-9 strings";
  }
  if (grid.ctaSeed !== undefined && typeof grid.ctaSeed !== "string") return "grid.ctaSeed must be a string";
  for (const key of Object.keys(grid)) {
    if (!GRID_ALLOWED_FIELDS.has(key)) return `unknown grid field: ${key}`;
  }
  if (JSON.stringify(grid).length > MAX_GRID_PAYLOAD_BYTES) return "grid payload too large";
  return null;
}

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

  const { event, batchKey, imageUrl, actor, vibe, editionTier, resultPositions, grid } = body;

  if (!event || !VALID_EVENTS.includes(event)) {
    return new Response(
      JSON.stringify({ error: `Invalid event type. Must be one of: ${VALID_EVENTS.join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (event === "grid_export") {
    const gridError = validateGridPayload(grid);
    if (gridError) {
      return new Response(
        JSON.stringify({ error: gridError }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
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

    /** @type {Record<string, unknown>} */
    const entry = { timestamp: new Date().toISOString() };

    if (event === "grid_export") {
      // Structured grid-artifact export event (validated above).
      entry.grid = grid;
    } else if (event === "grid-export") {
      // Grid export: store rich metadata so best grids can inform future curation
      if (actor !== undefined) entry.actor = actor;
      if (vibe !== undefined) entry.vibe = vibe;
      if (editionTier !== undefined) entry.editionTier = editionTier;
      // resultPositions: [{ position: 0..8, thumbnail: string, source: string|null }]
      if (Array.isArray(resultPositions)) entry.resultPositions = resultPositions;
    } else {
      entry.imageUrl = imageUrl || null;
    }

    entries.push(entry);

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
