import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const SITE = "38f9d839-c6dd-4b26-844f-54d8d00d045b";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const nullable = check => value => value === null || check(value);
const number = value => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const integer = value => number(value) && Number.isInteger(value);
const bool = value => typeof value === "boolean";
const enumeration = values => value => values.includes(value);
const id = value => typeof value === "string" && UUID.test(value);
const hash = value => typeof value === "string" && HASH.test(value);
const shared = {
  schemaVersion: value => value === 1,
  processId: id, requestId: id,
  event: enumeration(["archive_inventory_request", "archive_scan_chunk"]),
  requestKind: enumeration(["directory", "page", "edition", "invalid"]),
  traffic: enumeration(["marked_test", "unmarked"]),
  startedAt: integer, endedAt: integer, elapsedMs: number,
  manifestReadAttempts: integer, droppedRecordsSinceLastEmit: integer,
};
const request = {
  filtered: bool, httpStatus: nullable(value => Number.isInteger(value) && value >= 100 && value <= 599),
  outcome: enumeration(["ok", "exception", "http_error"]),
  coalescedWaitMs: number, workReferencesTruncated: bool,
};
const chunk = {
  workId: id, candidateFingerprint: hash, candidateCount: integer,
  generationHash: nullable(hash), chunkIdentity: nullable(hash),
  snapshotInitialOutcome: nullable(enumeration([
    "missing", "changed", "expired", "invalid", "partial_exhausted", "complete", "progress", "unavailable",
  ])),
  snapshotOutcome: nullable(enumeration([
    "missing", "changed", "expired", "invalid", "partial_exhausted", "complete", "progress", "unavailable",
  ])),
  source: enumeration(["verification", "snapshot"]),
  outcome: enumeration(["verified", "refreshing", "partial", "error"]),
  startOffset: nullable(integer), progressEndOffset: nullable(integer), attemptedEndOffset: nullable(integer),
  scanStartedAt: nullable(integer), scanEndedAt: nullable(integer), scanEndKnown: bool,
  manifestScanElapsedMs: number,
  casOutcome: enumeration(["not_attempted", "modified", "not_modified", "unknown", "error"]),
  casElapsedMs: number, cacheAvailable: nullable(bool), unavailableCount: nullable(integer),
  verifiedCandidateCount: nullable(integer), hasMore: nullable(bool),
  storageUnavailable: nullable(bool), restart: nullable(bool),
};

// Copy only typed fields. Never preserve raw messages, URLs, errors or arbitrary strings.
export function sanitizeRecord(value) {
  if (!value || typeof value !== "object") return null;
  const validators = { ...shared, ...(value.event === "archive_inventory_request" ? request : chunk) };
  const safe = {};
  for (const [key, valid] of Object.entries(validators)) {
    if (!valid(value[key])) return null;
    safe[key] = value[key];
  }
  if (value.event === "archive_inventory_request") {
    if (!Array.isArray(value.works) || value.works.length > 4) return null;
    safe.works = [];
    for (const work of value.works) {
      if (!work || !id(work.workId) || !["owner", "joiner"].includes(work.role)) return null;
      safe.works.push({ workId: work.workId, role: work.role });
    }
  }
  if (safe.endedAt < safe.startedAt) return null;
  return safe;
}

export function extractRecords(entries) {
  const records = new Map();
  let rejectedRecords = 0, unstructuredLines = 0, duplicateRecords = 0;
  for (const entry of entries) {
    if (typeof entry.message !== "string") { unstructuredLines++; continue; }
    for (const line of entry.message.split("\n").filter(line => line.trim())) {
      let value;
      try { value = JSON.parse(line); } catch { unstructuredLines++; continue; }
      if (!["archive_inventory_request", "archive_scan_chunk"].includes(value?.event)) {
        unstructuredLines++; continue;
      }
      const safe = sanitizeRecord(value);
      if (!safe) { rejectedRecords++; continue; }
      const key = `${safe.event}:${safe.processId}:${safe.requestId}:${safe.workId ?? ""}`;
      if (records.has(key)) {
        if (JSON.stringify(records.get(key)) !== JSON.stringify(safe)) {
          throw new Error("Conflicting diagnostic identities");
        }
        duplicateRecords++;
      } else records.set(key, safe);
    }
  }
  return {
    records: [...records.values()].sort((a, b) => a.startedAt - b.startedAt),
    rejectedRecords, unstructuredLines, duplicateRecords,
  };
}

export function coverageSummary(records) {
  const key = record => `${record.processId}:${record.workId}`;
  const chunks = new Map(records.filter(r => r.event === "archive_scan_chunk").map(r => [key(r), r]));
  const owners = new Set();
  let missingChunkReferences = 0;
  for (const r of records.filter(r => r.event === "archive_inventory_request")) {
    for (const work of r.works) {
      const identity = `${r.processId}:${work.workId}`;
      if (work.role === "owner") owners.add(identity);
      if (!chunks.has(identity)) missingChunkReferences++;
    }
  }
  return {
    missingChunkReferences,
    chunksWithoutOwnerSummary: [...chunks.keys()].filter(k => !owners.has(k)).length,
    unknownScanEnds: [...chunks.values()].filter(r => r.scanEndKnown === false).length,
    truncatedWorkReferences: records.filter(r => r.workReferencesTruncated === true).length,
    reportedSuppressedRecords: records.reduce((n, r) => n + r.droppedRecordsSinceLastEmit, 0),
  };
}

async function getJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "GET", headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Provider read failed (HTTP ${response.status})`);
  // Provider body and errors are deliberately never logged.
  try { return await response.json(); } catch { throw new Error("Provider returned invalid JSON"); }
}

function deploySummary(deploy) {
  if (!deploy || !/^[a-f0-9]{24}$/.test(deploy.id)
    || (deploy.commit_ref != null && !/^[a-f0-9]{40}$/.test(deploy.commit_ref))
    || !Number.isFinite(Date.parse(deploy.published_at))) {
    throw new Error("Invalid published deployment metadata");
  }
  return { deployId: deploy.id, commit: deploy.commit_ref ?? null, publishedAt: deploy.published_at };
}

export async function capture({ token, from, to, fetchImpl = fetch, maxPages = 100 }) {
  if (!token) throw new Error("A Netlify log-reading credential is required");
  if (!integer(from) || !integer(to) || from >= to || to - from > 22 * 3600_000) {
    throw new Error("Export window must be positive and no longer than 22 hours");
  }
  const siteUrl = `https://api.netlify.com/api/v1/sites/${SITE}`;
  const before = deploySummary((await getJson(siteUrl, token, fetchImpl)).published_deploy);
  const entries = [], cursors = new Set();
  let cursor, pages = 0;
  do {
    if (++pages > maxPages) throw new Error("Log pagination limit exceeded");
    const url = new URL(`https://analytics.services.netlify.com/v2/sites/${SITE}/function_logs/public-archive-inventory`);
    url.searchParams.set("from", String(from)); url.searchParams.set("to", String(to));
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = await getJson(url, token, fetchImpl);
    if (!Array.isArray(body.logs) || (body.pagination != null && typeof body.pagination !== "object")) {
      throw new Error("Invalid log response");
    }
    entries.push(...body.logs);
    if (entries.length > 100_000) throw new Error("Log entry limit exceeded");
    cursor = body.pagination?.next;
    if (cursor != null && (typeof cursor !== "string" || !cursor || cursors.has(cursor))) {
      throw new Error("Invalid or repeated log cursor");
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);
  // Keep production release boundaries, including the last release before the window.
  const deployments = [];
  let boundaryFound = false;
  let previousRelease = null;
  for (let page = 1; page <= 20 && !boundaryFound; page++) {
    const list = await getJson(`${siteUrl}/deploys?per_page=100&page=${page}`, token, fetchImpl);
    if (!Array.isArray(list)) throw new Error("Invalid deployment list");
    for (const deploy of list) {
      if (deploy.context !== "production" || deploy.state !== "ready" || !deploy.published_at) continue;
      const summary = deploySummary(deploy);
      if (Date.parse(summary.publishedAt) > from) deployments.push(summary);
      else {
        boundaryFound = true;
        if (!previousRelease || Date.parse(summary.publishedAt) > Date.parse(previousRelease.publishedAt)) {
          previousRelease = summary;
        }
      }
    }
    if (list.length < 100) break;
  }
  if (!boundaryFound) throw new Error("Deployment history does not cover the export window");
  deployments.push(previousRelease);
  deployments.sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  const after = deploySummary((await getJson(siteUrl, token, fetchImpl)).published_deploy);
  const parsed = extractRecords(entries);
  return {
    metadata: {
      queriedFrom: new Date(from).toISOString(), queriedTo: new Date(to).toISOString(),
      capturedAt: new Date().toISOString(), pages, providerEntries: entries.length,
      rejectedRecords: parsed.rejectedRecords, unstructuredLines: parsed.unstructuredLines,
      duplicateRecords: parsed.duplicateRecords, paginationComplete: true,
      coverageCertified: false,
      deliveryCaveat: "Pagination is complete; retention, indexing delay and provider truncation remain unknown.",
      activeDeployBefore: before, activeDeployAfter: after, deployments,
      ...coverageSummary(parsed.records),
    },
    records: parsed.records,
  };
}

export async function main(env = process.env) {
  const now = Date.now();
  if (env.ARCHIVE_SCAN_CAPTURE_UNTIL) {
    const until = Date.parse(env.ARCHIVE_SCAN_CAPTURE_UNTIL);
    if (!Number.isFinite(until)) throw new Error("Invalid capture stop date");
    if (now >= until) { console.log("Capture period has ended; no provider calls made."); return; }
    if (until - now > 16 * 24 * 3600_000) throw new Error("Capture stop date must be within 16 days");
  } else if (env.GITHUB_ACTIONS === "true") {
    throw new Error("Set ARCHIVE_SCAN_CAPTURE_UNTIL before activating capture");
  }
  // Allow historical indexing to settle; overlapping captures recover delayed lines.
  const to = now - 15 * 60_000;
  const output = await capture({ token: env.NETLIFY_ARCHIVE_LOG_READ_TOKEN ?? env.NETLIFY_AUTH_TOKEN,
    from: to - 22 * 3600_000, to });
  const file = resolve(env.ARCHIVE_SCAN_EXPORT_PATH ?? "scan-exports/archive-scans.json");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    records: output.records.length, pages: output.metadata.pages,
    rejectedRecords: output.metadata.rejectedRecords, coverageCertified: false,
  }));
  if (output.metadata.rejectedRecords > 0) throw new Error("Diagnostic schema rejection; inspect sanitized receipt");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    // Only local fixed errors escape; never echo provider payloads or fetch errors.
    const safe = /^(Provider |Invalid |Export |Log |Deployment |Diagnostic |A Netlify |Set ARCHIVE_|Capture stop)/;
    console.error(safe.test(error.message) ? error.message : "Archive scan export failed");
    process.exitCode = 1;
  });
}
