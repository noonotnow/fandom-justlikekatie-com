import test from "node:test";
import assert from "node:assert/strict";
import { auditMisprintDecisionKey, auditMisprintKey } from "./actor-eligibility.js";
import {
  applyMisprintExclusions,
  isMisprintExcluded,
  misprintDecisionId,
  misprintExclusionProvenance,
  readMisprintExclusions,
} from "./misprint-exclusions.js";

function memoryStore(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async list({ prefix = "" } = {}) {
      return { blobs: [...values.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    },
    set(key, value) { values.set(key, value); },
  };
}

function receipt(id, { scope = "actor_vibe", status = "pending_review", actorId = "liu", vibeIdx = 0, futureExclusion = true } = {}) {
  return {
    receiptId: id,
    status,
    actorId,
    vibeIdx,
    correctionScope: scope,
    futureExclusion,
    candidateId: `cand-${id}`,
    candidate: {
      candidateId: `cand-${id}`,
      thumbnail: `https://img.test/${id}.jpg`,
      publishedThumbnail: `https://media.test/${id}.webp`,
      imageDigest: `digest-${id}`,
      source: "weibo.com",
      link: `https://weibo.com/p/${id}`,
    },
  };
}

function put(store, item, decisions = []) {
  store.set(auditMisprintKey(item.actorId, item.vibeIdx, item.correctionScope, item.receiptId), item);
  for (const [kind, decision] of decisions) {
    const decisionId = misprintDecisionId(item.receiptId, kind);
    store.set(auditMisprintDecisionKey(item.actorId, item.vibeIdx, item.correctionScope, item.receiptId, decisionId), {
      sourceReceiptId: item.receiptId, kind, decision, decisionId, decidedAt: "2026-11-01T00:00:00.000Z",
    });
  }
}

test("only approved, unretracted, exclusion-bearing receipts exclude images", async () => {
  const store = memoryStore();
  put(store, receipt("approved"), [["review", "approved"]]);
  put(store, receipt("pending"));
  put(store, receipt("rejected"), [["review", "rejected"]]);
  put(store, receipt("retracted"), [["review", "approved"], ["retraction", "retracted"]]);
  put(store, receipt("trusted", { status: "active" }));
  put(store, receipt("duplicate", { futureExclusion: false, status: "active" }));
  const exclusions = await readMisprintExclusions(store, "liu", 0);
  assert.deepEqual(exclusions.receiptIds, ["approved", "trusted"]);
  assert.equal(isMisprintExcluded({ thumbnail: "https://img.test/approved.jpg" }, exclusions), true);
  assert.equal(isMisprintExcluded({ thumbnail: "https://other.test/x.jpg", imageDigest: "digest-trusted" }, exclusions), true);
  assert.equal(isMisprintExcluded({ thumbnail: "https://img.test/pending.jpg" }, exclusions), false);
  assert.equal(isMisprintExcluded({ thumbnail: "https://img.test/retracted.jpg" }, exclusions), false);
  assert.equal(isMisprintExcluded({ thumbnail: "https://img.test/duplicate.jpg" }, exclusions), false);
});

test("scope decides which pairings an approved report reaches", async () => {
  const store = memoryStore();
  put(store, receipt("global", { scope: "global_asset", actorId: "other", status: "active" }));
  put(store, receipt("wrong-person", { scope: "actor_identity", vibeIdx: 3, status: "active" }));
  put(store, receipt("wrong-vibe", { scope: "actor_vibe", vibeIdx: 3, status: "active" }));
  put(store, receipt("other-actor", { scope: "actor_identity", actorId: "other", status: "active" }));
  const exclusions = await readMisprintExclusions(store, "liu", 0);
  assert.deepEqual(exclusions.receiptIds, ["global", "wrong-person"]);
  const vibeThree = await readMisprintExclusions(store, "liu", 3);
  assert.deepEqual(vibeThree.receiptIds, ["global", "wrong-person", "wrong-vibe"]);
});

test("exclusions fail open and say so when storage cannot be read", async () => {
  const exclusions = await readMisprintExclusions({
    get: async () => null,
    list: async () => { throw new Error("blob outage"); },
  }, "liu", 0);
  assert.equal(exclusions.unavailable, true);
  assert.deepEqual(misprintExclusionProvenance(exclusions, { removed: 0 }), {
    activeReceiptCount: 0, receiptIds: [], removedCandidateCount: 0, unavailable: true, truncated: false,
  });
});

test("applying exclusions removes matches and keeps batch counts consistent", async () => {
  const store = memoryStore();
  put(store, receipt("bad", { status: "active" }));
  const exclusions = await readMisprintExclusions(store, "liu", 0);
  const tally = { removed: 0 };
  const batches = applyMisprintExclusions([{
    query: "q",
    count: 3,
    distinctSources: 3,
    results: [
      { thumbnail: "https://img.test/bad.jpg", source: "a" },
      { thumbnail: "https://img.test/ok-1.jpg", source: "b" },
      { thumbnail: "https://img.test/ok-2.jpg", source: "b" },
    ],
  }], exclusions, tally);
  assert.equal(tally.removed, 1);
  assert.equal(batches[0].count, 2);
  assert.equal(batches[0].distinctSources, 1);
  assert.equal(misprintExclusionProvenance(exclusions, tally).removedCandidateCount, 1);
  const untouched = [{ results: [] }];
  assert.equal(applyMisprintExclusions(untouched, await readMisprintExclusions(memoryStore(), "liu", 0)), untouched);
});
