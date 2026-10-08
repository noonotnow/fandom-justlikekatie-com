import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createArchiveDiagnosticsFactory } from "../netlify/functions/lib/public-archive-diagnostics.js";
import { sanitizeRecord, extractRecords, coverageSummary, capture, main } from "./export-public-archive-scans.js";

const id = "12345678-1234-1234-1234-123456789abc";
const hash = "a".repeat(64);
function fixture() {
  const lines = [];
  const d = createArchiveDiagnosticsFactory({ emit: line => lines.push(line) })({ kind: "directory", traffic: "marked_test", filtered: false });
  d.work(id, "owner");
  const c = d.beginChunk(id, hash, 2);
  c.snapshot("missing"); c.generation(id);
  c.scanRead(0); c.scanRead(1); c.scanFinished(2);
  c.casStart(); c.casFinished({ modified: false }); c.outcome("partial");
  c.result({ source: "verification", cacheAvailable: true, verifiedCandidates: 2 },
    { unavailableCount: 1, hasMore: false });
  c.finish(); d.manifestRead(); d.manifestRead(); d.finish(200);
  return lines.map(JSON.parse);
}
test("real schema is accepted, with only typed allowlisted values retained", () => {
  for (const record of fixture()) {
    const safe = sanitizeRecord({ ...record, url: "SECRET", member: "SECRET", error: "SECRET" });
    assert.deepEqual(safe, record);
    assert.doesNotMatch(JSON.stringify(safe), /SECRET/);
  }
});
test("untrusted strings cannot enter hashes, IDs, enums, numbers or nested works", () => {
  const [chunk, request] = fixture();
  for (const key of ["processId", "generationHash", "candidateFingerprint", "source", "casOutcome", "manifestReadAttempts"]) {
    assert.equal(sanitizeRecord({ ...chunk, [key]: "private@example.com" }), null, key);
  }
  assert.equal(sanitizeRecord({ ...request, schemaVersion: 2 }), null);
  assert.equal(sanitizeRecord({ ...request, works: [{ workId: "private", role: "owner" }] }), null);
  assert.equal(sanitizeRecord({ ...request, works: Array(5).fill({ workId: id, role: "owner" }) }), null);
  assert.equal(sanitizeRecord({ ...chunk, elapsedMs: Infinity }), null);
});
test("multiline provider entries, duplicates, malformed and non-diagnostic lines", () => {
  const records = fixture();
  const parsed = extractRecords([
    { message: records.map(JSON.stringify).join("\n") + "\nDuration: 300ms\nbroken{\"event\":\"archive_scan_chunk\"" },
    { message: JSON.stringify(records[0]) },
    { message: JSON.stringify({ ...records[1], processId: "SECRET" }) },
    { message: {} },
  ]);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.duplicateRecords, 1);
  assert.equal(parsed.rejectedRecords, 1);
  assert.equal(parsed.unstructuredLines, 3);
  assert.throws(() => extractRecords([
    { message: JSON.stringify(records[0]) },
    { message: JSON.stringify({ ...records[0], manifestReadAttempts: 3 }) },
  ]), /Conflicting/);
});
test("coverage is explicit for missing owners/chunks, unknown ends, truncation and suppression", () => {
  const [c, r] = fixture();
  assert.equal(coverageSummary([c, r]).missingChunkReferences, 0);
  assert.equal(coverageSummary([r]).missingChunkReferences, 1);
  assert.equal(coverageSummary([c]).chunksWithoutOwnerSummary, 1);
  assert.deepEqual(coverageSummary([
    { ...c, scanEndKnown: false, droppedRecordsSinceLastEmit: 3 },
    { ...r, workReferencesTruncated: true },
  ]), { missingChunkReferences: 0, chunksWithoutOwnerSummary: 0,
    unknownScanEnds: 1, truncatedWorkReferences: 1, reportedSuppressedRecords: 3 });
});

const deploy = { id: "a".repeat(24), commit_ref: "b".repeat(40),
  published_at: "2026-10-08T00:00:00Z", context: "production", state: "ready" };
function provider(logResponses) {
  const calls = [];
  let index = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    assert.equal(options.method, "GET");
    let body;
    if (String(url).includes("function_logs")) body = logResponses[index++];
    else if (String(url).includes("/deploys?")) body = [deploy];
    else body = { published_deploy: deploy };
    return { ok: true, json: async () => body };
  };
  return { calls, fetchImpl };
}
const from = Date.parse("2026-10-08T01:00:00Z"), to = from + 3600_000;
test("paginates without deploy filtering and retains deployment boundaries, never raw entries", async () => {
  const [c, r] = fixture();
  const p = provider([{ logs: [{ message: JSON.stringify(c), request_id: "SECRET" }], pagination: { next: "next" } },
    { logs: [{ message: JSON.stringify(r) }] }]);
  const output = await capture({ token: "secret", from, to, fetchImpl: p.fetchImpl });
  assert.equal(output.metadata.pages, 2);
  assert.equal(output.metadata.coverageCertified, false);
  assert.equal(output.metadata.paginationComplete, true);
  assert.equal(output.metadata.deployments.length, 1);
  assert.equal(output.records.length, 2);
  assert.doesNotMatch(JSON.stringify(output), /SECRET|secret|request_id/);
  assert.equal(p.calls.length, 5);
  assert(p.calls.every(c => !c.url.includes("deploy_id=")));
});
test("empty log windows are recorded as unknown coverage, not evidence of no traffic", async () => {
  const output = await capture({ token: "secret", from, to, fetchImpl: provider([{ logs: [] }]).fetchImpl });
  assert.equal(output.records.length, 0);
  assert.equal(output.metadata.coverageCertified, false);
});
test("manual deployments with no source revision retain an explicit unknown", async () => {
  const p = provider([{ logs: [] }]);
  const fetchImpl = async (url, options) => {
    if (String(url).includes("/deploys?")) return {
      ok: true, json: async () => [{ ...deploy, commit_ref: null }],
    };
    return p.fetchImpl(url, options);
  };
  const output = await capture({ token: "secret", from, to, fetchImpl });
  assert.equal(output.metadata.deployments[0].commit, null);
});
test("malformed, repeated, capped and failed provider reads fail closed", async () => {
  for (const responses of [
    [{ nope: [] }],
    [{ logs: [], pagination: { next: "again" } }, { logs: [], pagination: { next: "again" } }],
  ]) await assert.rejects(capture({ token: "secret", from, to, fetchImpl: provider(responses).fetchImpl }));
  await assert.rejects(capture({ token: "secret", from, to, maxPages: 1,
    fetchImpl: provider([{ logs: [], pagination: { next: "more" } }]).fetchImpl }), /limit/);
  await assert.rejects(capture({ token: "secret", from, to,
    fetchImpl: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
  await assert.rejects(capture({ token: "secret", from, to,
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error("SECRET"); } }) }), /invalid JSON/);
});
test("missing deployment boundary and unbounded windows are refused", async () => {
  await assert.rejects(capture({ token: "secret", from: from - 86400_000, to,
    fetchImpl: provider([{ logs: [] }]).fetchImpl }), /22 hours/);
  await assert.rejects(capture({ token: "", from, to }), /credential/);
  const p = provider([{ logs: [] }]);
  await assert.rejects(capture({ token: "secret", from: Date.parse("2026-10-07T23:00:00Z"), to,
    fetchImpl: p.fetchImpl }), /history/);
});
test("scheduled capture requires a bounded activation date and ends without provider calls", async () => {
  await assert.rejects(main({ GITHUB_ACTIONS: "true" }), /Set ARCHIVE_SCAN_CAPTURE_UNTIL/);
  await assert.rejects(main({ ARCHIVE_SCAN_CAPTURE_UNTIL: "invalid" }), /Invalid/);
  await assert.rejects(main({ ARCHIVE_SCAN_CAPTURE_UNTIL: new Date(Date.now() + 17 * 86400_000).toISOString() }), /16 days/);
  await main({ GITHUB_ACTIONS: "true", ARCHIVE_SCAN_CAPTURE_UNTIL: "2020-01-01T00:00:00Z" });
});
test("workflow is read-only, review gated, twice daily, finite-retention and credential-isolated", () => {
  const yaml = readFileSync(new URL("../.github/workflows/archive-scan-export.yml", import.meta.url), "utf8");
  assert.match(yaml, /cron: "23 5,17 \* \* \*"/);
  assert.match(yaml, /contents: read/);
  assert.match(yaml, /if: vars\.ARCHIVE_SCAN_CAPTURE_UNTIL != ''/);
  assert.match(yaml, /secrets\.NETLIFY_ARCHIVE_LOG_READ_TOKEN/);
  assert.match(yaml, /ref: main/);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /retention-days: 14/);
  assert.doesNotMatch(yaml, /secrets\.REPO_ADMIN_PAT|contents: write|pull_request_target|npm ci|deploy --prod/);
});
