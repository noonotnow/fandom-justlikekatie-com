import assert from "node:assert/strict";
import test from "node:test";
import { getRandomForDate } from "./date-seed.js";
import {
  auditHeadKey,
  auditRunKey,
  auditVerdictKey,
  eligibilityKey,
  pairingFingerprintFor,
  selectEligiblePair,
} from "./actor-eligibility.js";

const packs = [
  { id: "actor-a", vibes: [{}, {}] },
  { id: "actor-b", vibes: [{}, {}] },
];

function storeWith(entries = {}) {
  return {
    async get(key) {
      return entries[key] || null;
    },
  };
}

function approved(actor, vibeIdx) {
  const actorId = actor.id;
  const runId = `${actorId}-${vibeIdx}-run`;
  const pairingFingerprint = pairingFingerprintFor(actor, vibeIdx);
  return {
    [eligibilityKey(actorId, vibeIdx)]: {
      eligible: true,
      verdict: "approved",
      runId,
      profileVersion: 1,
      pairingFingerprint,
    },
    [auditHeadKey(actorId, vibeIdx)]: { currentRunId: runId },
    [auditRunKey(actorId, vibeIdx, runId)]: { runId, profileVersion: 1, pairingFingerprint },
    [auditVerdictKey(actorId, vibeIdx, runId)]: { verdict: "approved" },
  };
}

test("the legacy date pair stays selected when its current audit is approved", async () => {
  const date = "2026-08-31";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const selected = await selectEligiblePair(
    packs,
    date,
    storeWith(approved(actor, legacy.vIdx)),
  );

  assert.deepEqual(
    { aIdx: selected.aIdx, vIdx: selected.vIdx, legacy: selected.legacy },
    { aIdx: legacy.aIdx, vIdx: legacy.vIdx, legacy: true },
  );
});

test("an unapproved pair is skipped without removing its actor's other packs", async () => {
  const date = "2026-08-31";
  const legacy = getRandomForDate(packs, date);
  const sameActorOtherVibe = legacy.vIdx === 0 ? 1 : 0;
  const actor = packs[legacy.aIdx];
  const selected = await selectEligiblePair(
    packs,
    date,
    storeWith(approved(actor, sameActorOtherVibe)),
  );

  assert.equal(selected.aIdx, legacy.aIdx);
  assert.equal(selected.vIdx, sameActorOtherVibe);
  assert.equal(selected.legacy, false);
});

test("selection is stable and fails closed when no current pair is approved", async () => {
  const date = "2026-09-01";
  const empty = storeWith();
  assert.equal(await selectEligiblePair(packs, date, empty), null);

  const entries = {
    ...approved(packs[0], 0),
    ...approved(packs[1], 1),
  };
  const first = await selectEligiblePair(packs, date, storeWith(entries));
  const second = await selectEligiblePair(packs, date, storeWith(entries));
  assert.deepEqual(first, second);
});

test("stale approval-shaped records without an eligible current run are rejected", async () => {
  const date = "2026-09-02";
  const legacy = getRandomForDate(packs, date);
  const actor = packs[legacy.aIdx];
  const key = eligibilityKey(actor.id, legacy.vIdx);
  assert.equal(await selectEligiblePair(packs, date, storeWith({
    [key]: { verdict: "approved", eligible: false, runId: "old-run" },
  })), null);
  assert.equal(await selectEligiblePair(packs, date, storeWith({
    [key]: { verdict: "approved", eligible: true, runId: "" },
  })), null);
});

test("an approval is stale after its identity profile or query fingerprint changes", async () => {
  const date = "2026-09-03";
  const legacy = getRandomForDate(packs, date);
  const originalActor = packs[legacy.aIdx];
  const entries = approved(originalActor, legacy.vIdx);
  const changedPacks = structuredClone(packs);
  changedPacks[legacy.aIdx].vibes[legacy.vIdx].queries = ["new query contract"];

  assert.equal(await selectEligiblePair(changedPacks, date, storeWith(entries)), null);
});