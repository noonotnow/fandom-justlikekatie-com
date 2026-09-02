import assert from "node:assert/strict";
import test from "node:test";
import { ACTOR_PACKS } from "./actor-packs.js";
import {
  ACTOR_IDENTITY_PROFILES,
  IDENTITY_PROFILE_VERSION,
  assertIdentityProfileCoverage,
  vibePromiseFor,
} from "./actor-identity-profiles.js";
import {
  auditCalibrationPrefix,
  auditEligibilityDecisionPrefix,
  auditFeedbackPrefix,
  auditRescueBoardKey,
  auditRescueBoardPrefix,
  auditRescuePreferenceKey,
  auditRescuePreferencePrefix,
  auditRescueCalibrationPrefix,
  auditRescueCalibrationRetirementPrefix,
  auditRunKey,
  auditRunPrefix,
  auditVerdictPrefix,
  eligibilityKey,
} from "./actor-eligibility.js";
import {
  compareCalibrationOutcomes,
  createActorAuditHandler,
  rescueCalibrationBasis,
  vibeKeyFor,
} from "./actor-audit.js";
import { candidateIdForResult, CURATION_VERSION } from "./grid-curation.js";
import { gridManifestKey } from "./publication-manifest.js";

const ORIGIN = "https://fandom.example";
const PREVIOUS_CURATION_VERSION = 7;
const pairActor = {
  id: "liu-xueyi",
  name: "刘学义",
  shortName: "学义",
  shortName_en: "Liu Xueyi",
  vibes: [{
    label: "破碎感美人",
    label_en: "Professionally Devastated",
    queries: ["刘学义 query one", "刘学义 query two", "刘学义 query three", "刘学义 query four"],
  }],
};
const pairActorWithAlternateVibe = {
  ...pairActor,
  vibes: [
    ...pairActor.vibes,
    {
      label: "另一种氛围",
      label_en: "Alternate Vibe",
      queries: ["alternate query one", "alternate query two", "alternate query three", "alternate query four"],
    },
  ],
};

function publicationManifest(date, vibeIdx = 0) {
  const sourceCandidateIds = Array.from({ length: 9 }, (_, position) => `candidate-${date}-${position}`);
  return {
    schemaVersion: 1,
    manifestVersion: "v1",
    manifestId: `manifest-${date}`,
    idempotencyKey: `vibe-atlas:daily-drop:${date}`,
    kind: "vibe-atlas-daily-drop",
    publicationDate: date,
    publishedAt: `${date}T04:00:00.000Z`,
    boardHash: "a".repeat(64),
    actor: {
      id: pairActor.id,
      name: pairActor.name,
      nameEn: pairActor.shortName_en,
      accentColor: "#8d2638",
    },
    vibe: {
      key: `${pairActor.id}:${vibeIdx}`,
      idx: vibeIdx,
      label: pairActorWithAlternateVibe.vibes[vibeIdx]?.label || "氛围",
      labelEn: pairActorWithAlternateVibe.vibes[vibeIdx]?.label_en || "Vibe",
    },
    heroPosition: 4,
    cardCount: 9,
    retention: { policy: "permanent", deleteWithCollection: false },
    provenance: { sourceCandidateIds },
    cards: sourceCandidateIds.map((candidateId, position) => ({
      position,
      candidateId,
      title: `Frame ${position}`,
      source: "publisher.example",
      link: `https://publisher.example/${position}`,
      sourceUrl: `https://images.example/${date}-${position}.jpg`,
      media: {
        schemaVersion: 1,
        assetId: `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`,
        deliveryUrl: `https://media.example/assets/${date}-${position}.jpg`,
        thumbnailUrl: `https://media.example/thumbs/${date}-${position}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 100 + position,
        checksum: String(position).padStart(64, "0"),
        dimensions: { width: 1200, height: 1200 },
        association: {
          type: "publication",
          id: `vibe-atlas:daily-drop:${date}`,
          itemId: `card-${position}`,
        },
      },
    })),
  };
}

function memoryStore() {
  const records = new Map();
  const etags = new Map();
  let revision = 0;
  return {
    records,
    async get(key) {
      return structuredClone(records.get(key) || null);
    },
    async getWithMetadata(key) {
      if (!records.has(key)) return null;
      return {
        data: structuredClone(records.get(key)),
        etag: etags.get(key),
      };
    },
    async setJSON(key, value, options = {}) {
      if (options.onlyIfNew && records.has(key)) return { modified: false };
      if (options.onlyIfMatch && options.onlyIfMatch !== etags.get(key)) {
        return { modified: false };
      }
      records.set(key, structuredClone(value));
      revision += 1;
      const etag = `etag-${revision}`;
      etags.set(key, etag);
      return { modified: true, etag };
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
  const payload = body?.action === "verdict" && body.verdict === "approved"
    ? { vibeConfirmed: true, publishableConfirmed: true, ...body }
    : body;
  return new Request(`${ORIGIN}/.netlify/functions/actor-audits${query}`, {
    method,
    headers: {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      ...(method === "POST" ? { Origin: ORIGIN } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
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

function curation({
  sufficient = true,
  curationFailure = false,
  hardRejected = false,
  unavailableRejected = false,
  duplicateRejected = false,
  calibrationTransfers = true,
  hiddenSourceTransfer = false,
  onOptions = () => {},
} = {}) {
  return async (ranked, options = {}) => {
    onOptions(structuredClone(options));
    const positiveCandidateIds = new Set(options.calibrationProfile?.positiveCandidateIds || []);
    const negativeCandidateIds = new Set(options.calibrationProfile?.negativeCandidateIds || []);
    const positiveQueries = new Set(options.calibrationProfile?.positiveQueries || []);
    const negativeQueries = new Set(options.calibrationProfile?.negativeQueries || []);
    const positiveSources = new Set(options.calibrationProfile?.positiveSources || []);
    const negativeSources = new Set(options.calibrationProfile?.negativeSources || []);
    const rawCandidates = ranked.flatMap(batch => (batch.results || []).map(result => ({
      ...result,
      candidateId: candidateIdForResult({
        ...result,
        batchKey: result.batchKey || batch.query,
      }),
      query: batch.query,
      dropReason: null,
      promise: {
        coreSatisfied: true,
        heroSatisfied: true,
        incompatibleCluster: false,
        singleFrameRatio: 1,
      },
      calibration: options.calibrationProfile ? (() => {
        const candidateId = candidateIdForResult({
          ...result,
          batchKey: result.batchKey || batch.query,
        });
        const querySignal = String(batch.query || "").toLowerCase();
        const sourceSignal = String(result.source || "")
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
          .trim();
        return {
          candidateId,
          exactSavedCandidate: positiveCandidateIds.has(candidateId),
          hero: false,
          positive: [
            ...(positiveCandidateIds.has(candidateId) ? ["exact-saved-candidate"] : []),
            ...(positiveQueries.has(querySignal) ? [`query:${querySignal}`] : []),
            ...(positiveSources.has(sourceSignal) ? [`source:${sourceSignal}`] : []),
          ],
          negative: [
            ...(negativeCandidateIds.has(candidateId) ? ["omitted-candidate"] : []),
            ...(negativeQueries.has(querySignal) ? [`query:${querySignal}`] : []),
            ...(negativeSources.has(sourceSignal) ? [`source:${sourceSignal}`] : []),
          ],
        };
      })() : null,
    }))).slice(0, 36);
    if (duplicateRejected && rawCandidates[0]) {
      rawCandidates[0].provisionalCandidateId = "canonical-source";
      rawCandidates.splice(1, 0, {
        ...rawCandidates[0],
        provisionalCandidateId: "dropped-copy-source",
        title: "Duplicate source result",
        link: "https://duplicate-source.example/result",
      });
    }
    const uniqueCandidates = [...new Map(rawCandidates.map(candidate =>
      [candidate.candidateId, candidate])).values()];
    const boardCandidates = (options.calibrationProfile && calibrationTransfers
      ? [...uniqueCandidates].sort((left, right) =>
        Number(Boolean(right.calibration?.positive?.length))
        - Number(Boolean(left.calibration?.positive?.length))
        || Number(Boolean(left.calibration?.negative?.length))
        - Number(Boolean(right.calibration?.negative?.length)))
      : uniqueCandidates).slice(0, 9);
    const dropped = unavailableRejected && rawCandidates[0]
      ? [{ ...rawCandidates[0], dropReason: "image_load_failed", dropDetail: "The source did not return image bytes." }]
      : hardRejected && rawCandidates[0]
      ? [{ ...rawCandidates[0], dropReason: "composite_image", dropDetail: "Visible panel seams." }]
      : duplicateRejected && rawCandidates[1]
        ? [{ ...rawCandidates[1], dropReason: "exact_duplicate", dropDetail: "A canonical copy was retained." }]
      : [{ title: "bad frame", source: "stock.example", thumbnail: "https://images.example/bad.jpg", dropReason: "unusable_image" }];
    const output = {
    displayResults: sufficient ? boardCandidates : [],
    curation: sufficient
      ? { mode: "compiled", version: CURATION_VERSION, rationale: "A varied set won.", signals: ["source range"] }
      : null,
    diagnostics: {
      rawCandidates,
      sourceEvidenceCandidates: hiddenSourceTransfer ? [
        ...rawCandidates,
        {
          candidateId: "hidden-source-candidate",
          query: "historical hidden query",
          source: "hidden-source.test",
          link: "https://hidden-source.test/evidence",
          thumbnail: "https://images.test/hidden-source.jpg",
        },
      ] : rawCandidates,
      dropped,
      eventFamilies: [{ id: "event-family-1", strength: 0.8, size: 9, candidates: [] }],
      strongestEvent: sufficient ? { score: 0.7, scoreBreakdown: { familyStrength: { value: 0.8, weight: 0.55, contribution: 0.44 } }, candidates: boardCandidates } : null,
      strongestCompiled: sufficient ? { score: 0.8, scoreBreakdown: { sourceRange: { value: 1, weight: 0.2, contribution: 0.2 } }, candidates: [...boardCandidates].reverse() } : null,
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
      calibrationSignals: options.calibrationProfile ? {
        calibrationVersion: options.calibrationProfile.calibrationVersion,
        evidenceCount: options.calibrationProfile.evidenceCount,
        affected: calibrationTransfers,
        selectedSignalCount: calibrationTransfers ? 3 : 1,
        beyondExactSavedNineCount: calibrationTransfers ? 2 : 0,
        scoreDelta: calibrationTransfers ? 0.04 : 0,
        messages: calibrationTransfers
          ? ["2 matched candidates transferred the preference beyond the exact saved nine."]
          : ["Only exact saved candidates matched."],
      } : null,
      receipt: { rawCount: rawCandidates.length, analyzedCount: sufficient || curationFailure ? rawCandidates.length : 0, curationVersion: CURATION_VERSION },
    },
    };
    if (options.calibrationControl) {
      const controlRanks = options.calibrationControl.batchRanks || {};
      const controlCandidates = [...uniqueCandidates]
        .sort((left, right) =>
          (controlRanks[left.query] ?? Number.MAX_SAFE_INTEGER)
          - (controlRanks[right.query] ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 9)
        .map(candidate => ({ ...candidate, calibration: null }));
      output.controlDiagnostics = {
        ...output.diagnostics,
        rawCandidates: rawCandidates.map(candidate => ({ ...candidate, calibration: null })),
        strongestEvent: sufficient
          ? { ...output.diagnostics.strongestEvent, candidates: controlCandidates }
          : null,
        strongestCompiled: sufficient
          ? { ...output.diagnostics.strongestCompiled, candidates: [...controlCandidates].reverse() }
          : null,
        calibrationSignals: null,
      };
      if (hiddenSourceTransfer && options.calibrationProfile) {
        const query = options.calibrationProfile.positiveQueries?.[0] || "transfer query";
        const hiddenCandidate = {
          ...uniqueCandidates[0],
          candidateId: "hidden-source-candidate",
          query,
          calibration: {
            candidateId: "hidden-source-candidate",
            exactSavedCandidate: false,
            hero: false,
            positive: [`query:${query}`],
            negative: [],
          },
        };
        const supporting = uniqueCandidates.slice(1, 9);
        output.diagnostics.rawCandidates = [...rawCandidates, hiddenCandidate];
        output.diagnostics.sourceEvidenceCandidates = [
          ...rawCandidates,
          hiddenCandidate,
        ];
        output.diagnostics.strongestCompiled = {
          ...output.diagnostics.strongestCompiled,
          candidates: [hiddenCandidate, ...supporting],
        };
        output.displayResults = [hiddenCandidate, ...supporting];
        const controlHidden = { ...hiddenCandidate, calibration: null };
        output.controlDiagnostics.rawCandidates = [
          ...output.controlDiagnostics.rawCandidates,
          controlHidden,
        ];
        output.controlDiagnostics.sourceEvidenceCandidates = [
          ...output.controlDiagnostics.rawCandidates,
        ];
        output.controlDiagnostics.strongestCompiled = {
          ...output.controlDiagnostics.strongestCompiled,
          candidates: [...supporting.map(candidate => ({
            ...candidate,
            calibration: null,
          })), controlHidden],
        };
      }
    }
    return output;
  };
}

function harness({
  sufficient = true,
  curationFailure = false,
  hardRejected = false,
  unavailableRejected = false,
  duplicateRejected = false,
  calibrationTransfers = true,
  authorized = true,
  onCurateOptions = () => {},
  curationDelays = [],
  runIdFactory = null,
  freshEvidenceOnRerun = false,
  hiddenSourceTransfer = false,
  materializePublication = null,
  publicationStore = null,
  actorPacks = [pairActor],
} = {}) {
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
  let curateCall = 0;
  let searchCall = 0;
  const curateFixture = curation({
    sufficient,
    curationFailure,
    hardRejected,
    unavailableRejected,
    duplicateRejected,
    calibrationTransfers,
    hiddenSourceTransfer,
    onOptions: onCurateOptions,
  });
  const handler = createActorAuditHandler({
    auth,
    getStore: () => store,
    getPublicationStore: () => publicationStore || store,
    actorPacks,
    searchOneQuery: async query => {
      const pass = Math.floor(searchCall++ / actorPacks[0].vibes[0].queries.length);
      const results = searchResults(query).map(result => freshEvidenceOnRerun && pass > 0 ? {
        ...result,
        link: `${result.link}?fresh=${pass}`,
        thumbnail: `${result.thumbnail}?fresh=${pass}`,
      } : result);
      return {
      provider: "test",
      results,
      rawCount: 10,
      fallbackReason: query.includes("two") ? "subject_guard_failed" : null,
    };
    },
    now: (() => {
      let tick = 0;
      return () => new Date(Date.UTC(2026, 7, 31, 12, 0, tick++));
    })(),
    createRunId: runIdFactory || (() => `run-${++runNumber}`),
    createFeedbackId: (() => {
      let feedbackNumber = 0;
      return () => `feedback-${++feedbackNumber}`;
    })(),
    materializePublication,
    curate: async (...args) => {
      const delay = curationDelays[curateCall++] || 0;
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return curateFixture(...args);
    },
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
  const professionallyDevastated = vibePromiseFor(ACTOR_PACKS.find(actor => actor.id === "liu-xueyi"), 3);
  assert.equal(professionallyDevastated.id, "liu-xueyi-professionally-devastated");
  assert.ok(professionallyDevastated.requiredCombinations.some(combination => combination.id === "named-heartbroken-character"));
  assert.ok(professionallyDevastated.requiredCombinations.some(combination => combination.id === "visible-romantic-devastation"));
  assert.ok(professionallyDevastated.hardAntiAnchors.includes("business suit"));
  assert.ok(professionallyDevastated.hardAntiAnchors.includes("women-centered"));
  assert.ok(professionallyDevastated.hardAntiAnchors.includes("neutral portrait"));
  assert.equal(professionallyDevastated.hero.requireExplicit, true);
  assert.ok(professionallyDevastated.hero.any.includes("bloodied"));
  assert.deepEqual(professionallyDevastated.clusterIds, [
    "murong-jinghe-romantic-ruin",
    "shen-zaiye-composure-breaking",
    "jinxiu-devastated-devotion",
  ]);
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
  assert.equal(body.curationVersion, CURATION_VERSION);
  assert.equal(body.actors[0].canonicalName, "刘学义");
  assert.deepEqual(body.actors[0].pairings.map(item => item.vibeKey), ["liu-xueyi:0"]);
  assert.equal(body.actors[0].pairings[0].eligible, false);
  assert.equal(body.releaseInventory.timeZone, "Asia/Shanghai");
  assert.equal(body.releaseInventory.cutoff, "12:00");
  assert.equal(body.releaseInventory.releaseReadyPairingCount, 0);
  assert.equal(body.releaseInventory.actorPacks[0].releaseReadyPairingCount, 0);
});

test("release inventory groups current curator approvals by actor pack", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  await handler(request("POST", {
    action: "verdict", actorId: pairActor.id, vibeKey, runId: "run-1", verdict: "approved",
  }), {});

  const response = await handler(request(), {});
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.releaseInventory.releaseReadyPairingCount, 1);
  assert.equal(body.releaseInventory.freshCuratorPairingCount, 1);
  assert.equal(body.releaseInventory.rescueBackupPairingCount, 0);
  assert.equal(body.releaseInventory.rescueBackupBoardCount, 0);
  assert.equal(body.releaseInventory.recentlyUsedPairingCount, 0);
  assert.equal(body.releaseInventory.unusedWithinRecentWindowPairingCount, 1);
  assert.equal(body.releaseInventory.actorPacks[0].releaseReadyPairingCount, 1);
  assert.equal(body.releaseInventory.actorPacks[0].pairings[0].releaseSource, "fresh_curator");
});

test("release inventory privately marks a release-ready pairing used in a recent Daily Drop", async () => {
  const publicationStore = memoryStore();
  await publicationStore.setJSON(
    gridManifestKey("2026-08-30"),
    publicationManifest("2026-08-30"),
  );
  await publicationStore.setJSON(
    gridManifestKey("2026-07-31"),
    publicationManifest("2026-07-31"),
  );
  const { handler } = harness({ publicationStore });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  await handler(request("POST", {
    action: "verdict", actorId: pairActor.id, vibeKey, runId: "run-1", verdict: "approved",
  }), {});

  const response = await handler(request(), {});
  const inventory = (await response.json()).releaseInventory;

  assert.equal(inventory.recentDailyDropWindowDays, 30);
  assert.equal(inventory.recentDailyDropThroughDate, "2026-08-31");
  assert.equal(inventory.releaseReadyPairingCount, 1);
  assert.equal(inventory.recentlyUsedPairingCount, 1);
  assert.equal(inventory.unusedWithinRecentWindowPairingCount, 0);
  assert.deepEqual(inventory.pairings[0].recentDailyDropDates, ["2026-08-30"]);
  assert.equal(inventory.pairings[0].recentlyUsed, true);
  assert.equal(inventory.pairings[0].lastDailyDropDate, "2026-08-30");
  assert.equal(inventory.actorPacks[0].unusedWithinRecentWindowPairingCount, 0);
});

test("release inventory flags an actor repeat when a different Vibe pairing was published", async () => {
  const publicationStore = memoryStore();
  await publicationStore.setJSON(
    gridManifestKey("2026-08-30"),
    publicationManifest("2026-08-30", 1),
  );
  const { handler } = harness({
    publicationStore,
    actorPacks: [pairActorWithAlternateVibe],
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  await handler(request("POST", {
    action: "verdict", actorId: pairActor.id, vibeKey, runId: "run-1", verdict: "approved",
  }), {});

  const response = await handler(request(), {});
  const inventory = (await response.json()).releaseInventory;
  const actorPack = inventory.actorPacks[0];
  const pairing = inventory.pairings.find(item => item.vibeIdx === 0);

  assert.equal(inventory.recentlyUsedActorCount, 1);
  assert.equal(actorPack.recentlyUsed, true);
  assert.equal(actorPack.lastDailyDropDate, "2026-08-30");
  assert.deepEqual(actorPack.recentDailyDropDates, ["2026-08-30"]);
  assert.equal(pairing.recentlyUsed, false);
  assert.equal(pairing.lastDailyDropDate, null);
});

test("release inventory keeps an actor's latest recorded Drop date beyond the warning window", async () => {
  const publicationStore = memoryStore();
  await publicationStore.setJSON(
    gridManifestKey("2026-07-01"),
    publicationManifest("2026-07-01", 1),
  );
  const { handler } = harness({
    publicationStore,
    actorPacks: [pairActorWithAlternateVibe],
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  await handler(request("POST", {
    action: "verdict", actorId: pairActor.id, vibeKey, runId: "run-1", verdict: "approved",
  }), {});

  const response = await handler(request(), {});
  const actorPack = (await response.json()).releaseInventory.actorPacks[0];

  assert.equal(actorPack.recentlyUsed, false);
  assert.equal(actorPack.lastDailyDropDate, "2026-07-01");
  assert.deepEqual(actorPack.recentDailyDropDates, []);
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
  assert.equal(first.currentRun.curationVersion, CURATION_VERSION);
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

  const unconfirmedApproval = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: false,
    publishableConfirmed: true,
  }), {});
  assert.equal(unconfirmedApproval.status, 409);
  assert.match((await unconfirmedApproval.json()).error, /both.*Vibe.*publishable/i);

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
  assert.equal(decided.currentRun.operatorVerdict.calibration.vibeConfirmed, true);
  assert.equal(decided.currentRun.operatorVerdict.calibration.publishableConfirmed, true);
  assert.equal(decided.currentRun.operatorVerdict.rescuePreference.preferred, false);
  assert.equal(decided.currentRun.operatorVerdict.rescuePreference.rescueReceiptId, null);
  assert.match(decided.currentRun.operatorVerdict.rescuePreference.receiptId, /^[a-f0-9]{24}$/);
  assert.equal(
    store.records.get(auditRescuePreferenceKey(
      pairActor.id,
      0,
      "run-1",
      decided.currentRun.operatorVerdict.rescuePreference.receiptId,
    )).preferred,
    false,
  );
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, true);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).vibeConfirmed, true);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).publishableConfirmed, true);
  const approvedEligibilityHistory = [...store.records.entries()]
    .filter(([key, value]) =>
      key.startsWith(auditEligibilityDecisionPrefix(pairActor.id, 0))
      && value.eligible === true);
  assert.equal(approvedEligibilityHistory.length, 1);

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
  assert.deepEqual(
    [...store.records.entries()].filter(([key, value]) =>
      key.startsWith(auditEligibilityDecisionPrefix(pairActor.id, 0))
      && value.eligible === true),
    approvedEligibilityHistory,
  );

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

test("a publishable curator board can be approved while a rescue board is preferred separately", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const systemWinnerBefore = structuredClone(chosen.currentRun.winner);
  const candidateIds = chosen.currentRun.rawResults.slice(3, 12)
    .map(candidate => candidate.candidateId);
  const rescueResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const rescued = await rescueResponse.json();
  assert.equal(rescueResponse.status, 200, JSON.stringify(rescued));
  const rescueReceipt = rescued.currentRun.editorialFeedback.operatorRescueBoard;

  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    notes: "The curator result is publishable; the rescue arrangement is still my editorial preference.",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: true,
    rescueReceiptId: rescueReceipt.receiptId,
  }), {});
  const decided = await verdictResponse.json();
  assert.equal(verdictResponse.status, 200, JSON.stringify(decided));
  assert.equal(decided.pairing.eligible, true);
  assert.equal(decided.calibrationProfile.evidenceCount, 1);
  assert.deepEqual(
    decided.calibrationProfile.backupBoards,
    [],
    "a rescue preference beside a publishable curator board is calibration-only",
  );
  assert.equal(
    decided.currentRun.editorialFeedback.operatorRescueBoard.calibrationEvidence.status,
    "confirmed",
  );
  assert.equal(
    store.records.get(eligibilityKey(pairActor.id, 0)).calibrationProfile.evidenceCount,
    1,
  );
  assert.deepEqual(decided.currentRun.winner, systemWinnerBefore);
  assert.equal(decided.currentRun.operatorVerdict.verdict, "approved");
  assert.equal(decided.currentRun.operatorVerdict.rescuePreference.preferred, true);
  assert.equal(
    decided.currentRun.operatorVerdict.rescuePreference.rescueReceiptId,
    rescueReceipt.receiptId,
  );
  assert.equal(decided.currentRun.operatorVerdict.calibration.rescuePreference, undefined);
  const preferenceReceipt = store.records.get(
    auditRescuePreferenceKey(
      pairActor.id,
      0,
      "run-1",
      decided.currentRun.operatorVerdict.rescuePreference.receiptId,
    ),
  );
  assert.equal(preferenceReceipt.preferred, true);
  assert.equal(preferenceReceipt.rescueReceiptId, rescueReceipt.receiptId);
  assert.equal(preferenceReceipt.feedbackHash, rescueReceipt.feedbackHash);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).eligible, true);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).rescuePreference, undefined);

  const reloadResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const reloaded = await reloadResponse.json();
  assert.equal(reloadResponse.status, 200);
  assert.equal(reloaded.currentRun.operatorVerdict.rescuePreference.preferred, true);
  assert.equal(
    reloaded.currentRun.operatorVerdict.rescuePreference.rescueReceiptId,
    rescueReceipt.receiptId,
  );

  store.records.delete(auditRescuePreferenceKey(
    pairActor.id,
    0,
    "run-1",
    decided.currentRun.operatorVerdict.rescuePreference.receiptId,
  ));
  store.records.delete(auditRescueBoardKey(
    pairActor.id,
    0,
    "run-1",
    rescueReceipt.receiptId,
  ));
  const idempotentRetry = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    notes: "The curator result is publishable; the rescue arrangement is still my editorial preference.",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: true,
    rescueReceiptId: rescueReceipt.receiptId,
  }), {});
  assert.equal(idempotentRetry.status, 200);
  const eligibilityAfterPreferenceLoss = await handler(request(), {});
  const eligibilityBody = await eligibilityAfterPreferenceLoss.json();
  assert.equal(eligibilityAfterPreferenceLoss.status, 200);
  assert.equal(
    eligibilityBody.actors[0].pairings[0].eligible,
    true,
    "rescue preference evidence cannot grant or revoke curator eligibility",
  );
});

test("saving a rescue board returns the new receipt even when the blob listing lags", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const candidateIds = chosen.currentRun.rawResults.slice(3, 12)
    .map(candidate => candidate.candidateId);

  const originalList = store.list.bind(store);
  store.list = async options => {
    const result = await originalList(options);
    if (options?.prefix === auditRescueBoardPrefix(pairActor.id, 0, "run-1")) {
      return { ...result, blobs: [] };
    }
    return result;
  };

  const rescueResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const rescued = await rescueResponse.json();
  assert.equal(rescueResponse.status, 200, JSON.stringify(rescued));
  assert.equal(rescued.currentRun.editorialFeedback.operatorRescueBoards.length, 1);
  assert.equal(
    rescued.currentRun.editorialFeedback.operatorRescueBoard.receiptId,
    store.records.get(
      [...store.records.keys()].find(key =>
        key.startsWith(auditRescueBoardPrefix(pairActor.id, 0, "run-1"))),
    ).receiptId,
  );
});

test("an approved rescue backfill uses direct canonical reads when blob listings lag", async () => {
  let materialized = null;
  const { handler, store } = harness({
    sufficient: false,
    materializePublication: async input => {
      materialized = input;
      const displayResults = input.board.candidates.map(candidate => ({
        title: candidate.title || "",
        thumbnail: candidate.thumbnail || "",
        link: candidate.link || "",
        source: candidate.source || "",
      }));
      return {
        manifest: { boardHash: "verified" },
        payload: {
          version: "v10",
          date: input.date,
          actorId: input.actor.id,
          actorIdx: null,
          actorName: input.actor.name,
          actorShortNameEn: input.actor.nameEn,
          actorAccentColor: input.actor.accentColor,
          vibeIdx: input.vibe.idx,
          vibeEmoji: input.vibe.emoji,
          vibeLabel: input.vibe.label,
          vibeLabelEn: input.vibe.labelEn,
          vibeSubtitle: input.vibe.subtitle,
          vibeSubtitleEn: input.vibe.subtitleEn,
          rankedBatches: [],
          displayResults,
          generatedAt: "2026-09-01T12:00:00.000Z",
        },
      };
    },
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const detailResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const detail = await detailResponse.json();
  const candidateIds = detail.currentRun.rawResults
    .slice(0, 9)
    .map(candidate => candidate.candidateId);
  const rescueResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const rescued = await rescueResponse.json();
  const rescueReceiptId = rescued.currentRun.editorialFeedback.operatorRescueBoard.receiptId;
  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: true,
    rescueReceiptId,
  }), {});
  assert.equal(verdictResponse.status, 200, await verdictResponse.text());

  const originalList = store.list.bind(store);
  store.list = async options => {
    const result = await originalList(options);
    if (options?.prefix === auditRunPrefix(pairActor.id, 0)
      || options?.prefix === auditVerdictPrefix(pairActor.id, 0, "run-1")) {
      return { ...result, blobs: [] };
    }
    return result;
  };

  const publishResponse = await handler(request("POST", {
    action: "publish_backfill",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    rescueReceiptId,
    date: "2026-09-01",
  }), {});
  const published = await publishResponse.json();
  assert.equal(publishResponse.status, 200, JSON.stringify(published));
  assert.equal(published.backfill.status, "published");
  assert.equal(published.payload.date, "2026-09-01");
  assert.equal(materialized.date, "2026-09-01");
  assert.equal(materialized.board.candidates.length, 9);
  assert.equal(materialized.provenance.rescueReceiptId, rescueReceiptId);
  const publicationKey = [...store.records.keys()].find(key =>
    key.startsWith("starOfDay:") && key.endsWith(":2026-09-01"));
  assert.ok(publicationKey);
  assert.equal(store.records.get(publicationKey).displayResults.length, 9);
});

test("rescue preference cannot point at a missing or stale rescue board", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});
  const response = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: true,
    rescueReceiptId: "missing-receipt",
  }), {});
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /stale or unavailable/i);
});

test("approved overrides cannot impersonate the two human confirmations", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run",
    actorId: pairActor.id,
    vibeKey,
    scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});

  const response = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved_override",
    vibeConfirmed: true,
    publishableConfirmed: true,
  }), {});
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.currentRun.operatorVerdict.vibeConfirmed, false);
  assert.equal(body.currentRun.operatorVerdict.publishableConfirmed, false);
  assert.equal(body.currentRun.operatorVerdict.calibration.vibeConfirmed, false);
  assert.equal(body.currentRun.operatorVerdict.calibration.publishableConfirmed, false);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).vibeConfirmed, false);
  assert.equal(store.records.get(eligibilityKey(pairActor.id, 0)).publishableConfirmed, false);
});

test("run-scoped image flags persist as append-only feedback without rewriting calibration", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const candidate = chosen.currentRun.rawResults.find(item =>
    chosen.currentRun.curationReceipt.rawCandidates.some(
      retained => retained.candidateId === item.candidateId,
    ));
  const calibrationBefore = structuredClone(chosen.currentRun.blindReview);

  const flagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: candidate.candidateId,
    flagged: true,
  }), {});
  const flagged = await flagResponse.json();
  assert.equal(flagResponse.status, 200, JSON.stringify(flagged));
  assert.equal(flagged.currentRun.editorialFeedback.eventCount, 1);
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].candidateId, candidate.candidateId);
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].createdBy, "operator-1");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].disposition, "requested");
  assert.equal(flagged.currentRun.editorialFeedback.requestedReview.status, "provisional_board");
  assert.equal(flagged.currentRun.editorialFeedback.requestedReview.board.candidates.length, 9);
  assert.deepEqual(flagged.currentRun.blindReview, calibrationBefore);
  assert.equal(flagged.currentRun.operatorVerdict, null);

  const rescueIds = flagged.currentRun.editorialFeedback.requestedReview.board.candidates
    .map(item => item.candidateId);
  [rescueIds[0], rescueIds[2]] = [rescueIds[2], rescueIds[0]];
  const rescueResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: rescueIds,
  }), {});
  const rescued = await rescueResponse.json();
  assert.equal(rescueResponse.status, 200, JSON.stringify(rescued));
  assert.deepEqual(
    rescued.currentRun.editorialFeedback.operatorRescueBoard.board.candidates
      .map(item => item.candidateId),
    rescueIds,
  );
  assert.equal(rescued.currentRun.editorialFeedback.operatorRescueBoard.savedBy, "operator-1");
  assert.equal(rescued.currentRun.editorialFeedback.operatorRescueBoards.length, 1);
  assert.deepEqual(rescued.currentRun.blindReview, calibrationBefore);
  assert.equal([...store.records.keys()]
    .filter(key => key.startsWith(auditRescueBoardPrefix(pairActor.id, 0, "run-1"))).length, 1);

  const eligibilityBeforeExport = structuredClone(store.records.get(eligibilityKey(pairActor.id, 0)));
  const savedReceipt = rescued.currentRun.editorialFeedback.operatorRescueBoard;
  const exportResponse = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: savedReceipt.receiptId,
  }), {});
  const exported = await exportResponse.json();
  assert.equal(exportResponse.status, 200, JSON.stringify(exported));
  assert.equal(exported.rescueExport.gridId, `rescue-${pairActor.id}-${savedReceipt.receiptId}`);
  assert.deepEqual(
    exported.rescueExport.candidates.map(item => item.candidateId),
    rescueIds,
  );
  assert.deepEqual(
    exported.rescueExport.candidates.map(item => ({
      resultId: item.candidateId,
      query: item.query,
      sourceUrl: item.link,
      imageUrl: item.thumbnail,
    })),
    savedReceipt.board.candidates.map(item => ({
      resultId: item.candidateId,
      query: item.query,
      sourceUrl: item.link,
      imageUrl: item.thumbnail,
    })),
  );
  const afterExport = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  assert.deepEqual((await afterExport.json()).currentRun.blindReview, calibrationBefore);
  assert.deepEqual(store.records.get(eligibilityKey(pairActor.id, 0)), eligibilityBeforeExport);

  const secondRescueIds = [...rescueIds];
  [secondRescueIds[1], secondRescueIds[4]] = [secondRescueIds[4], secondRescueIds[1]];
  const secondRescueResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: secondRescueIds,
  }), {});
  const secondRescue = await secondRescueResponse.json();
  assert.equal(secondRescueResponse.status, 200, JSON.stringify(secondRescue));
  const savedReceipts = secondRescue.currentRun.editorialFeedback.operatorRescueBoards;
  assert.equal(savedReceipts.length, 2);
  assert.equal(savedReceipts[0].receiptId, secondRescue.currentRun.editorialFeedback.operatorRescueBoard.receiptId);
  assert.deepEqual(savedReceipts[0].board.candidates.map(item => item.candidateId), secondRescueIds);
  assert.deepEqual(savedReceipts[1].board.candidates.map(item => item.candidateId), rescueIds);

  const oldReceiptExport = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: savedReceipt.receiptId,
  }), {});
  const oldExportBody = await oldReceiptExport.json();
  assert.equal(oldReceiptExport.status, 200, JSON.stringify(oldExportBody));
  assert.deepEqual(oldExportBody.rescueExport.candidates.map(item => item.candidateId), rescueIds);
  assert.deepEqual(secondRescue.currentRun.blindReview, calibrationBefore);

  const missingReceiptExport = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: "missing-receipt",
  }), {});
  assert.equal(missingReceiptExport.status, 404);

  const malformedReceiptExport = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: "../another-run",
  }), {});
  assert.equal(malformedReceiptExport.status, 400);

  const mismatchedReceiptId = "mismatched-receipt";
  store.records.set(
    auditRescueBoardKey(pairActor.id, 0, "run-1", mismatchedReceiptId),
    { ...structuredClone(savedReceipt), receiptId: mismatchedReceiptId, actorId: "another-actor" },
  );
  const mismatchedReceiptExport = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: mismatchedReceiptId,
  }), {});
  assert.equal(mismatchedReceiptExport.status, 409);
  const filteredHistoryResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const filteredHistory = await filteredHistoryResponse.json();
  assert.equal(filteredHistory.currentRun.editorialFeedback.operatorRescueBoards.length, 2);

  const feedbackKeysAfterFlag = [...store.records.keys()]
    .filter(key => key.startsWith(auditFeedbackPrefix(pairActor.id, 0, "run-1")));
  assert.equal(feedbackKeysAfterFlag.length, 1);
  const duplicateFlag = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: candidate.candidateId,
    flagged: true,
  }), {});
  assert.equal(duplicateFlag.status, 200);
  assert.equal([...store.records.keys()]
    .filter(key => key.startsWith(auditFeedbackPrefix(pairActor.id, 0, "run-1"))).length, 1);

  const refreshed = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const persisted = await refreshed.json();
  assert.equal(persisted.currentRun.editorialFeedback.flags[0].candidateId, candidate.candidateId);
  assert.equal(persisted.currentRun.editorialFeedback.requestedReview.status, "provisional_board");

  const unflagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: candidate.candidateId,
    flagged: false,
  }), {});
  const unflagged = await unflagResponse.json();
  assert.equal(unflagResponse.status, 200);
  assert.equal(unflagged.currentRun.editorialFeedback.eventCount, 2);
  assert.deepEqual(unflagged.currentRun.editorialFeedback.flags, []);
  assert.equal(unflagged.currentRun.editorialFeedback.requestedReview, null);
  assert.ok(unflagged.currentRun.editorialFeedback.operatorRescueBoard);
  assert.equal([...store.records.keys()]
    .filter(key => key.startsWith(auditFeedbackPrefix(pairActor.id, 0, "run-1"))).length, 2);
  assert.deepEqual(unflagged.currentRun.blindReview, calibrationBefore);

  const staleExport = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: savedReceipt.receiptId,
  }), {});
  assert.equal(staleExport.status, 409);
  assert.match((await staleExport.json()).error, /stale|rebuild/i);
});

test("a historical rescue receipt cannot be exported as the current board", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const candidate = chosen.currentRun.rawResults[0];
  const flaggedResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: candidate.candidateId,
    flagged: true,
  }), {});
  const flagged = await flaggedResponse.json();
  const candidateIds = flagged.currentRun.editorialFeedback.requestedReview.board.candidates
    .map(item => item.candidateId);
  const savedResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const receiptId = (await savedResponse.json()).currentRun.editorialFeedback.operatorRescueBoard.receiptId;

  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const exportResponse = await handler(request("POST", {
    action: "export_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});
  assert.equal(exportResponse.status, 409);
  assert.match((await exportResponse.json()).error, /current audit run/i);
});

test("an operator can save and reload an exact nine-card rescue board without image flags", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const calibrationBefore = structuredClone(chosen.currentRun.blindReview);
  const manualIds = chosen.currentRun.rawResults
    .slice(4, 13)
    .map(candidate => candidate.candidateId);

  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: manualIds,
  }), {});
  const saved = await saveResponse.json();
  assert.equal(saveResponse.status, 200, JSON.stringify(saved));
  assert.deepEqual(saved.currentRun.editorialFeedback.flags, []);
  assert.equal(
    saved.currentRun.editorialFeedback.operatorRescueBoard.feedbackHash,
    saved.currentRun.editorialFeedback.feedbackHash,
  );

  const reloadResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const reloaded = await reloadResponse.json();
  assert.deepEqual(
    reloaded.currentRun.editorialFeedback.operatorRescueBoard.board.candidates
      .map(candidate => candidate.candidateId),
    manualIds,
  );
  assert.equal(
    reloaded.currentRun.editorialFeedback.operatorRescueBoard.board.candidates[4].candidateId,
    manualIds[4],
  );
  assert.deepEqual(reloaded.currentRun.blindReview, calibrationBefore);
});

test("confirmed rescue boards calibrate the next fresh audit without becoming an eligibility gate", async () => {
  const curateOptions = [];
  const { handler, store } = harness({
    freshEvidenceOnRerun: true,
    onCurateOptions: options => curateOptions.push(options),
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const selectedSource = chosen.currentRun.rawResults.at(-1).source;
  const selectedIds = chosen.currentRun.rawResults
    .filter(candidate => candidate.source === selectedSource)
    .slice(0, 9)
    .map(candidate => candidate.candidateId);
  assert.equal(selectedIds.length, 9);
  const immutableRunBefore = structuredClone(store.records.get(
    auditRunKey(pairActor.id, 0, "run-1"),
  ));
  const eligibilityBefore = structuredClone(store.records.get(
    eligibilityKey(pairActor.id, 0),
  ));

  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: selectedIds,
  }), {});
  const saved = await saveResponse.json();
  assert.equal(saveResponse.status, 200, JSON.stringify(saved));
  const receipt = saved.currentRun.editorialFeedback.operatorRescueBoard;
  assert.equal(receipt.calibrationEvidence, null);
  assert.deepEqual(receipt.calibrationBasis.selectedNine.map(item => item.candidateId), selectedIds);
  assert.equal(receipt.calibrationBasis.hero.position, 4);
  assert.equal(receipt.calibrationBasis.hero.candidateId, selectedIds[4]);
  assert.ok(receipt.calibrationBasis.omittedAlternatives.length);
  assert.equal(
    receipt.calibrationBasis.signals.negative.candidateIds.length,
    receipt.calibrationBasis.omittedAlternatives.length,
  );
  assert.ok(receipt.calibrationBasis.rankingContrasts.length);
  assert.ok(receipt.calibrationBasis.rankingContrasts.every(contrast =>
    Number.isInteger(contrast.preferredBoardPosition)
    && Number.isInteger(contrast.preferredEvidenceRank)
    && Number.isInteger(contrast.omittedEvidenceRank)));
  assert.ok(receipt.calibrationBasis.provenance.queries.length);
  const selectedSourceSignal = selectedSource.replace(".", " ");
  assert.ok(receipt.calibrationBasis.signals.reusable.sources.positive
    .includes(selectedSourceSignal));
  const selectedSourceDelta = receipt.calibrationBasis.signals.reusable.sources.deltas
    .find(signal => signal.value === selectedSourceSignal);
  assert.equal(selectedSourceDelta.selectedCount, 9);
  assert.ok(selectedSourceDelta.omittedCount > 0);
  assert.ok(selectedSourceDelta.delta >= 0.15);
  assert.equal(receipt.calibrationBasis.contract.curationVersion, CURATION_VERSION);
  assert.equal([...store.records.keys()]
    .filter(key => key.startsWith(auditRescueCalibrationPrefix(pairActor.id, 0))).length, 0);

  const markResponse = await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: receipt.receiptId,
  }), {});
  const marked = await markResponse.json();
  assert.equal(markResponse.status, 200, JSON.stringify(marked));
  const evidence = marked.currentRun.editorialFeedback.operatorRescueBoard.calibrationEvidence;
  assert.equal(evidence.status, "confirmed");
  assert.equal(evidence.sourceRescueReceiptId, receipt.receiptId);
  assert.equal(evidence.actor.id, pairActor.id);
  assert.equal(evidence.vibePack.key, vibeKey);
  assert.deepEqual(evidence.arrangement.map(item => item.candidateId), selectedIds);
  assert.equal(evidence.hero.candidateId, selectedIds[4]);
  assert.ok(evidence.omittedAlternatives.length);
  assert.deepEqual(
    new Set(evidence.sourceEvidenceCandidateIds),
    new Set([
      ...evidence.selectedNine,
      ...evidence.omittedAlternatives,
      ...evidence.omittedSystemSelections,
    ].map(candidate => candidate.candidateId)),
  );
  assert.deepEqual(evidence.rankingContrasts, receipt.calibrationBasis.rankingContrasts);
  assert.ok(evidence.provenance.selectedQueries.length);
  assert.equal(evidence.contract.curationVersion, CURATION_VERSION);
  assert.equal(marked.pairing.calibrationLearningPending, true);
  assert.notEqual(marked.pairing.auditState, "calibration_reaudit_required");
  assert.deepEqual(store.records.get(auditRunKey(pairActor.id, 0, "run-1")), immutableRunBefore);
  assert.deepEqual(store.records.get(eligibilityKey(pairActor.id, 0)), eligibilityBefore);

  const rerunResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  assert.equal(rerunResponse.status, 200);
  const calibratedOptions = curateOptions.find(options => options.calibrationProfile);
  assert.equal(calibratedOptions.calibrationProfile.evidenceCount, 1);
  assert.equal(calibratedOptions.calibrationProfile.sourceReceiptIds[0], receipt.receiptId);
  assert.deepEqual(
    new Set(calibratedOptions.calibrationProfile.positiveCandidateIds),
    new Set(selectedIds),
  );
  assert.ok(calibratedOptions.calibrationProfile.positiveSources
    .includes(selectedSourceSignal));
  assert.ok(calibratedOptions.calibrationProfile.reusableSignalDeltas.sources
    .some(signal =>
      signal.value === selectedSourceSignal
      && signal.selectedCount === 9
      && signal.omittedCount > 0
      && signal.delta >= 0.15));

  const rerunChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-2", choice: "compiled",
  }), {});
  const rerun = await rerunChoice.json();
  assert.equal(
    rerun.currentRun.calibrationProof.ready,
    true,
    JSON.stringify(rerun.currentRun.calibrationProof, null, 2),
  );
  assert.ok(rerun.currentRun.calibrationProof.beyondExactSavedNineCount > 0);
  assert.equal(rerun.currentRun.calibrationProof.comparison.sameInput, true);
  assert.equal(
    rerun.currentRun.calibrationProof.comparison.baselineInputFingerprint,
    rerun.currentRun.calibrationProof.comparison.calibratedInputFingerprint,
  );
  assert.ok(rerun.currentRun.calibrationProof.comparison.effects.length > 0);
  assert.equal(rerun.currentRun.curationReceipt.calibrationSignals.scoreDelta, 0.04);
  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-2",
    verdict: "approved",
    notes: "Fresh evidence transferred the operator signal.",
  }), {});
  assert.equal(verdictResponse.status, 200, JSON.stringify(await verdictResponse.clone().json()));
});

test("retiring calibration evidence appends a reason receipt, excludes it from profiles, and invalidates old proof", async () => {
  const curateOptions = [];
  const { handler, store } = harness({
    freshEvidenceOnRerun: true,
    onCurateOptions: options => curateOptions.push(options),
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const selectedSource = chosen.currentRun.rawResults.at(-1).source;
  const selectedIds = chosen.currentRun.rawResults
    .filter(candidate => candidate.source === selectedSource)
    .slice(0, 9)
    .map(candidate => candidate.candidateId);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: selectedIds,
  }), {});
  const rescueReceipt = (await saveResponse.json())
    .currentRun.editorialFeedback.operatorRescueBoard;
  await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId: rescueReceipt.receiptId,
  }), {});
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-2", choice: "compiled",
  }), {});
  const approvedResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-2",
    verdict: "approved",
    notes: "Proof covered the original active receipt set.",
  }), {});
  assert.equal(approvedResponse.status, 200);

  const originalRun = structuredClone(store.records.get(
    auditRunKey(pairActor.id, 0, "run-2"),
  ));
  const originalCalibrationKey = [...store.records.keys()].find(key =>
    key.startsWith(auditRescueCalibrationPrefix(pairActor.id, 0)));
  const originalCalibration = structuredClone(store.records.get(originalCalibrationKey));
  const originalEligibility = structuredClone(store.records.get(
    eligibilityKey(pairActor.id, 0),
  ));
  const reason = "The selected source was later found to publish mislabeled actor images.";
  const retirementResponse = await handler(request("POST", {
    action: "retire_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    receiptId: rescueReceipt.receiptId,
    reason,
  }), {});
  const retired = await retirementResponse.json();
  assert.equal(retirementResponse.status, 200, JSON.stringify(retired));
  assert.equal(retired.pairing.auditState, "approved");
  assert.equal(retired.pairing.eligible, true);
  assert.equal(retired.pairing.calibrationLearningPending, true);
  assert.equal(retired.calibrationProfile.evidenceCount, 0);
  assert.equal(retired.calibrationProfile.totalConfirmedEvidenceCount, 1);
  assert.equal(retired.calibrationProfile.retiredEvidenceCount, 1);
  assert.deepEqual(retired.calibrationProfile.sourceReceiptIds, []);
  assert.deepEqual(retired.calibrationProfile.diagnostics.excludedReceiptIds, [
    rescueReceipt.receiptId,
  ]);
  assert.equal(retired.calibrationProfile.diagnostics.exclusions[0].reason, reason);
  const historicalRescue = retired.priorRuns
    .find(run => run.runId === "run-1")
    .editorialFeedback.operatorRescueBoards
    .find(receipt => receipt.receiptId === rescueReceipt.receiptId);
  assert.equal(historicalRescue.calibrationEvidence.status, "confirmed");
  assert.equal(historicalRescue.calibrationEvidence.retirement.reason, reason);

  const retirementKeys = [...store.records.keys()].filter(key =>
    key.startsWith(auditRescueCalibrationRetirementPrefix(pairActor.id, 0)));
  assert.equal(retirementKeys.length, 1);
  const retirementReceipt = store.records.get(retirementKeys[0]);
  assert.equal(retirementReceipt.status, "retired");
  assert.equal(retirementReceipt.sourceRescueReceiptId, rescueReceipt.receiptId);
  assert.equal(retirementReceipt.reason, reason);
  assert.deepEqual(store.records.get(originalCalibrationKey), originalCalibration);
  assert.deepEqual(store.records.get(auditRunKey(pairActor.id, 0, "run-2")), originalRun);
  assert.deepEqual(store.records.get(eligibilityKey(pairActor.id, 0)), originalEligibility);

  const immutableRetirement = await handler(request("POST", {
    action: "retire_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    receiptId: rescueReceipt.receiptId,
    reason: "A different reason cannot replace the first one.",
  }), {});
  assert.equal(immutableRetirement.status, 409);
  assert.equal([...store.records.keys()].filter(key =>
    key.startsWith(auditRescueCalibrationRetirementPrefix(pairActor.id, 0))).length, 1);

  const freshResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const fresh = await freshResponse.json();
  assert.equal(freshResponse.status, 200, JSON.stringify(fresh));
  const retiredProfile = curateOptions.at(-1).calibrationProfile;
  assert.equal(retiredProfile.evidenceCount, 0);
  assert.deepEqual(retiredProfile.positiveCandidateIds, []);
  assert.equal(retiredProfile.diagnostics.exclusions[0].reason, reason);
  assert.equal(fresh.pairing.auditState, "blind_review_pending");
  const freshChoiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-3", choice: "compiled",
  }), {});
  const freshChoice = await freshChoiceResponse.json();
  assert.equal(freshChoice.currentRun.calibrationProof.ready, true);
  assert.equal(freshChoice.currentRun.calibrationProof.status, "retired_evidence_excluded");
  assert.deepEqual(freshChoice.currentRun.calibrationProof.sourceReceiptIds, []);
  assert.deepEqual(freshChoice.currentRun.calibrationProof.retiredReceiptIds, [
    rescueReceipt.receiptId,
  ]);
  assert.notEqual(freshChoice.pairing.auditState, "calibration_reaudit_required");
});

test("calibration remains discoverable and retireable after its source run leaves retained history", async () => {
  const { handler } = harness({ freshEvidenceOnRerun: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const source = chosen.currentRun.rawResults.at(-1).source;
  const candidateIds = chosen.currentRun.rawResults
    .filter(candidate => candidate.source === source)
    .slice(0, 9)
    .map(candidate => candidate.candidateId);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const receiptId = (await saveResponse.json())
    .currentRun.editorialFeedback.operatorRescueBoard.receiptId;
  await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});

  for (let index = 0; index < 13; index += 1) {
    await handler(request("POST", {
      action: "run", actorId: pairActor.id, vibeKey, scope: "full",
    }), {});
  }
  const detailResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.notEqual(detail.currentRun.runId, "run-1");
  assert.equal(detail.priorRuns.some(run => run.runId === "run-1"), false);
  assert.equal(detail.calibrationProfile.evidenceCount, 1);
  assert.deepEqual(detail.calibrationProfile.evidenceLedger, [{
    sourceRescueReceiptId: receiptId,
    sourceRunId: "run-1",
    status: "active",
    confirmedAt: detail.calibrationProfile.evidenceLedger[0].confirmedAt,
    confirmedBy: "operator-1",
    retirement: null,
  }]);

  const retirementResponse = await handler(request("POST", {
    action: "retire_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    receiptId,
    reason: "An old source audit revealed a misleading calibration example.",
  }), {});
  const retired = await retirementResponse.json();
  assert.equal(retirementResponse.status, 200, JSON.stringify(retired));
  assert.equal(retired.calibrationProfile.evidenceCount, 0);
  assert.equal(retired.calibrationProfile.evidenceLedger[0].status, "retired");
  assert.equal(
    retired.calibrationProfile.evidenceLedger[0].retirement.sourceRescueReceiptId,
    receiptId,
  );
  assert.equal(retired.priorRuns.some(run => run.runId === "run-1"), false);
});

test("confirmed calibration becomes records-only after its source contract is superseded", async () => {
  const curateOptions = [];
  const { handler, store } = harness({
    onCurateOptions: options => curateOptions.push(options),
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const firstChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const first = await firstChoice.json();
  const selectedQuery = first.currentRun.rawResults.at(-1).query;
  const selectedIds = first.currentRun.rawResults
    .filter(candidate => candidate.query === selectedQuery)
    .slice(0, 9)
    .map(candidate => candidate.candidateId);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: selectedIds,
  }), {});
  const receiptId = (await saveResponse.json())
    .currentRun.editorialFeedback.operatorRescueBoard.receiptId;
  await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});

  const calibrationKey = [...store.records.keys()].find(key =>
    key.startsWith(auditRescueCalibrationPrefix(pairActor.id, 0)));
  const calibration = store.records.get(calibrationKey);
  calibration.contract.curationVersion = PREVIOUS_CURATION_VERSION;
  store.records.set(calibrationKey, calibration);

  const rerunResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const rerun = await rerunResponse.json();
  assert.equal(rerunResponse.status, 200, JSON.stringify(rerun));
  assert.equal(curateOptions.filter(options => options.calibrationProfile).length, 0);
  assert.equal(rerun.currentRun.inheritedCalibration ?? null, null);
  assert.equal(rerun.currentRun.calibrationProof ?? null, null);
  assert.equal(store.records.get(calibrationKey).status, "confirmed");
});

test("advisory calibration does not require transfer proof before approval", async () => {
  const { handler } = harness({ calibrationTransfers: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const firstChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const first = await firstChoice.json();
  const selectedIds = first.currentRun.rawResults.slice(4, 13)
    .map(candidate => candidate.candidateId);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: selectedIds,
  }), {});
  const receiptId = (await saveResponse.json())
    .currentRun.editorialFeedback.operatorRescueBoard.receiptId;
  await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const secondChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-2", choice: "compiled",
  }), {});
  const second = await secondChoice.json();
  assert.equal(second.currentRun.calibrationProof.ready, false);
  assert.equal(second.currentRun.calibrationProof.beyondExactSavedNineCount, 0);
  const verdictResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-2",
    verdict: "approved",
    notes: "",
  }), {});
  const verdict = await verdictResponse.json();
  assert.equal(verdictResponse.status, 200, JSON.stringify(verdict));
  assert.equal(verdict.pairing.eligible, true);
  assert.equal(verdict.currentRun.calibrationProof.ready, false);
});

test("a promoted candidate beyond the source audit display cap cannot prove transfer", async () => {
  const curateOptions = [];
  const { handler } = harness({
    hiddenSourceTransfer: true,
    onCurateOptions: options => curateOptions.push(options),
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const firstChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const first = await firstChoice.json();
  const selectedQuery = first.currentRun.rawResults.at(-1).query;
  const selectedIds = first.currentRun.rawResults
    .filter(candidate => candidate.query === selectedQuery)
    .slice(0, 9)
    .map(candidate => candidate.candidateId);
  assert.equal(selectedIds.length, 9);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: selectedIds,
  }), {});
  const receiptId = (await saveResponse.json())
    .currentRun.editorialFeedback.operatorRescueBoard.receiptId;
  await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const profile = curateOptions.find(options => options.calibrationProfile)
    .calibrationProfile;
  assert.ok(profile.sourceEvidenceCandidateIds.includes("hidden-source-candidate"));
  const secondChoice = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-2", choice: "compiled",
  }), {});
  const second = await secondChoice.json();
  assert.equal(
    second.currentRun.calibrationProof.ready,
    false,
    JSON.stringify(second.currentRun.calibrationProof, null, 2),
  );
  assert.equal(second.currentRun.calibrationProof.beyondExactSavedNineCount, 0);
});

test("anti-anchor, hero, and candidate-ranking effects alone cannot prove calibration transfer", () => {
  const sourceCandidate = { candidateId: "source-candidate" };
  const newCandidate = { candidateId: "new-candidate" };
  const baseline = {
    winner: "compiled",
    strongestCompiled: { candidates: [sourceCandidate, newCandidate] },
    rawCandidates: [sourceCandidate, newCandidate],
  };
  const outcomeFor = positive => compareCalibrationOutcomes(
    {
      evidenceCount: 1,
      sourceEvidenceCandidateIds: [sourceCandidate.candidateId],
    },
    baseline,
    {
      winner: "compiled",
      strongestCompiled: { candidates: [newCandidate, sourceCandidate] },
      rawCandidates: [
        sourceCandidate,
        {
          ...newCandidate,
          calibration: {
            candidateId: newCandidate.candidateId,
            positive,
            negative: [],
          },
        },
      ],
    },
    {
      baselineInputFingerprint: "same-frozen-analysis",
      calibratedInputFingerprint: "same-frozen-analysis",
    },
  );

  for (const signal of [
    "anti-anchor:business-suit",
    "pairwise-ranking-win",
    "exact-saved-candidate",
  ]) {
    const comparison = outcomeFor([signal]);
    assert.equal(comparison.improved, false, signal);
    assert.equal(comparison.beyondExactSavedNineEffectCount, 0, signal);
  }
  assert.equal(outcomeFor(["cluster:wounded-moonlight"]).improved, true);
});

test("calibration source evidence includes analyzed candidates beyond the 36-card display cap", () => {
  const completeEvidence = Array.from({ length: 50 }, (_, index) => ({
    candidateId: `candidate-${index}`,
    title: `Candidate ${index}`,
    query: `query-${Math.floor(index / 10)}`,
    source: `source-${index % 4}.test`,
    thumbnail: `https://images.test/${index}.jpg`,
    promise: {
      clusters: [{ id: index === 49 ? "omitted-cluster" : "selected-cluster" }],
      hardAntiMatches: index === 49 ? ["business suit"] : [],
    },
    dropReason: index === 49 ? "hard_anti_anchor" : null,
    dropDetail: index === 49 ? "Matched hard anti-anchor: business suit" : null,
  }));
  const run = {
    rawResults: completeEvidence.slice(0, 36),
    curationReceipt: {
      rawCandidates: completeEvidence.slice(0, 36),
      sourceEvidenceCandidates: completeEvidence,
    },
    strongestEvent: { candidates: completeEvidence.slice(0, 9) },
    strongestCompiled: { candidates: completeEvidence.slice(9, 18) },
  };
  const board = { candidates: completeEvidence.slice(0, 9) };
  const basis = rescueCalibrationBasis(run, board);

  assert.equal(basis.omittedAlternatives.length, 41);
  assert.equal(basis.sourceEvidenceCandidateIds.length, 50);
  assert.ok(basis.sourceEvidenceCandidateIds.includes("candidate-49"));
  const omitted = basis.omittedAlternatives.find(candidate =>
    candidate.candidateId === "candidate-49");
  assert.equal(omitted.title, "Candidate 49");
  assert.equal(omitted.dropReason, "hard_anti_anchor");
  assert.deepEqual(omitted.promise.clusters, [{ id: "omitted-cluster" }]);
  assert.deepEqual(omitted.promise.hardAntiMatches, ["business suit"]);
  assert.ok(basis.signals.negative.clusters.includes("omitted cluster"));
  assert.ok(basis.signals.negative.antiAnchors.includes("business suit"));
});

test("shared source and cluster signals survive when selected evidence has a meaningful preference delta", () => {
  const selected = Array.from({ length: 9 }, (_, index) => ({
    candidateId: `selected-${index}`,
    query: "shared query",
    source: "shared-source.test",
    promise: { clusters: [{ id: "shared-cluster" }], hardAntiMatches: [] },
  }));
  const omittedShared = Array.from({ length: 2 }, (_, index) => ({
    candidateId: `omitted-shared-${index}`,
    query: "shared query",
    source: "shared-source.test",
    promise: { clusters: [{ id: "shared-cluster" }], hardAntiMatches: [] },
  }));
  const omittedOther = Array.from({ length: 9 }, (_, index) => ({
    candidateId: `omitted-other-${index}`,
    query: "other query",
    source: "other-source.test",
    promise: { clusters: [{ id: "other-cluster" }], hardAntiMatches: [] },
  }));
  const evidence = [...selected, ...omittedShared, ...omittedOther];
  const basis = rescueCalibrationBasis({
    curationReceipt: { sourceEvidenceCandidates: evidence },
    strongestEvent: { candidates: selected },
    strongestCompiled: { candidates: selected },
  }, { candidates: selected });

  for (const key of ["queries", "sources", "clusters"]) {
    const signal = basis.signals.reusable[key];
    assert.ok(signal.positive.includes(`shared${key === "queries" ? " query" : key === "sources" ? " source test" : " cluster"}`));
    const delta = signal.deltas.find(item => item.value.startsWith("shared"));
    assert.equal(delta.selectedCount, 9);
    assert.equal(delta.omittedCount, 2);
    assert.ok(delta.delta >= 0.8);
  }
});

test("broad human visual choices become advisory definition cues", () => {
  const selected = Array.from({ length: 9 }, (_, index) => ({
    candidateId: `selected-${index}`,
    title: `Handsome man beside a modern building ${index}`,
    description: "Editorial portrait with architectural context",
    source: "selected.example",
  }));
  const omitted = Array.from({ length: 9 }, (_, index) => ({
    candidateId: `omitted-${index}`,
    title: `Historical costume closeup ${index}`,
    description: "Studio character portrait",
    source: "omitted.example",
  }));
  const basis = rescueCalibrationBasis({
    rawResults: [...selected, ...omitted],
    queryRuns: [],
    pairingFingerprint: "fingerprint",
  }, { candidates: selected });

  assert.ok(basis.signals.reusable.definitions.positive.includes("handsome"));
  assert.ok(basis.signals.reusable.definitions.positive.includes("building"));
  assert.ok(basis.signals.reusable.definitions.negative.includes("historical"));
});

test("legacy rescue receipts remain records-only and cannot calibrate the current profile", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const candidateIds = chosen.currentRun.rawResults.slice(0, 9)
    .map(candidate => candidate.candidateId);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const receiptId = (await saveResponse.json())
    .currentRun.editorialFeedback.operatorRescueBoard.receiptId;
  const runKey = auditRunKey(pairActor.id, 0, "run-1");
  const legacy = await store.get(runKey);
  legacy.curationVersion = PREVIOUS_CURATION_VERSION;
  legacy.curationReceipt.curationVersion = PREVIOUS_CURATION_VERSION;
  await store.setJSON(runKey, legacy);

  const markResponse = await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});
  assert.equal(markResponse.status, 409);
  assert.match((await markResponse.json()).error, /legacy rescue boards remain historical records/i);
  assert.equal([...store.records.keys()]
    .filter(key => key.startsWith(auditRescueCalibrationPrefix(pairActor.id, 0))).length, 0);

  const legacyVerdict = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: true,
    rescueReceiptId: receiptId,
  }), {});
  assert.equal(legacyVerdict.status, 409);
  assert.match((await legacyVerdict.json()).error, /invalid under the current profile contract/i);
  assert.equal(
    [...store.records.keys()].filter(key =>
      key.startsWith(auditRescuePreferencePrefix(pairActor.id, 0, "run-1"))).length,
    0,
  );
});

test("excluding an original board image removes it from rescue boards and rejects it on save", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const sourceBoardCandidate = chosen.currentRun.strongestCompiled.candidates[0];
  const sourceBoardIds = new Set(chosen.currentRun.strongestCompiled.candidates
    .map(candidate => candidate.candidateId));
  const omittedCandidate = chosen.currentRun.rawResults.find(candidate =>
    !sourceBoardIds.has(candidate.candidateId));

  await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: omittedCandidate.candidateId,
    intent: "pin",
    flagged: true,
  }), {});
  const excludeResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: sourceBoardCandidate.candidateId,
    intent: "exclude",
    flagged: true,
  }), {});
  const excluded = await excludeResponse.json();
  assert.equal(excludeResponse.status, 200, JSON.stringify(excluded));
  const rescueIds = excluded.currentRun.editorialFeedback.requestedReview.board.candidates
    .map(candidate => candidate.candidateId);
  assert.equal(rescueIds.includes(sourceBoardCandidate.candidateId), false);

  const invalidIds = [...rescueIds];
  invalidIds[0] = sourceBoardCandidate.candidateId;
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: invalidIds,
  }), {});
  const saveBody = await saveResponse.json();
  assert.notEqual(saveResponse.status, 200, JSON.stringify(saveBody));
  assert.match(saveBody.error, /non-excluded candidates/i);
});

test("a retained image left out of both boards can be pinned for the next review", async () => {
  const curateOptions = [];
  const { handler } = harness({ onCurateOptions: options => curateOptions.push(options) });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const selectedIds = new Set([
    ...chosen.currentRun.strongestEvent.candidates,
    ...chosen.currentRun.strongestCompiled.candidates,
  ].map(item => item.candidateId));
  const omitted = chosen.currentRun.rawResults.find(item => !selectedIds.has(item.candidateId));
  assert.ok(omitted, "fixture should retain candidates that neither board selected");

  const flagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: omitted.candidateId,
    flagged: true,
    intent: "pin",
  }), {});
  const flagged = await flagResponse.json();
  assert.equal(flagResponse.status, 200, JSON.stringify(flagged));
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].disposition, "requested");
  assert.ok(flagged.currentRun.editorialFeedback.requestedReview.board.candidates
    .some(item => item.candidateId === omitted.candidateId));

  const rerunResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  assert.equal(rerunResponse.status, 200);
  assert.deepEqual(curateOptions[1].preferredCandidateIds, [omitted.candidateId]);
});

test("a finalized legacy run can annotate old duplicate guesses as separate image feedback", async () => {
  const curateOptions = [];
  const { handler, store } = harness({
    onCurateOptions: options => curateOptions.push(options),
  });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const key = auditRunKey(pairActor.id, 0, "run-1");
  const legacy = await store.get(key);
  const withoutId = item => {
    const { candidateId: _candidateId, ...rest } = item;
    return rest;
  };
  legacy.curationVersion = 3;
  legacy.curationReceipt.curationVersion = 3;
  legacy.rawResults = legacy.rawResults.map(item => ({
    ...withoutId(item),
    imageDigest: "shared-bad-retrieval-digest",
  }));
  legacy.curationReceipt.rawCandidates = legacy.curationReceipt.rawCandidates.map(item => ({
    ...withoutId(item),
    imageDigest: "shared-bad-retrieval-digest",
  }));
  legacy.curationReceipt.dropped = legacy.curationReceipt.rawCandidates.map(item => ({
    ...withoutId(item),
    dropReason: "exact_duplicate",
  }));
  legacy.rejections = legacy.rawResults.map(item => ({
    kind: "image",
    ...withoutId(item),
    reason: "exact_duplicate",
  }));
  legacy.strongestEvent.candidates = legacy.strongestEvent.candidates.map(withoutId);
  legacy.strongestCompiled.candidates = legacy.strongestCompiled.candidates.map(withoutId);
  await store.setJSON(key, legacy);

  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    notes: "",
  }), {});
  const detailResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const detail = await detailResponse.json();
  const candidate = detail.currentRun.rawResults[0];
  const secondCandidate = detail.currentRun.rawResults[1];
  assert.match(candidate.candidateId, /^[a-f0-9]{24}$/);
  assert.equal(new Set(detail.currentRun.rawResults.slice(0, 4).map(item => item.candidateId)).size, 4);
  assert.equal(detail.currentRun.rejections[0].reason, "legacy_duplicate_unverified");
  const calibrationPrefix = auditCalibrationPrefix(pairActor.id, 0, "run-1");
  const verdictPrefix = auditVerdictPrefix(pairActor.id, 0, "run-1");
  const immutableBefore = [...store.records.entries()]
    .filter(([recordKey]) => recordKey.startsWith(calibrationPrefix) || recordKey.startsWith(verdictPrefix))
    .map(([recordKey, value]) => [recordKey, structuredClone(value)]);

  const flagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: candidate.candidateId,
    flagged: true,
    intent: "pin",
  }), {});
  const flagged = await flagResponse.json();
  assert.equal(flagResponse.status, 200, JSON.stringify(flagged));
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].disposition, "requested");
  const secondFlagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: secondCandidate.candidateId,
    flagged: true,
    intent: "supporting",
  }), {});
  const secondFlagged = await secondFlagResponse.json();
  assert.equal(secondFlagResponse.status, 200, JSON.stringify(secondFlagged));
  assert.equal(secondFlagged.currentRun.editorialFeedback.flags.length, 2);
  assert.equal(new Set(secondFlagged.currentRun.editorialFeedback.flags.map(item => item.candidateId)).size, 2);
  const immutableAfter = [...store.records.entries()]
    .filter(([recordKey]) => recordKey.startsWith(calibrationPrefix) || recordKey.startsWith(verdictPrefix))
    .map(([recordKey, value]) => [recordKey, structuredClone(value)]);
  assert.deepEqual(immutableAfter, immutableBefore);

  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  assert.deepEqual(new Set(curateOptions[1].preferredCandidateIds), new Set([
    candidate.candidateId,
    secondCandidate.candidateId,
  ]));
});

test("rendered evidence uses the exact frozen ranked curation snapshot", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "event",
  }), {});
  const chosen = await choiceResponse.json();
  assert.equal(chosen.currentRun.rawResults.length, 27);
  assert.deepEqual(
    chosen.currentRun.rawResults.map(item => item.candidateId),
    chosen.currentRun.curationReceipt.rawCandidates.map(item => item.candidateId),
  );
  assert.ok(chosen.currentRun.rawResults.some(item =>
    item.query === pairActor.vibes[0].queries[2]));
});

test("a retained composite image can be rescued without changing its original rejection evidence", async () => {
  const { handler } = harness({ hardRejected: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "event",
  }), {});
  const chosen = await choiceResponse.json();
  const rejected = chosen.currentRun.rawResults.find(item =>
    chosen.currentRun.rejections.some(entry =>
      entry.kind === "image" && entry.candidateId === item.candidateId));
  assert.ok(rejected);

  const flagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: rejected.candidateId,
    flagged: true,
    intent: "pin",
  }), {});
  const flagged = await flagResponse.json();
  assert.equal(flagResponse.status, 200, JSON.stringify(flagged));
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].disposition, "requested");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].blockedReason, null);
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].intent, "pin");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].originalRejection.reason, "composite_image");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].originalRejection.detail, "Visible panel seams.");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].equivalentRequest, null);
  assert.equal(flagged.currentRun.editorialFeedback.requestedReview.status, "provisional_board");
  assert.equal(flagged.currentRun.editorialFeedback.requestedReview.board.candidates
    .some(candidate => candidate.candidateId === rejected.candidateId), true);
  assert.equal(flagged.currentRun.blindReview.choice, "event");
  const manualIds = chosen.currentRun.rawResults.slice(0, 9).map(candidate => candidate.candidateId);
  assert.equal(manualIds.includes(rejected.candidateId), true);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: manualIds,
  }), {});
  const saved = await saveResponse.json();
  assert.equal(saveResponse.status, 200, JSON.stringify(saved));
  assert.deepEqual(
    saved.currentRun.editorialFeedback.operatorRescueBoard.board.candidates
      .map(candidate => candidate.candidateId),
    manualIds,
  );
});

test("an image whose retained URL could not be loaded remains unavailable to rescue", async () => {
  const { handler } = harness({ unavailableRejected: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "event",
  }), {});
  const chosen = await choiceResponse.json();
  const unavailable = chosen.currentRun.rawResults.find(item =>
    chosen.currentRun.rejections.some(entry =>
      entry.kind === "image"
      && entry.reason === "image_load_failed"
      && entry.candidateId === item.candidateId));

  const flagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: unavailable.candidateId,
    flagged: true,
    intent: "pin",
  }), {});
  const flagged = await flagResponse.json();
  assert.equal(flagResponse.status, 200, JSON.stringify(flagged));
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].disposition, "blocked");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].blockedReason, "unavailable");
  assert.equal(flagged.currentRun.editorialFeedback.requestedReview.status, "blocked");
  assert.equal(flagged.currentRun.editorialFeedback.requestedReview.board, null);
  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds: chosen.currentRun.strongestEvent.candidates.map(candidate => candidate.candidateId),
  }), {});
  const saveBody = await saveResponse.json();
  assert.equal(saveResponse.status, 409, JSON.stringify(saveBody));
  assert.match(saveBody.error, /displayable/i);
});

test("an exact-copy source can pin its canonical retained image without duplicating a board slot", async () => {
  const { handler } = harness({ duplicateRejected: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const duplicate = chosen.currentRun.rawResults.find(item =>
    chosen.currentRun.rejections.some(entry =>
      entry.kind === "image"
      && entry.reason === "exact_duplicate"
      && entry.candidateId === item.candidateId));
  assert.ok(duplicate);
  assert.notEqual(duplicate.link, "https://duplicate-source.example/result");

  const flagResponse = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: duplicate.candidateId,
    flagged: true,
    intent: "pin",
  }), {});
  const flagged = await flagResponse.json();
  assert.equal(flagResponse.status, 200, JSON.stringify(flagged));
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].disposition, "requested");
  assert.equal(flagged.currentRun.editorialFeedback.flags[0].originalRejection.reason, "exact_duplicate");
  assert.notEqual(
    flagged.currentRun.editorialFeedback.flags[0].candidate.link,
    "https://duplicate-source.example/result",
  );
  assert.equal(
    flagged.currentRun.editorialFeedback.requestedReview.board.candidates
      .filter(item => item.candidateId === duplicate.candidateId).length,
    1,
  );
});

test("a rejection challenge requires a structured reason", async () => {
  const { handler } = harness({ hardRejected: true });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const choiceResponse = await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const chosen = await choiceResponse.json();
  const candidate = chosen.currentRun.rawResults.find(item =>
    chosen.currentRun.rejections.some(entry => entry.candidateId === item.candidateId));
  const response = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: candidate.candidateId,
    flagged: true,
    intent: "challenge",
    reasons: [],
  }), {});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Explain why/);
});

test("flags cannot target hidden evidence, another run, or an arbitrary candidate", async () => {
  const { handler } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const runResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const pending = await runResponse.json();
  const hiddenCandidateId = candidateIdForResult({
    ...searchResults(pairActor.vibes[0].queries[0])[0],
    batchKey: pairActor.vibes[0].queries[0],
  });
  const hiddenFlag = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: pending.currentRun.runId,
    candidateId: hiddenCandidateId,
    flagged: true,
  }), {});
  assert.equal(hiddenFlag.status, 409);

  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  const arbitrary = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: "a".repeat(24),
    flagged: true,
  }), {});
  assert.equal(arbitrary.status, 404);

  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const historical = await handler(request("POST", {
    action: "flag_candidate",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateId: hiddenCandidateId,
    flagged: true,
  }), {});
  assert.equal(historical.status, 409);
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

test("runs without a complete publication board fail clearly and cannot be approved", async () => {
  const { handler, store } = harness({ sufficient: false });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});

  const detail = await handler(request("GET", undefined, `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`), {});
  const report = await detail.json();
  assert.equal(report.currentRun.blindReview.status, "unavailable");
  assert.equal(report.currentRun.queryRuns.length, 4);
  assert.equal(report.currentRun.rawResults.length, 27);
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
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: false,
  }), {});
  assert.equal(ordinary.status, 409);
  assert.match((await ordinary.json()).error, /one complete nine-card curated board/i);

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

test("a saved retained-evidence board can be approved without a curator comparison", async () => {
  const { handler, store } = harness({ sufficient: false });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const detail = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const report = await detail.json();
  const candidateIds = report.currentRun.rawResults
    .slice(0, 9)
    .map(candidate => candidate.candidateId);

  const saveResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const saved = await saveResponse.json();
  assert.equal(saveResponse.status, 200, JSON.stringify(saved));
  const receiptId = saved.currentRun.editorialFeedback.operatorRescueBoard.receiptId;

  const calibrationResponse = await handler(request("POST", {
    action: "mark_rescue_calibration",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    receiptId,
  }), {});
  const calibration = await calibrationResponse.json();
  assert.equal(calibrationResponse.status, 200, JSON.stringify(calibration));
  assert.equal(calibration.calibrationProfile.evidenceCount, 1);
  assert.notEqual(calibration.currentRun.calibrationProof?.ready, true);

  const approvalResponse = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
    vibeConfirmed: true,
    publishableConfirmed: true,
    rescuePreferred: true,
    rescueReceiptId: receiptId,
  }), {});
  const approval = await approvalResponse.json();
  assert.equal(approvalResponse.status, 200, JSON.stringify(approval));
  assert.equal(approval.pairing.eligible, true);
  assert.equal(approval.currentRun.operatorVerdict.publicationSource.type, "operator_rescue");
  assert.equal(approval.currentRun.operatorVerdict.publicationSource.rescueReceiptId, receiptId);

  const eligibility = store.records.get(eligibilityKey(pairActor.id, 0));
  assert.equal(eligibility.eligible, true);
  assert.equal(eligibility.verdict, "approved");
  assert.equal(eligibility.publicationSource.type, "operator_rescue");
  assert.equal(eligibility.publicationSource.rescueReceiptId, receiptId);
  assert.deepEqual(
    approval.calibrationProfile.backupBoards,
    [],
    "manual calibration alone does not create a fallback publication source",
  );

  const inventoryResponse = await handler(request(), {});
  const inventory = (await inventoryResponse.json()).releaseInventory;
  assert.equal(inventory.releaseReadyPairingCount, 1);
  assert.equal(inventory.freshCuratorPairingCount, 0);
  assert.equal(inventory.rescueBackupPairingCount, 1);
  assert.equal(inventory.rescueBackupBoardCount, 1);
  assert.equal(inventory.actorPacks[0].pairings[0].releaseSource, "rescue_backup");
});

test("an approval from a legacy profile contract is visibly marked for reapproval", async () => {
  assert.equal(CURATION_VERSION, PREVIOUS_CURATION_VERSION + 1);
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  await handler(request("POST", {
    action: "blind_choice", actorId: pairActor.id, vibeKey, runId: "run-1", choice: "compiled",
  }), {});
  await handler(request("POST", {
    action: "verdict", actorId: pairActor.id, vibeKey, runId: "run-1", verdict: "approved",
  }), {});

  const runKey = auditRunKey(pairActor.id, 0, "run-1");
  const staleRun = store.records.get(runKey);
  staleRun.profileVersion = IDENTITY_PROFILE_VERSION - 1;
  delete staleRun.identityProfileVersion;
  delete staleRun.aestheticClusterVersion;
  delete staleRun.promiseContractVersion;
  staleRun.curationVersion = PREVIOUS_CURATION_VERSION;
  staleRun.curationReceipt.curationVersion = PREVIOUS_CURATION_VERSION;
  staleRun.curationReceipt.version = PREVIOUS_CURATION_VERSION;
  staleRun.pairingFingerprint = "previous-v4-pairing-fingerprint";
  store.records.set(runKey, staleRun);
  const staleEligibility = store.records.get(eligibilityKey(pairActor.id, 0));
  staleEligibility.curationVersion = PREVIOUS_CURATION_VERSION;
  staleEligibility.pairingFingerprint = staleRun.pairingFingerprint;
  store.records.set(eligibilityKey(pairActor.id, 0), staleEligibility);

  const response = await handler(request(), {});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.actors[0].pairings[0].auditState, "needs_reapproval");
  assert.equal(body.actors[0].pairings[0].verdict, "approved");
  assert.equal(body.actors[0].pairings[0].eligible, false);
  assert.equal(body.actors[0].pairings[0].auditContract.status, "legacy");
  assert.deepEqual(body.actors[0].pairings[0].auditContract.legacyReasons, [
    "identity_profile_version",
    "aesthetic_cluster_version",
    "promise_contract_version",
    "curation_version",
    "pairing_fingerprint",
  ]);

  const detailResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const detail = await detailResponse.json();
  assert.equal(detailResponse.status, 200);
  assert.equal(detail.currentRun.auditContract.isLegacy, true);
  assert.deepEqual(detail.currentRun.auditContract.currentVersions, detail.currentContract);

  const staleChoice = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});
  assert.equal(staleChoice.status, 409);

  const staleReasons = await handler(request("POST", {
    action: "blind_reasons",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    reasonCodes: ["wrong_vibe"],
  }), {});
  assert.equal(staleReasons.status, 409);

  const staleVerdict = await handler(request("POST", {
    action: "verdict",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    verdict: "approved",
  }), {});
  assert.equal(staleVerdict.status, 409);
});

test("a blinded legacy run reveals retained evidence and still accepts a rescue board", async () => {
  const { handler, store } = harness();
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});

  const runKey = auditRunKey(pairActor.id, 0, "run-1");
  const staleRun = store.records.get(runKey);
  delete staleRun.promiseContractVersion;
  store.records.set(runKey, staleRun);

  const detailResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const detail = await detailResponse.json();
  assert.equal(detail.currentRun.auditContract.isLegacy, true);
  assert.ok(detail.currentRun.rawResults.length > 0);
  assert.equal(detail.currentRun.blindReview.status, "pending");

  const choiceResponse = await handler(request("POST", {
    action: "blind_choice",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    choice: "compiled",
  }), {});
  assert.equal(choiceResponse.status, 409);

  const candidateIds = detail.currentRun.strongestCompiled.candidates
    .map(candidate => candidate.candidateId);
  const rescueResponse = await handler(request("POST", {
    action: "save_rescue_board",
    actorId: pairActor.id,
    vibeKey,
    runId: "run-1",
    candidateIds,
  }), {});
  const rescued = await rescueResponse.json();
  assert.equal(rescueResponse.status, 200, JSON.stringify(rescued));
  assert.deepEqual(
    rescued.currentRun.editorialFeedback.operatorRescueBoard.board.candidates
      .map(candidate => candidate.candidateId),
    candidateIds,
  );
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

test("audit run identifiers are create-only and cannot rewrite historical evidence", async () => {
  const { handler, store } = harness({ runIdFactory: () => "fixed-run" });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const firstResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "representative",
  }), {});
  assert.equal(firstResponse.status, 200);
  const runKey = auditRunKey(pairActor.id, 0, "fixed-run");
  const firstRun = structuredClone(store.records.get(runKey));

  const collisionResponse = await handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  assert.equal(collisionResponse.status, 409);
  assert.match((await collisionResponse.json()).error, /identifier already exists/i);
  assert.deepEqual(store.records.get(runKey), firstRun);
});

test("a later-started concurrent audit remains current when an older request finishes last", async () => {
  const { handler, store } = harness({ curationDelays: [40, 0] });
  const vibeKey = vibeKeyFor(pairActor.id, 0);
  const olderRequest = handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "representative",
  }), {});
  await new Promise(resolve => setImmediate(resolve));
  const newerRequest = handler(request("POST", {
    action: "run", actorId: pairActor.id, vibeKey, scope: "full",
  }), {});
  const responses = await Promise.all([olderRequest, newerRequest]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);

  const detailResponse = await handler(request(
    "GET",
    undefined,
    `?actorId=${pairActor.id}&vibeKey=${encodeURIComponent(vibeKey)}`,
  ), {});
  const detail = await detailResponse.json();
  assert.equal(detail.currentRun.scope, "full");
  assert.equal(
    [...store.records.keys()].filter(key => key.startsWith(auditRunPrefix(pairActor.id, 0))).length,
    2,
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