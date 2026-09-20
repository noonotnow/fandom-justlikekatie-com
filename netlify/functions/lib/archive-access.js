import { publicArchiveRecord } from "../../../src/contracts/publicArchiveRecord.js";

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
      throw new Error(
        "The archive access window could not be updated safely because storage did not provide a revision tag.",
      );
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
  return isArchiveCatalog({
    schemaVersion: 1,
    catalogVersion: ARCHIVE_CATALOG_VERSION,
    kind: "vibe-atlas-archive-catalog",
    editions: [edition],
  });
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
      && (index === 0 || years[index - 1].localeCompare(year) > 0));
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
      throw new Error(
        "The archive catalogue index could not be updated safely because storage did not provide a revision tag.",
      );
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

async function ensureArchiveCatalogDate(store, date) {
  const year = date.slice(0, 4);
  await ensureArchiveCatalogList(
    store,
    `${ARCHIVE_CATALOG_YEAR_PREFIX}${year}`,
    value => isArchiveCatalogYear(value, year),
    current => ({
      schemaVersion: 1,
      catalogVersion: ARCHIVE_CATALOG_EDITION_VERSION,
      kind: "vibe-atlas-archive-catalog-year",
      year,
      dates: [...new Set([date, ...(current?.dates || [])])].sort().reverse(),
    }),
  );
  await ensureArchiveCatalogList(
    store,
    ARCHIVE_CATALOG_INDEX_KEY,
    isArchiveCatalogIndex,
    current => ({
      schemaVersion: 1,
      catalogVersion: ARCHIVE_CATALOG_EDITION_VERSION,
      kind: "vibe-atlas-archive-catalog-index",
      years: [...new Set([year, ...(current?.years || [])])].sort().reverse(),
    }),
  );
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
      throw new Error(
        "The archive catalogue edition could not be updated safely because storage did not provide a revision tag.",
      );
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

export function archiveEditionMetadata(payload) {
  const canonicalLegendaryMisprints = new Map([
    ["2026-08-04|王鹤棣", "The Dylan Wangtermelon incident"],
  ]);
  if (!payload?.date || !payload?.actorName || !payload?.vibeLabel) return null;
  const legendaryMisprint = (payload.rankedBatches || []).some(batch =>
    batch?.intentionalMisprint === true || (batch?.legendary === true && batch?.misprint === true)
  );
  const canonicalMisprintTitle =
    canonicalLegendaryMisprints.get(`${payload.date}|${payload.actorName}`);
  const publicEdition = publicArchiveEdition(payload);
  return {
    ...publicEdition,
    ...(payload.publicRecord ? { publicRecord: publicEdition.publicRecord } : {}),
    ...(legendaryMisprint || canonicalMisprintTitle ? { legendaryMisprint: true } : {}),
    ...(canonicalMisprintTitle ? { legendaryMisprintTitle: canonicalMisprintTitle } : {}),
  };
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
