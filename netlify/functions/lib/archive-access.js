import {
  assertPublicArchiveRecord,
  publicArchiveRecord,
  publicArchiveRecordDiagnostic,
} from "../../../src/contracts/publicArchiveRecord.js";

export const ARCHIVE_FREE_EDITION_COUNT = 4;
export const ARCHIVE_ACCESS_WINDOW_VERSION = 1;
export const ARCHIVE_ACCESS_WINDOW_KEY =
  `vibeAtlas:archive-access-window:v${ARCHIVE_ACCESS_WINDOW_VERSION}:latest`;
export const ARCHIVE_CATALOG_VERSION = 1;
export const ARCHIVE_CATALOG_KEY =
  `vibeAtlas:archive-catalog:v${ARCHIVE_CATALOG_VERSION}:latest`;
export const ARCHIVE_CATALOG_EDITION_VERSION = 2;
export const ARCHIVE_CATALOG_EDITION_PREFIX =
  `vibeAtlas:archive-catalog:v${ARCHIVE_CATALOG_EDITION_VERSION}:edition:`;
export const ARCHIVE_CATALOG_INDEX_KEY =
  `vibeAtlas:archive-catalog:v${ARCHIVE_CATALOG_EDITION_VERSION}:index`;
export const ARCHIVE_CATALOG_YEAR_PREFIX =
  `vibeAtlas:archive-catalog:v${ARCHIVE_CATALOG_EDITION_VERSION}:year:`;

export const ARCHIVE_SAFE_UPDATE_UNAVAILABLE = "ARCHIVE_SAFE_UPDATE_UNAVAILABLE";
export const ARCHIVE_RECONCILIATION_LIMIT = 100;
export const ARCHIVE_RECONCILIATION_START_DATE = "2026-01-01";

export function archiveGateEnabled(env = process.env) {
  return env.FANDOM_ARCHIVE_GATE_ENABLED !== "false";
}

export function freeArchiveDates(editions, count = ARCHIVE_FREE_EDITION_COUNT) {
  return new Set(
    [...new Set((editions || []).map(edition => edition?.date).filter(Boolean))]
      .sort((left, right) => right.localeCompare(left))
      .slice(0, count),
  );
}

export function archiveAccessWindowDates(value, count = ARCHIVE_FREE_EDITION_COUNT) {
  if (!isArchiveAccessWindow(value, count)) return new Set();
  const expected = [...new Set(value.freeArchiveDates)]
    .sort((left, right) => right.localeCompare(left));
  if (expected.length !== value.freeArchiveDates.length
    || expected.some((date, index) => date !== value.freeArchiveDates[index])) {
    return new Set();
  }
  return new Set(expected);
}

function isArchiveAccessWindow(value, count = ARCHIVE_FREE_EDITION_COUNT) {
  return value?.schemaVersion === 1
    && value?.accessWindowVersion === ARCHIVE_ACCESS_WINDOW_VERSION
    && value?.kind === "vibe-atlas-archive-access-window"
    && Array.isArray(value?.freeArchiveDates)
    && value.freeArchiveDates.length <= count
    && value.freeArchiveDates.every(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    && new Set(value.freeArchiveDates).size === value.freeArchiveDates.length
    && value.freeArchiveDates.every((date, index, dates) =>
      index === 0 || dates[index - 1].localeCompare(date) > 0);
}

export async function ensureArchiveAccessWindow(
  store,
  dates,
  now = () => new Date().toISOString(),
) {
  const candidates = [...new Set((dates || [])
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, ARCHIVE_FREE_EDITION_COUNT);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentWithMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(ARCHIVE_ACCESS_WINDOW_KEY, {
        type: "json",
        consistency: "strong",
      })
      : null;
    const current = currentWithMetadata?.data ?? await store.get(
      ARCHIVE_ACCESS_WINDOW_KEY,
      { type: "json", consistency: "strong" },
    );
    const currentDates = archiveAccessWindowDates(current);
    if (current && !isArchiveAccessWindow(current)) {
      throw new Error("The archive access window is invalid.");
    }
    const freeArchiveDates = [...new Set([...currentDates, ...candidates])]
      .sort((left, right) => right.localeCompare(left))
      .slice(0, ARCHIVE_FREE_EDITION_COUNT);
    if (current
      && freeArchiveDates.length === currentDates.size
      && freeArchiveDates.every(date => currentDates.has(date))) return current;
    if (current && !currentWithMetadata?.etag) {
      throw archiveSafeUpdateUnavailable({
        resource: "archive access window",
        key: ARCHIVE_ACCESS_WINDOW_KEY,
      });
    }
    const timestamp = now();
    const next = {
      schemaVersion: 1,
      accessWindowVersion: ARCHIVE_ACCESS_WINDOW_VERSION,
      kind: "vibe-atlas-archive-access-window",
      freeArchiveDates,
      updatedAt: typeof timestamp === "string" ? timestamp : timestamp.toISOString(),
    };
    const write = await store.setJSON(
      ARCHIVE_ACCESS_WINDOW_KEY,
      next,
      currentWithMetadata?.etag
        ? { onlyIfMatch: currentWithMetadata.etag }
        : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;
    const authoritative = await store.get(ARCHIVE_ACCESS_WINDOW_KEY, {
      type: "json",
      consistency: "strong",
    });
    const authoritativeDates = archiveAccessWindowDates(authoritative);
    if (freeArchiveDates.length === authoritativeDates.size
      && freeArchiveDates.every(date => authoritativeDates.has(date))) return authoritative;
  }
  throw new Error("The archive access window could not be updated safely.");
}

export function archiveCatalogEditions(value) {
  if (!isArchiveCatalog(value)) return null;
  return value.editions.map(edition => structuredClone(edition));
}

function isArchiveCatalog(value) {
  return value?.schemaVersion === 1
    && value?.catalogVersion === ARCHIVE_CATALOG_VERSION
    && value?.kind === "vibe-atlas-archive-catalog"
    && Array.isArray(value?.editions)
    && value.editions.every((edition, index, editions) =>
      typeof edition?.date === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(edition.date)
      && typeof edition?.actorName === "string"
      && edition.actorName.length > 0
      && typeof edition?.vibeLabel === "string"
      && edition.vibeLabel.length > 0
      && (index === 0 || editions[index - 1].date.localeCompare(edition.date) > 0));
}

function isArchiveCatalogEdition(edition) {
  if (!isArchiveCatalog({
    schemaVersion: 1,
    catalogVersion: ARCHIVE_CATALOG_VERSION,
    kind: "vibe-atlas-archive-catalog",
    editions: [edition],
  })) return false;
  if (!Object.hasOwn(edition, "publicRecord")) return true;
  try {
    assertArchiveEditionPublicRecord(edition);
    return true;
  } catch {
    return false;
  }
}

function archiveActorSlug(edition) {
  return String(edition?.actorShortNameEn || edition?.actorName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "actor";
}
export function archiveCatalogEditionKey(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw new Error("The archive catalogue date is invalid.");
  }
  return `${ARCHIVE_CATALOG_EDITION_PREFIX}${date}`;
}

function isArchiveCatalogIndex(value) {
  return value?.schemaVersion === 1
    && value?.catalogVersion === ARCHIVE_CATALOG_EDITION_VERSION
    && value?.kind === "vibe-atlas-archive-catalog-index"
    && Array.isArray(value?.years)
    && value.years.every((year, index, years) =>
      /^\d{4}$/.test(year)
      && (index === 0 || years[index - 1].localeCompare(year) > 0))
    && (value.yearCounts === undefined
      || (value.yearCounts
        && value.years.every(year => Number.isSafeInteger(value.yearCounts[year])
          && value.yearCounts[year] >= 0)
        && Object.keys(value.yearCounts).every(year => value.years.includes(year))
        && value.total === value.years.reduce((sum, year) => sum + value.yearCounts[year], 0)));
}

function isArchiveCatalogYear(value, year) {
  return value?.schemaVersion === 1
    && value?.catalogVersion === ARCHIVE_CATALOG_EDITION_VERSION
    && value?.kind === "vibe-atlas-archive-catalog-year"
    && value?.year === year
    && Array.isArray(value?.dates)
    && value.dates.every((date, index, dates) =>
      date.startsWith(`${year}-`)
      && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && (index === 0 || dates[index - 1].localeCompare(date) > 0));
}

async function ensureArchiveCatalogList(store, key, currentIsValid, createNext) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const withMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
      : null;
    const current = withMetadata?.data ?? await store.get(
      key,
      { type: "json", consistency: "strong" },
    );
    if (current && !currentIsValid(current)) {
      throw new Error("The archive catalogue index is invalid.");
    }
    const next = createNext(current);
    if (current && JSON.stringify(current) === JSON.stringify(next)) return current;
    if (current && !withMetadata?.etag) {
      throw archiveSafeUpdateUnavailable({
        resource: "archive catalogue index",
        key,
      });
    }
    const write = await store.setJSON(
      key,
      next,
      withMetadata?.etag ? { onlyIfMatch: withMetadata.etag } : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;
    const authoritative = await store.get(key, { type: "json", consistency: "strong" });
    if (currentIsValid(authoritative)
      && JSON.stringify(authoritative) === JSON.stringify(next)) return authoritative;
  }
  throw new Error("The archive catalogue index could not be updated safely.");
}

async function ensureArchiveCatalogDates(store, dates) {
  const datesByYear = new Map();
  const countsByYear = new Map();
  for (const date of dates) {
    const year = date.slice(0, 4);
    datesByYear.set(year, [...(datesByYear.get(year) || []), date]);
  }
  for (const [year, yearDates] of datesByYear) {
    const bucket = await ensureArchiveCatalogList(
      store,
      `${ARCHIVE_CATALOG_YEAR_PREFIX}${year}`,
      value => isArchiveCatalogYear(value, year),
      current => ({
        schemaVersion: 1,
        catalogVersion: ARCHIVE_CATALOG_EDITION_VERSION,
        kind: "vibe-atlas-archive-catalog-year",
        year,
        dates: [...new Set([...yearDates, ...(current?.dates || [])])].sort().reverse(),
      }),
    );
    countsByYear.set(year, bucket.dates.length);
  }
  await ensureArchiveCatalogList(
    store,
    ARCHIVE_CATALOG_INDEX_KEY,
    isArchiveCatalogIndex,
    current => {
      const years = [...new Set([...datesByYear.keys(), ...(current?.years || [])])]
        .sort()
        .reverse();
      const yearCounts = current?.yearCounts
        ? {
          ...current.yearCounts,
          ...Object.fromEntries(countsByYear),
        }
        : null;
      return {
        schemaVersion: 1,
        catalogVersion: ARCHIVE_CATALOG_EDITION_VERSION,
        kind: "vibe-atlas-archive-catalog-index",
        years,
        ...(yearCounts ? {
          yearCounts,
          total: years.reduce((sum, year) => sum + yearCounts[year], 0),
        } : {}),
      };
    },
  );
}

async function ensureArchiveCatalogDate(store, date) {
  await ensureArchiveCatalogDates(store, [date]);
}

async function archiveCatalogIndexWithCounts(store, index) {
  if (index.yearCounts) return index;
  const buckets = await Promise.all(index.years.map(async year => {
    const bucket = await store.get(
      `${ARCHIVE_CATALOG_YEAR_PREFIX}${year}`,
      { type: "json", consistency: "strong" },
    );
    if (!isArchiveCatalogYear(bucket, year)) {
      throw new Error("The archive catalogue year is invalid.");
    }
    return bucket;
  }));
  const yearCounts = Object.fromEntries(buckets.map(bucket => [bucket.year, bucket.dates.length]));
  return ensureArchiveCatalogList(
    store,
    ARCHIVE_CATALOG_INDEX_KEY,
    isArchiveCatalogIndex,
    current => ({
      ...current,
      yearCounts,
      total: Object.values(yearCounts).reduce((sum, count) => sum + count, 0),
    }),
  );
}

export async function reconcileArchiveCatalogIndexes(
  store,
  {
    throughDate,
    cursor = null,
    limit = ARCHIVE_RECONCILIATION_LIMIT,
  } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ARCHIVE_RECONCILIATION_LIMIT) {
    throw new Error("The archive catalogue reconciliation limit is invalid.");
  }
  const firstDate = cursor || throughDate;
  if (!isCalendarDate(firstDate) || !isCalendarDate(throughDate) || firstDate > throughDate) {
    throw new Error("The archive catalogue reconciliation cursor is invalid.");
  }
  if (firstDate < ARCHIVE_RECONCILIATION_START_DATE) {
    return { scanned: 0, verified: 0, missingDates: [], repaired: 0, nextCursor: null };
  }
  const dates = [];
  let date = firstDate;
  while (dates.length < limit && date >= ARCHIVE_RECONCILIATION_START_DATE) {
    dates.push(date);
    date = previousCalendarDate(date);
  }
  let records;
  let missingDates;
  try {
    records = (await Promise.all(dates.map(async candidateDate => {
      const key = archiveCatalogEditionKey(candidateDate);
      const edition = await store.get(key, { type: "json", consistency: "strong" });
      if (!edition) return null;
      if (!isArchiveCatalogEdition(edition) || edition.date !== candidateDate) {
        throw new Error("The archive catalogue edition is invalid.");
      }
      return { date: candidateDate, edition };
    }))).filter(Boolean);

    const index = await store.get(
      ARCHIVE_CATALOG_INDEX_KEY,
      { type: "json", consistency: "strong" },
    );
    if (index && !isArchiveCatalogIndex(index)) {
      throw new Error("The archive catalogue index is invalid.");
    }
    const years = new Map();
    await Promise.all([...new Set(records.map(record => record.date.slice(0, 4)))]
      .map(async year => {
        const bucket = await store.get(
          `${ARCHIVE_CATALOG_YEAR_PREFIX}${year}`,
          { type: "json", consistency: "strong" },
        );
        if (bucket && !isArchiveCatalogYear(bucket, year)) {
          throw new Error("The archive catalogue year is invalid.");
        }
        years.set(year, bucket);
      }));
    missingDates = records
      .map(record => record.date)
      .filter(candidateDate => {
        const year = candidateDate.slice(0, 4);
        return !index?.years.includes(year) || !years.get(year)?.dates.includes(candidateDate);
      })
      .sort()
      .reverse();

    await ensureArchiveCatalogDates(store, records.map(record => record.date));
  } catch (error) {
    error.reconciliationScanned = dates.length;
    throw error;
  }
  return {
    scanned: dates.length,
    verified: records.length,
    missingDates,
    repaired: missingDates.length,
    nextCursor: date >= ARCHIVE_RECONCILIATION_START_DATE ? date : null,
  };
}

export async function repairArchiveCatalogPublicRecords(
  store,
  { throughDate, cursor = null, limit = ARCHIVE_RECONCILIATION_LIMIT } = {},
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ARCHIVE_RECONCILIATION_LIMIT) {
    throw new Error("The archive reader-link repair limit is invalid.");
  }
  const firstDate = cursor || throughDate;
  if (!isCalendarDate(firstDate) || !isCalendarDate(throughDate) || firstDate > throughDate) {
    throw new Error("The archive reader-link repair cursor is invalid.");
  }
  const invalid = [];
  let scanned = 0;
  let repaired = 0;
  let date = firstDate;
  while (scanned < limit && date >= ARCHIVE_RECONCILIATION_START_DATE) {
    const key = archiveCatalogEditionKey(date);
    let completed = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const withMetadata = typeof store.getWithMetadata === "function"
        ? await store.getWithMetadata(key, { type: "json", consistency: "strong" })
        : null;
      const edition = withMetadata?.data ?? await store.get(
        key,
        { type: "json", consistency: "strong" },
      );
      if (!edition) {
        completed = true;
        break;
      }
      const metadata = structuredClone(edition);
      delete metadata.publicRecord;
      if (!isArchiveCatalogEdition(metadata) || metadata.date !== date) {
        invalid.push({ date, status: "invalid_edition", repaired: false });
        completed = true;
        break;
      }
      const expectedActorSlug = archiveActorSlug(edition);
      const diagnostic = publicArchiveRecordDiagnostic(edition.publicRecord, {
        expectedDate: edition.date,
        expectedActorSlug,
      });
      if (diagnostic.status === "valid") {
        completed = true;
        break;
      }
      const next = {
        ...edition,
        publicRecord: {
          actorPath: `/vibe-atlas/actors/${expectedActorSlug}/`,
          editionPath: `/vibe-atlas/editions/${edition.date}/${expectedActorSlug}/`,
        },
      };
      if (!withMetadata?.etag) {
        throw archiveSafeUpdateUnavailable({ resource: "archive catalogue edition", key });
      }
      const write = await store.setJSON(key, next, { onlyIfMatch: withMetadata.etag });
      if (write?.modified === false) continue;
      const authoritative = await store.get(key, { type: "json", consistency: "strong" });
      if (!isArchiveCatalogEdition(authoritative)
        || JSON.stringify(authoritative.publicRecord) !== JSON.stringify(next.publicRecord)) {
        throw new Error("The archive reader-link repair could not be verified.");
      }
      invalid.push({ date, status: diagnostic.status, repaired: true });
      repaired += 1;
      completed = true;
      break;
    }
    if (!completed) {
      throw new Error("The archive reader links could not be repaired safely after repeated conflicts.");
    }
    scanned += 1;
    date = previousCalendarDate(date);
  }
  return {
    scanned,
    invalid,
    repaired,
    nextCursor: date >= ARCHIVE_RECONCILIATION_START_DATE ? date : null,
  };
}
function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function previousCalendarDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function listArchiveCatalogEditions(store) {
  const index = await store.get(
    ARCHIVE_CATALOG_INDEX_KEY,
    { type: "json", consistency: "strong" },
  );
  if (!index) return [];
  if (!isArchiveCatalogIndex(index)) throw new Error("The archive catalogue index is invalid.");
  const buckets = await Promise.all(index.years.map(async year => {
    const bucket = await store.get(
      `${ARCHIVE_CATALOG_YEAR_PREFIX}${year}`,
      { type: "json", consistency: "strong" },
    );
    if (!isArchiveCatalogYear(bucket, year)) {
      throw new Error("The archive catalogue year is invalid.");
    }
    return bucket.dates;
  }));
  const dates = buckets.flat().sort().reverse();
  const editions = await Promise.all(dates.map(async date => {
    const edition = await store.get(archiveCatalogEditionKey(date), {
      type: "json",
      consistency: "strong",
    });
    if (!isArchiveCatalogEdition(edition) || edition.date !== date) {
      throw new Error("The archive catalogue edition is invalid.");
    }
    return structuredClone(edition);
  }));
  return editions;
}

export async function updateArchiveCatalog(
  store,
  edition,
  _now = () => new Date().toISOString(),
) {
  if (edition && Object.hasOwn(edition, "publicRecord")) {
    assertArchiveEditionPublicRecord(edition);
  }
  if (!isArchiveCatalogEdition(edition)) {
    throw new Error("The archive catalogue edition is invalid.");
  }
  const key = archiveCatalogEditionKey(edition.date);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentWithMetadata = typeof store.getWithMetadata === "function"
      ? await store.getWithMetadata(key, {
        type: "json",
        consistency: "strong",
      })
      : null;
    const current = currentWithMetadata?.data ?? await store.get(
      key,
      { type: "json", consistency: "strong" },
    );
    if (current && !isArchiveCatalogEdition(current)) {
      throw new Error("The archive catalogue edition is invalid.");
    }
    if (current && JSON.stringify(current) === JSON.stringify(edition)) {
      await ensureArchiveCatalogDate(store, edition.date);
      return current;
    }
    if (current && !currentWithMetadata?.etag) {
      throw archiveSafeUpdateUnavailable({
        resource: "archive catalogue edition",
        key,
      });
    }
    const write = await store.setJSON(
      key,
      edition,
      currentWithMetadata?.etag
        ? { onlyIfMatch: currentWithMetadata.etag }
        : { onlyIfNew: true },
    );
    if (write?.modified === false) continue;
    const authoritative = await store.get(key, {
      type: "json",
      consistency: "strong",
    });
    if (isArchiveCatalogEdition(authoritative)
      && JSON.stringify(authoritative) === JSON.stringify(edition)) {
      await ensureArchiveCatalogDate(store, edition.date);
      return authoritative;
    }
  }
  throw new Error("The archive catalogue edition could not be updated safely.");
}

const canonicalLegendaryMisprints = new Map([
  ["2026-08-04|王鹤棣", {
    title: "The Dylan Wangtermelon incident",
    copy: "The Vibe Pack was asked for Dylan Wang: Variety Show Chaos, examined the evidence, and returned biblically accurate watermelon man.",
  }],
]);

export function enrichCanonicalLegendaryMisprint(edition) {
  const canonical = canonicalLegendaryMisprints.get(`${edition?.date}|${edition?.actorName}`);
  return canonical
    ? {
      ...edition,
      legendaryMisprint: true,
      legendaryMisprintTitle: canonical.title,
      legendaryMisprintCopy: canonical.copy,
    }
    : edition;
}

export function archiveEditionMetadata(payload) {
  if (!payload?.date || !payload?.actorName || !payload?.vibeLabel) return null;
  const legendaryMisprint = (payload.rankedBatches || []).some(batch =>
    batch?.intentionalMisprint === true || (batch?.legendary === true && batch?.misprint === true)
  );
  const publicEdition = publicArchiveEdition(payload);
  return enrichCanonicalLegendaryMisprint({
    ...publicEdition,
    ...(payload.publicRecord ? { publicRecord: publicEdition.publicRecord } : {}),
    ...(legendaryMisprint ? { legendaryMisprint: true } : {}),
  });
}

export function archiveAccessDecision({
  requestedDate,
  editions,
  freeDates = null,
  session = null,
  membership = null,
  enforcementEnabled = true,
  capabilities = null,
}) {
  const publicDates = freeDates instanceof Set ? freeDates : freeArchiveDates(editions);
  if (!enforcementEnabled || publicDates.has(requestedDate)) {
    return { allowed: true, reason: "free_window", capability: "public_archive" };
  }
  if (!session) {
    return { allowed: false, reason: "sign_in", capability: "fandom_collector" };
  }
  if (membership?.status === "active"
    && (capabilities == null || capabilities.includes("fandom_collector"))) {
    return { allowed: true, reason: "active_member", capability: "fandom_collector" };
  }
  if (membership?.status === "past_due" || membership?.status === "incomplete") {
    return { allowed: false, reason: "billing_delay", capability: "fandom_collector" };
  }
  return { allowed: false, reason: "upgrade", capability: "fandom_collector" };
}

export function publicArchiveEdition(payload, { isFree = false } = {}) {
  const previewResults = Array.isArray(payload?.displayResults) && payload.displayResults.length
    ? payload.displayResults
    : (payload?.rankedBatches || []).flatMap(batch => batch?.results || []);
  const publicRecord = publicArchiveRecord(payload?.publicRecord);
  return {
    date: payload?.date,
    actorName: payload?.actorName,
    actorShortNameEn: payload?.actorShortNameEn,
    vibeEmoji: payload?.vibeEmoji,
    vibeLabel: payload?.vibeLabel,
    vibeLabelEn: payload?.vibeLabelEn,
    vibeSubtitleEn: payload?.vibeSubtitleEn,
    generatedAt: payload?.generatedAt,
    previewThumbnails: [...new Set(previewResults
      .map(result => result?.thumbnail)
      .filter(thumbnail => typeof thumbnail === "string" && thumbnail.length > 0))]
      .slice(0, 3),
    access: isFree ? "free" : "member",
    ...(publicRecord ? { publicRecord } : {}),
  };
}

export function archiveReaderLinkDiagnostic(payload) {
  return publicArchiveRecordDiagnostic(payload?.publicRecord);
}

function archiveSafeUpdateUnavailable({ resource, key }) {
  console.error("[archive-publication] safe-update support unavailable", {
    code: ARCHIVE_SAFE_UPDATE_UNAVAILABLE,
    resource,
    key,
  });
  const error = new Error(
    `The ${resource} could not be updated safely because storage did not provide a revision tag.`,
  );
  error.code = ARCHIVE_SAFE_UPDATE_UNAVAILABLE;
  return error;
}

function assertArchiveEditionPublicRecord(edition) {
  return assertPublicArchiveRecord(edition.publicRecord, {
    expectedDate: edition.date,
    expectedActorSlug: archiveActorSlug(edition),
  });
}

export async function listArchiveCatalogPage(
  store,
  { cursor = null, limit, throughDate },
) {
  let index = await store.get(
    ARCHIVE_CATALOG_INDEX_KEY,
    { type: "json", consistency: "strong" },
  );
  if (!index) return { editions: [], total: 0, hasMore: false };
  if (!isArchiveCatalogIndex(index)) throw new Error("The archive catalogue index is invalid.");
  index = await archiveCatalogIndexWithCounts(store, index);

  const throughYear = throughDate.slice(0, 4);
  const buckets = new Map();
  const readBucket = async year => {
    if (buckets.has(year)) return buckets.get(year);
    const bucket = await store.get(
      `${ARCHIVE_CATALOG_YEAR_PREFIX}${year}`,
      { type: "json", consistency: "strong" },
    );
    if (!isArchiveCatalogYear(bucket, year)) {
      throw new Error("The archive catalogue year is invalid.");
    }
    buckets.set(year, bucket);
    return bucket;
  };
  let total = index.years.reduce((sum, year) => {
    if (year < throughYear) return sum + index.yearCounts[year];
    return sum;
  }, 0);
  if (index.years.includes(throughYear)) {
    const currentBucket = await readBucket(throughYear);
    total += currentBucket.dates.filter(date => date <= throughDate).length;
  }
  const dates = [];
  for (const year of index.years) {
    if (year > throughYear || (cursor && year > cursor.slice(0, 4))) continue;
    if (dates.length > limit && year < dates.at(-1).slice(0, 4)) break;
    const bucket = await readBucket(year);
    dates.push(...bucket.dates.filter(date =>
      date <= throughDate && (!cursor || date < cursor)));
  }
  const pageDates = dates.slice(0, limit);
  const editions = await Promise.all(pageDates.map(async date => {
    const edition = await store.get(archiveCatalogEditionKey(date), {
      type: "json",
      consistency: "strong",
    });
    if (!isArchiveCatalogEdition(edition) || edition.date !== date) {
      throw new Error("The archive catalogue edition is invalid.");
    }
    return structuredClone(edition);
  }));
  return { editions, total, hasMore: dates.length > pageDates.length };
}
