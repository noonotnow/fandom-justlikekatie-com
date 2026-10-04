import {
  gridManifestKey,
  isGridManifest,
  isIndexablePublicationManifest,
  isPublicationManifestCatalog,
  publicActorPath,
  publicActorSlug,
  publicEditionPath,
  publicationManifestCatalogKey,
} from "./publication-manifest.js";
import { getShanghaiDateString } from "./date-seed.js";
import { assertPublicArchiveRecord } from "../../../src/contracts/publicArchiveRecord.js";
import { readVerifiedActorDirectory } from "./public-archive-directory.js";

export const PUBLIC_ARCHIVE_PAGE_SIZE = 24;
export const PUBLIC_ARCHIVE_MAX_PAGE_SIZE = 50;
export const PUBLIC_ARCHIVE_MAX_SCAN = 100;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUBLIC_CACHE = "public, max-age=60, stale-while-revalidate=300";
const PUBLIC_FAMILY_EVIDENCE = new Set([
  "persisted-event",
  "batch",
  "publisher",
  "fallback",
]);

function isCalendarDate(value) {
  if (!DATE_RE.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeHttpsLink(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? value : "";
  } catch {
    return "";
  }
}

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": statusCode === 200 ? PUBLIC_CACHE : "no-store",
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

function publicRecordForManifest(manifest) {
  const actorSlug = publicActorSlug(manifest.actor);
  const expected = {
    actorPath: publicActorPath(manifest.actor),
    editionPath: publicEditionPath(manifest),
  };
  if (!manifest.publicRecord
    || manifest.publicRecord.actorPath !== expected.actorPath
    || manifest.publicRecord.editionPath !== expected.editionPath) return null;
  try {
    return assertPublicArchiveRecord(manifest.publicRecord, {
      expectedDate: manifest.publicationDate,
      expectedActorSlug: actorSlug,
    });
  } catch {
    return null;
  }
}

export function publicArchiveImageId(manifest, card) {
  return `archive:${manifest.publicationDate}:card-${card.position}`;
}

/**
 * Project only approved manifest fields and immutable MEDIA references. The
 * original source attribution remains separate from the public edition route.
 */
export function publicArchiveGrid(manifest) {
  if (!isGridManifest(manifest)
    || !isIndexablePublicationManifest(manifest)) return null;
  const publicRecord = publicRecordForManifest(manifest);
  if (!publicRecord) return null;

  const editionPath = publicRecord.editionPath;
  const results = manifest.cards.map(card => ({
    imageId: publicArchiveImageId(manifest, card),
    title: typeof card.title === "string" ? card.title : "",
    thumbnail: card.media.thumbnailUrl,
    deliveryUrl: card.media.deliveryUrl,
    link: safeHttpsLink(card.link),
    source: typeof card.source === "string" ? card.source : "",
    ...(typeof card.familyId === "string" ? { familyId: card.familyId } : {}),
    ...(typeof card.familyLabel === "string" ? { familyLabel: card.familyLabel } : {}),
    ...(PUBLIC_FAMILY_EVIDENCE.has(card.familyEvidence)
      ? { familyEvidence: card.familyEvidence }
      : {}),
    editionDate: manifest.publicationDate,
    archiveEditionPath: editionPath,
  }));
  const result = {
    date: manifest.publicationDate,
    actorId: manifest.actor.id,
    actorName: manifest.actor.name,
    actorShortNameEn: manifest.actor.nameEn,
    actorAccentColor: manifest.actor.accentColor,
    vibeIdx: manifest.vibe.idx,
    vibeEmoji: manifest.vibe.emoji || "",
    vibeLabel: manifest.vibe.label,
    vibeLabelEn: manifest.vibe.labelEn,
    vibeSubtitle: manifest.vibe.subtitle || "",
    vibeSubtitleEn: manifest.vibe.subtitleEn || "",
    vibeSupportingCopy: manifest.vibe.supportingCopy || "",
    vibeSupportingCopyEn: manifest.vibe.supportingCopyEn || "",
    generatedAt: manifest.publishedAt,
    rankedBatches: [{
      query: "verified-publication-manifest",
      results,
      count: results.length,
      distinctSources: new Set(results.map(card => card.source).filter(Boolean)).size,
      provider: null,
    }],
    displayResults: results,
    publicRecord,
  };
  return result;
}

export async function readPublicManifestForDate(store, date) {
  if (!isCalendarDate(date)) return { status: "invalid_date" };
  let manifest;
  try {
    manifest = await store.get(gridManifestKey(date), {
      type: "json",
      consistency: "strong",
    });
  } catch {
    return { status: "unavailable" };
  }
  if (!manifest) return { status: "missing" };
  if (manifest.publicationDate !== date) return { status: "invalid" };
  const edition = publicArchiveGrid(manifest);
  return edition
    ? { status: "available", manifest, edition }
    : { status: "not_public" };
}

function actorSummaries(editions) {
  const actors = new Map();
  for (const edition of editions) {
    if (!edition.actorId || actors.has(edition.actorId)) continue;
    actors.set(edition.actorId, {
      id: edition.actorId,
      name: edition.actorShortNameEn || edition.actorName,
    });
  }
  return [...actors.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function pageLimit(searchParams) {
  const raw = searchParams.get("limit");
  if (raw === null) return PUBLIC_ARCHIVE_PAGE_SIZE;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return parsed >= 1 && parsed <= PUBLIC_ARCHIVE_MAX_PAGE_SIZE ? parsed : null;
}

function nextCalendarDate(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Public, cursor-paginated inventory. The catalogue supplies candidate dates,
 * while each manifest is independently checked before it can enter a page.
 * A missing or invalid candidate is skipped only with explicit partial-page
 * metadata, and the bounded scan continues beyond it to find later editions.
 */
export function createPublicArchiveInventoryHandler({
  getStore = () => {
    throw new Error("A publication store is required.");
  },
  now = () => new Date(),
} = {}) {
  return async (request, context) => {
    if (request.method && request.method !== "GET") {
      return jsonResponse(405, { error: "Method not allowed" }, { Allow: "GET" });
    }
    const url = new URL(request.url || "https://fandom.local/.netlify/functions/public-archive-inventory");
    const date = url.searchParams.get("date");
    let store;
    try {
      store = getStore("star-of-day", context);
    } catch {
      return jsonResponse(503, { error: "Public Archive inventory is temporarily unavailable." });
    }

    if (date !== null) {
      if (!isCalendarDate(date)) {
        return jsonResponse(400, { error: "Date must be a valid YYYY-MM-DD calendar date." });
      }
      let today;
      try {
        today = getShanghaiDateString(now());
      } catch {
        return jsonResponse(503, { error: "The public Archive date could not be verified." });
      }
      if (date > today) {
        return jsonResponse(404, { error: "That public Archive edition is not available." });
      }
      const found = await readPublicManifestForDate(store, date);
      if (found.status === "unavailable") {
        return jsonResponse(503, { error: "The public Archive edition could not be verified." });
      }
      if (found.status !== "available") {
        const isUnverifiedOlderEdition = date < today
          && ["missing", "not_public"].includes(found.status);
        return jsonResponse(404, {
          error: "That public Archive edition is not available.",
          ...(isUnverifiedOlderEdition ? { fallback: "legacy_unverified_edition" } : {}),
        });
      }
      return jsonResponse(200, found.edition);
    }

    const limit = pageLimit(url.searchParams);
    if (limit === null) {
      return jsonResponse(400, {
        error: `Page limit must be between 1 and ${PUBLIC_ARCHIVE_MAX_PAGE_SIZE}.`,
      });
    }
    const actorId = url.searchParams.get("actorId");
    const directory = url.searchParams.get("directory");
    if (directory !== null && (directory !== "actors" || actorId !== null)) {
      return jsonResponse(400, { error: "Archive directory request is invalid." });
    }
    if (actorId !== null && (actorId.length === 0 || actorId.length > 120)) {
      return jsonResponse(400, { error: "Actor id is invalid." });
    }
    const cursor = url.searchParams.get("cursor");
    if (cursor !== null && !isCalendarDate(cursor)) {
      return jsonResponse(400, { error: "Archive cursor must be a valid YYYY-MM-DD date." });
    }

    let today;
    let catalog;
    let timestamp;
    try {
      const clock = now();
      timestamp = clock.getTime();
      today = getShanghaiDateString(clock);
      catalog = await store.get(publicationManifestCatalogKey(), {
        type: "json",
        consistency: "strong",
      });
    } catch {
      return jsonResponse(503, { error: "Public Archive inventory is temporarily unavailable." });
    }
    if (!isPublicationManifestCatalog(catalog)) {
      return jsonResponse(503, { error: "Public Archive inventory is not ready." });
    }

    if (directory === "actors") {
      const body = await readVerifiedActorDirectory({
        store,
        dates: catalog.dates.filter(candidate => candidate <= today).reverse(),
        timestamp, cursor,
        maxScan: PUBLIC_ARCHIVE_MAX_SCAN,
        readManifest: readPublicManifestForDate,
      });
      // Never serve a partial pass or an expired directory from an HTTP cache.
      // The derived snapshot itself supplies bounded caching and freshness.
      return jsonResponse(200, body, { "Cache-Control": "no-store" });
    }

    const candidates = catalog.dates
      .filter(candidate => candidate <= today && (!cursor || candidate < cursor))
      .reverse();
    const editions = [];
    let scanned = 0;
    let unavailableCount = 0;
    let lastScannedDate = null;
    let index = 0;
    let storageUnavailable = false;
    while (index < candidates.length
      && scanned < PUBLIC_ARCHIVE_MAX_SCAN
      && (directory === "actors" || editions.length < limit)) {
      const candidate = candidates[index];
      index += 1;
      scanned += 1;
      const found = await readPublicManifestForDate(store, candidate);
      if (found.status === "unavailable") {
        storageUnavailable = true;
        break;
      }
      lastScannedDate = candidate;
      if (found.status !== "available") {
        unavailableCount += 1;
        continue;
      }
      if (actorId && found.edition.actorId !== actorId) continue;
      editions.push(found.edition);
    }

    const hasMore = storageUnavailable || index < candidates.length;
    const scanLimitReached = scanned >= PUBLIC_ARCHIVE_MAX_SCAN && index < candidates.length;
    const partial = unavailableCount > 0 || storageUnavailable || scanLimitReached;
    const nextCursor = hasMore
      ? lastScannedDate || (storageUnavailable && candidates[0]
        ? nextCalendarDate(candidates[0])
        : null)
      : null;
    return jsonResponse(200, {
      ...(directory === "actors" ? {} : { editions }),
      page: {
        nextCursor,
        hasMore,
        status: partial ? "partial" : "complete",
        partial,
        scanned,
        unavailableCount,
        scanLimitReached,
        ...(storageUnavailable ? { unavailable: true } : {}),
      },
      actors: actorSummaries(editions),
      actorInventory: {
        complete: directory === "actors" && !hasMore && !partial,
        scope: directory === "actors" ? "verified-directory" : "verified-page",
        ...(directory === "actors" ? {} : {
          reason: "A complete global actor directory is not part of this bounded page read.",
        }),
      },
    });
  };
}

export function isValidArchiveImageIdentity(manifest, imageId) {
  if (typeof imageId !== "string" || !imageId || imageId.length > 2048) return false;
  return manifest.cards.some(card =>
    publicArchiveImageId(manifest, card) === imageId
    || card.candidateId === imageId
    || card.media.thumbnailUrl === imageId
    || card.media.deliveryUrl === imageId);
}