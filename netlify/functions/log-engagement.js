import { getBlobStore } from "./lib/blob-store.js";
import { validateGridPayload } from "./lib/grid-export-validation.js";
import { createPublicAuth } from "./lib/public-auth.js";
import { createParticipationCollector } from "./lib/daily-participation-analytics.js";
import { PARTICIPATION_EVENTS } from "../../shared/daily-participation.js";
import { ENDINGS, GAME_ID } from "../../public/c-drama-fandom/fandom-games/sect-day/story.js";

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
  "sect_game_start", "sect_game_complete", "sect_game_action",
  "save", "share", "click", "export", "grid-export", "grid_export",
  "collection_save", "plan_add", "membership_view", "upgrade_click",
  "checkout_started", "membership_activated", "paid_feature_used",
  "fandom_game_start", "fandom_game_reveal", "fandom_game_share",
  "fandom_share_open",
  "daily_drop_view", "daily_drop_engaged", "daily_drop_card_save",
  "daily_drop_share", "daily_drop_collection_open",
  "archive_page_view", "archive_gated_preview_view", "archive_record_opened",
  "companion_path_view", "companion_qualified_view", "companion_interest_click", "companion_collection_click",
];
const COMPANION_EVENTS = new Set(["companion_path_view", "companion_qualified_view", "companion_interest_click", "companion_collection_click"]);
const COMPANION_PATHS = new Set(["discover", "context", "collect"]);
const PILOT_MEMBERSHIP_EVENTS = new Set(["membership_view", "upgrade_click", "checkout_started", "membership_activated"]);
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
const ARCHIVE_REVIEW_EVENTS = new Set([
  "archive_page_view", "archive_gated_preview_view", "archive_record_opened",
]);
const ARCHIVE_PAGE_PATHS = new Set(["/vibe-atlas", "/vibe-atlas/archive"]);
const ARCHIVE_RECORD_TYPES = new Set(["actor", "edition"]);
const ARCHIVE_RECORD_LOCATIONS = new Set([
  "daily", "archive_picker", "locked_preview", "full_archive",
]);
const ATTRIBUTED_COLLECTION_EVENTS = new Set(["collection_save", "plan_add"]);
const LG01_OUTCOMES = new Set([
  "moonlit-strategist", "exiled-immortal", "chaos-prince",
  "lotus-healer", "silent-sword", "fox-spirit",
  "celestial-guardian", "bamboo-recluse", "fated-romantic",
]);
const STORE_NAME = "engagement";
const SECT_EVENTS = new Set(["sect_game_start", "sect_game_complete", "sect_game_action"]);
const SECT_OUTCOMES = new Set(ENDINGS.map(ending => ending.id));
const MAX_CONTEXT_TEXT = 500;
const publicAuth = createPublicAuth({ getStore: getBlobStore });
const collectParticipation = createParticipationCollector({ auth: publicAuth, getStore: getBlobStore });

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
    shareMethod, capturedDate, pagePath, recordType, location, pilotPath, internalPilot,
  } = body;

  if (PARTICIPATION_EVENTS.includes(event)) {
    return collectParticipation(req, context, body);
  }

  if (SECT_EVENTS.has(event) && (
    batchKey !== "c-drama-fandom-sect-day" || contentId !== GAME_ID
    || !["direct", "share"].includes(source)
    || (event === "sect_game_start" ? outcomeId !== undefined : !SECT_OUTCOMES.has(outcomeId))
    || (event === "sect_game_action" ? !["native", "copy", "download"].includes(shareMethod) : shareMethod !== undefined)
  )) {
    return new Response(JSON.stringify({ error: "Invalid sect game payload" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  if (!event || !VALID_EVENTS.includes(event)) {
    return new Response(
      JSON.stringify({ error: `Invalid event type. Must be one of: ${VALID_EVENTS.join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if ((COMPANION_EVENTS.has(event) || (pilotPath !== undefined && PILOT_MEMBERSHIP_EVENTS.has(event)))
    && (!COMPANION_PATHS.has(pilotPath)
    || (COMPANION_EVENTS.has(event) && batchKey !== "c-drama-companion-pilot"))) {
    return new Response(JSON.stringify({ error: "Invalid companion path." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
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

  // A self-declared, bounded QA flag is only accepted for pilot events.
  // No email, token, browser ID or arbitrary label enters the engagement store.
  const pilotEvent = COMPANION_EVENTS.has(event)
    || (PILOT_MEMBERSHIP_EVENTS.has(event) && COMPANION_PATHS.has(pilotPath));
  if (internalPilot !== undefined && (!pilotEvent || typeof internalPilot !== "boolean")) {
    return new Response(JSON.stringify({ error: "Invalid pilot exclusion flag." }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }
  if (pilotEvent && internalPilot === true) {
    return new Response(JSON.stringify({ ok: true, excluded: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
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

  if (ARCHIVE_REVIEW_EVENTS.has(event)) {
    const valid = batchKey === "archive-link-review"
      && (event !== "archive_page_view" || ARCHIVE_PAGE_PATHS.has(pagePath))
      && (event !== "archive_record_opened"
        || (ARCHIVE_RECORD_TYPES.has(recordType) && ARCHIVE_RECORD_LOCATIONS.has(location)));
    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Invalid archive review event payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  if (event === "companion_qualified_view") {
    if (/(bot|crawler|spider|headless|lighthouse|playwright)/i.test(req.headers.get("user-agent") || "")) {
      return new Response(JSON.stringify({ ok: true, excluded: true }), { status: 200 });
    }
    try {
      await publicAuth.authenticateAdmin(req, context);
      return new Response(JSON.stringify({ ok: true, excluded: true }), { status: 200 });
    } catch (error) {
      if (error?.status !== 401 && error?.status !== 403) throw error;
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

    if (COMPANION_EVENTS.has(event) || (pilotPath && COMPANION_PATHS.has(pilotPath))) {
      entry.pilotPath = pilotPath;
    }
    if (event === "grid_export") {
      // Structured grid-artifact export event (validated above).
      entry.grid = grid;
    } else if (event === "grid-export") {
      // Legacy grid export: rich positional metadata from saveShareCard.
      if (actor !== undefined) entry.actor = actor;
      if (vibe !== undefined) entry.vibe = vibe;
      if (editionTier !== undefined) entry.editionTier = editionTier;
      if (Array.isArray(resultPositions)) entry.resultPositions = resultPositions;
    } else if (COMPANION_EVENTS.has(event)) {
      // Path alone is allowed; never retain arbitrary browser-provided text.
    } else if (PUBLIC_GAME_EVENTS.has(event) || SECT_EVENTS.has(event)) {
      entry.contentId = contentId;
      if (outcomeId !== undefined) entry.outcomeId = outcomeId;
      if (source !== undefined) entry.source = source;
      if (SECT_EVENTS.has(event) && shareMethod !== undefined) entry.shareMethod = shareMethod;
    } else if (ARCHIVE_REVIEW_EVENTS.has(event)) {
      if (event === "archive_page_view") entry.pagePath = pagePath;
      if (event === "archive_record_opened") {
        entry.recordType = recordType;
        entry.location = location;
      }
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
