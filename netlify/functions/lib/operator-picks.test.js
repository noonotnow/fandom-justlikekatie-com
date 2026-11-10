import test from "node:test";
import assert from "node:assert/strict";
import { auditFeedbackKey, auditRunKey } from "./actor-eligibility.js";
import {
  mergeCalibrationWithPicks,
  operatorPicksProfileFromRuns,
  readOperatorPicksProfile,
} from "./operator-picks.js";

function memoryStore(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async list({ prefix = "" } = {}) {
      return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
  };
}

const pick = (candidateId, intent, { flagged = true, createdAt = "2026-11-01T00:00:00Z", source = "weibo.com", query = "q1", runId = "run-1" } = {}) => ({
  eventId: `${candidateId}-${createdAt}`, candidateId, intent, flagged, createdAt, runId,
  candidate: { source, query },
});

const pool = [
  ...Array.from({ length: 4 }, (_, i) => ({ candidateId: `w${i}`, source: "weibo.com", query: "q1" })),
  ...Array.from({ length: 12 }, (_, i) => ({ candidateId: `o${i}`, source: `other-${i}.com`, query: "q2" })),
];

test("picks become calibration: ids, hero, excludes, and over-represented sources", () => {
  const profile = operatorPicksProfileFromRuns([{
    runId: "run-1",
    pool,
    receipts: [
      pick("w0", "hero"),
      pick("w1", "pin"),
      pick("w2", "supporting"),
      pick("o0", "exclude", { source: "other-0.com", query: "q2" }),
    ],
  }]);
  assert.deepEqual(profile.positiveCandidateIds, ["w0", "w1", "w2"]);
  assert.deepEqual(profile.heroCandidateIds, ["w0"]);
  assert.deepEqual(profile.negativeCandidateIds, ["o0"]);
  // Weibo is 25% of the pool but 100% of positive picks.
  assert.deepEqual(profile.positiveSources, ["weibo.com"]);
  assert.deepEqual(profile.positiveQueries, ["q1"]);
  assert.equal(profile.evidenceCount, 1);
  assert.equal(profile.pickCount, 4);
});

test("a source picked in proportion to what the run offered is not a preference", () => {
  const evenPool = Array.from({ length: 10 }, (_, i) => ({ candidateId: `e${i}`, source: i < 5 ? "weibo.com" : "douban.com" }));
  const profile = operatorPicksProfileFromRuns([{
    runId: "run-1",
    pool: evenPool,
    receipts: [pick("e0", "pin"), pick("e5", "pin", { source: "douban.com" })],
  }]);
  assert.deepEqual(profile.positiveSources, []);
});

test("the latest receipt per image wins and unflagging removes a pick", () => {
  const profile = operatorPicksProfileFromRuns([{
    runId: "run-1",
    pool,
    receipts: [
      pick("w0", "pin", { createdAt: "2026-11-01T00:00:00Z" }),
      pick("w0", "pin", { flagged: false, createdAt: "2026-11-02T00:00:00Z" }),
      pick("w1", "pin", { createdAt: "2026-11-01T00:00:00Z" }),
      pick("w1", "hero", { createdAt: "2026-11-03T00:00:00Z" }),
    ],
  }]);
  assert.deepEqual(profile.positiveCandidateIds, ["w1"]);
  assert.deepEqual(profile.heroCandidateIds, ["w1"]);
  assert.equal(operatorPicksProfileFromRuns([{ runId: "r", pool, receipts: [] }]), null);
});

test("reads receipts across recent runs from the audit store", async () => {
  const store = memoryStore({
    [auditFeedbackKey("liu", 0, "run-1", "e1")]: pick("w0", "hero", { runId: "run-1" }),
    [auditFeedbackKey("liu", 0, "run-2", "e2")]: pick("w1", "pin", { runId: "run-2", createdAt: "2026-11-05T00:00:00Z" }),
    [auditFeedbackKey("liu", 1, "run-9", "e3")]: pick("x", "pin", { runId: "run-9" }),
    [auditRunKey("liu", 0, "run-1")]: { rawResults: pool },
    [auditRunKey("liu", 0, "run-2")]: { rawResults: pool },
  });
  const profile = await readOperatorPicksProfile(store, "liu", 0);
  assert.deepEqual(profile.positiveCandidateIds, ["w0", "w1"]);
  assert.equal(profile.evidenceCount, 2);
  assert.equal(await readOperatorPicksProfile(memoryStore(), "liu", 0), null);
  assert.equal(await readOperatorPicksProfile({
    get: async () => null,
    list: async () => { throw new Error("outage"); },
  }, "liu", 0), null);
});

test("merging keeps the approved profile intact and unions pick evidence", () => {
  const base = Object.freeze({
    calibrationVersion: 7,
    evidenceCount: 2,
    positiveCandidateIds: Object.freeze(["a"]),
    positiveSources: Object.freeze(["douban.com"]),
    rankingWins: { a: 2 },
  });
  const picks = operatorPicksProfileFromRuns([{ runId: "r", pool, receipts: [pick("w0", "hero"), pick("w1", "pin")] }]);
  const merged = mergeCalibrationWithPicks(base, picks);
  assert.equal(merged.calibrationVersion, 7);
  assert.equal(merged.evidenceCount, 3);
  assert.deepEqual(merged.positiveCandidateIds, ["a", "w0", "w1"]);
  assert.deepEqual(merged.positiveSources, ["douban.com", "weibo.com"]);
  assert.deepEqual(merged.rankingWins, { a: 2 });
  assert.deepEqual(merged.operatorPicks, { version: "operator-picks-v1", runCount: 1, pickCount: 2 });
  assert.deepEqual(base.positiveCandidateIds, ["a"]);
  assert.equal(mergeCalibrationWithPicks(base, null), base);
  assert.equal(mergeCalibrationWithPicks(null, picks).calibrationVersion, "operator-picks-v1");
});
