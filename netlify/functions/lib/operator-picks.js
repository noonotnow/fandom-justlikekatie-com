// Operator image picks (pin / hero / supporting / exclude) in Actor Preflight
// as direct calibration evidence for fresh Daily Drop curation.
//
// Previously these picks were only weak preferences for the next audit review
// and reached Daily Drop curation only through an explicitly confirmed rescue
// receipt. They now count immediately, without a separate confirm step:
//   - picked images (and the hero pick) are preferred if search finds them again
//   - excluded images are penalised
//   - sources/queries the operator picks far more often than the run offered
//     them become transferable preferences for new images
//
// This is merged into the calibration profile only at curation time. It never
// changes the eligibility snapshot, its approval hash, or any publication
// gate, and it is subject to the same capped operator-calibration bonus.

import { auditFeedbackKey, auditRunKey } from "./actor-eligibility.js";

export const OPERATOR_PICKS_VERSION = "operator-picks-v1";
export const OPERATOR_PICK_RUN_LIMIT = 5;
export const OPERATOR_PICK_MIN_SIGNAL_PICKS = 2;
export const OPERATOR_PICK_MIN_SHARE_DELTA = 0.15;
const POSITIVE_INTENTS = new Set(["pin", "hero", "supporting"]);

const feedbackRootPrefix = (actorId, vibeIdx) => `feedback/${actorId}/${vibeIdx}/`;

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function runIdFromKey(key, root) {
  const rest = key.slice(root.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  try {
    return decodeURIComponent(rest.slice(0, slash));
  } catch {
    return null;
  }
}

/** Latest receipt per candidate within one run decides that candidate's pick. */
function latestPicks(receipts) {
  const latest = new Map();
  for (const receipt of [...receipts].sort((left, right) =>
    String(left.createdAt || left.recordedAt || "").localeCompare(String(right.createdAt || right.recordedAt || ""))
    || String(left.eventId || "").localeCompare(String(right.eventId || "")))) {
    if (typeof receipt?.candidateId === "string") latest.set(receipt.candidateId, receipt);
  }
  return [...latest.values()].filter(receipt => receipt.flagged === true);
}

function shareDeltas(picked, pool, field) {
  const count = (items) => {
    const counts = new Map();
    for (const item of items) {
      const value = normalize(item?.[field]);
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    return counts;
  };
  const pickedCounts = count(picked);
  const poolCounts = count(pool);
  const deltas = new Map();
  for (const [value, picks] of pickedCounts) {
    const pickShare = picks / Math.max(1, picked.length);
    const poolShare = (poolCounts.get(value) || 0) / Math.max(1, pool.length);
    deltas.set(value, { picks, delta: pickShare - poolShare });
  }
  return deltas;
}

/**
 * Build a calibration-shaped profile from one pairing's recent pick receipts.
 * `runs` is [{ runId, receipts, pool }] where pool is the run's candidates.
 */
export function operatorPicksProfileFromRuns(runs) {
  const positiveIds = new Set();
  const negativeIds = new Set();
  const heroIds = new Set();
  const tallies = { sources: new Map(), queries: new Map() };
  let pickCount = 0;
  let evidenceRuns = 0;
  for (const run of runs) {
    const picks = latestPicks(run.receipts || []);
    if (!picks.length) continue;
    evidenceRuns += 1;
    const positive = picks.filter(pick => POSITIVE_INTENTS.has(pick.intent));
    const negative = picks.filter(pick => pick.intent === "exclude");
    pickCount += positive.length + negative.length;
    positive.forEach(pick => positiveIds.add(pick.candidateId));
    negative.forEach(pick => negativeIds.add(pick.candidateId));
    positive.filter(pick => pick.intent === "hero").forEach(pick => heroIds.add(pick.candidateId));
    const pool = (run.pool || []).length ? run.pool : picks.map(pick => pick.candidate || {});
    const pickedCandidates = positive.map(pick => pick.candidate || {});
    for (const [family, field] of [["sources", "source"], ["queries", "query"]]) {
      for (const [value, { picks: n, delta }] of shareDeltas(pickedCandidates, pool, field)) {
        const tally = tallies[family].get(value) || { picks: 0, deltaSum: 0, runs: 0 };
        tally.picks += n;
        tally.deltaSum += delta;
        tally.runs += 1;
        tallies[family].set(value, tally);
      }
    }
  }
  if (!evidenceRuns) return null;
  const preferred = family => [...tallies[family].entries()]
    .filter(([, tally]) => tally.picks >= OPERATOR_PICK_MIN_SIGNAL_PICKS
      && tally.deltaSum / tally.runs >= OPERATOR_PICK_MIN_SHARE_DELTA)
    .map(([value]) => value)
    .sort();
  // An image both picked and excluded across runs keeps only its latest-run
  // meaning; ambiguous ids are dropped rather than guessed.
  for (const id of [...positiveIds]) {
    if (negativeIds.has(id)) {
      positiveIds.delete(id);
      negativeIds.delete(id);
      heroIds.delete(id);
    }
  }
  return {
    calibrationVersion: OPERATOR_PICKS_VERSION,
    evidenceCount: evidenceRuns,
    pickCount,
    positiveCandidateIds: [...positiveIds].sort(),
    negativeCandidateIds: [...negativeIds].sort(),
    heroCandidateIds: [...heroIds].sort(),
    positiveSources: preferred("sources"),
    negativeSources: [],
    positiveQueries: preferred("queries"),
    negativeQueries: [],
  };
}

/** Read recent pick receipts for a pairing. Returns null on no evidence or failure. */
export async function readOperatorPicksProfile(store, actorId, vibeIdx, {
  runLimit = OPERATOR_PICK_RUN_LIMIT,
} = {}) {
  if (!store?.list || !store?.get || !actorId || !Number.isInteger(vibeIdx)) return null;
  try {
    const root = feedbackRootPrefix(actorId, vibeIdx);
    const listing = await store.list({ prefix: root });
    const byRun = new Map();
    for (const blob of listing?.blobs || []) {
      if (typeof blob?.key !== "string") continue;
      const runId = runIdFromKey(blob.key, root);
      if (!runId) continue;
      if (!byRun.has(runId)) byRun.set(runId, []);
      byRun.get(runId).push(blob.key);
    }
    const runs = await Promise.all([...byRun.entries()].map(async ([runId, keys]) => {
      const receipts = (await Promise.all(keys.map(key =>
        store.get(key, { type: "json", consistency: "strong" }))))
        .filter(receipt => receipt?.candidateId && (!receipt.runId || receipt.runId === runId));
      const latestAt = receipts.reduce((max, receipt) =>
        String(receipt.createdAt || receipt.recordedAt || "") > max
          ? String(receipt.createdAt || receipt.recordedAt || "")
          : max, "");
      return { runId, receipts, latestAt };
    }));
    const recent = runs
      .filter(run => run.receipts.length)
      .sort((left, right) => right.latestAt.localeCompare(left.latestAt) || left.runId.localeCompare(right.runId))
      .slice(0, Math.max(1, runLimit));
    const withPools = await Promise.all(recent.map(async run => {
      const stored = await store.get(auditRunKey(actorId, vibeIdx, run.runId), {
        type: "json",
        consistency: "strong",
      });
      return { ...run, pool: Array.isArray(stored?.rawResults) ? stored.rawResults : [] };
    }));
    return operatorPicksProfileFromRuns(withPools);
  } catch (error) {
    console.warn("Operator picks unavailable; curating without them", {
      actorId,
      vibeIdx,
      message: error?.message || String(error),
    });
    return null;
  }
}

/**
 * Combine the approved (eligibility-bound) calibration profile with operator
 * picks for curation. The approved profile object itself is never mutated.
 */
export function mergeCalibrationWithPicks(base, picks) {
  if (!picks) return base || null;
  const union = (key) => [...new Set([...(base?.[key] || []), ...(picks[key] || [])])];
  return {
    ...(base || {}),
    calibrationVersion: base?.calibrationVersion || picks.calibrationVersion,
    evidenceCount: (base?.evidenceCount || 0) + (picks.evidenceCount || 0),
    positiveCandidateIds: union("positiveCandidateIds"),
    negativeCandidateIds: union("negativeCandidateIds"),
    heroCandidateIds: union("heroCandidateIds"),
    positiveSources: union("positiveSources"),
    negativeSources: union("negativeSources"),
    positiveQueries: union("positiveQueries"),
    negativeQueries: union("negativeQueries"),
    operatorPicks: {
      version: picks.calibrationVersion,
      runCount: picks.evidenceCount,
      pickCount: picks.pickCount,
    },
  };
}

// Exported for tests that need to seed receipts at canonical keys.
export { auditFeedbackKey };
