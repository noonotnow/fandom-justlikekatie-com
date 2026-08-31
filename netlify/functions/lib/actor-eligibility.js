import { createHash } from "node:crypto";
import { getRandomForDate, hashDateString } from "./date-seed.js";
import { IDENTITY_PROFILE_VERSION } from "./actor-identity-profiles.js";

export const ELIGIBILITY_STORE = "actor-audit";
export const APPROVED_VERDICTS = new Set(["approved", "approved_override"]);
export const eligibilityKey = (actorId, vibeIdx) => `eligibility/${actorId}/${vibeIdx}`;
export const auditVibeKey = (actorId, vibeIdx) => `${actorId}:${vibeIdx}`;
export const auditHeadKey = (actorId, vibeIdx) => `heads/${actorId}/${vibeIdx}`;
export const auditRunPrefix = (actorId, vibeIdx) => `runs/${actorId}/${vibeIdx}/`;
export const auditRunKey = (actorId, vibeIdx, runId) => `${auditRunPrefix(actorId, vibeIdx)}${encodeURIComponent(runId)}`;
export const auditVerdictKey = (actorId, vibeIdx, runId) => `verdicts/${actorId}/${vibeIdx}/${encodeURIComponent(runId)}`;

export function pairingFingerprintFor(actor, vibeIdx) {
  return createHash("sha256").update(JSON.stringify({
    profileVersion: IDENTITY_PROFILE_VERSION,
    actorId: actor.id,
    vibeKey: auditVibeKey(actor.id, vibeIdx),
    queries: actor.vibes?.[vibeIdx]?.queries || [],
  })).digest("hex").slice(0, 20);
}

export async function getEligibility(store, actor, vibeIdx) {
  const actorId = actor.id;
  const [snapshot, head] = await Promise.all([
    store.get(eligibilityKey(actorId, vibeIdx), { type: "json", consistency: "strong" }),
    store.get(auditHeadKey(actorId, vibeIdx), { type: "json", consistency: "strong" }),
  ]);
  if (!snapshot || !head?.currentRunId || snapshot.runId !== head.currentRunId) return null;

  const [run, verdict] = await Promise.all([
    store.get(auditRunKey(actorId, vibeIdx, head.currentRunId), { type: "json", consistency: "strong" }),
    store.get(auditVerdictKey(actorId, vibeIdx, head.currentRunId), { type: "json", consistency: "strong" }),
  ]);
  const expectedFingerprint = pairingFingerprintFor(actor, vibeIdx);
  if (
    !run
    || !verdict
    || run.profileVersion !== IDENTITY_PROFILE_VERSION
    || run.pairingFingerprint !== expectedFingerprint
    || snapshot.profileVersion !== IDENTITY_PROFILE_VERSION
    || snapshot.pairingFingerprint !== expectedFingerprint
    || snapshot.verdict !== verdict.verdict
  ) return null;
  return snapshot;
}

export function isApproved(snapshot) {
  return Boolean(
    snapshot
    && snapshot.eligible === true
    && snapshot.runId
    && APPROVED_VERDICTS.has(snapshot.verdict),
  );
}

export async function isPairEligible(actorPacks, actorId, vibeIdx, store) {
  const actor = actorPacks.find(item => item.id === actorId);
  if (!actor?.vibes?.[vibeIdx]) return false;
  return isApproved(await getEligibility(store, actor, vibeIdx));
}

// Does not mutate or reorder ACTOR_PACKS. The first probe remains the legacy
// hash pair; remaining pairs are a stable rotation of the flattened roster.
export async function selectEligiblePair(actorPacks, dateString, store, excluded = new Set()) {
  const legacy = getRandomForDate(actorPacks, dateString);
  if (!legacy) return null;
  const all = actorPacks.flatMap((actor, aIdx) => actor.vibes.map((_, vIdx) => ({ aIdx, vIdx })));
  const offset = hashDateString(`${dateString}:eligibility`) % all.length;
  const order = [legacy, ...all.slice(offset), ...all.slice(0, offset)]
    .filter((pair, index, pairs) => index === pairs.findIndex(other => other.aIdx === pair.aIdx && other.vIdx === pair.vIdx));
  for (const pair of order) {
    const actor = actorPacks[pair.aIdx];
    const key = `${actor.id}:${pair.vIdx}`;
    if (excluded.has(key)) continue;
    if (isApproved(await getEligibility(store, actor, pair.vIdx))) {
      return {
        ...pair,
        legacy: pair.aIdx === legacy.aIdx && pair.vIdx === legacy.vIdx,
      };
    }
  }
  return null;
}