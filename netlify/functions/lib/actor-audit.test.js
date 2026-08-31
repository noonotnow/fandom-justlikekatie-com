import assert from "node:assert/strict";
import test from "node:test";
import { ACTOR_PACKS } from "./actor-packs.js";
import {
  ACTOR_IDENTITY_PROFILES,
  IDENTITY_PROFILE_VERSION,
  assertIdentityProfileCoverage,
} from "./actor-identity-profiles.js";
import { eligibilityKey } from "./actor-eligibility.js";
import { createActorAuditHandler, vibeKeyFor } from "./actor-audit.js";

const ORIGIN = "https://fandom.example";
const pairActor = {
  id: "liu-xueyi",
  name: "刘学义",
  shortName: "学义",
  shortName_en: "Liu Xueyi",
  vibes: [{
    label: "破碎感美人",
    label_en: "Shattered Beauty",
    queries: ["刘学义 query one", "刘学义 query two", "刘学义 query three", "刘学义 query four"],
  }],
};

function memoryStore() {
  const records = new Map();
  return {
    records,
    async get(key) {
      return structuredClone(records.get(key) || null);
    },
    async setJSON(key, value) {
      records.set(key, structuredClone(value));
    },
    async list({ prefix } = {}) {
      return {
        blobs: [...records.keys()]
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key })),
      };
    },
  };
}

function request(method = "GET", body, query = "") {
  return new Request(`${ORIGIN}/.netlify/functions/actor-audits${query}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(method === "POST" ? { Origin: ORIGIN } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function searchResults(query) {
  return Array.from({ length: 9 }, (_, index) => ({
    title: index === 0 ? `成毅 collision ${query}` : `刘学义 ${query} ${index}`,
    description: "刘学义 editorial frame",
    source: index % 2 ? "official.example" : "magazine.example",
    link: `https://source.example/${encodeURIComponent(query)}/${index}`,
    thumbnail: `https://images.example/${encodeURIComponent(query)}/${index}.jpg`,
  }));
}

function curation({ sufficient = true } = {}) {
  return async ranked => ({
    displayResults: sufficient ? ranked[0].results.slice(0, 9) : [],
    curation: sufficient
      ? { mode: "compiled", version: 1, rationale: "A varied set won.", signals: ["source range"] }
      : null,
    diagnostics: {
      rawCandidates: ranked[0]?.results.slice(0, 9) || [],
      dropped: [{ title: "bad frame", source: "stock.example", thumbnail: "https://images.example/bad.jpg", dropReason: "unusable_image" }],
      eventFamilies: [{ id: "event-family-1", strength: 0.8, size: 9, candidates: [] }],
      strongestEvent: sufficient ? { score: 0.7, candidates: [] } : null,
      strongestCompiled: sufficient ? { score: 0.8, candidates: ranked[0].results.slice(0, 9) } : null,
      winner: sufficient ? "compiled" : null,
      alternate: sufficient ? "event" : null,
      receipt: { rawCount: 9, analyzedCount: sufficient ? 9 : 0, curationVersion: 1 },
    },
  });
}

function harness({ sufficient = true, authorized = true } = {}) {
  const store = memoryStore();
  let runNumber = 0;
  const auth = {
    async authenticateAdmin() {
      if (!authorized) {
        const error = new Error("Admin access is required.");
        error.status = 403;
        throw error;
      }
      return { user: { accountId: "operator-1" } };
    },
  };
  const handler = createActorAuditHandler({
    auth,
    getStore: () => store,
    actorPacks: [pairActor],
    searchOneQuery: async query => ({
      provider: "test",
      results: searchResults(query),
      rawCount: 10,
      fallbackReason: query.includes("two") ? "subject_guard_failed" : null,
    }),
    now: (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 7, 31, 12, 0, tick++));
    })(),
    createRunId: () => `run-${++runNumber}`,
    curate: curation({ sufficient }),
  });
  return { handler, store };
}

test("every configured actor has a complete private identity profile", () => {
  assert.equal(assertIdentityProfileCoverage(ACTOR_PACKS), true);
  for (const actor of ACTOR_PACKS) {
    const profile = ACTOR_IDENTITY_PROFILES[actor.id];
    for (const field of [
      "canonicalNames", "romanizedNames", "aliases", "commonCollisions",
      "representativeWorks", "knownContamination", "productStockMeanings",
      "trustedSourcePatterns", "problematicSourcePatterns",
    ]) {
      assert.ok(Array.isArray(profile[field]), `${actor.id}.${field}`);
    }
  }
});

test("the audit surface is admin-only before any report store is read", async () => {
  const { handler, store } = harness({ authorized: false });
  const response = await handler(request(), {});
  assert.equal(response.status, 403);
  assert.equal(store.records.size, 0);
});

test("the private actor register includes every pairing without exposing reports publicly", async () => {
  const { handler } = harness();
  const response = await handler(request(), {});
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.profileVersion, IDENTITY_PROFILE_VERSION);
  assert.equal(body.actors[0].canonicalName, "刘学义");
  assert.deepEqual(body.actors[0].pairings.map(item => item.vibeKey), ["liu-xueyi:0"]);
  assert.equal(body.actors[0].pairings[0].eligible, false);
});

test("run, verdict, rerun, and retained-run inspection keep eligibility current", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const runResponse = await handler(request("POST", {
    action: "run",
    actorId: pairActor.id,
    vibeKey,
    scope: "representative",
  }), {});
  const first = await runResponse.json();
  assert.equal(runResponse.status, 200);
  assert.equal(first.currentRun.runId, "run-1");
  assert.equal(first.currentRun.queryRuns.length, 3);
  assert.equal(first.currentRun.rawResults.length, 27);
  assert.equal(first.currentRun.rejections.some(item => item.reason === "subject_guard_failed"), true);
  assert.equal(first.currentRun.detectedEvents.length, 1);
  assert.equal(first.currentRun.winner.mode, "compiled");
  assert.equal(first.currentRun.identityEvidence.heuristic.includes("do not prove"), true);
  assert.equal(first.currentRun.suggestedState, "identity_risk");

  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    notes: "Collision checked against the full board.",
  }), {});
  const decided = await verdictResponse.json();
  assert.equal(verdictResponse.status, 200);
  assert.equal(decided.pairing.eligible, true);
  assert.equal(decided.currentRun.operatorVerdict.decidedBy, "operator-1");
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, true);

  const rerunResponse = await handler(request("POST", {
    action: "run",
    actorId: pairActor.id,
    vibeKey,
    scope: "full",
  }), {});
  const rerun = await rerunResponse.json();
  assert.equal(rerun.currentRun.runId, "run-2");
  assert.equal(rerun.currentRun.queryRuns.length, 4);
  assert.equal(rerun.priorRuns[0].runId, "run-1");
  assert.equal(rerun.priorRuns[0].operatorVerdict.verdict, "approved");
  assert.equal(rerun.pairing.eligible, false);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, false);

  const oldVerdict = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
  }), {});
  assert.equal(oldVerdict.status, 409);

  const priorResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}&runId=run-1`,
  ), {});
  assert.equal(priorResponse.status, 200);
  assert.equal((await priorResponse.json()).run.operatorVerdict.verdict, "approved");
});

test("insufficient material needs an explicit override and remains pairing-specific", async () => {
  const { handler, store } = harness({ sufficient: false });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});

  const ordinary = await handler(request("POST", {
    action: "verdict", actorId: pairActor.id, vibeKey, runId: "run-1", verdict: "approved",
  }), {});
  assert.equal(ordinary.status, 409);

  const override = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved_override",
    notes: "Known sparse pack accepted for a monitored release.",
  }), {});
  assert.equal(override.status, 200);
  assert.equal((await override.json()).pairing.eligible, true);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).verdict, "approved_override");
});

test("cross-origin mutations and oversized notes are rejected", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const crossOrigin = new Request(`${ORIGIN}/.netlify/functions/actor-audits`, {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "run", actorId: pairActor.id, vibeKey, scope: "full" }),
  });
  assert.equal((await handler(crossOrigin, {})).status, 403);

  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const tooLong = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "do_not_schedule",
    notes: "x".repeat(2001),
  }), {});
  assert.equal(tooLong.status, 400);
});

test("a verdict racing a newer run cannot restore stale eligibility", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const originalSet = store.setJSON.bind(store);
  let advanced = false;
  store.setJSON = async (key, value) => {
    await originalSet(key, value);
    if (!advanced && key.startsWith("verdicts/")) {
      advanced = true;
      await originalSet("heads/liu-xueyi/0", {
        currentRunId: "newer-run",
        updatedAt: "2026-08-31T12:05:00.000Z",
      });
    }
  };

  const response = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
  }), {});

  assert.equal(response.status, 409);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, false);
});