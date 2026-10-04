import { createHash, randomUUID } from "node:crypto";
import { getWithResolvedEtag } from "./blob-store.js";

export const PUBLIC_ARCHIVE_DIRECTORY_KEY = "derived/public-archive-actors-v1";
export const PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS = 15 * 60 * 1000;
export const PUBLIC_ARCHIVE_DIRECTORY_COALESCE_MS = 30 * 1000;
const KIND = "verified-public-archive-actors";
const refreshes = new WeakMap();
const MAX_PENDING_REFRESHES = 64;

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
  store, dates, timestamp, maxScan, readManifest, cursor, refreshScope = store, diagnostics,
}) {
  // Share only identical requests within one server instance/storage scope.
  // A distributed lease would add writes and require a new browser waiting
  // protocol. CAS remains the cross-instance progress safeguard, not a lock.
  let pending = refreshes.get(refreshScope);
  if (!pending) {
    pending = new Map();
    refreshes.set(refreshScope, pending);
  }
  for (const [key, work] of pending) {
    if (timestamp >= work.timestamp + PUBLIC_ARCHIVE_DIRECTORY_COALESCE_MS) pending.delete(key);
  }
  const key = JSON.stringify([dates, maxScan, cursor || null]);
  const work = pending.get(key);
  if (work && timestamp >= work.timestamp) {
    const stopWait = diagnostics?.join(work.workId);
    let result;
    try {
      result = await work.promise;
    } finally {
      stopWait?.();
    }
    // A request crossing the evidence TTL must reverify, not inherit freshness
    // from an earlier reader. Coalescing never extends verification authority.
    if (timestamp < Date.parse(result.actorInventory.expiresAt)) return structuredClone(result);
    if (pending.get(key) === work) pending.delete(key);
    return readVerifiedActorDirectory({
      store, dates, timestamp, maxScan, readManifest, cursor, refreshScope, diagnostics,
    });
  }
  const workId = randomUUID();
  diagnostics?.work(workId, "owner");
  const current = {
    workId,
    timestamp,
    promise: scanVerifiedActorDirectory({
      store, dates, timestamp, maxScan, readManifest, cursor, workId, diagnostics,
    }),
  };
  // Bound memory even if storage/manifest calls never settle. Expired work is
  // replaceable; its eventual CAS still cannot overwrite newer saved progress.
  if (pending.size < MAX_PENDING_REFRESHES) pending.set(key, current);
  try {
    return structuredClone(await current.promise);
  } finally {
    if (pending.get(key) === current) pending.delete(key);
  }
}

async function scanVerifiedActorDirectory({
  store, dates, timestamp, maxScan, readManifest, cursor, workId, diagnostics,
}) {
  const fingerprint = createHash("sha256").update(JSON.stringify(dates)).digest("hex");
  const metrics = diagnostics?.beginChunk(workId, fingerprint, dates.length);
  try {
    return await verifyActorDirectory({
      store, dates, timestamp, maxScan, readManifest, cursor, fingerprint, metrics,
    });
  } finally {
    metrics?.finish();
  }
}

function snapshotOutcome(value, fingerprint, dates, timestamp) {
  if (!value) return "missing";
  if (value.fingerprint !== fingerprint) return "changed";
  if (Number.isFinite(value.startedAt)
    && timestamp >= value.startedAt + PUBLIC_ARCHIVE_DIRECTORY_MAX_AGE_MS) return "expired";
  if (value.scanned === dates.length && value.unavailableCount > 0) return "partial_exhausted";
  if (!validSnapshot(value, fingerprint, dates, timestamp)) return "invalid";
  return value.scanned === dates.length ? "complete" : "progress";
}

async function verifyActorDirectory({
  store, dates, timestamp, maxScan, readManifest, cursor, fingerprint, metrics,
}) {
  const deliver = (snapshot, options) => {
    const body = response(snapshot, dates, options);
    metrics?.generation(snapshot.generation);
    metrics?.outcome(body.actorInventory.freshness);
    metrics?.result(body.actorInventory, body.page);
    return body;
  };
  let entry = null;
  let cached = null;
  let cacheAvailable = typeof store.setJSON === "function"
    && typeof store.getWithMetadata === "function";
  try {
    cached = await store.get(PUBLIC_ARCHIVE_DIRECTORY_KEY, { type: "json", consistency: "strong" });
    metrics?.snapshot(snapshotOutcome(cached, fingerprint, dates, timestamp));
  } catch {
    cacheAvailable = false;
    metrics?.snapshot("unavailable");
  }
  if (validSnapshot(cached, fingerprint, dates, timestamp)
    && cached.scanned === dates.length) {
    return deliver(cached, { scanned: 0, source: "snapshot", cacheAvailable: true });
  }
  if (cacheAvailable) {
    try {
      entry = await getWithResolvedEtag(store, PUBLIC_ARCHIVE_DIRECTORY_KEY, { type: "json" });
      cached = entry?.data;
      metrics?.snapshot(snapshotOutcome(cached, fingerprint, dates, timestamp));
      if (entry && !entry.etag) cacheAvailable = false;
    } catch {
      cacheAvailable = false;
      metrics?.snapshot("unavailable");
    }
  }
  let snapshot = cacheAvailable && validSnapshot(cached, fingerprint, dates, timestamp) ? cached : null;
  if (snapshot?.scanned === dates.length) {
    return deliver(snapshot, { scanned: 0, source: "snapshot", cacheAvailable });
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
  metrics?.generation(snapshot.generation);
  const actors = new Map(snapshot.actors.map(actor => [actor.id, actor]));
  let scanned = 0;
  let unavailable = false;
  while (snapshot.scanned < dates.length && scanned < maxScan) {
    // Bound both total reads and in-flight reads. A long catalogue must not
    // multiply serial network latency until a refresh outlives its own TTL.
    const batch = dates.slice(snapshot.scanned,
      snapshot.scanned + Math.min(10, maxScan - scanned));
    const foundBatch = await Promise.all(batch.map((date, index) => {
      metrics?.scanRead(snapshot.scanned + index);
      return readManifest(store, date);
    }));
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
  metrics?.scanFinished(snapshot.scanned);
  snapshot.actors = [...actors.values()].sort((a, b) => a.name.localeCompare(b.name));
  // Never persist a temporary storage failure as a verified omission.
  if (cacheAvailable && !unavailable) {
    try {
      metrics?.casStart();
      const result = await store.setJSON(PUBLIC_ARCHIVE_DIRECTORY_KEY, snapshot,
        entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
      metrics?.casFinished(result);
      // A losing CAS is safe: the winning request retained independent progress.
    } catch {
      cacheAvailable = false;
      metrics?.casError();
    }
  }
  return deliver(snapshot, {
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