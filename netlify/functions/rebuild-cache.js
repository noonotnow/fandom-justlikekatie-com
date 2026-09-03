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
import { getShanghaiDateString } from "./lib/date-seed.js";
import {
  buildPayloadForDate,
  cachedPairIsEligible,
  STAR_OF_DAY_VERSION,
} from "./star-of-day.js";
import { materializePublicationManifest } from "./lib/publication-manifest.js";

const VERSION = STAR_OF_DAY_VERSION;
const STORE_NAME = "star-of-day";

function cacheKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}`;
}

function lockKeyFor(dateString) {
  return `starOfDay:${VERSION}:${dateString}:lock`;
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
    const eligibilityStore = getBlobStore("actor-audit", context);
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
    const payload = await buildPayloadForDate(todayStr, eligibilityStore, {
      publicationStore: store,
      materializePublication: materializePublicationManifest,
      mediaEnv: process.env,
    });
    if (!payload) {
      return jsonResponse(500, {
        error: "Rebuild produced no acceptable results",
        date: todayStr
      });
    }

    if (!await cachedPairIsEligible(
      payload,
      eligibilityStore,
      undefined,
    )) {
      return jsonResponse(409, {
        error: "Pairing approval changed while the rebuild was running",
        date: todayStr,
      });
    }

    await store.setJSON(todayKey, payload);
    if (!await cachedPairIsEligible(
      payload,
      eligibilityStore,
      undefined,
    )) {
      await store.delete(todayKey);
      return jsonResponse(409, {
        error: "Pairing approval changed before the rebuild completed",
        date: todayStr,
      });
    }

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
