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
  "daily_drop_view", "daily_drop_engaged", "daily_drop_card_save",
  "daily_drop_share", "daily_drop_collection_open",
];
const PUBLIC_GAME_EVENTS = new Set([
  "fandom_game_start", "fandom_game_reveal", "fandom_game_share",
  "fandom_share_open",
]);
const DAILY_DROP_EVENTS = new Set([
  "daily_drop_view", "daily_drop_engaged", "daily_drop_card_save",
  "daily_drop_share", "daily_drop_collection_open",
]);
const DAILY_DROP_ENGAGEMENT_REASONS = new Set(["three_cards", "twenty_seconds"]);
const DAILY_DROP_SHARE_METHODS = new Set(["edition_link", "image"]);
const ATTRIBUTED_COLLECTION_EVENTS = new Set(["collection_save", "plan_add"]);
const LG01_OUTCOMES = new Set([
  "moonlit-strategist", "exiled-immortal", "chaos-prince",
  "lotus-healer", "silent-sword", "fox-spirit",
  "celestial-guardian", "bamboo-recluse", "fated-romantic",
]);
const STORE_NAME = "engagement";
const MAX_CONTEXT_TEXT = 500;

function optionalContextText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CONTEXT_TEXT
    ? value
    : undefined;
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
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

  const {
    event, batchKey, imageUrl, actor, vibe, editionTier, resultPositions, grid,
    contentId, outcomeId, source, editionDate, position, saved, engagementReason,
    shareMethod, capturedDate,
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

  if (DAILY_DROP_EVENTS.has(event)) {
    const validEditionDate = isCalendarDate(editionDate);
    const validPosition = event !== "daily_drop_card_save"
      || (Number.isInteger(position) && position >= 0 && position <= 8);
    const validSaved = event !== "daily_drop_card_save" || typeof saved === "boolean";
    const validReason = event !== "daily_drop_engaged"
      || DAILY_DROP_ENGAGEMENT_REASONS.has(engagementReason);
    const validShareMethod = event !== "daily_drop_share"
      || DAILY_DROP_SHARE_METHODS.has(shareMethod);
    if (
      !validEditionDate
      || batchKey !== `vibe-atlas:${editionDate}`
      || !validPosition
      || !validSaved
      || !validReason
      || !validShareMethod
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid Daily Drop event payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
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

    const sharedKey = `${batchKey}:${event}`;

    /** @type {Record<string, unknown>} */
    const entry = {
      schemaVersion: 2,
      event,
      batchKey,
      timestamp: new Date().toISOString(),
    };

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
    } else if (DAILY_DROP_EVENTS.has(event)) {
      entry.editionDate = editionDate;
      if (event === "daily_drop_card_save") {
        entry.position = position;
        entry.saved = saved;
      } else if (event === "daily_drop_engaged") {
        entry.engagementReason = engagementReason;
      } else if (event === "daily_drop_share") {
        entry.shareMethod = shareMethod;
      }
    } else if (ATTRIBUTED_COLLECTION_EVENTS.has(event)) {
      entry.imageUrl = optionalContextText(imageUrl) ?? null;
      if (optionalContextText(actor) !== undefined) entry.actor = actor;
      if (optionalContextText(vibe) !== undefined) entry.vibe = vibe;
      if (isCalendarDate(capturedDate)) entry.capturedDate = capturedDate;
    } else {
      entry.imageUrl = optionalContextText(imageUrl) ?? null;
    }

    const eventKey = `${sharedKey}:${Date.now()}:${crypto.randomUUID()}`;
    await store.setJSON(eventKey, entry, { onlyIfNew: true });

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
