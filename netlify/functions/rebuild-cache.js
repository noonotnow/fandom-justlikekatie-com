// Manual cache rebuild endpoint for star-of-day.
//
// Forces an immediate rebuild of today's star-of-day cache, bypassing the
// lock mechanism. Protected by a secret token (env var REBUILD_SECRET).
//
// Usage:
//   curl "https://<site>.netlify.app/.netlify/functions/rebuild-cache?secret=YOUR_SECRET"
//
// Or with a header:
//   curl -H "x-rebuild-secret: YOUR_SECRET" \
//        "https://<site>.netlify.app/.netlify/functions/rebuild-cache"
//
// Set the REBUILD_SECRET environment variable in the Netlify site settings.

import { getBlobStore } from "./lib/blob-store.js";
import { ACTOR_PACKS as actorPacks } from "./lib/actor-packs.js";
import { searchOneQuery } from "./preview-search.js";
import { evaluateCandidates, rankCandidates, RANKED_BATCH_LIMIT } from "./lib/ranking.js";
import { getShanghaiDateString, getRandomForDate } from "./lib/date-seed.js";

const VERSION = "v1";
const STORE_NAME = "star-of-day";

function cacheKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}`;
}

function lockKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}:lock`;
}

async function buildPayloadForDate(dateString) {
  const seed = getRandomForDate(actorPacks, dateString);
  if (!seed) {
    throw new Error("Could not resolve actor/vibe pack for date");
  }

  const actor = actorPacks[seed.aIdx];
  const vibe = actor.vibes[seed.vIdx];

  const candidates = await evaluateCandidates(vibe.queries, searchOneQuery);
  const ranked = rankCandidates(candidates).slice(0, RANKED_BATCH_LIMIT);

  if (!ranked.length) {
    return null;
  }

  return {
    version: VERSION,
    date: dateString,
    actorId: actor.id,
    actorIdx: seed.aIdx,
    actorName: actor.name,
    actorShortNameEn: actor.shortName_en,
    actorAccentColor: actor.accentColor,
    vibeIdx: seed.vIdx,
    vibeEmoji: vibe.emoji,
    vibeLabel: vibe.label,
    vibeLabelEn: vibe.label_en,
    vibeSubtitle: vibe.subtitle,
    vibeSubtitleEn: vibe.subtitle_en,
    rankedBatches: ranked,
    generatedAt: new Date().toISOString()
  };
}

export default async (req, context) => {
  // Only allow GET and POST
  if (req.method && !["GET", "POST"].includes(req.method)) {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // Auth check: secret via query param or header
  const url = new URL(req.url);
  const secretParam = url.searchParams.get("secret");
  const secretHeader = req.headers.get("x-rebuild-secret");
  const providedSecret = secretParam || secretHeader;

  const expectedSecret = Netlify.env.get("REBUILD_SECRET");
  if (!expectedSecret) {
    return jsonResponse(500, { error: "REBUILD_SECRET env var not configured" });
  }
  if (!providedSecret || providedSecret !== expectedSecret) {
    return jsonResponse(401, { error: "Unauthorized: invalid or missing secret" });
  }

  try {
    const store = getBlobStore(STORE_NAME, context);
    const todayStr = getShanghaiDateString();
    const todayKey = cacheKeyFor(todayStr);

    // Clear any existing lock so our rebuild isn't blocked
    try {
      await store.delete(lockKeyFor(todayStr));
    } catch (e) {
      // Non-fatal
    }

    // Delete the existing cache entry to force a fresh build
    try {
      await store.delete(todayKey);
    } catch (e) {
      // Non-fatal — may not exist
    }

    // Build fresh payload
    const payload = await buildPayloadForDate(todayStr);
    if (!payload) {
      return jsonResponse(500, {
        error: "Rebuild produced no acceptable results",
        date: todayStr
      });
    }

    // Write to cache
    await store.setJSON(todayKey, payload);

    return jsonResponse(200, {
      success: true,
      message: "Cache rebuilt successfully",
      date: todayStr,
      actorName: payload.actorName,
      vibeLabel: payload.vibeLabel,
      batchCount: payload.rankedBatches.length,
      generatedAt: payload.generatedAt
    });
  } catch (err) {
    return jsonResponse(500, {
      error: err.message || "Unknown error during rebuild",
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
};

function jsonResponse(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
