import assert from "node:assert/strict";
import test from "node:test";
import { ACTOR_PACKS } from "./actor-packs.js";
import {
  ACTOR_IDENTITY_PROFILES,
  IDENTITY_PROFILE_VERSION,
  assertIdentityProfileCoverage,
  vibePromiseFor,
} from "./actor-identity-profiles.js";
import { auditRunKey, eligibilityKey } from "./actor-eligibility.js";
import { createActorAuditHandler, vibeKeyFor } from "./actor-audit.js";
import { CURATION_VERSION } from "./grid-curation.js";

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
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      records.set(key, structuredClone(value));
      return { modified: true, etag: `etag-${records.size}` };
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

function curation({ sufficient = true, curationFailure = false } = {}) {
  return async ranked => ({
    displayResults: sufficient ? ranked[0].results.slice(0, 9) : [],
    curation: sufficient
      ? { mode: "compiled", version: CURATION_VERSION, rationale: "A varied set won.", signals: ["source range"] }
      : null,
    diagnostics: {
      rawCandidates: ranked[0]?.results.slice(0, 9) || [],
      dropped: [{ title: "bad frame", source: "stock.example", thumbnail: "https://images.example/bad.jpg", dropReason: "unusable_image" }],
      eventFamilies: [{ id: "event-family-1", strength: 0.8, size: 9, candidates: [] }],
      strongestEvent: sufficient ? { score: 0.7, scoreBreakdown: { familyStrength: { value: 0.8, weight: 0.55, contribution: 0.44 } }, candidates: ranked[0].results.slice(0, 9) } : null,
      strongestCompiled: sufficient ? { score: 0.8, scoreBreakdown: { sourceRange: { value: 1, weight: 0.2, contribution: 0.2 } }, candidates: ranked[0].results.slice(0, 9).reverse() } : null,
      boardDiagnostics: {
        event: {
          available: sufficient,
          reasonCode: sufficient ? null : curationFailure ? "promise_not_fulfilled" : "no_bounded_role_family",
          summary: sufficient ? "A complete 9-card Event board qualified." : curationFailure ? "A complete proposal failed the Vibe promise." : "No bounded work or role family produced enough distinct frames for an Event board.",
        },
        compiled: {
          available: sufficient,
          reasonCode: sufficient ? null : curationFailure ? "promise_not_fulfilled" : "too_few_usable_images",
          summary: sufficient ? "A complete 9-card Compiled board qualified." : curationFailure ? "A complete proposal failed the Vibe promise." : "Compiled had 0 usable images; 9 are required.",
        },
      },
      winner: sufficient ? "compiled" : null,
      alternate: sufficient ? "event" : null,
      receipt: { rawCount: 9, analyzedCount: sufficient || curationFailure ? 9 : 0, curationVersion: CURATION_VERSION },
    },
  });
}

function harness({ sufficient = true, curationFailure = false, authorized = true } = {}) {
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
    curate: curation({ sufficient, curationFailure }),
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
      "trustedSourcePatterns", "problematicSourcePatterns", "aestheticClusters",
    ]) {
      assert.ok(Array.isArray(profile[field]), `${actor.id}.${field}`);
    }
    assert.equal(typeof profile.vibeContracts, "object", `${actor.id}.vibeContracts`);
    actor.vibes.forEach((_, vibeIdx) => {
      const promise = vibePromiseFor(actor, vibeIdx);
      assert.ok(promise.requiredCombinations.length >= 2, `${actor.id}:${vibeIdx} required promise`);
      assert.ok(promise.requiredCombinations.every(combination => combination.any?.length || combination.all?.length), `${actor.id}:${vibeIdx} enforceable combinations`);
      assert.ok(promise.hero?.any?.length, `${actor.id}:${vibeIdx} hero promise`);
    });
  }
  const yuning = ACTOR_IDENTITY_PROFILES["liu-yuning"];
  const xueyi = ACTOR_IDENTITY_PROFILES["liu-xueyi"];
  assert.equal(yuning.commonCollisions.includes("离十六"), false, "Li Shiliu is Liu Yuning's character, not a collision");
  assert.ok(yuning.aestheticClusters.some(cluster => cluster.id === "li-shiliu-masked-moonlight"));
  assert.ok(xueyi.aestheticClusters.some(cluster => cluster.id === "yuan-zhong-pale-ceremonial"));
  assert.ok(xueyi.aestheticClusters.some(cluster => cluster.id === "murong-jinghe-dark-commander"));
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
  assert.equal(first.currentRun.blindReview.status, "pending");
  assert.equal(first.currentRun.blindReview.boards.length, 2);
  assert.equal(first.currentRun.blindReview.boards.every(item => item.board.candidates.length === 9), true);
  assert.equal(first.currentRun.queryRuns, undefined);
  assert.equal(first.currentRun.rawResults, undefined);
  assert.equal(first.currentRun.winner, undefined);
  assert.equal(first.currentRun.curationReceipt, undefined);
  assert.equal(first.pairing.eligible, null);
  assert.equal(first.actor.pairings[0].eligible, null);

  const blockedVerdict = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
  }), {});
  assert.equal(blockedVerdict.status, 409);

  const choiceResponse = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  assert.equal(choiceResponse.status, 200);
  assert.equal(chosen.currentRun.queryRuns.length, 3);
  assert.equal(chosen.currentRun.rawResults.length, 27);
  assert.equal(chosen.currentRun.rejections.some(item => item.reason === "subject_guard_failed"), true);
  assert.equal(chosen.currentRun.detectedEvents.length, 1);
  assert.equal(chosen.currentRun.winner.mode, "compiled");
  assert.equal(chosen.currentRun.identityEvidence.heuristic.includes("do not prove"), true);
  assert.equal(chosen.currentRun.suggestedState, "identity_risk");
  assert.equal(chosen.currentRun.blindReview.choice, "compiled");
  assert.equal(chosen.currentRun.blindReview.agreement, true);
  assert.match(chosen.currentRun.blindReview.experiment.eventBoard.boardHash, /^[a-f0-9]{64}$/);
  assert.match(chosen.currentRun.blindReview.experiment.compiledBoard.boardId, /^compiled-[a-f0-9]{16}$/);

  const rewrittenChoice = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "event",
  }), {});
  assert.equal(rewrittenChoice.status, 409);

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
  assert.equal(decided.currentRun.operatorVerdict.calibration.humanChoice, "compiled");
  assert.equal(decided.currentRun.operatorVerdict.calibration.systemWinner, "compiled");
  assert.equal(decided.currentRun.operatorVerdict.calibration.finalSchedulingVerdict, "approved");
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, true);

  const rewrittenVerdict = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "do_not_schedule",
    notes: "Attempted rewrite.",
  }), {});
  assert.equal(rewrittenVerdict.status, 409);

  const rerunResponse = await handler(request("POST", {
    action: "run",
    actorId: pairActor.id,
    vibeKey,
    scope: "full",
  }), {});
  const rerun = await rerunResponse.json();
  assert.equal(rerun.currentRun.runId, "run-2");
  assert.equal(rerun.currentRun.queryRuns, undefined);
  assert.equal(rerun.currentRun.blindReview.status, "pending");
  assert.equal(rerun.priorRuns[0].runId, "run-1");
  assert.equal(rerun.priorRuns[0].operatorVerdict.verdict, "approved");
  assert.equal(rerun.priorRuns[0].blindReview.choice, "compiled");
  assert.equal(rerun.pairing.eligible, null);
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

test("disagreements and Neither require structured reasons before scheduling", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const runResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const pending = await runResponse.json();
  const presentationOrder = pending.currentRun.blindReview.presentationOrder;

  const choiceResponse = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "neither",
  }), {});
  const revealed = await choiceResponse.json();
  assert.equal(revealed.currentRun.blindReview.choice, "neither");
  assert.equal(revealed.currentRun.blindReview.agreement, false);
  assert.deepEqual(revealed.currentRun.blindReview.presentationOrder, presentationOrder);

  const blocked = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "do_not_schedule",
  }), {});
  assert.equal(blocked.status, 409);

  const missingOtherNote = await handler(request("POST", {
    action: "blind_reasons",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    reasonCodes: ["other_editorial_instinct"],
  }), {});
  assert.equal(missingOtherNote.status, 400);

  const reasonsResponse = await handler(request("POST", {
    action: "blind_reasons",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    reasonCodes: ["wrong_vibe", "other_editorial_instinct"],
    note: "Both boards are technically valid but spiritually unemployed.",
  }), {});
  const annotated = await reasonsResponse.json();
  assert.deepEqual(annotated.currentRun.blindReview.reasonCodes, ["wrong_vibe", "other_editorial_instinct"]);
  assert.equal(annotated.currentRun.blindReview.choice, "neither");

  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "do_not_schedule",
    notes: "Neither argument earns production.",
  }), {});
  const decided = await verdictResponse.json();
  assert.equal(verdictResponse.status, 200);
  assert.deepEqual(
    decided.currentRun.operatorVerdict.calibration.reasonCodes,
    ["wrong_vibe", "other_editorial_instinct"],
  );
  assert.equal(
    decided.currentRun.operatorVerdict.calibration.disagreementNote,
    "Both boards are technically valid but spiritually unemployed.",
  );
  assert.equal(decided.currentRun.operatorVerdict.calibration.finalSchedulingVerdict, "do_not_schedule");
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, false);

  const rewrittenReasons = await handler(request("POST", {
    action: "blind_reasons",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    reasonCodes: ["wrong_actor"],
  }), {});
  assert.equal(rewrittenReasons.status, 409);

  const refreshed = await handler(request("GET", undefined, `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`), {});
  const persisted = await refreshed.json();
  assert.equal(persisted.currentRun.blindReview.choice, "neither");
  assert.deepEqual(persisted.currentRun.blindReview.presentationOrder, presentationOrder);
  assert.deepEqual(persisted.currentRun.blindReview.reasonCodes, ["wrong_vibe", "other_editorial_instinct"]);
});

test("runs without two complete boards fail clearly and cannot be approved", async () => {
  const { handler, store } = harness({ sufficient: false });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});

  const detail = await handler(request("GET", undefined, `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`), {});
  const report = await detail.json();
  assert.equal(report.currentRun.blindReview.status, "unavailable");
  assert.equal(report.currentRun.queryRuns.length, 4);
  assert.equal(report.currentRun.rawResults.length, 36);
  assert.ok(report.currentRun.curationReceipt);
  assert.equal(report.currentRun.boardDiagnostics.event.reasonCode, "no_bounded_role_family");
  assert.equal(report.currentRun.boardDiagnostics.compiled.reasonCode, "too_few_usable_images");

  const retainedRunKey = auditRunKey(pairActor.id, 0, "run-1");
  const retainedRun = store.records.get(retainedRunKey);
  delete retainedRun.boardDiagnostics;
  store.records.set(retainedRunKey, retainedRun);
  const legacyDetail = await handler(request("GET", undefined, `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`), {});
  const legacyReport = await legacyDetail.json();
  assert.equal(legacyReport.currentRun.boardDiagnostics.event.reasonCode, "too_few_usable_images");
  assert.match(legacyReport.currentRun.boardDiagnostics.event.summary, /0 usable images/);

  const blindChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "neither",
  }), {});
  assert.equal(blindChoice.status, 409);

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
  assert.equal(override.status, 409);

  const rejected = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "insufficient_material",
    notes: "No valid blinded comparison was possible.",
  }), {});
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).pairing.eligible, false);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, false);
});

test("useful evidence with failed board selection records Needs curation work", async () => {
  const { handler, store } = harness({ sufficient: false, curationFailure: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const runResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const run = await runResponse.json();
  assert.equal(run.currentRun.blindReview.status, "unavailable");
  assert.equal(run.currentRun.suggestedState, "needs_curation_work");
  assert.equal(run.currentRun.boardDiagnostics.compiled.reasonCode, "promise_not_fulfilled");

  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "needs_curation_work",
    notes: "Useful evidence exists, but neither board kept the promise.",
  }), {});
  assert.equal(verdictResponse.status, 200);
  assert.equal((await verdictResponse.json()).pairing.eligible, false);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, false);
});

test("concurrent calibration writes preserve the canonical first receipt", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});

  const choiceResponses = await Promise.all([
    handler(request("POST", {
      action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "event",
    }), {}),
    handler(request("POST", {
      action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "neither",
    }), {}),
  ]);
  assert.deepEqual(choiceResponses.map(response => response.status).sort(), [200, 409]);

  const detail = await handler(request("GET", undefined, `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`), {});
  const selected = (await detail.json()).currentRun.blindReview.choice;
  assert.equal(["event", "neither"].includes(selected), true);

  const reasonResponses = await Promise.all([
    handler(request("POST", {
      action: "blind_reasons",
      actorId: pairActor.id,
      vibeKey,
      runId: "run-1",
      reasonCodes: ["wrong_vibe"],
    }), {}),
    handler(request("POST", {
      action: "blind_reasons",
      actorId: pairActor.id,
      vibeKey,
      runId: "run-1",
      reasonCodes: ["bad_arrangement"],
    }), {}),
  ]);
  assert.deepEqual(reasonResponses.map(response => response.status).sort(), [200, 409]);

  const verdictResponses = await Promise.all([
    handler(request("POST", {
      action: "verdict",
      actorId: pairActor.id,
      vibeKey,
      runId: "run-1",
      verdict: "do_not_schedule",
      notes: "First final path.",
    }), {}),
    handler(request("POST", {
      action: "verdict",
      actorId: pairActor.id,
      vibeKey,
      runId: "run-1",
      verdict: "identity_risk",
      notes: "Competing final path.",
    }), {}),
  ]);
  assert.deepEqual(verdictResponses.map(response => response.status).sort(), [200, 409]);

  const refreshed = await handler(request("GET", undefined, `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`), {});
  const frozen = (await refreshed.json()).currentRun.operatorVerdict;
  assert.equal(["do_not_schedule", "identity_risk"].includes(frozen.verdict), true);
  assert.equal(
    frozen.calibration.finalSchedulingVerdict,
    frozen.verdict,
  );
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
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
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