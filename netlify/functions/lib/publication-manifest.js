import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { get as httpsGet } from "node:https";
import { isIP } from "node:net";
import {
  isValidMediaReference,
  registerMediaBytes,
  requestError,
} from "./media-asset.js";
import {
  ensureArchiveAccessWindow,
} from "./archive-access.js";
import { getWithResolvedEtag } from "./blob-store.js";
import {
  hasHistoricalPublicationApproval,
  matchesHistoricalPublicationApproval,
} from "./historical-publication-approvals.js";
import {
  assertPublicArchiveRecord,
  publicArchiveRecordDiagnostic,
} from "../../../src/contracts/publicArchiveRecord.js";

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
export const PUBLICATION_RELEASE_DATES_KEY =
  `vibeAtlas:grid-release-dates:${GRID_MANIFEST_VERSION}:all`;

export const PUBLICATION_RELEASE_RECEIPT_PREFIX =
  `vibeAtlas:grid-release-receipt:${GRID_MANIFEST_VERSION}:`;
export const PUBLICATION_ACTOR_INDEX_REPAIR_KEY =
  `vibeAtlas:grid-manifest-actor-index-repair:${PUBLICATION_ACTOR_INDEX_VERSION}:latest`;

export const PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_PREFIX =
  `vibeAtlas:grid-manifest-actor-index-repair-recovery:${PUBLICATION_ACTOR_INDEX_VERSION}:`;
export const PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_CATALOG_KEY =
  `vibeAtlas:grid-manifest-actor-index-repair-recovery-catalog:${PUBLICATION_ACTOR_INDEX_VERSION}:latest`;
const PUBLICATION_ACTOR_INDEX_REPAIR_WINDOW_MS = 24 * 60 * 60 * 1000;
const PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_HISTORY_LIMIT = 100;
const REQUIRED_CARD_COUNT = 9;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PUBLICATION_LOCK_TTL_MS = 10 * 60 * 1000;
const PUBLICATION_LOCK_PREFIX = `vibeAtlas:grid-lock:${GRID_MANIFEST_VERSION}:`;
const CORRECTION_PUBLICATION_LOCK_KEY = "locks/misprint-publication";
const CORRECTION_PUBLICATION_LOCK_TTL_MS = 10 * 60 * 1000;
const CORRECTION_PUBLICATION_LOCK_WAIT_MS = 30 * 1000;
const STALE_PENDING_CATALOG_REPAIR_MS = 60 * 60 * 1000;

export const gridManifestKey = date => `${GRID_MANIFEST_PREFIX}${date}`;
export const gridPendingKey = date => `${GRID_PENDING_PREFIX}${date}`;
export const gridCorrectionPrefix = date =>
  `${GRID_CORRECTION_PREFIX}${encodeURIComponent(date)}/`;
export const gridCorrectionKey = (date, correctionReceiptId) =>
  `${gridCorrectionPrefix(date)}${encodeURIComponent(correctionReceiptId)}`;
export const publicationActorIndexKey = () => PUBLICATION_ACTOR_INDEX_KEY;
export const publicationActorIndexRepairKey = () => PUBLICATION_ACTOR_INDEX_REPAIR_KEY;

export const publicationActorIndexRepairRecoveryKey = receiptId =>
  `${PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_PREFIX}${encodeURIComponent(receiptId)}`;
export const publicationActorIndexRepairRecoveryCatalogKey = () =>
  PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_CATALOG_KEY;
export const publicationManifestCatalogKey = () => PUBLICATION_MANIFEST_CATALOG_KEY;

function isPublicationReleaseDates(value) {
  return value?.schemaVersion === 1
    && value?.kind === "vibe-atlas-released-dates"
    && typeof value.verifiedBaseline === "boolean"
    && Array.isArray(value.dates)
    && value.dates.every(isPublicationDate)
    && value.dates.every((date, index) => index === 0 || value.dates[index - 1] < date);
}

function isPublicationReleaseReceipt(value, date) {
  return value?.schemaVersion === 1
    && value?.kind === "vibe-atlas-release-receipt"
    && value.date === date;
}
export async function ensurePublicationReleaseDates(store, dates, { publicationDate } = {}) {
  if (publicationDate && (!isPublicationDate(publicationDate)
    || !dates.includes(publicationDate))) {
    throw new Error("The publication receipt date is invalid.");
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = typeof store.getWithMetadata === "function"
      ? await getWithResolvedEtag(store, PUBLICATION_RELEASE_DATES_KEY, { type: "json" })
      : null;
    const current = entry?.data ?? await store.get(PUBLICATION_RELEASE_DATES_KEY, {
      type: "json", consistency: "strong",
    });
    if (current && !isPublicationReleaseDates(current)) {
      throw new Error("The released-date history is invalid.");
    }
    const nextDates = [...new Set([...(current?.dates || []), ...dates])].sort();
    if (!nextDates.every(isPublicationDate)) throw new Error("The released-date history has an invalid date.");
    if (current && nextDates.length === current.dates.length) {
      if (publicationDate) await ensurePublicationReleaseReceipts(store, [publicationDate]);
      return current;
    }
    if (current && !entry?.etag) {
      throw new Error("The released-date history cannot be updated without a revision tag.");
    }
    const next = {
      schemaVersion: 1,
      kind: "vibe-atlas-released-dates",
      verifiedBaseline: current?.verifiedBaseline === true,
      dates: nextDates,
    };
    const write = await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, next,
      entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (write?.modified === false) continue;
    const authoritative = await store.get(PUBLICATION_RELEASE_DATES_KEY, {
      type: "json", consistency: "strong",
    });
    if (isPublicationReleaseDates(authoritative)
      && nextDates.every(date => authoritative.dates.includes(date))) {
      // Only the date being published may get a receipt here; bulk catalog
      // dates (including those recovered by repairs) are not release evidence.
      if (publicationDate) await ensurePublicationReleaseReceipts(store, [publicationDate]);
      return authoritative;
    }
  }
  throw new Error("The released-date history could not be updated safely.");
}

export async function readPublicationReleaseDates(store) {
  const history = await store.get(PUBLICATION_RELEASE_DATES_KEY, {
    type: "json", consistency: "strong",
  });
  if (history && !isPublicationReleaseDates(history)) {
    throw new Error("The released-date history is invalid.");
  }
  return history ?? null;
}

export async function verifyPublicationReleaseEvidence(store, history, catalogDates, manifests) {
  if (!history?.verifiedBaseline) return false;
  // The default list consumes every page; paginate: true returns an async iterator.
  const listing = await store.list({ prefix: PUBLICATION_RELEASE_RECEIPT_PREFIX });
  if (!Array.isArray(listing?.blobs)) return false;
  const keys = listing.blobs.map(blob => blob?.key);
  const dates = keys.map(key => key?.startsWith(PUBLICATION_RELEASE_RECEIPT_PREFIX)
    ? key.slice(PUBLICATION_RELEASE_RECEIPT_PREFIX.length) : null);
  if (dates.some(date => !isPublicationDate(date)) || new Set(dates).size !== dates.length) return false;
  const expected = new Set(history.dates);
  if (dates.some(date => !expected.has(date))
    || catalogDates.some(date => !expected.has(date))
    || manifests.some(manifest => !expected.has(manifest.publicationDate))) return false;
  // Exact strong reads cover listing lag for dates still in the ledger.
  const receipts = await Promise.all(history.dates.map(date =>
    store.get(publicationReleaseReceiptKey(date), { type: "json", consistency: "strong" })));
  return receipts.every((receipt, index) => isPublicationReleaseReceipt(receipt, history.dates[index]))
    && catalogDates.length === history.dates.length
    && history.dates.every(date => catalogDates.includes(date));
}

// Run only after the private Archive has been fully enumerated. A public
// catalog alone is not evidence: it may already have lost an older date.
export async function backfillPublicationReleaseDates(store, archiveEditions) {
  if (!Array.isArray(archiveEditions) || archiveEditions.some(
    edition => !isPublicationDate(edition?.date),
  ) || new Set(archiveEditions.map(edition => edition.date)).size !== archiveEditions.length) {
    throw new Error("The Archive release evidence is invalid.");
  }
  const archiveDates = new Set(archiveEditions.map(edition => edition.date));
  const catalog = await store.get(publicationManifestCatalogKey(), {
    type: "json", consistency: "strong",
  });
  if (!isPublicationManifestCatalog(catalog)) {
    throw new Error("The publication catalog cannot be verified.");
  }
  const priorHistory = await readPublicationReleaseDates(store);
  const listed = await readPublicationManifestKeys(store);
  const receiptListing = await store.list({ prefix: PUBLICATION_RELEASE_RECEIPT_PREFIX });
  if (!Array.isArray(receiptListing?.blobs)) {
    throw new Error("The released-date receipts cannot be verified.");
  }
  const receiptDates = receiptListing.blobs.map(blob =>
    blob?.key?.startsWith(PUBLICATION_RELEASE_RECEIPT_PREFIX)
      ? blob.key.slice(PUBLICATION_RELEASE_RECEIPT_PREFIX.length) : null);
  if (receiptDates.some(date => !isPublicationDate(date))
    || new Set(receiptDates).size !== receiptDates.length) {
    throw new Error("The released-date receipts are invalid.");
  }
  const candidateDates = [...new Set([
    ...listed.map(key => key.slice(GRID_MANIFEST_PREFIX.length)),
    ...catalog.dates,
    ...archiveDates,
    ...(priorHistory?.dates || []),
    ...receiptDates,
  ])].sort();
  const verified = [];
  for (const date of candidateDates) {
    const manifest = await store.get(gridManifestKey(date), {
      type: "json", consistency: "strong",
    });
    if (!manifest) {
      // A legacy Archive link may name a page without a publication manifest.
      // Only independent release evidence makes the missing manifest fatal.
      const receipt = await store.get(publicationReleaseReceiptKey(date), {
        type: "json", consistency: "strong",
      });
      if (catalog.dates.includes(date)
        || priorHistory?.dates.includes(date)
        || receipt) {
        throw new Error(`Archive publication evidence is missing for ${date}.`);
      }
      continue; // An older Archive cache entry need not have a publication manifest.
    }
    if (!isGridManifest(manifest) || manifest.publicationDate !== date
      || !archiveDates.has(date)) {
      throw new Error(`Archive publication evidence disagrees for ${date}.`);
    }
    const archived = archiveEditions.find(edition => edition.date === date);
    if (archived.actorName !== manifest.actor.name
      || archived.vibeLabel !== manifest.vibe.label) {
      throw new Error(`Archive publication identity disagrees for ${date}.`);
    }
    if (archived.publicRecord
      && archived.publicRecord.editionPath !== publicEditionPath(manifest)) {
      throw new Error(`Archive publication record disagrees for ${date}.`);
    }
    verified.push(date);
  }
  if (verified.length !== catalog.dates.length
    || verified.some(date => !catalog.dates.includes(date))) {
    throw new Error("The publication catalog is missing verified releases.");
  }
  // Re-read the catalog before writing: concurrent publication or repair
  // invalidates this snapshot. History itself uses a conditional revision.
  const latestCatalog = await store.get(publicationManifestCatalogKey(), {
    type: "json", consistency: "strong",
  });
  if (JSON.stringify(latestCatalog) !== JSON.stringify(catalog)) {
    throw new Error("The publication catalog changed during verification.");
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const entry = await getWithResolvedEtag(store, PUBLICATION_RELEASE_DATES_KEY, {
      type: "json",
    });
    const current = entry?.data ?? null;
    if (current && !isPublicationReleaseDates(current)) {
      throw new Error("The released-date history is invalid.");
    }
    if (current?.dates.some(date => !verified.includes(date))) {
      throw new Error("The released-date history disagrees with the Archive.");
    }
    if (current?.verifiedBaseline && current.dates.length === verified.length) {
      return current;
    }
    if (current && !entry?.etag) {
      throw new Error("The released-date history cannot be updated without a revision tag.");
    }
    const next = {
      schemaVersion: 1,
      kind: "vibe-atlas-released-dates",
      verifiedBaseline: true,
      dates: verified,
    };
    const write = await store.setJSON(PUBLICATION_RELEASE_DATES_KEY, next,
      entry?.etag ? { onlyIfMatch: entry.etag } : { onlyIfNew: true });
    if (write?.modified === false) continue;
    const authoritative = await readPublicationReleaseDates(store);
    if (authoritative?.verifiedBaseline
      && verified.every(date => authoritative.dates.includes(date))) {
      return authoritative;
    }
  }
  throw new Error("The released-date baseline could not be updated safely.");
}

// Called only from the private operator route after the full Archive/manifest
// baseline has been certified. A page is validated in full before any writes.
export async function reconcilePublicationReleaseReceipts(store, archiveEditions) {
  if (!Array.isArray(archiveEditions) || archiveEditions.length > 100
    || archiveEditions.some(edition => !isPublicationDate(edition?.date))
    || new Set(archiveEditions.map(edition => edition.date)).size !== archiveEditions.length) {
    throw new Error("The receipt reconciliation batch is invalid.");
  }
  const history = await readPublicationReleaseDates(store);
  if (!history?.verifiedBaseline) throw new Error("The released-date baseline is not verified.");
  const catalog = await store.get(publicationManifestCatalogKey(), {
    type: "json", consistency: "strong",
  });
  if (!isPublicationManifestCatalog(catalog)
    || catalog.dates.length !== history.dates.length
    || catalog.dates.some(date => !history.dates.includes(date))) {
    throw new Error("The publication catalog disagrees with the verified baseline.");
  }
  const pending = [];
  for (const edition of archiveEditions) {
    if (!history.dates.includes(edition.date)) {
      const receipt = await store.get(publicationReleaseReceiptKey(edition.date), {
        type: "json", consistency: "strong",
      });
      if (receipt) throw new Error(`The released-date baseline omits ${edition.date}.`);
      // Link metadata on an old Archive entry does not prove publication.
      continue;
    }
    const manifest = await store.get(gridManifestKey(edition.date), {
      type: "json", consistency: "strong",
    });
    if (!isGridManifest(manifest) || manifest.publicationDate !== edition.date
      || edition.actorName !== manifest.actor.name
      || edition.vibeLabel !== manifest.vibe.label
      || (edition.publicRecord
        && edition.publicRecord.editionPath !== publicEditionPath(manifest))) {
      throw new Error(`Archive publication evidence disagrees for ${edition.date}.`);
    }
    const receipt = await store.get(publicationReleaseReceiptKey(edition.date), {
      type: "json", consistency: "strong",
    });
    if (receipt && !isPublicationReleaseReceipt(receipt, edition.date)) {
      throw new Error(`The immutable release receipt disagrees for ${edition.date}.`);
    }
    if (!receipt) pending.push(edition.date);
  }
  // Do not attest to a stale baseline or catalog if an operator publishes
  // while the page is being checked.
  const latestHistory = await readPublicationReleaseDates(store);
  const latestCatalog = await store.get(publicationManifestCatalogKey(), {
    type: "json", consistency: "strong",
  });
  if (JSON.stringify(latestHistory) !== JSON.stringify(history)
    || JSON.stringify(latestCatalog) !== JSON.stringify(catalog)) {
    throw new Error("Publication evidence changed during receipt reconciliation.");
  }
  await ensurePublicationReleaseReceipts(store, pending);
  return { checked: archiveEditions.length, written: pending.length };
}

export const PUBLIC_VIBE_ATLAS_ORIGIN = "https://fandom.justlikekatie.com";
export const PUBLIC_ACTOR_PATH = "/vibe-atlas/actors";
export const PUBLIC_EDITION_PATH = "/vibe-atlas/editions";
const MIN_PUBLIC_EDITORIAL_COPY_LENGTH = 40;

const APPROVED_SHORT_COPY_EDITION_DATE = "2026-09-03";
export function publicActorSlug(actor) {
  const source = actor?.nameEn || actor?.name || actor?.id || "";
  return String(source)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "actor";
}

export function publicActorPath(actor) {
  return `${PUBLIC_ACTOR_PATH}/${publicActorSlug(actor)}/`;
}

export function publicEditionPath(manifest) {
  if (!isPublicationDate(manifest?.publicationDate) || !manifest?.actor) return null;
  return `${PUBLIC_EDITION_PATH}/${manifest.publicationDate}/${publicActorSlug(manifest.actor)}/`;
}

function publicCanonical(path) {
  return `${PUBLIC_VIBE_ATLAS_ORIGIN}${path}`;
}

/**
 * A manifest can be immutable without being a useful public editorial record.
 * Keep this gate stricter than isGridManifest: it is the sole indexability
 * predicate used by the public directory and edition endpoint.
 */
export function isIndexablePublicationManifest(manifest) {
  if (!isGridManifest(manifest)) return false;
  const copy = manifest.vibe?.supportingCopyEn || manifest.vibe?.supportingCopy;
  if (hasHistoricalPublicationApproval(manifest.publicationDate)) {
    // A changed approved date cannot fall through to the generic copy-length
    // gate: both its exact bilingual copy and nine MEDIA references are pinned.
    if (!matchesHistoricalPublicationApproval(manifest)) return false;
  } else if (manifest.publicationDate === APPROVED_SHORT_COPY_EDITION_DATE) {
    if (!manifest.vibe?.label?.trim() || !manifest.vibe?.labelEn?.trim()
      || !(manifest.vibe?.subtitleEn?.trim() || (typeof copy === "string" && copy.trim()))) {
      return false;
    }
  } else if (typeof copy !== "string" || copy.trim().length < MIN_PUBLIC_EDITORIAL_COPY_LENGTH
    || !manifest.vibe?.labelEn?.trim() || !manifest.vibe?.subtitleEn?.trim()) {
    return false;
  }
  return Boolean(publicEditionPath(manifest));
}

export function publicEditionPreview(manifest) {
  if (!isIndexablePublicationManifest(manifest)) return null;
  const actorPath = publicActorPath(manifest.actor);
  const editionPath = publicEditionPath(manifest);
  const copy = (manifest.vibe.supportingCopyEn || manifest.vibe.supportingCopy
    || manifest.vibe.subtitleEn).trim();
  const copyEn = typeof manifest.vibe.supportingCopyEn === "string"
    ? manifest.vibe.supportingCopyEn.trim()
    : "";
  const copyZhSource = typeof manifest.vibe.supportingCopy === "string"
    ? manifest.vibe.supportingCopy.trim()
    : "";
  const copyZh = /\p{Script=Han}/u.test(copyZhSource) ? copyZhSource : "";
  return {
    kind: "vibe-atlas-public-edition",
    date: manifest.publicationDate,
    actor: {
      id: manifest.actor.id,
      name: manifest.actor.name,
      nameEn: manifest.actor.nameEn,
      accentColor: manifest.actor.accentColor,
      slug: publicActorSlug(manifest.actor),
      path: actorPath,
      canonical: publicCanonical(actorPath),
    },
    vibe: {
      label: manifest.vibe.label,
      labelEn: manifest.vibe.labelEn,
      emoji: manifest.vibe.emoji || null,
      subtitle: manifest.vibe.subtitle || "",
      subtitleEn: manifest.vibe.subtitleEn || copy,
      copy,
      ...(copyEn ? { copyEn } : {}),
      ...(copyZh ? { copyZh } : {}),
    },
    canonical: publicCanonical(editionPath),
    path: editionPath,
    publishedAt: manifest.publishedAt,
    heroPosition: manifest.heroPosition,
    previews: manifest.cards.map(card => ({
      position: card.position,
      title: typeof card.title === "string" ? card.title : "",
      source: typeof card.source === "string" ? card.source : "",
      link: typeof card.link === "string" && card.link.startsWith("https://")
        ? card.link
        : null,
      thumbnailUrl: card.media.thumbnailUrl,
      deliveryUrl: card.media.deliveryUrl,
      mimeType: card.media.mimeType,
      dimensions: {
        width: card.media.dimensions.width,
        height: card.media.dimensions.height,
      },
    })),
  };
}

export function publicActorDirectory(manifests) {
  const editions = (Array.isArray(manifests) ? manifests : [])
    .filter(isIndexablePublicationManifest)
    .map(publicEditionPreview)
    .sort((left, right) => right.date.localeCompare(left.date));
  const actors = new Map();
  for (const edition of editions) {
    const current = actors.get(edition.actor.id);
    if (!current) {
      actors.set(edition.actor.id, {
        ...edition.actor,
        editionCount: 1,
        latestEdition: edition.date,
        editions: [{ date: edition.date, path: edition.path, canonical: edition.canonical }],
        relatedContext: [{
          label: edition.vibe.label,
          labelEn: edition.vibe.labelEn,
          subtitleEn: edition.vibe.subtitleEn,
        }],
      });
      continue;
    }
    current.editionCount += 1;
    current.editions.push({
      date: edition.date,
      path: edition.path,
      canonical: edition.canonical,
    });
    if (!current.relatedContext.some(context => context.labelEn === edition.vibe.labelEn)) {
      current.relatedContext.push({
        label: edition.vibe.label,
        labelEn: edition.vibe.labelEn,
        subtitleEn: edition.vibe.subtitleEn,
      });
    }
  }
  return [...actors.values()]
    .sort((left, right) => left.nameEn.localeCompare(right.nameEn))
    .map(actor => ({
      ...actor,
      canonical: publicCanonical(actor.path),
    }));
}

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
  const validCatalog = isPublicationManifestCatalog(catalog);
  const validManifests = manifests.filter(isGridManifest);
  const invalidCatalogManifests = validCatalog
    ? catalogKeys
      .map(key => manifests[keys.indexOf(key)])
      .filter(manifest => manifest && !isGridManifest(manifest))
    : [];
  const catalogCoverageComplete = validCatalog && catalog.dates.every(date => {
    const manifest = manifests[keys.indexOf(gridManifestKey(date))];
    return isGridManifest(manifest) && manifest.publicationDate === date;
  });
  return {
    manifests: validManifests,
    invalidCatalogManifests,
    catalogDates: validCatalog ? catalog.dates : [],
    inventory: {
      catalogValid: validCatalog,
      catalogDateCount: catalogKeys.length,
      listedManifestCount: listedKeys.length,
      manifestCount: validManifests.length,
      complete: catalogCoverageComplete,
    },
  };
}

/**
 * Historical Archive payloads are not publication evidence. Diagnose the
 * immutable manifests directly without exposing source URLs or stored blobs.
 * Reports only bounded statuses; legacy Archive metadata cannot establish that
 * nine immutable MEDIA assets exist.
 */
export async function diagnoseArchivedPublications(store, dates) {
  const uniqueDates = [...new Set(dates)].filter(isPublicationDate);
  if (uniqueDates.length > 100) throw new Error("Too many archive dates to diagnose.");
  return Promise.all(uniqueDates.map(async date => {
    const manifest = await store.get(gridManifestKey(date), {
      type: "json",
      consistency: "strong",
    });
    return {
      date,
      status: !manifest ? "missing_manifest"
        : !isGridManifest(manifest) || manifest.publicationDate !== date
          ? "malformed_manifest"
          : !isIndexablePublicationManifest(manifest) ? "not_indexable"
            : "indexable",
    };
  }));
}

/** Private, bounded catalogue health: never expose raw manifests or media URLs. */
export async function diagnosePublicationManifestCatalog(store) {
  const { inventory } = await readPublicationManifests(store);
  const catalog = await store.get(publicationManifestCatalogKey(), {
    type: "json",
    consistency: "strong",
  });
  if (!isPublicationManifestCatalog(catalog)) {
    return {
      inventory,
      catalogStatus: catalog ? "malformed" : "missing",
      catalogFailures: [],
    };
  }
  const dates = catalog.dates.slice(0, 100);
  const checks = await Promise.all(dates.map(async date => {
    const manifest = await store.get(gridManifestKey(date), {
      type: "json",
      consistency: "strong",
    });
    if (!manifest) return { date, status: "missing_manifest" };
    if (!isGridManifest(manifest) || manifest.publicationDate !== date) {
      return { date, status: "malformed_manifest" };
    }
    return null;
  }));
  return {
    inventory,
    catalogStatus: "valid",
    catalogFailures: checks.filter(Boolean),
    catalogFailuresTruncated: catalog.dates.length > dates.length,
  };
}

/**
 * Remove only a dangling derived date. A sufficiently old pending receipt can
 * remain for a future retry: retries now register the date after the immutable
 * manifest is committed. Never delete the receipt or its MEDIA references.
 */
export async function repairMissingPublicationCatalogDate(
  store, date, { now = () => new Date() } = {},
) {
  if (!isPublicationDate(date)) throw requestError("Invalid publication date.", 400);
  const lock = await acquireCorrectionPublicationLock(store, now);
  try {
    const key = publicationManifestCatalogKey();
    const entry = await store.getWithMetadata?.(key, {
      type: "json",
      consistency: "strong",
    });
    const catalog = entry?.data ?? await store.get(key, {
      type: "json",
      consistency: "strong",
    });
    if (!isPublicationManifestCatalog(catalog)) {
      throw requestError("The publication catalog is invalid.", 503);
    }
    if (!catalog.dates.includes(date)) return { date, status: "already_absent" };
    if (await store.get(gridManifestKey(date), { type: "json", consistency: "strong" })) {
      return { date, status: "manifest_present" };
    }
    const pending = await store.get(gridPendingKey(date), {
      type: "json", consistency: "strong",
    });
    if (pending) {
      const currentTime = Date.parse(asTimestamp(now()));
      const lastUpdate = Date.parse(pending.updatedAt);
      const dateLock = await store.get(`${PUBLICATION_LOCK_PREFIX}${date}`, {
        type: "json", consistency: "strong",
      });
      const lockStart = Date.parse(dateLock?.startedAt);
      if (pending.state !== "pending" || pending.date !== date
        || !Number.isFinite(lastUpdate) || lastUpdate > currentTime) {
        return { date, status: "publication_pending", reason: "unverifiable_receipt" };
      }
      if (currentTime - lastUpdate < STALE_PENDING_CATALOG_REPAIR_MS) {
        return {
          date, status: "publication_pending", reason: "recent_receipt",
          retryAfter: new Date(lastUpdate + STALE_PENDING_CATALOG_REPAIR_MS).toISOString(),
        };
      }
      if (dateLock && dateLock.state !== "released") {
        if (!Number.isFinite(lockStart) || lockStart > currentTime) {
          return { date, status: "publication_pending", reason: "unverifiable_lock" };
        }
        if (currentTime - lockStart < STALE_PENDING_CATALOG_REPAIR_MS) {
          return {
            date, status: "publication_pending", reason: "recent_date_lock",
            retryAfter: new Date(lockStart + STALE_PENDING_CATALOG_REPAIR_MS).toISOString(),
          };
        }
      }
    }
    if (!entry?.etag) {
      throw requestError("The publication catalog has no revision tag; repair was not attempted.", 503);
    }
    const updated = {
      ...catalog,
      dates: catalog.dates.filter(item => item !== date),
      updatedAt: new Date().toISOString(),
    };
    const write = await store.setJSON(key, updated, { onlyIfMatch: entry.etag });
    if (write?.modified === false) {
      throw requestError("The publication catalog changed during repair; retry after checking the audit.", 409);
    }
    const authoritative = await store.get(key, { type: "json", consistency: "strong" });
    if (!isPublicationManifestCatalog(authoritative) || authoritative.dates.includes(date)) {
      throw requestError("The publication catalog repair could not be verified.", 503);
    }
    if (await store.get(gridManifestKey(date), { type: "json", consistency: "strong" })) {
      await ensurePublicationManifestCatalogDate(store, date, () => new Date());
      throw requestError("A publication appeared during repair; the catalog was restored.", 409);
    }
    return {
      date,
      status: pending ? "removed_stale_pending_catalog_reference" : "removed_missing_manifest",
    };
  } finally {
    await releaseCorrectionPublicationLock(store, lock);
  }
}

export async function repairPublicationManifestPublicRecords(
  store,
  { cursor = null, limit = 100, now = () => new Date() } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("The publication reader-link repair limit is invalid.");
  }
  const catalog = await store.get(publicationManifestCatalogKey(), {
    type: "json",
    consistency: "strong",
  });
  const keys = [...new Set([
    ...(isPublicationManifestCatalog(catalog) ? catalog.dates.map(gridManifestKey) : []),
    ...await readPublicationManifestKeys(store),
  ])].sort().reverse();
  const page = keys.filter(key => !cursor || key < cursor).slice(0, limit);
  const invalid = [];
  let repaired = 0;
  let cataloged = 0;
  const catalogedDates = new Set(
    isPublicationManifestCatalog(catalog) ? catalog.dates : [],
  );
  for (const key of page) {
    let completed = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const withMetadata = typeof store.getWithMetadata === "function"
        ? await getWithResolvedEtag(store, key, { type: "json" })
        : null;
      const manifest = withMetadata?.data ?? await store.get(
        key,
        { type: "json", consistency: "strong" },
      );
      if (!manifest) {
        completed = true;
        break;
      }
      const metadata = structuredClone(manifest);
      delete metadata.publicRecord;
      if (!isGridManifest(metadata)) {
        invalid.push({ key, status: "invalid_manifest", repaired: false });
        completed = true;
        break;
      }
      if (!catalogedDates.has(manifest.publicationDate)) {
        await ensurePublicationReleaseDates(store, [manifest.publicationDate]);
        await ensurePublicationManifestCatalogDate(
          store,
          manifest.publicationDate,
          now,
        );
        catalogedDates.add(manifest.publicationDate);
        cataloged += 1;
      }
      const expectedActorSlug = publicActorSlug(manifest.actor);
      const diagnostic = publicArchiveRecordDiagnostic(manifest.publicRecord, {
        expectedDate: manifest.publicationDate,
        expectedActorSlug,
      });
      if (diagnostic.status === "valid") {
        completed = true;
        break;
      }
      const next = {
        ...manifest,
        publicRecord: {
          actorPath: `${PUBLIC_ACTOR_PATH}/${expectedActorSlug}/`,
          editionPath: `${PUBLIC_EDITION_PATH}/${manifest.publicationDate}/${expectedActorSlug}/`,
        },
      };
      if (manifest && !withMetadata?.etag) {
        throw new Error("The publication reader links could not be repaired safely because storage did not provide a revision tag.");
      }
      const write = await store.setJSON(key, next, { onlyIfMatch: withMetadata.etag });
      if (write?.modified === false) continue;
      const authoritative = await store.get(key, { type: "json", consistency: "strong" });
      if (!isGridManifest(authoritative)
        || JSON.stringify(authoritative.publicRecord) !== JSON.stringify(next.publicRecord)) {
        throw new Error("The publication reader-link repair could not be verified.");
      }
      invalid.push({ key, status: diagnostic.status, repaired: true });
      repaired += 1;
      completed = true;
      break;
    }
    if (!completed) {
      throw new Error("The publication reader links could not be repaired safely after repeated conflicts.");
    }
  }
  return {
    scanned: page.length,
    invalid,
    repaired,
    cataloged,
    nextCursor: keys.filter(key => !cursor || key < cursor).length > page.length
      ? page.at(-1)
      : null,
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
  const result = await readLatestPublicationDatesByActorWithHealth(store, {
    throughDate,
    actorIds,
  });
  return result.dates;
}

export async function readLatestPublicationDatesByActorWithHealth(
  store,
  { throughDate = null, actorIds = null, now = () => new Date().toISOString() } = {},
) {
  const requestedActorIds = actorIds
    ? new Set(actorIds.filter(actorId => typeof actorId === "string"))
    : null;
  let index = null;
  let repairReason = null;
  try {
    index = await store.get(publicationActorIndexKey(), {
      type: "json",
      consistency: "strong",
    });
  } catch {
    repairReason = "read_failed";
    // A transient index read failure should not make the private inventory
    // claim that no actor has ever been published.
  }

  let stale = !isPublicationActorIndex(index);
  if (stale && !repairReason) repairReason = index ? "invalid" : "missing";
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
      repairReason = "verification_failed";
    }
    if (stale && !repairReason) repairReason = "stale";
  }
  if (stale) {
    const repair = await rebuildPublicationActorIndexSafely(store, throughDate);
    index = repair.index;
    await recordPublicationActorIndexRepair(store, {
      attemptedAt: asTimestamp(now()),
      reason: repairReason,
      outcome: repair.outcome,
    });
  }

  return {
    dates: publicationDatesFromIndex(index, throughDate, requestedActorIds),
    repairHealth: await readPublicationActorIndexRepairHealth(store, now),
  };
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
      ? await getWithResolvedEtag(store, publicationActorIndexKey(), {
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
    if (typeof store.getWithMetadata === "function"
      && existing
      && !existingWithMetadata?.etag) {
      throw requestError(
        "The publication actor index could not be rebuilt safely because storage did not provide a revision tag.",
        503,
      );
    }
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
    return {
      index: await rebuildPublicationActorIndex(store, { throughDate }),
      outcome: "rebuilt",
    };
  } catch {
    // The inventory can still be correct for this request when the derived
    // write is unavailable. The next request will retry the rebuild.
    try {
      const scan = await readPublicationManifestsForIndex(store, throughDate);
      return {
        index: publicationActorIndexFromManifests(
          scan.manifests,
          new Date().toISOString(),
          scan.coverageKeys,
          throughDate,
        ),
        outcome: "fallback_scan",
      };
    } catch {
      // Missing history is safer than presenting an unverified date.
      return {
        index: emptyPublicationActorIndex(new Date().toISOString()),
        outcome: "failed",
      };
    }
  }
}

async function recordPublicationActorIndexRepair(store, event) {
  try {
    const current = await store.get(publicationActorIndexRepairKey(), {
      type: "json",
      consistency: "strong",
    });
    const events = [
      ...(Array.isArray(current?.events) ? current.events : []),
      event,
    ].filter(item => (
      item
      && Number.isFinite(Date.parse(item.attemptedAt))
      && ["missing", "invalid", "stale", "read_failed", "verification_failed"].includes(item.reason)
      && ["rebuilt", "fallback_scan", "failed"].includes(item.outcome)
    )).slice(-20);
    await store.setJSON(publicationActorIndexRepairKey(), {
      schemaVersion: 1,
      kind: "vibe-atlas-publication-actor-index-repair-health",
      updatedAt: event.attemptedAt,
      events,
    });
  } catch {
    // Repair telemetry is private observability and must not block inventory.
  }
}

function isPublicationActorIndexRepairEvent(event) {
  return Boolean(
    event
    && typeof event === "object"
    && typeof event.attemptedAt === "string"
    && Number.isFinite(Date.parse(event.attemptedAt))
    && ["missing", "invalid", "stale", "read_failed", "verification_failed"].includes(event.reason)
    && ["rebuilt", "fallback_scan", "failed"].includes(event.outcome)
  );
}

function unavailablePublicationActorIndexRepairHealth() {
  return {
    status: "unavailable",
    warning: true,
    windowHours: 24,
    attemptCount: 0,
    failedAttemptCount: 0,
    lastAttemptAt: null,
    lastOutcome: null,
  };
}

async function readPublicationActorIndexRepairHealth(store, now) {
  try {
    const record = await store.get(publicationActorIndexRepairKey(), {
      type: "json",
      consistency: "strong",
    });
    const nowAt = Date.parse(asTimestamp(now()));
    if (!Number.isFinite(nowAt)) {
      return unavailablePublicationActorIndexRepairHealth();
    }
    if (record !== null && record !== undefined && (
      record?.schemaVersion !== 1
      || record?.kind !== "vibe-atlas-publication-actor-index-repair-health"
      || !Array.isArray(record?.events)
      || !record.events.every(isPublicationActorIndexRepairEvent)
    )) {
      return unavailablePublicationActorIndexRepairHealth();
    }
    const recentEvents = (record?.events || [])
      .filter(event => (
        nowAt - Date.parse(event.attemptedAt) <= PUBLICATION_ACTOR_INDEX_REPAIR_WINDOW_MS
        && nowAt >= Date.parse(event.attemptedAt)
      ));
    const lastEvent = recentEvents.at(-1) || null;
    const failed = recentEvents.filter(event => event.outcome !== "rebuilt").length;
    return {
      status: failed > 0 ? "failed" : recentEvents.length >= 2 ? "repeated" : "healthy",
      warning: failed > 0 || recentEvents.length >= 2,
      windowHours: 24,
      attemptCount: recentEvents.length,
      failedAttemptCount: failed,
      lastAttemptAt: lastEvent?.attemptedAt || null,
      lastOutcome: lastEvent?.outcome || null,
    };
  } catch {
    return unavailablePublicationActorIndexRepairHealth();
  }
}

export async function recoverPublicationActorIndexRepairHealth(
  store,
  {
    now = () => new Date().toISOString(),
    operator,
    reason = "",
    createReceiptId = () => randomUUID(),
  } = {},
) {
  const recoveredAt = asTimestamp(now());
  const recoveredAtMs = Date.parse(recoveredAt);
  if (!Number.isFinite(recoveredAtMs)) {
    throw requestError("Repair health could not be recovered with an invalid timestamp.", 503);
  }

  let current = null;
  try {
    current = await store.get(publicationActorIndexRepairKey(), {
      type: "json",
      consistency: "strong",
    });
  } catch {
    // An unreadable telemetry record can still be safely reset. This recovery
    // never reads or writes publication manifests or the actor index.
  }
  const events = (Array.isArray(current?.events) ? current.events : [])
    .filter(isPublicationActorIndexRepairEvent)
    .filter(event => {
      const attemptedAt = Date.parse(event.attemptedAt);
      return attemptedAt <= recoveredAtMs
        && recoveredAtMs - attemptedAt <= PUBLICATION_ACTOR_INDEX_REPAIR_WINDOW_MS;
    })
    .slice(-20);
  const record = {
    schemaVersion: 1,
    kind: "vibe-atlas-publication-actor-index-repair-health",
    updatedAt: recoveredAt,
    events,
  };
  const receiptId = `repair-health-recovery-${createReceiptId()}`;
  const receipt = {
    schemaVersion: 1,
    kind: "vibe-atlas-publication-actor-index-repair-health-recovery",
    status: "authorized",
    receiptId,
    recoveredAt,
    recoveredBy: operator,
    preservedEventCount: events.length,
    reason: reason || null,
    targetRepairHealth: {
      updatedAt: record.updatedAt,
      eventCount: record.events.length,
    },
  };

  try {
    const receiptWrite = await store.setJSON(
      publicationActorIndexRepairRecoveryKey(receiptId),
      receipt,
      { onlyIfNew: true },
    );
    if (receiptWrite?.modified === false) {
      throw new Error("Repair-health recovery receipt already exists.");
    }
    await appendPublicationActorIndexRepairRecoveryCatalog(store, receipt);
    await store.setJSON(publicationActorIndexRepairKey(), record);
    const health = await readPublicationActorIndexRepairHealth(store, () => recoveredAt);
    if (health.status === "unavailable") {
      throw new Error("Recovered repair health could not be verified.");
    }
    return {
      recovered: true,
      preservedEventCount: events.length,
      receiptId,
      repairHealth: health,
    };
  } catch {
    throw requestError("Repair health could not be recovered. No publication data was changed.", 503);
  }
}

function isPublicationActorIndexRepairRecoveryReceipt(receipt) {
  return receipt?.schemaVersion === 1
    && receipt.kind === "vibe-atlas-publication-actor-index-repair-health-recovery"
    && receipt.status === "authorized"
    && typeof receipt.receiptId === "string"
    && typeof receipt.recoveredAt === "string"
    && Number.isFinite(Date.parse(receipt.recoveredAt))
    && typeof receipt.recoveredBy === "string"
    && Number.isSafeInteger(receipt.preservedEventCount)
    && receipt.preservedEventCount >= 0
    && (receipt.reason === null || typeof receipt.reason === "string");
}

function repairRecoveryHistoryItem(receipt) {
  return {
    receiptId: receipt.receiptId,
    recoveredAt: receipt.recoveredAt,
    recoveredBy: receipt.recoveredBy,
    preservedEventCount: receipt.preservedEventCount,
    reason: receipt.reason,
  };
}

function isPublicationActorIndexRepairRecoveryCatalog(catalog) {
  return catalog?.schemaVersion === 1
    && catalog.kind === "vibe-atlas-publication-actor-index-repair-health-recovery-catalog"
    && Array.isArray(catalog.receipts)
    && catalog.receipts.length <= PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_HISTORY_LIMIT
    && catalog.receipts.every(isPublicationActorIndexRepairRecoveryReceipt);
}

async function appendPublicationActorIndexRepairRecoveryCatalog(store, receipt) {
  const key = publicationActorIndexRepairRecoveryCatalogKey();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = typeof store.getWithMetadata === "function"
      ? await getWithResolvedEtag(store, key, { type: "json" })
      : null;
    const catalog = current?.data;
    if (catalog && !isPublicationActorIndexRepairRecoveryCatalog(catalog)) {
      throw new Error("Repair-health recovery history is invalid.");
    }
    if (catalog && !current.etag) {
      throw new Error("Repair-health recovery history cannot be updated without a revision tag.");
    }
    const receipts = [
      receipt,
      ...(catalog?.receipts || []).filter(item => item.receiptId !== receipt.receiptId),
    ]
      .sort((left, right) =>
        right.recoveredAt.localeCompare(left.recoveredAt)
        || right.receiptId.localeCompare(left.receiptId))
      .slice(0, PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_HISTORY_LIMIT);
    const next = {
      schemaVersion: 1,
      kind: "vibe-atlas-publication-actor-index-repair-health-recovery-catalog",
      updatedAt: receipt.recoveredAt,
      receipts,
    };
    const write = await store.setJSON(key, next, current?.etag
      ? { onlyIfMatch: current.etag }
      : { onlyIfNew: true });
    if (write?.modified !== false) return;
  }
  throw new Error("Repair-health recovery history changed concurrently.");
}

async function initializePublicationActorIndexRepairRecoveryCatalog(store) {
  const listing = await store.list({
    prefix: PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_PREFIX,
    paginate: false,
  });
  const keys = (listing?.blobs || [])
    .map(blob => blob?.key)
    .filter(key =>
      typeof key === "string"
      && key.startsWith(PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_PREFIX));
  const receipts = (await Promise.all(keys.map(key => store.get(key, {
    type: "json",
    consistency: "strong",
  }))))
    .filter(isPublicationActorIndexRepairRecoveryReceipt)
    .sort((left, right) =>
      right.recoveredAt.localeCompare(left.recoveredAt)
      || right.receiptId.localeCompare(left.receiptId))
    .slice(0, PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_HISTORY_LIMIT);
  const catalog = {
    schemaVersion: 1,
    kind: "vibe-atlas-publication-actor-index-repair-health-recovery-catalog",
    updatedAt: receipts[0]?.recoveredAt || new Date(0).toISOString(),
    receipts,
  };
  const write = await store.setJSON(
    publicationActorIndexRepairRecoveryCatalogKey(),
    catalog,
    { onlyIfNew: true },
  );
  if (write?.modified !== false) return catalog;
  const authoritative = await store.get(
    publicationActorIndexRepairRecoveryCatalogKey(),
    { type: "json", consistency: "strong" },
  );
  if (!isPublicationActorIndexRepairRecoveryCatalog(authoritative)) {
    throw requestError("Repair-health recovery history is unavailable.", 503);
  }
  return authoritative;
}

export async function listPublicationActorIndexRepairRecoveryReceipts(
  store,
  { limit = 25 } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw requestError("The repair-health recovery history limit is invalid.", 400);
  }
  let catalog = await store.get(publicationActorIndexRepairRecoveryCatalogKey(), {
    type: "json",
    consistency: "strong",
  });
  if (!catalog) {
    catalog = await initializePublicationActorIndexRepairRecoveryCatalog(store);
  }
  if (catalog && !isPublicationActorIndexRepairRecoveryCatalog(catalog)) {
    throw requestError("Repair-health recovery history is unavailable.", 503);
  }
  const receipts = (catalog?.receipts || [])
    .slice(0, limit)
    .map(repairRecoveryHistoryItem);
  return {
    receipts,
    retainedReceiptCount: catalog?.receipts.length || 0,
    historyLimit: PUBLICATION_ACTOR_INDEX_REPAIR_RECOVERY_HISTORY_LIMIT,
  };
}

async function updatePublicationActorIndex(store, manifest, now) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existingWithMetadata = typeof store.getWithMetadata === "function"
      ? await getWithResolvedEtag(store, publicationActorIndexKey(), {
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
    if (typeof store.getWithMetadata === "function"
      && existing
      && !existingWithMetadata?.etag) {
      throw requestError(
        "The publication actor index could not be updated safely because storage did not provide a revision tag.",
        503,
      );
    }
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
  if (!entry || !isVerifiedPublicationManifest(manifest)
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

function isVerifiedPublicationManifest(manifest) {
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

export function isPublicationManifestCatalog(value) {
  return value?.schemaVersion === 1
    && value.catalogVersion === GRID_MANIFEST_VERSION
    && value.kind === "vibe-atlas-publication-manifest-catalog"
    && Array.isArray(value.dates)
    && value.dates.every((date, index, dates) =>
      isPublicationDate(date)
      && (index === 0 || dates[index - 1] < date));
}
async function ensurePublicationManifestCatalogDate(store, date, now) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentWithMetadata = typeof store.getWithMetadata === "function"
      ? await getWithResolvedEtag(store, publicationManifestCatalogKey(), {
        type: "json",
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
    if (current && !currentWithMetadata?.etag) {
      throw requestError(
        "The publication manifest catalog requires reconciliation before it can be updated.",
        503,
      );
    }
    const dates = [...new Set([...(current?.dates || []), date])].sort();
    const next = {
      schemaVersion: 1,
      catalogVersion: GRID_MANIFEST_VERSION,
      kind: "vibe-atlas-publication-manifest-catalog",
      dates,
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
      ? await getWithResolvedEtag(store, CORRECTION_PUBLICATION_LOCK_KEY, {
        type: "json",
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
  validateBeforeCommit = null,
}) {
  validatePublicationInput(date, actor, vibe, board);
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
    const publicationCatalog = await ensurePublicationManifestCatalogDate(store, date, now);
    await ensurePublicationReleaseDates(store, publicationCatalog.dates, { publicationDate: date });
    await ensureArchiveAccessWindow(store, publicationCatalog.dates, now);
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
    const publicationCatalog = await ensurePublicationManifestCatalogDate(store, date, now);
    await ensurePublicationReleaseDates(store, publicationCatalog.dates, { publicationDate: date });
    await ensureArchiveAccessWindow(store, publicationCatalog.dates, now);
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
    publicRecord: assertPublicArchiveRecord({
      actorPath: publicActorPath(actor),
      editionPath: `${PUBLIC_EDITION_PATH}/${date}/${publicActorSlug(actor)}/`,
    }, {
      expectedDate: date,
      expectedActorSlug: publicActorSlug(actor),
    }),
    cards,
  };
  if (typeof validateBeforeCommit === "function") {
    await validateBeforeCommit();
  }
  await store.setJSON(manifestKey, manifest, { onlyIfNew: true });
  const authoritative = await store.get(manifestKey, { type: "json", consistency: "strong" });
  if (!isGridManifest(authoritative) || authoritative.boardHash !== boardHashValue) {
    throw requestError("Another board won this publication date.", 409);
  }
  const publicationCatalog = await ensurePublicationManifestCatalogDate(store, date, now);
  await ensurePublicationReleaseDates(store, publicationCatalog.dates, { publicationDate: date });
  await ensureArchiveAccessWindow(store, publicationCatalog.dates, now);
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
  const publicEdition = publicEditionPreview(manifest);
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
    ...(publicEdition ? {
      publicRecord: {
        actorPath: publicEdition.actor.path,
        editionPath: publicEdition.path,
      },
    } : {}),
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
  if (Object.hasOwn(value, "publicRecord")) {
    try {
      assertPublicArchiveRecord(value.publicRecord, {
        expectedDate: value.publicationDate,
        expectedActorSlug: publicActorSlug(value.actor),
      });
    } catch {
      return false;
    }
  }
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

export async function fetchPublicationImage(sourceUrl, fetchImpl = fetch, resolveHost = lookup) {
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
      lookup: pinnedPublicLookup(resolved),
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

// Node's automatic address-family selection requests an array with `all`.
// Return only the validated address; never perform a second DNS resolution.
export function pinnedPublicLookup(resolved) {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [resolved]);
    else callback(null, resolved.address, resolved.family);
  };
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
    ? await getWithResolvedEtag(store, key, { type: "json" })
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

export const publicationReleaseReceiptKey = date =>
  `${PUBLICATION_RELEASE_RECEIPT_PREFIX}${date}`;

async function ensurePublicationReleaseReceipts(store, dates) {
  for (const date of dates) {
    const key = publicationReleaseReceiptKey(date);
    const receipt = {
      schemaVersion: 1,
      kind: "vibe-atlas-release-receipt",
      date,
    };
    await store.setJSON(key, receipt, { onlyIfNew: true });
    const saved = await store.get(key, { type: "json", consistency: "strong" });
    if (!isPublicationReleaseReceipt(saved, date)) {
      throw new Error("The immutable release receipt is missing or invalid.");
    }
  }
}
