import { createHash, randomUUID } from "node:crypto";
import { getWithResolvedEtag } from "./blob-store.js";

export const PUBLIC_ARCHIVE_DIRECTORY_KEY = "derived/public-archive-actors-v1";
export const PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS = 15 * 60 * 1000;
const KIND = "verified-public-archive-actors";

function validSnapshot(value, fingerprint, dates, timestamp) {
  return value?.kind === KIND
    && value.fingerprint === fingerprint
    && typeof value.generation === "string"
    && Number.isFinite(value.startedAt)
    && value.startedAt <= timestamp
    && timestamp < value.startedAt + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS
    && Number.isInteger(value.scanned)
    && value.scanned >= 0 && value.scanned <= dates.length
    && Number.isInteger(value.unavailableCount)
    && value.unavailableCount >= 0 && value.unavailableCount <= value.scanned
    && Array.isArray(value.actors)
    && value.actors.length <= value.scanned
    && value.actors.every(actor => typeof actor?.id === "string" && actor.id
      && typeof actor.name === "string" && actor.name)
    // An exhausted partial pass must be retried, never treated as a warm directory.
    && !(value.scanned === dates.length && value.unavailableCount > 0);
}

function projectActors(actors) {
  return actors.map(({ id, name }) => ({ id, name }));
}

/**
 * A disposable, names-only derivation. Catalogue dates are candidates, not
 * publication evidence: only readManifest's authoritative manifest/MEDIA check
 * can add an actor. Exact-date and edition reads never consult this snapshot.
 *
 * One constant key limits storage growth. CAS prevents slower overlapping
 * requests from overwriting newer progress. Catalogue changes and the oldest
 * verification's TTL invalidate the entire derivation, including omissions.
 */
export async function readVerifiedActorDirectory({
  store, dates, timestamp, maxScan, readManifest, cursor,
}) {
  const fingerprint = createHash("sha256").update(JSON.stringify(dates)).digest("hex");
  let entry = null;
  let cached = null;
  let cacheAvailable = typeof store.setJSON === "function"
    && typeof store.getWithMetadata === "function";
  try {
    cached = await store.get(PUBLIC_ARCHIVE_DIRECTORY_KEY, { type: "json", consistency: "strong" });
  } catch {
    cacheAvailable = false;
  }
  if (validSnapshot(cached, fingerprint, dates, timestamp)
    && cached.scanned === dates.length) {
    return response(cached, dates, { scanned: 0, source: "snapshot", cacheAvailable: true });
  }
  if (cacheAvailable) {
    try {
      entry = await getWithResolvedEtag(store, PUBLIC_ARCHIVE_DIRECTORY_KEY, { type: "json" });
      cached = entry?.data;
      if (entry && !entry.etag) cacheAvailable = false;
    } catch {
      cacheAvailable = false;
    }
  }
  let snapshot = cacheAvailable && validSnapshot(cached, fingerprint, dates, timestamp) ? cached : null;
  if (snapshot?.scanned === dates.length) {
    return response(snapshot, dates, { scanned: 0, source: "snapshot", cacheAvailable });
  }
  // A read-only store can still deliver the original bounded, date-paged scan.
  // It cannot certify the complete history from a caller-supplied cursor.
  const cursorOffset = cursor ? dates.filter(date => date >= cursor).length : 0;
  // A prior response may have survived a cache write outage. Resume its bounded
  // suffix without pretending that an unretained prefix has been certified.
  if (snapshot && cursorOffset > snapshot.scanned) {
    snapshot = null;
    cacheAvailable = false;
  }
  const fallbackOffset = !cacheAvailable ? cursorOffset : 0;
  const restart = Boolean(cursor && !snapshot && cacheAvailable);
  snapshot = snapshot ? { ...snapshot, actors: projectActors(snapshot.actors) } : {
    kind: KIND, fingerprint, generation: randomUUID(), startedAt: timestamp,
    scanned: fallbackOffset, unavailableCount: 0, actors: [],
  };
  const actors = new Map(snapshot.actors.map(actor => [actor.id, actor]));
  let scanned = 0;
  let unavailable = false;
  while (snapshot.scanned < dates.length && scanned < maxScan) {
    // Bound both total reads and in-flight reads. A long catalogue must not
    // multiply serial network latency until a refresh outlives its own TTL.
    const batch = dates.slice(snapshot.scanned,
      snapshot.scanned + Math.min(10, maxScan - scanned));
    const foundBatch = await Promise.all(batch.map(date => readManifest(store, date)));
    scanned += batch.length;
    for (const found of foundBatch) {
      if (found.status === "unavailable") {
        unavailable = true;
        break;
      }
      snapshot.scanned += 1;
      if (found.status !== "available") {
        snapshot.unavailableCount += 1;
        continue;
      }
      const edition = found.edition;
      if (!actors.has(edition.actorId)) actors.set(edition.actorId, {
        id: edition.actorId, name: edition.actorShortNameEn || edition.actorName,
      });
    }
    if (unavailable) break;
  }
  snapshot.actors = [...actors.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Never persist a temporary storage failure as a verified omission.
  if (cacheAvailable && !unavailable) {
    try {
      await store.setJSON(PUBLIC_ARCHIVE_DIRECTORY_KEY, snapshot,
        entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      // A losing CAS is safe: the winning request retained independent progress.
    } catch {
      cacheAvailable = false;
    }
  }
  return response(snapshot, dates, {
    scanned, unavailable, restart, source: "verification", cacheAvailable,
    sharedGeneration: fallbackOffset === 0 && cacheAvailable,
    incompletePrefix: fallbackOffset > 0,
  });
}

function response(snapshot, dates, {
  scanned, unavailable = false, restart = false, source, cacheAvailable,
  sharedGeneration = true,
  incompletePrefix = false,
}) {
  const hasMore = unavailable || snapshot.scanned < dates.length;
  const complete = !hasMore && snapshot.unavailableCount === 0 && !incompletePrefix;
  const nextCursor = hasMore
    ? dates[snapshot.scanned - 1] || nextDate(dates[0])
    : null;
  return {
    actors: projectActors(snapshot.actors),
    page: {
      hasMore, nextCursor, scanned, unavailableCount: snapshot.unavailableCount,
      partial: !complete, status: complete ? "complete" : "partial",
      scanLimitReached: !unavailable && hasMore,
      ...(unavailable ? { unavailable: true } : {}),
    },
    actorInventory: {
      scope: "verified-directory", complete,
      ...(sharedGeneration ? { generation: snapshot.generation } : {}),
      restart,
      source, cacheAvailable,
      freshness: complete ? "verified" : hasMore ? "refreshing" : "partial",
      verifiedAt: new Date(snapshot.startedAt).toISOString(),
      expiresAt: new Date(snapshot.startedAt + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS).toISOString(),
      verifiedCandidates: snapshot.scanned,
      totalCandidates: dates.length,
    },
  };
}

function nextDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}