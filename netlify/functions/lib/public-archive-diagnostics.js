import { createHash, randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const PROCESS_ID = randomUUID();
const SNAPSHOT_OUTCOMES = new Set([
  "missing", "changed", "expired", "invalid", "partial_exhausted",
  "complete", "progress", "unavailable",
]);
const OUTCOMES = new Set(["verified", "refreshing", "partial", "error"]);
const hash = value => createHash("sha256").update(value).digest("hex");
const elapsed = (clock, start) => Math.max(0, Math.round((clock() - start) * 100) / 100);

/**
 * Server-only, bounded operational logs. No request values, storage bodies,
 * provider errors, or reader identifiers are serialized. Logging is best-effort:
 * suppressed records and missing provider coverage must not be treated as zero work.
 */
export function createArchiveDiagnosticsFactory({
  emit = line => console.info(line),
  epochNow = Date.now,
  monotonicNow = () => performance.now(),
  maxRecordsPerMinute = 600,
} = {}) {
  let window = -1;
  let emitted = 0;
  let dropped = 0;
  const cap = Number.isInteger(maxRecordsPerMinute) && maxRecordsPerMinute > 0
    ? Math.min(maxRecordsPerMinute, 600) : 600;

  function write(record) {
    try {
      const currentWindow = Math.floor(epochNow() / 60_000);
      if (currentWindow !== window) {
        window = currentWindow;
        emitted = 0;
      }
      if (emitted >= cap) {
        dropped += 1;
        return;
      }
      emitted += 1;
      emit(JSON.stringify({
        schemaVersion: 1,
        processId: PROCESS_ID,
        ...record,
        droppedRecordsSinceLastEmit: dropped,
      }));
      dropped = 0;
    } catch {
      // Diagnostics never change inventory availability or publication authority.
      dropped += 1;
    }
  }

  return request => {
    const requestId = randomUUID();
    const start = monotonicNow();
    const startedAt = epochNow();
    let kind = "invalid";
    let filtered = false;
    try {
      const url = new URL(request.url);
      kind = url.searchParams.has("date") ? "edition"
        : url.searchParams.get("directory") === "actors" ? "directory" : "page";
      filtered = url.searchParams.has("actorId");
    } catch { /* Only the fixed invalid category is retained. */ }
    const traffic = request.headers?.get?.("x-vibe-atlas-archive-test") === "1"
      ? "marked_test" : "unmarked";
    const works = [];
    let workReferencesTruncated = false;
    let manifestReadAttempts = 0;
    let coalescedWaitMs = 0;
    let finished = false;
    const identity = { requestId, requestKind: kind, traffic };

    return {
      manifestRead() { manifestReadAttempts += 1; },
      work(workId, role) {
        if (works.length < 4) works.push({ workId, role });
        else workReferencesTruncated = true;
      },
      join(workId) {
        this.work(workId, "joiner");
        const joinedAt = monotonicNow();
        return () => { coalescedWaitMs += elapsed(monotonicNow, joinedAt); };
      },
      beginChunk(workId, fingerprint, candidateCount) {
        const chunkStart = monotonicNow();
        const record = {
          event: "archive_scan_chunk", ...identity, workId,
          candidateFingerprint: fingerprint,
          candidateCount, generationHash: null,
          startedAt: epochNow(), snapshotInitialOutcome: null,
          snapshotOutcome: null, source: "snapshot",
          outcome: "error", startOffset: null, progressEndOffset: null,
          attemptedEndOffset: null, manifestReadAttempts: 0,
          scanStartedAt: null, scanEndedAt: null, scanEndKnown: true,
          manifestScanElapsedMs: 0, casOutcome: "not_attempted", casElapsedMs: 0,
          cacheAvailable: null, unavailableCount: null, verifiedCandidateCount: null,
          hasMore: null, storageUnavailable: null, restart: null,
        };
        let scanStart = null;
        let casStart = null;
        let chunkFinished = false;
        return {
          snapshot(outcome) {
            const safe = SNAPSHOT_OUTCOMES.has(outcome) ? outcome : "invalid";
            record.snapshotInitialOutcome ??= safe;
            record.snapshotOutcome = safe;
          },
          generation(value) {
            // Stored generation is not trusted log content, even on a valid snapshot.
            record.generationHash = typeof value === "string" && value.length <= 512
              ? hash(value) : null;
          },
          scanRead(offset) {
            record.source = "verification";
            if (scanStart === null) {
              scanStart = monotonicNow();
              record.scanStartedAt = epochNow();
              record.startOffset = offset;
              record.scanEndKnown = false;
            }
            record.manifestReadAttempts += 1;
            record.attemptedEndOffset = offset + 1;
          },
          scanFinished(progressEndOffset) {
            record.progressEndOffset = progressEndOffset;
            if (scanStart !== null) {
              record.scanEndedAt = epochNow();
              record.manifestScanElapsedMs = elapsed(monotonicNow, scanStart);
              record.scanEndKnown = true;
            }
          },
          casStart() { casStart = monotonicNow(); },
          casFinished(result) {
            record.casElapsedMs = elapsed(monotonicNow, casStart);
            record.casOutcome = result?.modified === true ? "modified"
              : result?.modified === false ? "not_modified" : "unknown";
          },
          casError() {
            record.casElapsedMs = elapsed(monotonicNow, casStart);
            record.casOutcome = "error";
          },
          outcome(value) { record.outcome = OUTCOMES.has(value) ? value : "error"; },
          result(inventory, page) {
            record.source = inventory.source === "verification" ? "verification" : "snapshot";
            record.cacheAvailable = inventory.cacheAvailable === true;
            record.unavailableCount = page.unavailableCount;
            record.verifiedCandidateCount = inventory.verifiedCandidates;
            record.hasMore = page.hasMore === true;
            record.storageUnavailable = page.unavailable === true;
            record.restart = inventory.restart === true;
          },
          finish() {
            if (chunkFinished) return;
            chunkFinished = true;
            // A rejecting Promise.all can leave sibling reads unsettled. Its observed
            // end is not proof of their completion; scanEndKnown remains false.
            if (scanStart !== null && !record.scanEndKnown) {
              record.scanEndedAt = epochNow();
              record.manifestScanElapsedMs = elapsed(monotonicNow, scanStart);
            }
            write({
              ...record, endedAt: epochNow(),
              chunkIdentity: record.startOffset === null ? null : hash(JSON.stringify([
                fingerprint, record.startOffset, record.attemptedEndOffset,
              ])),
              elapsedMs: elapsed(monotonicNow, chunkStart),
            });
          },
        };
      },
      finish(statusCode) {
        if (finished) return;
        finished = true;
        write({
          event: "archive_inventory_request", ...identity, filtered,
          startedAt, endedAt: epochNow(), elapsedMs: elapsed(monotonicNow, start),
          httpStatus: Number.isInteger(statusCode) ? statusCode : null,
          outcome: statusCode === undefined ? "exception"
            : statusCode >= 400 ? "http_error" : "ok",
          manifestReadAttempts, coalescedWaitMs, works, workReferencesTruncated,
        });
      },
    };
  };
}