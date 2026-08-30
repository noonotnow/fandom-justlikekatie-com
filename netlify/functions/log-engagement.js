import { getBlobStore } from "./lib/blob-store.js";
import { validateGridPayload } from "./lib/grid-export-validation.js";

/**
 * Log engagement events to Netlify Blobs.
 *
 * Single-card events (save, share, click, export):
 *   Payload: { event, batchKey, imageUrl }
 *
 * Legacy grid exports (grid-export) — sent by saveShareCard in exportCanvas.ts:
 *   Payload: { event: "grid-export", batchKey, actor, vibe, editionTier, resultPositions }
 *   resultPositions: [{ position: 0..8, thumbnail: string, source: string|null }]
 *
 * Structured grid exports (grid_export) — sent by logGridExport in gridExportLog.ts:
 *   Payload: { event: "grid_export", batchKey: <gridId>, grid: {...} }
 *   The `grid` object is validated by validateGridPayload (lib/grid-export-validation.js)
 *   and captures actor, vibe, search spell, edition tier, export variant, and image ids
 *   so exported grids can inform future curation.
 */

const VALID_EVENTS = [
  "save", "share", "click", "export", "grid-export", "grid_export",
  "collection_save", "plan_add", "membership_view", "upgrade_click",
  "checkout_started", "membership_activated", "paid_feature_used",
  "fandom_game_start", "fandom_game_reveal", "fandom_game_share",
  "fandom_share_open",
];
const PUBLIC_GAME_EVENTS = new Set([
  "fandom_game_start", "fandom_game_reveal", "fandom_game_share",
  "fandom_share_open",
]);
const LG01_OUTCOMES = new Set([
  "moonlit-strategist", "exiled-immortal", "chaos-prince",
  "lotus-healer", "silent-sword", "fox-spirit",
  "celestial-guardian", "bamboo-recluse", "fated-romantic",
]);
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

  const {
    event, batchKey, imageUrl, actor, vibe, editionTier, resultPositions, grid,
    contentId, outcomeId, source,
  } = body;

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

  if (PUBLIC_GAME_EVENTS.has(event)) {
    const requiresOutcome = event !== "fandom_game_start";
    const validOutcome = outcomeId === undefined || LG01_OUTCOMES.has(outcomeId);
    const validSource = source === undefined || source === "direct" || source === "share";
    if (
      batchKey !== "c-drama-fandom-lg01"
      || contentId !== "lg01-v1"
      || (requiresOutcome && outcomeId === undefined)
      || !validOutcome
      || !validSource
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid public fandom game payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
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
      // Legacy grid export: rich positional metadata from saveShareCard.
      if (actor !== undefined) entry.actor = actor;
      if (vibe !== undefined) entry.vibe = vibe;
      if (editionTier !== undefined) entry.editionTier = editionTier;
      if (Array.isArray(resultPositions)) entry.resultPositions = resultPositions;
    } else if (PUBLIC_GAME_EVENTS.has(event)) {
      entry.contentId = contentId;
      if (outcomeId !== undefined) entry.outcomeId = outcomeId;
      if (source !== undefined) entry.source = source;
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
