import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { get as httpsGet } from "node:https";
import { isIP } from "node:net";
import {
  isValidMediaReference,
  registerMediaBytes,
  requestError,
} from "./media-asset.js";

export const GRID_MANIFEST_VERSION = "v1";
export const GRID_MANIFEST_PREFIX = `vibeAtlas:grid-manifest:${GRID_MANIFEST_VERSION}:`;
export const GRID_PENDING_PREFIX = `vibeAtlas:grid-pending:${GRID_MANIFEST_VERSION}:`;
export const GRID_CORRECTION_VERSION = "v1";
export const GRID_CORRECTION_PREFIX =
  `vibeAtlas:grid-manifest-correction:${GRID_CORRECTION_VERSION}:`;
export const PUBLICATION_ACTOR_INDEX_VERSION = "v1";
export const PUBLICATION_ACTOR_INDEX_KEY =
  `vibeAtlas:grid-manifest-actor-index:${PUBLICATION_ACTOR_INDEX_VERSION}:latest`;
export const PUBLICATION_MANIFEST_CATALOG_KEY =
  `vibeAtlas:grid-manifest-catalog:${GRID_MANIFEST_VERSION}:dates`;
const REQUIRED_CARD_COUNT = 9;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUBLICATION_LOCK_TTL_MS = 10 * 60 * 1000;
const PUBLICATION_LOCK_PREFIX = `vibeAtlas:grid-lock:${GRID_MANIFEST_VERSION}:`;
const CORRECTION_PUBLICATION_LOCK_KEY = "locks/misprint-publication";
const CORRECTION_PUBLICATION_LOCK_TTL_MS = 10 * 60 * 1000;
const CORRECTION_PUBLICATION_LOCK_WAIT_MS = 30 * 1000;

export const gridManifestKey = date => `${GRID_MANIFEST_PREFIX}${date}`;
export const gridPendingKey = date => `${GRID_PENDING_PREFIX}${date}`;
export const gridCorrectionPrefix = date =>
  `${GRID_CORRECTION_PREFIX}${encodeURIComponent(date)}/`;
export const gridCorrectionKey = (date, correctionReceiptId) =>
  `${gridCorrectionPrefix(date)}${encodeURIComponent(correctionReceiptId)}`;
export const publicationActorIndexKey = () => PUBLICATION_ACTOR_INDEX_KEY;
export const publicationManifestCatalogKey = () => PUBLICATION_MANIFEST_CATALOG_KEY;

export async function readPublicationManifests(store) {
  const catalog = await store.get(publicationManifestCatalogKey(), {
    type: "json",
    consistency: "strong",
  });
  const listedKeys = await readPublicationManifestKeys(store);
  const catalogKeys = isPublicationManifestCatalog(catalog)
    ? catalog.dates.map(gridManifestKey)
    : [];
  const keys = [...new Set([...catalogKeys, ...listedKeys])];
  const manifests = await Promise.all(keys.map(key => store.get(key, {
    type: "json",
    consistency: "strong",
  })));
  return {
    manifests: manifests.filter(isGridManifest),
    inventory: {
      catalogValid: isPublicationManifestCatalog(catalog),
      catalogDateCount: catalogKeys.length,
      listedManifestCount: listedKeys.length,
      manifestCount: manifests.filter(isGridManifest).length,
      complete: isPublicationManifestCatalog(catalog),
    },
  };
}

export function publicationJoinReceipt(run, pair, manifests) {
  const auditDate = shanghaiDateFromTimestamp(run?.completedAt || run?.startedAt);
  const eligibleManifests = auditDate
    ? manifests.filter(manifest =>
      manifest.actor.id === pair.actor.id
      && manifest.vibe.key === pair.vibeKey
      && manifest.publicationDate >= auditDate)
    : [];
  const occurrences = (run?.rawResults || []).map((candidate, index) => {
    const auditOccurrenceId = candidate.provisionalCandidateId
      || candidate.candidateId
      || `rawResults:${index}`;
    const identity = {
      candidateId: candidate.candidateId || null,
      imageDigest: candidate.imageDigest || null,
      sourceUrl: candidate.thumbnail || null,
    };
    const hasIdentity = Boolean(identity.candidateId || identity.imageDigest || identity.sourceUrl);
    const matches = hasIdentity
      ? eligibleManifests.flatMap(manifest => manifest.cards
        .filter(card => publicationCardMatchesAuditOccurrence(card, identity))
        .map(card => ({
          publicationDate: manifest.publicationDate,
          manifestId: manifest.manifestId,
          boardHash: manifest.boardHash,
          position: card.position,
          candidateId: card.candidateId,
          sourceUrl: card.sourceUrl,
          mediaChecksum: card.media?.checksum || null,
        })))
      : [];
    return {
      auditOccurrenceId,
      auditIndex: index,
      identity,
      status: !hasIdentity
        ? "identity_unavailable"
        : matches.length === 0
          ? "missing"
          : matches.length === 1 ? "matched" : "ambiguous",
      matches,
    };
  });
  const counts = occurrences.reduce((summary, occurrence) => ({
    ...summary,
    [occurrence.status]: summary[occurrence.status] + 1,
  }), { matched: 0, missing: 0, ambiguous: 0, identity_unavailable: 0 });
  return {
    schemaVersion: 1,
    kind: "vibe-atlas-audit-publication-join",
    readOnly: true,
    source: {
      actorId: pair.actor.id,
      vibeKey: pair.vibeKey,
      runId: run.runId,
      auditDate,
    },
    matchPolicy: {
      manifestScope: "same-actor-and-vibe-on-or-after-audit-date-in-Asia/Shanghai",
      identityOrder: ["imageDigest/mediaChecksum", "candidateId+sourceUrl", "candidateId", "sourceUrl"],
      ambiguity: "Every matching immutable manifest card is retained; multiple matches are never collapsed.",
    },
    counts,
    occurrences,
  };
}

function shanghaiDateFromTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + (8 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function publicationCardMatchesAuditOccurrence(card, identity) {
  if (identity.imageDigest && card.media?.checksum) {
    return identity.imageDigest === card.media.checksum;
  }
  if (identity.candidateId && identity.sourceUrl) {
    return identity.candidateId === card.candidateId && identity.sourceUrl === card.sourceUrl;
  }
  if (identity.candidateId) return identity.candidateId === card.candidateId;
  return identity.sourceUrl === card.sourceUrl;
}

export async function recordPublicationCorrectionsForMisprint({
  store,
  correction,
  matchesCandidate,
  now = () => new Date().toISOString(),
}) {
  if (
    correction?.status !== "active"
    || correction.futureExclusion !== true
    || typeof matchesCandidate !== "function"
  ) return [];
  const listing = await store.list({ prefix: GRID_MANIFEST_PREFIX });
  const manifestKeys = new Set((listing?.blobs || [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string"));
  const actorIndex = await store.get(publicationActorIndexKey(), {
    type: "json",
    consistency: "strong",
  });
  if (isPublicationActorIndex(actorIndex)) {
    for (const entry of Object.values(actorIndex.actors)) {
      manifestKeys.add(gridManifestKey(entry.latestPublicationDate));
    }
  }
  const catalog = await store.get(publicationManifestCatalogKey(), {
    type: "json",
    consistency: "strong",
  });
  if (isPublicationManifestCatalog(catalog)) {
    for (const date of catalog.dates) manifestKeys.add(gridManifestKey(date));
  }
  const manifests = (await Promise.all([...manifestKeys].map(key =>
    store.get(key, { type: "json", consistency: "strong" })))).filter(manifest =>
    isGridManifest(manifest) && correctionAppliesToManifest(correction, manifest));
  const receipts = [];
  for (const manifest of manifests) {
    const affectedCards = manifest.cards
      .filter(card => matchesCandidate(correction, {
        candidateId: card.candidateId,
        thumbnail: card.sourceUrl || card.media?.thumbnailUrl,
        imageDigest: card.media?.checksum || null,
        query: card.query || null,
      }))
      .map(card => ({ position: card.position, candidateId: card.candidateId }));
    if (!affectedCards.length) continue;
    const receipt = {
      schemaVersion: 1,
      correctionVersion: GRID_CORRECTION_VERSION,
      receiptId: `publication-correction-${createHash("sha256").update(JSON.stringify({
        manifestId: manifest.manifestId,
        correctionReceiptId: correction.receiptId,
      })).digest("hex").slice(0, 24)}`,
      kind: "vibe-atlas-publication-correction",
      status: "recorded",
      manifestId: manifest.manifestId,
      publicationDate: manifest.publicationDate,
      boardHash: manifest.boardHash,
      correctionReceiptId: correction.receiptId,
      reason: correction.reason,
      actorId: correction.actorId,
      vibeKey: correction.vibeKey,
      affectedCards,
      affectedPositions: affectedCards.map(card => card.position),
      affectedCandidateIds: affectedCards.map(card => card.candidateId),
      recordedAt: (() => {
        const value = now();
        return value instanceof Date ? value.toISOString() : value;
      })(),
      resolution: "requires_explicit_supersession",
    };
    const key = gridCorrectionKey(manifest.publicationDate, correction.receiptId);
    const write = await store.setJSON(key, receipt, { onlyIfNew: true });
    const authoritative = write?.modified === false
      ? await store.get(key, { type: "json", consistency: "strong" })
      : receipt;
    if (!authoritative || authoritative.manifestId !== manifest.manifestId) {
      throw requestError("Publication correction history is immutable.", 409);
    }
    receipts.push(authoritative);
  }
  return receipts.sort((left, right) =>
    left.publicationDate.localeCompare(right.publicationDate));
}

function correctionAppliesToManifest(correction, manifest) {
  if (correction.correctionScope === "global_asset") return true;
  if (manifest.actor.id !== correction.actorId) return false;
  if (["actor_vibe", "result_set"].includes(correction.correctionScope)) {
    return manifest.vibe.key === correction.vibeKey;
  }
  return ["actor_identity", "metadata_signal"].includes(correction.correctionScope);
}

export async function readPublicationCorrections(store, date) {
  const listing = await store.list({ prefix: gridCorrectionPrefix(date) });
  const receipts = await Promise.all((listing?.blobs || []).map(blob =>
    typeof blob?.key === "string"
      ? store.get(blob.key, { type: "json", consistency: "strong" })
      : null));
  return receipts.filter(receipt =>
    receipt?.kind === "vibe-atlas-publication-correction"
    && receipt.publicationDate === date);
}

/**
 * The actor index is derived state, not another source of publication truth.
 * Every entry points back to the immutable manifest that supplied its date.
 */
export function isPublicationActorIndex(value) {
  if (!value || typeof value !== "object"
    || value.schemaVersion !== 1
    || value.indexVersion !== PUBLICATION_ACTOR_INDEX_VERSION
    || value.kind !== "vibe-atlas-daily-drop-actor-index"
    || !Number.isInteger(value.manifestCount)
    || value.manifestCount < 0
    || typeof value.manifestKeyHash !== "string"
    || !/^[a-f0-9]{64}$/i.test(value.manifestKeyHash)
    || (value.latestManifestDate !== null && !isPublicationDate(value.latestManifestDate))
    || (value.actorDateThrough !== null && !isPublicationDate(value.actorDateThrough))
    || !value.actors || typeof value.actors !== "object"
    || Array.isArray(value.actors)) return false;
  return Object.entries(value.actors).every(([actorId, entry]) =>
    typeof actorId === "string"
    && actorId.length > 0
    && isPublicationActorIndexEntry(entry));
}

export async function readLatestPublicationDatesByActor(
  store,
  { throughDate = null, actorIds = null } = {},
) {
  const requestedActorIds = actorIds
    ? new Set(actorIds.filter(actorId => typeof actorId === "string"))
    : null;
  let index = null;
  try {
    index = await store.get(publicationActorIndexKey(), {
      type: "json",
      consistency: "strong",
    });
  } catch {
    // A transient index read failure should not make the private inventory
    // claim that no actor has ever been published.
  }

  let stale = !isPublicationActorIndex(index);
  if (!stale) {
    try {
      stale = await publicationActorIndexIsStale(
        store,
        index,
        throughDate,
        requestedActorIds,
      );
    } catch {
      stale = true;
    }
  }
  if (stale) {
    index = await rebuildPublicationActorIndexSafely(store, throughDate);
  }

  return publicationDatesFromIndex(index, throughDate, requestedActorIds);
}

/**
 * Rebuilds the actor index from the immutable manifest keys. This is also
 * exported for an operator/admin repair path without making that path public.
 */
export async function rebuildPublicationActorIndex(
  store,
  { throughDate = null, now = () => new Date().toISOString() } = {},
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existingWithMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(publicationActorIndexKey(), {
        type: "json",
        consistency: "strong",
      })
      : null;
    const existing = existingWithMetadata?.data ?? await store.get(
      publicationActorIndexKey(),
      { type: "json", consistency: "strong" },
    );
    const [publicationScan, indexedManifests] = await Promise.all([
      readPublicationManifestsForIndex(store, throughDate),
      isPublicationActorIndex(existing)
        ? readVerifiedIndexedManifests(store, existing)
        : [],
    ]);
    const index = publicationActorIndexFromManifests(
      [...publicationScan.manifests, ...indexedManifests],
      now(),
      [
        ...publicationScan.coverageKeys,
        ...indexedManifests.map(manifest => gridManifestKey(manifest.publicationDate)),
      ],
      throughDate,
    );
    const write = await store.setJSON(
      publicationActorIndexKey(),
      index,
      existingWithMetadata?.etag
        ? { onlyIfMatch: existingWithMetadata.etag }
        : existing
          ? {}
          : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;
    const authoritative = await store.get(publicationActorIndexKey(), {
      type: "json",
      consistency: "strong",
    });
    if (isPublicationActorIndex(authoritative)) return authoritative;
  }
  throw requestError("The publication actor index could not be rebuilt safely.", 503);
}

async function rebuildPublicationActorIndexSafely(store, throughDate) {
  try {
    return await rebuildPublicationActorIndex(store, { throughDate });
  } catch {
    // The inventory can still be correct for this request when the derived
    // write is unavailable. The next request will retry the rebuild.
    try {
      const scan = await readPublicationManifestsForIndex(store, throughDate);
      return publicationActorIndexFromManifests(
        scan.manifests,
        new Date().toISOString(),
        scan.coverageKeys,
        throughDate,
      );
    } catch {
      // Missing history is safer than presenting an unverified date.
      return emptyPublicationActorIndex(new Date().toISOString());
    }
  }
}

async function updatePublicationActorIndex(store, manifest, now) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existingWithMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(publicationActorIndexKey(), {
        type: "json",
        consistency: "strong",
      })
      : null;
    let existing = existingWithMetadata?.data;
    if (existing === undefined) {
      existing = await store.get(publicationActorIndexKey(), {
        type: "json",
        consistency: "strong",
      });
    }
    const validExisting = isPublicationActorIndex(existing)
      && existing.actorDateThrough === null;
    if (validExisting && publicationActorIndexCoversManifest(existing, manifest)) {
      return existing;
    }
    let next;
    if (validExisting) {
      next = mergePublicationActorIndex(existing, manifest, asTimestamp(now()));
    } else {
      const scan = typeof store.list === "function"
        ? await readPublicationManifestsForIndex(store, null)
        : { manifests: [manifest], coverageKeys: [gridManifestKey(manifest.publicationDate)] };
      next = mergePublicationActorIndex(
        publicationActorIndexFromManifests(
          scan.manifests,
          now(),
          scan.coverageKeys,
        ),
        manifest,
        asTimestamp(now()),
      );
    }
    if (JSON.stringify(next) === JSON.stringify(existing)) return existing;
    const write = await store.setJSON(
      publicationActorIndexKey(),
      next,
      existingWithMetadata?.etag
        ? { onlyIfMatch: existingWithMetadata.etag }
        : existing
          ? {}
          : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;

    const authoritative = await store.get(publicationActorIndexKey(), {
      type: "json",
      consistency: "strong",
    });
    if (isPublicationActorIndex(authoritative)
      && publicationActorIndexEntryMatchesManifest(authoritative, manifest)) {
      return authoritative;
    }
  }
  throw requestError("The publication actor index could not be updated safely.", 503);
}

async function publicationActorIndexIsStale(store, index, throughDate, actorIds) {
  if (throughDate && !isPublicationDate(throughDate)) return true;
  const manifestKeys = await readPublicationManifestKeys(store);
  const coverage = publicationManifestCoverage(manifestKeys);
  if (coverage.manifestCount !== index.manifestCount
    || coverage.manifestKeyHash !== index.manifestKeyHash) return true;
  const needsCutoff = Boolean(
    throughDate
    && coverage.latestManifestDate
    && coverage.latestManifestDate > throughDate,
  );
  if (needsCutoff && index.actorDateThrough !== throughDate) return true;
  if (!needsCutoff && index.actorDateThrough !== null) return true;
  const entries = Object.entries(index.actors)
    .filter(([actorId]) => !actorIds || actorIds.has(actorId));
  if (typeof store.get !== "function") return false;
  const checks = await Promise.all(entries.map(async ([actorId, entry]) => {
    if (throughDate && entry.latestPublicationDate > throughDate) return false;
    const manifest = await store.get(gridManifestKey(entry.latestPublicationDate), {
      type: "json",
      consistency: "strong",
    });
    return publicationActorIndexEntryMatchesManifest(
      { actors: { [actorId]: entry } },
      manifest,
    );
  }));
  return checks.some(isCurrent => !isCurrent);
}

function publicationActorIndexEntryMatchesManifest(index, manifest) {
  const actorId = manifest?.actor?.id;
  const entry = typeof actorId === "string" ? index.actors?.[actorId] : null;
  if (!entry || !isIndexablePublicationManifest(manifest)
    || entry.latestPublicationDate !== manifest.publicationDate) return false;
  if (entry.manifestId && entry.manifestId !== manifest.manifestId) return false;
  if (entry.boardHash && entry.boardHash !== manifest.boardHash) return false;
  return true;
}

function publicationActorIndexCoversManifest(index, manifest) {
  const entry = index.actors?.[manifest?.actor?.id];
  if (!entry) return false;
  if (entry.latestPublicationDate > manifest.publicationDate) return true;
  return publicationActorIndexEntryMatchesManifest(index, manifest);
}

function publicationDatesFromIndex(index, throughDate, actorIds) {
  return new Map(Object.entries(index.actors)
    .filter(([actorId, entry]) =>
      (!actorIds || actorIds.has(actorId))
      && (!throughDate || entry.latestPublicationDate <= throughDate))
    .map(([actorId, entry]) => [actorId, entry.latestPublicationDate]));
}

async function readPublicationManifestsForIndex(store, throughDate) {
  const listedKeys = await readPublicationManifestKeys(store);
  const recentKeys = throughDate && isPublicationDate(throughDate)
    ? Array.from({ length: 30 }, (_, offset) =>
      gridManifestKey(calendarDateOffset(throughDate, -offset)))
    : [];
  const keys = [...new Set([...listedKeys, ...recentKeys])];
  const manifests = await Promise.all(keys.map(key => store.get(key, {
    type: "json",
    consistency: "strong",
  })));
  return {
    manifests: manifests.filter(isGridManifest),
    coverageKeys: listedKeys,
  };
}

async function readPublicationManifestKeys(store) {
  const listing = await store.list({ prefix: GRID_MANIFEST_PREFIX });
  return (listing?.blobs || [])
    .map(blob => blob?.key)
    .filter(key => typeof key === "string")
    .filter(key => isPublicationDate(key.slice(GRID_MANIFEST_PREFIX.length)));
}

async function readVerifiedIndexedManifests(store, index) {
  const manifests = await Promise.all(Object.values(index.actors).map(entry =>
    store.get(gridManifestKey(entry.latestPublicationDate), {
      type: "json",
      consistency: "strong",
    })));
  return manifests.filter(manifest =>
    isGridManifest(manifest)
    && publicationActorIndexEntryMatchesManifest(index, manifest));
}

function publicationActorIndexFromManifests(
  manifests,
  generatedAt,
  coverageKeys = manifests.map(manifest => gridManifestKey(manifest.publicationDate)),
  throughDate = null,
) {
  const actors = {};
  const coverage = publicationManifestCoverage(coverageKeys);
  const actorDateThrough = throughDate
    && coverage.latestManifestDate
    && coverage.latestManifestDate > throughDate
    ? throughDate
    : null;
  for (const manifest of manifests.filter(item =>
    !actorDateThrough || item.publicationDate <= actorDateThrough)) {
    const actorId = manifest.actor.id;
    const current = actors[actorId];
    if (!current || manifest.publicationDate > current.latestPublicationDate) {
      actors[actorId] = publicationActorIndexEntry(manifest);
    }
  }
  return {
    schemaVersion: 1,
    indexVersion: PUBLICATION_ACTOR_INDEX_VERSION,
    kind: "vibe-atlas-daily-drop-actor-index",
    generatedAt: asTimestamp(generatedAt),
    ...coverage,
    actorDateThrough,
    actors,
  };
}

function emptyPublicationActorIndex(generatedAt) {
  return publicationActorIndexFromManifests([], generatedAt);
}

function mergePublicationActorIndex(index, manifest, generatedAt) {
  const current = index.actors[manifest.actor.id];
  const addsManifest = !current || current.latestPublicationDate !== manifest.publicationDate;
  const next = {
    ...index,
    generatedAt,
    ...(addsManifest ? addPublicationManifestCoverage(index, manifest.publicationDate) : {}),
    actors: { ...index.actors },
  };
  if (!current || manifest.publicationDate > current.latestPublicationDate) {
    next.actors[manifest.actor.id] = publicationActorIndexEntry(manifest);
  }
  return next;
}

function publicationManifestCoverage(keys) {
  const uniqueKeys = [...new Set(keys)].sort();
  let hash = Buffer.alloc(32);
  for (const key of uniqueKeys) {
    hash = xorHashes(hash, createHash("sha256").update(key).digest());
  }
  return {
    manifestCount: uniqueKeys.length,
    manifestKeyHash: hash.toString("hex"),
    latestManifestDate: uniqueKeys.length
      ? uniqueKeys[uniqueKeys.length - 1].slice(GRID_MANIFEST_PREFIX.length)
      : null,
  };
}

function addPublicationManifestCoverage(index, publicationDate) {
  const current = Buffer.from(index.manifestKeyHash, "hex");
  const added = createHash("sha256").update(gridManifestKey(publicationDate)).digest();
  return {
    manifestCount: index.manifestCount + 1,
    manifestKeyHash: xorHashes(current, added).toString("hex"),
  };
}

function xorHashes(left, right) {
  return Buffer.from(left.map((byte, index) => byte ^ right[index]));
}

function publicationActorIndexEntry(manifest) {
  return {
    latestPublicationDate: manifest.publicationDate,
    manifestId: typeof manifest.manifestId === "string" ? manifest.manifestId : null,
    boardHash: typeof manifest.boardHash === "string" ? manifest.boardHash : null,
  };
}

function isPublicationActorIndexEntry(entry) {
  return Boolean(
    entry
    && isPublicationDate(entry.latestPublicationDate)
    && (entry.manifestId === null || typeof entry.manifestId === "string")
    && (entry.boardHash === null || typeof entry.boardHash === "string"),
  );
}

function isIndexablePublicationManifest(manifest) {
  return isGridManifest(manifest);
}

function isPublicationDate(value) {
  return typeof value === "string" && DATE_RE.test(value);
}

function asTimestamp(value) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return new Date().toISOString();
}

function calendarDateOffset(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isPublicationManifestCatalog(value) {
  return value?.schemaVersion === 1
    && value.catalogVersion === GRID_MANIFEST_VERSION
    && value.kind === "vibe-atlas-publication-manifest-catalog"
    && Array.isArray(value.dates)
    && value.dates.every(isPublicationDate);
}

async function ensurePublicationManifestCatalogDate(store, date, now) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentWithMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(publicationManifestCatalogKey(), {
        type: "json",
        consistency: "strong",
      })
      : null;
    const current = currentWithMetadata?.data || await store.get(
      publicationManifestCatalogKey(),
      { type: "json", consistency: "strong" },
    );
    if (isPublicationManifestCatalog(current) && current.dates.includes(date)) return current;
    if (current && !isPublicationManifestCatalog(current)) {
      throw requestError("The publication manifest catalog is invalid.", 503);
    }
    const next = {
      schemaVersion: 1,
      catalogVersion: GRID_MANIFEST_VERSION,
      kind: "vibe-atlas-publication-manifest-catalog",
      dates: [...new Set([...(current?.dates || []), date])].sort(),
      updatedAt: asTimestamp(now()),
    };
    const write = await store.setJSON(
      publicationManifestCatalogKey(),
      next,
      currentWithMetadata?.etag
        ? { onlyIfMatch: currentWithMetadata.etag }
        : current ? {} : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;
    const authoritative = await store.get(publicationManifestCatalogKey(), {
      type: "json",
      consistency: "strong",
    });
    if (isPublicationManifestCatalog(authoritative)
      && authoritative.dates.includes(date)) return authoritative;
  }
  throw requestError("The publication manifest catalog could not be updated safely.", 503);
}

export async function acquireCorrectionPublicationLock(store, now = () => new Date()) {
  const waitDeadline = Date.now() + CORRECTION_PUBLICATION_LOCK_WAIT_MS;
  while (Date.now() < waitDeadline) {
    const stampValue = now();
    const stamp = stampValue instanceof Date ? stampValue.toISOString() : String(stampValue);
    const startedAt = Date.parse(stamp);
    const token = randomUUID();
    const currentWithMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(CORRECTION_PUBLICATION_LOCK_KEY, {
        type: "json",
        consistency: "strong",
      })
      : null;
    const current = currentWithMetadata?.data || await store.get(
      CORRECTION_PUBLICATION_LOCK_KEY,
      { type: "json", consistency: "strong" },
    );
    if (
      current?.state !== "released"
      && current?.startedAt
      && startedAt - Date.parse(current.startedAt) <= CORRECTION_PUBLICATION_LOCK_TTL_MS
    ) {
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }
    if (current && !currentWithMetadata?.etag) {
      throw requestError("A stale correction/publication lock requires reconciliation.", 503);
    }
    const write = await store.setJSON(CORRECTION_PUBLICATION_LOCK_KEY, {
      schemaVersion: 1,
      token,
      startedAt: stamp,
    }, currentWithMetadata?.etag
      ? { onlyIfMatch: currentWithMetadata.etag }
      : { onlyIfNew: true });
    if (write?.modified === false) {
      await new Promise(resolve => setTimeout(resolve, 50));
      continue;
    }
    const authoritative = await store.get(CORRECTION_PUBLICATION_LOCK_KEY, {
      type: "json",
      consistency: "strong",
    });
    if (authoritative?.token === token) return { token };
  }
  throw requestError("Misprint correction or publication is already in progress. Retry shortly.", 503);
}

export async function releaseCorrectionPublicationLock(store, lock) {
  if (!store || !lock) return;
  try {
    if (typeof store.getWithMetadata === "function") {
      const current = await store.getWithMetadata(CORRECTION_PUBLICATION_LOCK_KEY, {
        type: "json",
        consistency: "strong",
      });
      if (current?.data?.token === lock.token && current.etag) {
        await store.setJSON(CORRECTION_PUBLICATION_LOCK_KEY, {
          ...current.data,
          state: "released",
          releasedAt: new Date().toISOString(),
        }, { onlyIfMatch: current.etag });
      }
      return;
    }
    const current = await store.get(CORRECTION_PUBLICATION_LOCK_KEY, {
      type: "json",
      consistency: "strong",
    });
    if (current?.token === lock.token && typeof store.delete === "function") {
      await store.delete(CORRECTION_PUBLICATION_LOCK_KEY);
    }
  } catch {
    // The bounded lease expires even if best-effort release fails.
  }
}

async function updatePublicationActorIndexSafely(store, manifest, now) {
  try {
    await updatePublicationActorIndex(store, manifest, now);
  } catch {
    // The immutable manifest is authoritative. A derived-index outage must not
    // change scheduler selection or the public Daily Drop response.
  }
}

export async function materializePublicationManifest(input) {
  const ownedLock = input.publicationCorrectionLock
    ? null
    : await acquireCorrectionPublicationLock(input.store, input.now);
  try {
    if (typeof input.validateBeforeCommit === "function") {
      await input.validateBeforeCommit();
    }
    return await materializePublicationManifestUnlocked(input);
  } finally {
    if (ownedLock) await releaseCorrectionPublicationLock(input.store, ownedLock);
  }
}

async function materializePublicationManifestUnlocked({
  store,
  date,
  actor,
  vibe,
  board,
  provenance = {},
  env = process.env,
  fetchImpl = fetch,
  resolveHost = lookup,
  now = () => new Date().toISOString(),
}) {
  validatePublicationInput(date, actor, vibe, board);
  await ensurePublicationManifestCatalogDate(store, date, now);
  const boardHashValue = boardHash(board);
  const manifestKey = gridManifestKey(date);
  const existingManifest = await store.get(manifestKey, {
    type: "json",
    consistency: "strong",
  });
  if (existingManifest) {
    if (!isGridManifest(existingManifest) || existingManifest.boardHash !== boardHashValue) {
      throw requestError("That publication date already contains a different immutable board.", 409);
    }
    await updatePublicationActorIndexSafely(store, existingManifest, now);
    return { manifest: existingManifest, payload: manifestPayload(existingManifest) };
  }
  const lock = await acquirePublicationLock(store, date, boardHashValue, now);
  try {
  const racedManifest = await store.get(manifestKey, {
    type: "json",
    consistency: "strong",
  });
  if (racedManifest) {
    if (!isGridManifest(racedManifest) || racedManifest.boardHash !== boardHashValue) {
      throw requestError("That publication date already contains a different immutable board.", 409);
    }
    await updatePublicationActorIndexSafely(store, racedManifest, now);
    return { manifest: racedManifest, payload: manifestPayload(racedManifest) };
  }

  const pendingKey = gridPendingKey(date);
  const existingPending = await store.get(pendingKey, {
    type: "json",
    consistency: "strong",
  });
  if (existingPending?.boardHash && existingPending.boardHash !== boardHashValue) {
    throw requestError("A different board is already being reconciled for that publication date.", 409);
  }

  const associationId = `vibe-atlas:daily-drop:${date}`;
  const assets = Array.isArray(existingPending?.assets)
    ? existingPending.assets.filter(asset => (
      Number.isInteger(asset?.position)
      && asset.position >= 0
      && asset.position < REQUIRED_CARD_COUNT
      && isValidPublicationAsset(asset, asset.position, associationId)
    ))
    : [];
  const cards = Array(REQUIRED_CARD_COUNT).fill(null);
  for (const asset of assets) {
    const candidate = board.candidates[asset.position];
    if (asset.candidateId === candidate.candidateId && asset.sourceUrl === candidate.thumbnail) {
      cards[asset.position] = asset;
    }
  }
  const missingPositions = cards
    .map((card, position) => card ? null : position)
    .filter(position => position !== null);
  await writePending(store, pendingKey, {
    schemaVersion: 1,
    state: "pending",
    date,
    boardHash: boardHashValue,
    assets: cards.filter(Boolean),
    intents: missingPositions.map(position => ({
      position,
      candidateId: board.candidates[position].candidateId,
      idempotencyKey: publicationAssetIdempotencyKey(date, boardHashValue, position),
    })),
    updatedAt: now(),
  });
  const attempts = await Promise.allSettled(missingPositions.map(position =>
    materializePublicationAsset({
      position,
      candidate: board.candidates[position],
      associationId,
      date,
      boardHashValue,
      actor,
      vibe,
      provenance,
      env,
      fetchImpl,
      resolveHost,
    })));
  attempts.forEach((attempt, index) => {
    if (attempt.status === "fulfilled") cards[missingPositions[index]] = attempt.value;
  });
  const firstFailureIndex = attempts.findIndex(attempt => attempt.status === "rejected");
  if (firstFailureIndex !== -1) {
    const failedPosition = missingPositions[firstFailureIndex];
    const failure = attempts[firstFailureIndex].reason;
    await writePending(store, pendingKey, {
      schemaVersion: 1,
      state: "pending",
      date,
      boardHash: boardHashValue,
      assets: cards.filter(Boolean),
      failedPosition,
      failure: failure instanceof Error ? failure.message : "MEDIA registration failed.",
      updatedAt: now(),
    });
    throw failure;
  }

  if (cards.length !== REQUIRED_CARD_COUNT
    || cards.some((card, position) => !isValidPublicationAsset(card, position, associationId))) {
    throw requestError("The publication board did not produce nine verified MEDIA assets.", 502);
  }

  const manifest = {
    schemaVersion: 1,
    manifestVersion: GRID_MANIFEST_VERSION,
    manifestId: `vibe-atlas-${date}-${boardHashValue.slice(0, 24)}`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: now(),
    boardHash: boardHashValue,
    actor,
    vibe,
    heroPosition: 4,
    cardCount: REQUIRED_CARD_COUNT,
    retention: {
      policy: "permanent",
      deleteWithCollection: false,
    },
    provenance: {
      ...provenance,
      sourceCandidateIds: cards.map(card => card.candidateId),
    },
    cards,
  };
  await store.setJSON(manifestKey, manifest, { onlyIfNew: true });
  const authoritative = await store.get(manifestKey, { type: "json", consistency: "strong" });
  if (!isGridManifest(authoritative) || authoritative.boardHash !== boardHashValue) {
    throw requestError("Another board won this publication date.", 409);
  }
  await updatePublicationActorIndexSafely(store, authoritative, now);
  try {
    await store.delete(pendingKey);
  } catch {
    // The manifest is authoritative; a stale pending receipt is harmless and
    // remains available for reconciliation diagnostics.
  }
  return { manifest: authoritative, payload: manifestPayload(authoritative) };
  } finally {
    await releasePublicationLock(store, date, lock);
  }
}

export function manifestPayload(manifest, version = "v10") {
  if (!isGridManifest(manifest)) return null;
  const displayResults = manifest.cards.map(card => ({
    title: card.title,
    thumbnail: card.media.thumbnailUrl,
    link: card.link,
    source: card.source,
    media: card.media,
    ...(card.query ? { query: card.query } : {}),
    ...(card.batchKey ? { batchKey: card.batchKey } : {}),
    ...(card.familyId ? { familyId: card.familyId } : {}),
    ...(card.familyLabel ? { familyLabel: card.familyLabel } : {}),
    ...(card.familyEvidence ? { familyEvidence: card.familyEvidence } : {}),
  }));
  return {
    version,
    date: manifest.publicationDate,
    actorId: manifest.actor.id,
    actorIdx: null,
    actorName: manifest.actor.name,
    actorShortNameEn: manifest.actor.nameEn,
    actorAccentColor: manifest.actor.accentColor,
    vibeIdx: manifest.vibe.idx,
    vibeEmoji: manifest.vibe.emoji,
    vibeLabel: manifest.vibe.label,
    vibeLabelEn: manifest.vibe.labelEn,
    vibeSubtitle: manifest.vibe.subtitle,
    vibeSubtitleEn: manifest.vibe.subtitleEn,
    vibeSupportingCopy: manifest.vibe.supportingCopy,
    vibeSupportingCopyEn: manifest.vibe.supportingCopyEn,
    generationPrompt: manifest.vibe.generationPrompt,
    rankedBatches: [{
      query: "verified-publication-manifest",
      results: displayResults,
      count: displayResults.length,
      distinctSources: new Set(displayResults.map(candidate => candidate.source).filter(Boolean)).size,
      provider: null,
    }],
    displayResults,
    generatedAt: manifest.publishedAt,
  };
}

export function boardHash(board) {
  return createHash("sha256").update(JSON.stringify(
    board.candidates.map(candidate => ({
      candidateId: candidate.candidateId,
      thumbnail: candidate.thumbnail || "",
      title: candidate.title || "",
      source: candidate.source || "",
      link: candidate.link || "",
      query: candidate.query || "",
      batchKey: candidate.batchKey || "",
      imageDigest: candidate.imageDigest || null,
    })),
  )).digest("hex");
}

async function materializePublicationAsset({
  position,
  candidate,
  associationId,
  date,
  boardHashValue,
  actor,
  vibe,
  provenance,
  env,
  fetchImpl,
  resolveHost,
}) {
  const image = await fetchPublicationImage(candidate.thumbnail, fetchImpl, resolveHost);
  const media = await registerMediaBytes({
    bytes: image.bytes,
    contentType: image.contentType,
    association: {
      type: "publication",
      id: associationId,
      itemId: `card-${position}`,
    },
    filename: `vibe-atlas-${date}-${position + 1}`,
    idempotencyKey: publicationAssetIdempotencyKey(date, boardHashValue, position),
    metadata: {
      sourceType: "fandom-vibe-atlas-daily-drop",
      seriesTags: [
        "Fandom",
        "Vibe Atlas",
        "Daily Drop",
        `date:${date}`,
        `actor:${actor.id}`,
        `vibe:${vibe.key}`,
      ],
      linkedPostIdentifiers: [
        `fandom/vibe-atlas/daily-drop/${date}`,
        `fandom/vibe-atlas/daily-drop/${date}/card/${position}`,
      ],
      provenance: {
        date,
        actorId: actor.id,
        vibeKey: vibe.key,
        candidateId: candidate.candidateId,
        sourceUrl: candidate.thumbnail,
        ...provenance,
      },
    },
    env,
    fetchImpl,
  });
  return publicationAsset(position, candidate, media);
}

function publicationAssetIdempotencyKey(date, boardHashValue, position) {
  return `fandom-vibe-atlas:${date}:${boardHashValue}:card-${position}`;
}

export function isGridManifest(value) {
  if (!value || typeof value !== "object"
    || value.schemaVersion !== 1
    || value.manifestVersion !== GRID_MANIFEST_VERSION
    || value.kind !== "vibe-atlas-daily-drop"
    || !DATE_RE.test(value.publicationDate)
    || typeof value.manifestId !== "string"
    || typeof value.idempotencyKey !== "string"
    || typeof value.boardHash !== "string"
    || !/^[a-f0-9]{64}$/i.test(value.boardHash)
    || !value.actor || typeof value.actor.id !== "string"
    || typeof value.actor.name !== "string"
    || typeof value.actor.nameEn !== "string"
    || typeof value.actor.accentColor !== "string"
    || !value.vibe || typeof value.vibe.key !== "string"
    || !Number.isInteger(value.vibe.idx)
    || typeof value.vibe.label !== "string"
    || typeof value.vibe.labelEn !== "string"
    || !Number.isInteger(value.heroPosition)
    || value.heroPosition !== 4
    || value.cardCount !== REQUIRED_CARD_COUNT
    || value.retention?.policy !== "permanent"
    || value.retention?.deleteWithCollection !== false
    || !Array.isArray(value.cards)
    || value.cards.length !== REQUIRED_CARD_COUNT
    || !Array.isArray(value.provenance?.sourceCandidateIds)
    || value.provenance.sourceCandidateIds.length !== REQUIRED_CARD_COUNT
    || value.provenance.sourceCandidateIds.some((candidateId, position) =>
      candidateId !== value.cards[position]?.candidateId)) return false;
  return value.cards.every((card, position) => isValidPublicationAsset(
    card,
    position,
    `vibe-atlas:daily-drop:${value.publicationDate}`,
  ));
}

function validatePublicationInput(date, actor, vibe, board) {
  if (!DATE_RE.test(date)) throw requestError("Publication date must be YYYY-MM-DD.", 400);
  if (!actor?.id || !actor?.name || !actor?.nameEn || !actor?.accentColor) {
    throw requestError("Publication actor identity is incomplete.", 400);
  }
  if (!vibe?.key || !Number.isInteger(vibe.idx) || !vibe.label || !vibe.labelEn) {
    throw requestError("Publication Vibe Pack identity is incomplete.", 400);
  }
  if (!board || !Array.isArray(board.candidates)
    || board.candidates.length !== REQUIRED_CARD_COUNT
    || board.candidates.some(candidate => (
      !candidate
      || typeof candidate.candidateId !== "string"
      || !candidate.candidateId
      || !isSafeHttpsSourceUrl(candidate.thumbnail)
    ))
    || new Set(board.candidates.map(candidate => candidate.candidateId)).size !== REQUIRED_CARD_COUNT) {
    throw requestError("Publication requires nine distinct HTTPS image candidates.", 409);
  }
}

function publicationAsset(position, candidate, media) {
  return {
    position,
    candidateId: candidate.candidateId,
    title: candidate.title || "",
    source: candidate.source || "",
    link: candidate.link || "",
    sourceUrl: candidate.thumbnail,
    ...(candidate.query ? { query: candidate.query } : {}),
    ...(candidate.batchKey ? { batchKey: candidate.batchKey } : {}),
    ...(candidate.familyId ? { familyId: candidate.familyId } : {}),
    ...(candidate.familyLabel ? { familyLabel: candidate.familyLabel } : {}),
    ...(candidate.familyEvidence ? { familyEvidence: candidate.familyEvidence } : {}),
    media,
  };
}

function isValidPublicationAsset(asset, position, associationId) {
  return Boolean(
    asset
    && asset.position === position
    && typeof asset.candidateId === "string"
    && typeof asset.sourceUrl === "string"
    && isSafeHttpsSourceUrl(asset.sourceUrl)
    && isValidMediaReference(asset.media, {
      type: "publication",
      id: associationId,
      itemId: `card-${position}`,
    }),
  );
}

async function fetchPublicationImage(sourceUrl, fetchImpl, resolveHost) {
  let currentUrl = sourceUrl;
  let response;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    const validated = await assertPublicHttpsUrl(currentUrl, resolveHost);
    response = fetchImpl === fetch
      ? await pinnedHttpsFetch(currentUrl, validated)
      : await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location || redirectCount === 3) {
      throw requestError("The approved source image redirected unsafely.", 502);
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  if (!response.ok) throw requestError("The approved source image could not be reached.", 502);
  const contentType = (response.headers.get("content-type") || "")
    .toLowerCase().split(";")[0].trim();
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw requestError("The approved source did not return a supported image.", 502);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1 || bytes.byteLength > 8 * 1024 * 1024) {
    throw requestError("The approved source image is empty or larger than 8 MB.", 502);
  }
  return { bytes, contentType };
}

function isSafeHttpsSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function assertPublicHttpsUrl(value, resolveHost) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw requestError("The approved source image URL is invalid.", 409);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw requestError("The approved source image must use public HTTPS.", 409);
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw requestError("The approved source image host is not public.", 409);
  }
  const literal = isIP(hostname);
  const addresses = literal
    ? [{ address: hostname }]
    : await resolveHost(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || addresses.length === 0
    || addresses.some(entry => isPrivateOrReservedIp(entry.address))) {
    throw requestError("The approved source image host is not public.", 409);
  }
  return {
    address: addresses[0].address,
    family: isIP(addresses[0].address),
  };
}

function pinnedHttpsFetch(url, resolved) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, {
      headers: { Accept: "image/png,image/jpeg,image/webp" },
      lookup: (_hostname, _options, callback) =>
        callback(null, resolved.address, resolved.family),
    }, response => {
      const chunks = [];
      let size = 0;
      response.on("data", chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) {
          request.destroy(requestError("The approved source image is larger than 8 MB.", 502));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: {
            get(name) {
              const value = response.headers[name.toLowerCase()];
              return Array.isArray(value) ? value[0] : value || null;
            },
          },
          arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        });
      });
    });
    request.setTimeout(30_000, () =>
      request.destroy(requestError("The approved source image timed out.", 502)));
    request.on("error", reject);
  });
}

function isPrivateOrReservedIp(address) {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 192 && b === 0 && parts[2] === 2)
      || (a === 198 && (b === 18 || b === 19))
      || (a === 198 && b === 51 && parts[2] === 100)
      || (a === 203 && b === 0 && parts[2] === 113)
      || a >= 224;
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      return isPrivateOrReservedIp(normalized.slice("::ffff:".length));
    }
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized)
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:");
  }
  return true;
}

async function acquirePublicationLock(store, date, boardHashValue, now) {
  const key = `${PUBLICATION_LOCK_PREFIX}${date}`;
  const stamp = now();
  const startedAt = Date.parse(stamp);
  const token = randomUUID();
  const existingWithMetadata = typeof store.getWithMetadata === "function"
    ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
    : null;
  const existing = existingWithMetadata?.data || await store.get(key, {
    type: "json",
    consistency: "strong",
  });
  if (existing?.state !== "released" && existing?.startedAt
    && startedAt - Date.parse(existing.startedAt) <= PUBLICATION_LOCK_TTL_MS) {
    throw requestError("That publication date is already being materialized. Retry shortly.", 503);
  }
  if (existing && !existingWithMetadata?.etag) {
    throw requestError("A stale publication lock requires reconciliation before retrying.", 503);
  }
  await store.setJSON(key, {
    schemaVersion: 1,
    token,
    date,
    boardHash: boardHashValue,
    startedAt: stamp,
  }, existingWithMetadata?.etag
    ? { onlyIfMatch: existingWithMetadata.etag }
    : { onlyIfNew: true });
  const authoritative = await store.get(key, { type: "json", consistency: "strong" });
  if (authoritative?.token !== token) {
    throw requestError("That publication date is already being materialized. Retry shortly.", 503);
  }
  return { key, token };
}

async function releasePublicationLock(store, date, lock) {
  if (!lock) return;
  try {
    if (typeof store.getWithMetadata === "function") {
      const current = await store.getWithMetadata(lock.key, {
        type: "json",
        consistency: "strong",
      });
      if (current?.data?.token === lock.token && current.etag) {
        await store.setJSON(lock.key, {
          ...current.data,
          state: "released",
          releasedAt: new Date().toISOString(),
        }, { onlyIfMatch: current.etag });
      }
      return;
    }
    const current = await store.get(lock.key || `${PUBLICATION_LOCK_PREFIX}${date}`, {
      type: "json",
      consistency: "strong",
    });
    if (current?.token === lock.token) await store.delete(lock.key);
  } catch {
    // An abandoned lock expires and is reclaimed with a compare-and-swap.
  }
}

async function writePending(store, key, value) {
  await store.setJSON(key, value);
}