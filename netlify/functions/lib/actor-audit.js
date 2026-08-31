import { createHash, randomUUID } from "node:crypto";
import { json } from "./public-auth.js";
import {
  AESTHETIC_CLUSTER_VERSION,
  ACTOR_IDENTITY_PROFILES,
  IDENTITY_PROFILE_VERSION,
  VIBE_PROMISE_CONTRACT_VERSION,
  vibePromiseFor,
} from "./actor-identity-profiles.js";
import {
  APPROVED_VERDICTS,
  ELIGIBILITY_STORE,
  auditHeadKey,
  auditCalibrationKey,
  auditCalibrationPrefix,
  auditCalibrationReasonsKey,
  auditCalibrationReasonsPrefix,
  auditFeedbackKey,
  auditFeedbackPrefix,
  auditRunKey,
  auditRunPrefix,
  auditRequestedReviewKey,
  auditRescueBoardKey,
  auditRescueBoardPrefix,
  auditVerdictKey,
  auditVerdictPrefix,
  auditVibeKey,
  eligibilityKey,
  pairingFingerprintFor,
} from "./actor-eligibility.js";
import {
  evaluateCandidates,
  MIN_VIABLE_RESULTS,
  rankCandidates,
  RANKED_BATCH_LIMIT,
} from "./ranking.js";
import {
  candidateIdForResult,
  CURATION_VERSION,
  curateDisplayResults,
} from "./grid-curation.js";

const MAX_BODY_BYTES = 48 * 1024;
const MAX_NOTE_LENGTH = 2000;
const MAX_CALIBRATION_NOTE_LENGTH = 1000;
const MAX_RETAINED_RUNS = 12;
const MAX_RAW_RESULTS = 36;
const MAX_IDENTITY_ITEMS = 36;
const MAX_FEEDBACK_EVENTS = 72;
const MAX_FEEDBACK_NOTE_LENGTH = 400;
const FEEDBACK_INTENTS = new Set(["pin", "hero", "supporting", "exclude", "challenge"]);
const CHALLENGE_REASONS = new Set([
  "stronger_vibe_match",
  "better_silhouette",
  "better_costume_continuity",
  "better_character_match",
  "intentional_similarity",
  "better_composition",
  "better_hero_image",
  "not_collage_duplicate_or_bts",
  "other_editorial_instinct",
]);
const VERDICTS = new Set([
  "approved",
  "approved_override",
  "needs_query_work",
  "needs_curation_work",
  "insufficient_material",
  "identity_risk",
  "do_not_schedule",
]);
const BLIND_CHOICES = new Set(["event", "compiled", "neither"]);
const DISAGREEMENT_REASONS = new Set([
  "better_individual_cards",
  "stronger_overall_cohesion",
  "event_repetition_intentional",
  "event_repetition_redundant",
  "compiled_board_varied",
  "compiled_board_random",
  "wrong_vibe",
  "wrong_actor",
  "bad_arrangement",
  "other_editorial_instinct",
]);

export function createActorAuditHandler({
  auth,
  getStore,
  actorPacks,
  searchOneQuery,
  now = () => new Date(),
  createRunId = () => randomUUID(),
  createFeedbackId = () => randomUUID(),
  curate = curateDisplayResults,
}) {
  return async (req, context) => {
    try {
      const operator = await auth.authenticateAdmin(req, context);
      const store = getStore(ELIGIBILITY_STORE, context);
      const url = new URL(req.url);

      if (req.method === "GET") {
        const actorId = url.searchParams.get("actorId");
        const vibeKey = url.searchParams.get("vibeKey");
        if (!actorId && !vibeKey) {
          return json(200, {
            schemaVersion: 1,
            profileVersion: IDENTITY_PROFILE_VERSION,
            identityProfileVersion: IDENTITY_PROFILE_VERSION,
            aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
            promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
            curationVersion: CURATION_VERSION,
            actors: await listActors(store, actorPacks),
          });
        }
        const pair = resolvePair(actorPacks, actorId, vibeKey);
        if (!pair) return json(400, { error: "Unknown actor or Vibe Pack." });
        const report = await readReport(store, pair);
        const runId = url.searchParams.get("runId");
        if (runId) {
          const run = await readRun(store, pair, runId);
          return run ? json(200, { run: clientRun(run, pair) }) : json(404, { error: "Audit run not found." });
        }
        return json(200, detailResponse(pair, report));
      }

      if (req.method !== "POST") {
        return json(405, { error: "Method not allowed." }, { Allow: "GET, POST" });
      }
      requireSameOrigin(req);
      const input = await readJson(req);
      const pair = resolvePair(actorPacks, input.actorId, input.vibeKey);
      if (!pair) return json(400, { error: "Unknown actor or Vibe Pack." });

      if (input.action === "run") {
        const scope = parseScope(input.scope);
        if (!scope) return json(400, { error: "Audit scope must be representative or full." });
        const previous = await readReport(store, pair);
        const preferredCandidateIds = nextReviewPreferenceIds(previous.currentRun);
        const run = await runPreflight(pair, searchOneQuery, {
          now,
          createRunId,
          scope,
          curate,
          preferredCandidateIds,
        });
        const report = await appendRun(store, pair, run);
        await writeEligibility(store, pair, null);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, report),
          ...detailResponse(pair, report),
        });
      }

      if (input.action === "verdict") {
        if (!VERDICTS.has(input.verdict)) {
          return json(400, { error: "A valid verdict is required." });
        }
        const notes = boundedText(input.notes, MAX_NOTE_LENGTH);
        if (notes === null) {
          return json(400, { error: "Notes must be text under 2000 characters." });
        }
        const report = await readReport(store, pair);
        if (!report?.currentRun || input.runId !== report.currentRun.runId) {
          return json(409, { error: "This verdict is not for the current audit run. Refresh and try again." });
        }
        if (!currentRunMatchesCurrentContract(report.currentRun, pair)) {
          return json(409, { error: "This audit used an older curation contract. Run a fresh audit before recording a scheduling verdict." });
        }
        const hasComparableBoards = comparableBoards(report.currentRun);
        const blindReview = report.currentRun.blindReview;
        const existingVerdict = report.currentRun.operatorVerdict;
        if (existingVerdict) {
          if (existingVerdict.verdict !== input.verdict || existingVerdict.notes !== notes) {
            return json(409, { error: "The final scheduling verdict for this audit run is immutable." });
          }
          return json(200, {
            actor: await actorSummary(store, actorPacks, pair.actor),
            pairing: pairingSummary(pair, report),
            ...detailResponse(pair, report),
          });
        }
        if (hasComparableBoards && !blindReview?.choice) {
          return json(409, { error: "Choose the more compelling board before recording a scheduling verdict." });
        }
        if (hasComparableBoards && isDisagreement(report.currentRun, blindReview)
          && !blindReview?.reasonCodes?.length) {
          return json(409, { error: "Capture at least one disagreement reason before recording a scheduling verdict." });
        }
        if (!hasComparableBoards && APPROVED_VERDICTS.has(input.verdict)) {
          return json(409, { error: "A pairing without two complete boards cannot be approved." });
        }
        if (input.verdict === "approved" && !report.currentRun.materialSufficient) {
          return json(409, { error: "Insufficient material cannot be approved without an override." });
        }
        const stamp = now().toISOString();
        const operatorVerdict = {
          verdict: input.verdict,
          notes,
          decidedAt: stamp,
          decidedBy: operator.user.accountId,
          calibration: blindReview
            ? calibrationSnapshot(blindReview, input.verdict, notes, stamp, operator.user.accountId)
            : null,
        };
        const verdictWrite = await store.setJSON(
          auditVerdictKey(pair.actor.id, pair.vibeIdx, report.currentRun.runId),
          operatorVerdict,
          { onlyIfNew: true },
        );
        if (verdictWrite?.modified === false) {
          return json(409, { error: "Another operator finalized this audit run first." });
        }
        const currentHead = await store.get(auditHeadKey(pair.actor.id, pair.vibeIdx), {
          type: "json",
          consistency: "strong",
        });
        if (currentHead?.currentRunId !== report.currentRun.runId) {
          return json(409, { error: "A newer audit run became current. Review that run before scheduling." });
        }
        const next = await readReport(store, pair);
        if (next.currentRun?.operatorVerdict?.verdict !== input.verdict
          || next.currentRun?.operatorVerdict?.notes !== notes) {
          return json(409, { error: "Another operator finalized this audit run first." });
        }
        await writeEligibility(store, pair, {
          schemaVersion: 1,
          profileVersion: IDENTITY_PROFILE_VERSION,
          identityProfileVersion: IDENTITY_PROFILE_VERSION,
          aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
          promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
          curationVersion: report.currentRun.curationReceipt?.curationVersion || null,
          actorId: pair.actor.id,
          vibeKey: pair.vibeKey,
          vibeIdx: pair.vibeIdx,
          runId: report.currentRun.runId,
          pairingFingerprint: report.currentRun.pairingFingerprint,
          verdict: input.verdict,
          calibrationVersion: 1,
          calibrationHash: recordHash(operatorVerdict.calibration),
          materialSufficient: report.currentRun.materialSufficient,
          eligible: APPROVED_VERDICTS.has(input.verdict),
          decidedAt: stamp,
        });
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      if (input.action === "blind_choice") {
        const report = await readReport(store, pair);
        if (!report?.currentRun || input.runId !== report.currentRun.runId) {
          return json(409, { error: "This review is not for the current audit run. Refresh and try again." });
        }
        if (!comparableBoards(report.currentRun)) {
          return json(409, { error: "A blinded comparison requires two complete Event and Compiled boards." });
        }
        if (!BLIND_CHOICES.has(input.choice)) {
          return json(400, { error: "Choose Event, Compiled, or Neither." });
        }
        if (report.currentRun.blindReview?.choice) {
          if (report.currentRun.blindReview.choice !== input.choice) {
            return json(409, { error: "The independent board choice is immutable." });
          }
          return json(200, {
            actor: await actorSummary(store, actorPacks, pair.actor),
            pairing: pairingSummary(pair, report),
            ...detailResponse(pair, report),
          });
        }
        const calibration = createCalibration(pair, report.currentRun, input.choice, operator, now);
        const calibrationWrite = await store.setJSON(
          auditCalibrationKey(pair.actor.id, pair.vibeIdx, report.currentRun.runId),
          calibration,
          { onlyIfNew: true },
        );
        if (calibrationWrite?.modified === false) {
          return json(409, { error: "Another operator recorded the independent choice first." });
        }
        const next = await readReport(store, pair);
        if (next.currentRun?.blindReview?.choice !== input.choice) {
          return json(409, { error: "Another operator recorded the independent choice first." });
        }
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      if (input.action === "blind_reasons") {
        const report = await readReport(store, pair);
        if (!report?.currentRun || input.runId !== report.currentRun.runId) {
          return json(409, { error: "This review is not for the current audit run. Refresh and try again." });
        }
        if (report.currentRun.operatorVerdict) {
          return json(409, { error: "This audit run is finalized; its calibration receipt is immutable." });
        }
        const blindReview = report.currentRun.blindReview;
        if (!blindReview?.choice) {
          return json(409, { error: "Record the independent board choice before adding disagreement reasons." });
        }
        const reasonCodes = parseReasons(input.reasonCodes);
        if (reasonCodes === null) {
          return json(400, { error: "Choose only the listed disagreement reasons." });
        }
        const note = boundedText(input.note, MAX_CALIBRATION_NOTE_LENGTH);
        if (note === null) {
          return json(400, { error: "The editorial instinct note must be text under 1000 characters." });
        }
        const disagreement = isDisagreement(report.currentRun, blindReview);
        if (disagreement && !reasonCodes.length) {
          return json(400, { error: "Choose at least one reason when your board choice disagrees with the system." });
        }
        if (reasonCodes.includes("other_editorial_instinct") && !note) {
          return json(400, { error: "Explain the other editorial instinct in a short note." });
        }
        if (blindReview.reasonCodes) {
          if (JSON.stringify(blindReview.reasonCodes) !== JSON.stringify(reasonCodes)
            || blindReview.note !== note) {
            return json(409, { error: "The disagreement annotation for this audit run is immutable." });
          }
          return json(200, {
            actor: await actorSummary(store, actorPacks, pair.actor),
            pairing: pairingSummary(pair, report),
            ...detailResponse(pair, report),
          });
        }
        const annotatedAt = now().toISOString();
        const reasonsWrite = await store.setJSON(
          auditCalibrationReasonsKey(pair.actor.id, pair.vibeIdx, report.currentRun.runId),
          {
            runId: report.currentRun.runId,
            reasonCodes,
            note,
            annotatedAt,
            annotatedBy: operator.user.accountId,
          },
          { onlyIfNew: true },
        );
        if (reasonsWrite?.modified === false) {
          return json(409, { error: "Another operator recorded the disagreement annotation first." });
        }
        const next = await readReport(store, pair);
        if (JSON.stringify(next.currentRun?.blindReview?.reasonCodes) !== JSON.stringify(reasonCodes)
          || next.currentRun?.blindReview?.note !== note) {
          return json(409, { error: "Another operator recorded the disagreement annotation first." });
        }
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      if (input.action === "flag_candidate") {
        const report = await readReport(store, pair);
        const run = await readRun(store, pair, input.runId);
        if (!run || run.runId !== input.runId) {
          return json(409, { error: "This flag is not for a retained audit run. Refresh and try again." });
        }
        if (report.currentRun?.runId !== run.runId) {
          return json(409, { error: "Only the current audit run can receive grid-review requests." });
        }
        if (!run.blindReview?.choice && run.blindReview?.status !== "unavailable") {
          return json(409, { error: "Choose the blind board result before flagging evidence for grid review." });
        }
        if (typeof input.candidateId !== "string" || !/^[a-f0-9]{24}$/.test(input.candidateId)) {
          return json(400, { error: "A valid retained candidate is required." });
        }
        if (typeof input.flagged !== "boolean") {
          return json(400, { error: "Flag state must be true or false." });
        }
        const requestedIntent = input.intent === undefined ? "pin" : input.intent;
        if (input.flagged && (typeof requestedIntent !== "string" || !FEEDBACK_INTENTS.has(requestedIntent))) {
          return json(400, { error: "Choose pin, hero, supporting, exclude, or challenge as the editorial intent." });
        }
        const challengeReasons = parseChallengeReasons(input.reasons);
        if (challengeReasons === null) {
          return json(400, { error: "Choose only the listed rejection-challenge reasons." });
        }
        if (input.flagged && requestedIntent === "challenge" && !challengeReasons.length) {
          return json(400, { error: "Explain why this rejected image should be reconsidered." });
        }
        const receiptReasons = requestedIntent === "challenge" ? challengeReasons : [];
        const candidate = (run.rawResults || []).find(item =>
          item.candidateId === input.candidateId
          || (!item.candidateId
            && candidateIdForResult({ ...item, batchKey: item.query }) === input.candidateId));
        if (!candidate) {
          return json(404, { error: "That image is not part of this audit's retained evidence." });
        }
        const originalRejection = (run.rejections || []).find(item =>
          item.kind === "image" && item.candidateId === input.candidateId) || null;
        if (input.flagged && requestedIntent === "challenge" && !originalRejection) {
          return json(409, { error: "Only an image rejected by this audit can receive a rejection challenge." });
        }
        const note = boundedText(input.note, MAX_FEEDBACK_NOTE_LENGTH);
        if (note === null) {
          return json(400, { error: "The review note must be text under 400 characters." });
        }
        const feedback = run.editorialFeedback || emptyEditorialFeedback();
        const existing = feedback.flags.find(item => item.candidateId === input.candidateId);
        if (
          (existing?.flagged === input.flagged && (!input.flagged || (
            existing.intent === requestedIntent
            && JSON.stringify(existing.reasons || []) === JSON.stringify(receiptReasons)
          )))
          || (!existing && input.flagged === false)
        ) {
          return json(200, {
            actor: await actorSummary(store, actorPacks, pair.actor),
            pairing: pairingSummary(pair, report),
            ...detailResponse(pair, report),
          });
        }
        if (feedback.eventCount >= MAX_FEEDBACK_EVENTS) {
          return json(409, { error: "This run has reached its editorial feedback receipt limit." });
        }
        const stamp = now().toISOString();
        const gate = candidateGate(run, input.candidateId);
        const receipt = {
          schemaVersion: 1,
          eventId: createFeedbackId(),
          action: input.flagged ? "flag" : "unflag",
          flagged: input.flagged,
          intent: input.flagged ? requestedIntent : existing?.intent || "pin",
          reasons: input.flagged ? receiptReasons : [],
          runId: run.runId,
          actorId: pair.actor.id,
          vibeKey: pair.vibeKey,
          candidateId: input.candidateId,
          candidate: {
            query: String(candidate.query || "").slice(0, 500),
            title: String(candidate.title || "").slice(0, 240),
            source: String(candidate.source || "").slice(0, 120),
            link: String(candidate.link || "").slice(0, 700),
            thumbnail: String(candidate.thumbnail || "").slice(0, 700),
            imageDigest: String(candidate.imageDigest || "").slice(0, 256) || null,
          },
          originalRejection: originalRejection ? {
            reason: originalRejection.reason || "curation_gate",
            detail: originalRejection.dropDetail || null,
          } : null,
          equivalentRequest: input.flagged
            && requestedIntent !== "exclude"
            && gate.disposition === "blocked"
            ? {
              status: "requested",
              requestType: "find_usable_equivalent",
              sourceCandidateId: input.candidateId,
              blockedReason: gate.blockedReason,
              requestedAt: stamp,
            }
            : null,
          versions: {
            identityProfileVersion: run.identityProfileVersion || run.profileVersion || null,
            aestheticClusterVersion: run.aestheticClusterVersion || null,
            promiseContractVersion: run.promiseContractVersion || null,
            curationVersion: run.curationReceipt?.curationVersion || null,
          },
          note,
          createdAt: stamp,
          createdBy: operator.user.accountId,
        };
        const write = await store.setJSON(
          auditFeedbackKey(pair.actor.id, pair.vibeIdx, run.runId, receipt.eventId),
          receipt,
          { onlyIfNew: true },
        );
        if (write?.modified === false) {
          return json(409, { error: "Another operator recorded this grid-review request first." });
        }
        const refreshed = await readReport(store, pair);
        const refreshedRun = refreshed.currentRun;
        if (refreshedRun?.runId === run.runId && refreshedRun.editorialFeedback?.flags?.length) {
          await persistRequestedReview(store, pair, refreshedRun, now);
        }
        const next = await readReport(store, pair);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      if (input.action === "save_rescue_board") {
        const report = await readReport(store, pair);
        const run = report.currentRun;
        if (!run || input.runId !== run.runId) {
          return json(409, { error: "Only the current audit run can save an Operator Rescue Board." });
        }
        if (!run.blindReview?.choice && run.blindReview?.status !== "unavailable") {
          return json(409, { error: "Choose the blind board result before saving a rescue arrangement." });
        }
        const validation = validateRescueArrangement(run, input.candidateIds);
        if (!validation.ok) return json(409, { error: validation.error });
        const savedAt = now().toISOString();
        const receiptId = createFeedbackId();
        const receipt = {
          schemaVersion: 1,
          receiptId,
          runId: run.runId,
          actorId: pair.actor.id,
          vibeKey: pair.vibeKey,
          feedbackHash: feedbackHash(run.editorialFeedback?.flags || []),
          board: validation.board,
          savedAt,
          savedBy: operator.user.accountId,
          versions: {
            identityProfileVersion: run.identityProfileVersion || run.profileVersion || null,
            aestheticClusterVersion: run.aestheticClusterVersion || null,
            promiseContractVersion: run.promiseContractVersion || null,
            curationVersion: run.curationReceipt?.curationVersion || null,
          },
        };
        const write = await store.setJSON(
          auditRescueBoardKey(pair.actor.id, pair.vibeIdx, run.runId, receiptId),
          receipt,
          { onlyIfNew: true },
        );
        if (write?.modified === false) {
          return json(409, { error: "Another operator saved this rescue arrangement first." });
        }
        const next = await readReport(store, pair);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      return json(400, { error: "Unknown audit action." });
    } catch (error) {
      const status = error?.status || (error instanceof TypeError ? 400 : 500);
      if (status === 500) console.error("[actor-audit] request failed", error);
      return json(status, {
        error: status === 500 ? "Actor audit request failed." : error.message,
      });
    }
  };
}

export async function runPreflight(
  pair,
  searchOneQuery,
  {
    now = () => new Date(),
    createRunId = () => randomUUID(),
    scope = "full",
    curate = curateDisplayResults,
    preferredCandidateIds = [],
  } = {},
) {
  const startedAt = now().toISOString();
  const queries = scope === "representative" ? pair.vibe.queries.slice(0, 3) : pair.vibe.queries;
  const searchReceipts = new Map();
  const candidates = await evaluateCandidates(queries, async query => {
    try {
      const response = await searchOneQuery(query, { debug: true });
      searchReceipts.set(query, { response, error: null });
      return response;
    } catch (error) {
      searchReceipts.set(query, {
        response: null,
        error: boundedText(error?.message || "provider_error", 300) || "provider_error",
      });
      throw error;
    }
  });
  const ranked = rankCandidates(candidates);
  const rankedForCuration = ranked.slice(0, RANKED_BATCH_LIMIT);
  const profileVersions = {
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
  };
  const curated = rankedForCuration.length
    ? await curate(rankedForCuration, {
      diagnostics: true,
      promise: vibePromiseFor(pair.actor, pair.vibeIdx),
      profileVersions,
      preferredCandidateIds,
    })
    : { displayResults: [], curation: null, diagnostics: null };
  const diagnostics = curated.diagnostics || emptyDiagnostics();
  const profile = ACTOR_IDENTITY_PROFILES[pair.actor.id];
  const identityEvidence = summarizeIdentityEvidence(candidates, profile);
  const queryRuns = candidates.map(candidate => queryRun(
    candidate,
    searchReceipts.get(candidate.query),
    ranked.findIndex(item => item.query === candidate.query),
  ));
  const completedAt = now().toISOString();
  const materialSufficient = curated.displayResults.length >= 9;
  const curationReceipt = {
    ...(diagnostics.receipt || {}),
    ...(curated.curation || {}),
    rawCandidates: diagnostics.rawCandidates || [],
    dropped: diagnostics.dropped || [],
  };

  return {
    runId: createRunId(),
    schemaVersion: 1,
    profileVersion: IDENTITY_PROFILE_VERSION,
    ...profileVersions,
    curationVersion: curationReceipt.curationVersion ?? curationReceipt.version ?? null,
    pairingFingerprint: pairingFingerprintFor(pair.actor, pair.vibeIdx),
    scope,
    startedAt,
    completedAt,
    queryCount: queries.length,
    queryRuns,
    inheritedPreferenceCandidateIds: preferredCandidateIds,
    rawResults: boundedRawResults(candidates, diagnostics),
    rejections: buildRejectionLedger(queryRuns, diagnostics),
    identityEvidence,
    detectedEvents: diagnostics.eventFamilies || [],
    boardDiagnostics: diagnostics.boardDiagnostics || null,
    strongestEvent: diagnostics.strongestEvent || null,
    strongestCompiled: diagnostics.strongestCompiled || null,
    eventAlternatives: diagnostics.eventAlternatives || [],
    compiledAlternatives: diagnostics.compiledAlternatives || [],
    winner: diagnostics.winner
      ? { mode: diagnostics.winner, board: diagnostics[diagnostics.winner === "event" ? "strongestEvent" : "strongestCompiled"] }
      : null,
    alternate: diagnostics.alternate
      ? { mode: diagnostics.alternate, board: diagnostics[diagnostics.alternate === "event" ? "strongestEvent" : "strongestCompiled"] }
      : null,
    curationReceipt,
    displayCount: curated.displayResults.length,
    materialSufficient,
    suggestedState: materialSufficient
      ? identityEvidence.collisionSignals > 0 ? "identity_risk" : "needs_operator_verdict"
      : Number(diagnostics.receipt?.analyzedCount) >= 9
        ? "needs_curation_work"
        : "insufficient_material",
    operatorVerdict: null,
  };
}

function queryRun(candidate, receipt, rankIndex) {
  const rawCount = receipt?.response?.rawCount
    || receipt?.response?.baiduAttemptLog?.rawCount
    || receipt?.response?.results?.length
    || candidate.count;
  const reasons = [];
  if (receipt?.error) reasons.push("provider_error");
  if (candidate.count < MIN_VIABLE_RESULTS) reasons.push("insufficient_clean_results");
  if (rawCount > candidate.count) reasons.push("junk_source_removed");
  const providerFallback = receipt?.response?.fallbackReason
    || receipt?.response?.baiduAttemptLog?.fallbackReason;
  if (providerFallback) reasons.push(String(providerFallback).slice(0, 160));
  return {
    query: String(candidate.query || "").slice(0, 500),
    provider: candidate.provider || null,
    rawCount,
    cleanCount: candidate.count,
    distinctSources: candidate.distinctSources,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    acceptedForCuration: rankIndex >= 0 && rankIndex < RANKED_BATCH_LIMIT,
    rejectionReasons: [...new Set(reasons)],
  };
}

function boundedRawResults(candidates, diagnostics = {}) {
  const frozen = Array.isArray(diagnostics.rawCandidates) ? diagnostics.rawCandidates : [];
  if (frozen.length) {
    const droppedExactCopies = new Set((diagnostics.dropped || [])
      .filter(item => item.dropReason === "exact_duplicate")
      .map(item => item.provisionalCandidateId)
      .filter(Boolean));
    const unique = [];
    const indexById = new Map();
    for (const item of frozen) {
      const candidateId = item.candidateId
        || candidateIdForResult({ ...item, batchKey: item.query, digest: item.imageDigest });
      const next = { ...item, candidateId };
      const existingIndex = indexById.get(candidateId);
      if (existingIndex === undefined) {
        indexById.set(candidateId, unique.length);
        unique.push(next);
      } else if (
        droppedExactCopies.has(unique[existingIndex].provisionalCandidateId)
        && !droppedExactCopies.has(item.provisionalCandidateId)
      ) {
        unique[existingIndex] = next;
      }
    }
    return unique.slice(0, MAX_RAW_RESULTS).map(item => ({
      candidateId: item.candidateId
        || candidateIdForResult({ ...item, batchKey: item.query, digest: item.imageDigest }),
      provisionalCandidateId: item.provisionalCandidateId || null,
      imageDigest: String(item.imageDigest || "").slice(0, 256) || null,
      query: String(item.query || "").slice(0, 500),
      title: String(item.title || "").slice(0, 240),
      description: String(item.description || "").slice(0, 400),
      source: String(item.source || "").slice(0, 120),
      link: String(item.link || "").slice(0, 700),
      thumbnail: String(item.thumbnail || "").slice(0, 700),
      dropReason: item.dropReason || null,
      dropDetail: String(item.dropDetail || "").slice(0, 400) || null,
      promise: item.promise || null,
    }));
  }
  return candidates.flatMap(candidate => (candidate.results || []).map(result => ({
    candidateId: candidateIdForResult({ ...result, batchKey: result.batchKey || candidate.query }),
    imageDigest: null,
    query: String(candidate.query || "").slice(0, 500),
    title: String(result.title || "").slice(0, 240),
    description: String(result.description || "").slice(0, 400),
    source: String(result.source || "").slice(0, 120),
    link: String(result.link || "").slice(0, 700),
    thumbnail: String(result.thumbnail || "").slice(0, 700),
  }))).slice(0, MAX_RAW_RESULTS);
}

function buildRejectionLedger(queryRuns, diagnostics) {
  const queryRejections = queryRuns.flatMap(item => item.rejectionReasons.map(reason => ({
    kind: "query",
    query: item.query,
    reason,
  })));
  const imageRejections = (diagnostics.dropped || []).map(item => ({
    kind: "image",
    candidateId: item.candidateId || null,
    link: item.link || null,
    title: item.title,
    source: item.source,
    thumbnail: item.thumbnail,
    reason: item.dropReason,
    dropDetail: item.dropDetail || null,
  }));
  return [...queryRejections, ...imageRejections].slice(0, MAX_RAW_RESULTS);
}

function summarizeIdentityEvidence(candidates, profile) {
  const canonical = profile?.canonicalNames || [];
  const aliases = profile?.aliases || [];
  const collisions = [...(profile?.commonCollisions || []), ...(profile?.knownContamination || [])]
    .map(value => String(value).toLowerCase());
  const trusted = (profile?.trustedSourcePatterns || []).map(value => String(value).toLowerCase());
  const problematic = (profile?.problematicSourcePatterns || []).map(value => String(value).toLowerCase());
  const items = candidates.flatMap(candidate => candidate.results || []).slice(0, MAX_IDENTITY_ITEMS);
  let canonicalMentions = 0;
  let aliasMentions = 0;
  let collisionSignals = 0;
  let trustedSourceSignals = 0;
  let problematicSourceSignals = 0;
  const evidenceItems = items.map(item => {
    const text = `${item.title || ""} ${item.description || ""}`.toLowerCase();
    const source = String(item.source || "").toLowerCase();
    const canonicalMention = canonical.some(name => text.includes(String(name).toLowerCase()));
    const aliasMention = aliases.some(name => text.includes(String(name).toLowerCase()));
    const collisionMatches = collisions.filter(value => value && text.includes(value));
    const trustedMatch = trusted.some(value => value && source.includes(value));
    const problematicMatch = problematic.some(value => value && source.includes(value));
    if (canonicalMention) canonicalMentions += 1;
    if (aliasMention) aliasMentions += 1;
    collisionSignals += collisionMatches.length;
    if (trustedMatch) trustedSourceSignals += 1;
    if (problematicMatch) problematicSourceSignals += 1;
    return {
      title: String(item.title || "").slice(0, 240),
      source: String(item.source || "").slice(0, 120),
      canonicalMention,
      aliasMention,
      collisionMatches: collisionMatches.slice(0, 4),
      trustedSourceSignal: trustedMatch,
      problematicSourceSignal: problematicMatch,
    };
  });
  return {
    heuristic: "Metadata and source-pattern signals only; these do not prove visual identity.",
    candidateCount: items.length,
    canonicalMentions,
    aliasMentions,
    collisionSignals,
    trustedSourceSignals,
    problematicSourceSignals,
    items: evidenceItems,
  };
}

async function appendRun(store, pair, run) {
  await store.setJSON(auditRunKey(pair.actor.id, pair.vibeIdx, run.runId), run);
  await store.setJSON(auditHeadKey(pair.actor.id, pair.vibeIdx), {
    schemaVersion: 1,
    actorId: pair.actor.id,
    vibeIdx: pair.vibeIdx,
    currentRunId: run.runId,
    updatedAt: run.completedAt,
  });
  return readReport(store, pair);
}

async function listActors(store, actorPacks) {
  return Promise.all(actorPacks.map(actor => actorSummary(store, actorPacks, actor)));
}

async function actorSummary(store, actorPacks, actor) {
  const profile = ACTOR_IDENTITY_PROFILES[actor.id] || emptyProfile(actor);
  const pairings = await Promise.all(actor.vibes.map(async (vibe, vibeIdx) => {
    const pair = resolvePair(actorPacks, actor.id, vibeKeyFor(actor.id, vibeIdx));
    return pairingSummary(pair, await readReport(store, pair));
  }));
  return {
    actorId: actor.id,
    canonicalName: actor.name,
    romanizedName: actor.shortName_en,
    profileVersion: IDENTITY_PROFILE_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
    ...profile,
    pairings,
  };
}

function pairingSummary(pair, report) {
  const current = report?.currentRun || null;
  const currentVerdict = current && report?.verdictRunId === current.runId ? report.verdict : null;
  const reviewPending = Boolean(current && comparableBoards(current) && !current.blindReview?.choice);
  const comparisonUnavailable = Boolean(current && !comparableBoards(current) && !currentVerdict);
  const needsReapproval = Boolean(current && !currentRunMatchesCurrentContract(current, pair));
  const eligible = Boolean(
    current
    && currentRunMatchesCurrentContract(current, pair)
    && currentVerdict
    && current.blindReview?.choice
    && (!isDisagreement(current, current.blindReview) || current.blindReview.reasonCodes?.length)
    && APPROVED_VERDICTS.has(currentVerdict),
  );
  return {
    vibeKey: pair.vibeKey,
    vibeIdx: pair.vibeIdx,
    labels: [pair.vibe.label, pair.vibe.label_en].filter(Boolean),
    queryCount: pair.vibe.queries.length,
    auditState: needsReapproval
      ? "needs_reapproval"
      : reviewPending
        ? "blind_review_pending"
        : comparisonUnavailable
          ? "comparison_unavailable"
          : currentVerdict || current?.suggestedState || "not_run",
    lastRunAt: current?.completedAt || null,
    currentRunId: current?.runId || null,
    verdict: currentVerdict,
    notes: currentVerdict ? report.notes : "",
    verdictAt: currentVerdict ? report.verdictAt : null,
    eligible: needsReapproval ? false : reviewPending ? null : eligible,
  };
}

function currentRunMatchesCurrentContract(run, pair) {
  return Boolean(
    run
    && run.profileVersion === IDENTITY_PROFILE_VERSION
    && run.identityProfileVersion === IDENTITY_PROFILE_VERSION
    && run.aestheticClusterVersion === AESTHETIC_CLUSTER_VERSION
    && run.promiseContractVersion === VIBE_PROMISE_CONTRACT_VERSION
    && (run.curationVersion ?? run.curationReceipt?.curationVersion) === CURATION_VERSION
    && run.pairingFingerprint === pairingFingerprintFor(pair.actor, pair.vibeIdx)
  );
}
function detailResponse(pair, report) {
  const revealed = Boolean(report?.currentRun?.blindReview?.choice);
  return {
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    currentRun: clientRun(report?.currentRun, pair),
    priorRuns: (report?.priorRuns || []).map(run => clientRun(run, pair)),
    verdict: revealed ? report?.verdict || null : null,
    notes: revealed ? report?.notes || "" : "",
    verdictAt: revealed ? report?.verdictAt || null : null,
  };
}

function emptyProfile(actor) {
  return {
    canonicalNames: [actor.name],
    romanizedNames: [actor.shortName_en].filter(Boolean),
    aliases: [actor.shortName].filter(Boolean),
    commonCollisions: [],
    representativeWorks: [],
    knownContamination: [],
    productStockMeanings: [],
    trustedSourcePatterns: [],
    problematicSourcePatterns: [],
  };
}

function emptyDiagnostics() {
  return {
    rawCandidates: [],
    dropped: [],
    eventFamilies: [],
    strongestEvent: null,
    strongestCompiled: null,
    eventAlternatives: [],
    compiledAlternatives: [],
    boardDiagnostics: null,
    winner: null,
    alternate: null,
    receipt: { rawCount: 0, analyzedCount: 0 },
  };
}

async function readReport(store, pair) {
  const head = await store.get(auditHeadKey(pair.actor.id, pair.vibeIdx), {
    type: "json",
    consistency: "strong",
  });
  const listing = await store.list({ prefix: auditRunPrefix(pair.actor.id, pair.vibeIdx) });
  const runs = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const run = await store.get(blob.key, { type: "json", consistency: "strong" });
    return run ? attachVerdict(store, pair, run) : null;
  })))
    .filter(Boolean)
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const currentRun = runs.find(run => run.runId === head?.currentRunId) || null;
  const currentVerdict = currentRun?.operatorVerdict || null;
  return {
    schemaVersion: 1,
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    vibeIdx: pair.vibeIdx,
    verdict: currentVerdict?.verdict || null,
    notes: currentVerdict?.notes || "",
    verdictAt: currentVerdict?.decidedAt || null,
    verdictRunId: currentVerdict ? currentRun.runId : null,
    currentRun,
    priorRuns: runs.filter(run => run.runId !== currentRun?.runId).slice(0, MAX_RETAINED_RUNS),
  };
}

async function readRun(store, pair, runId) {
  const run = await store.get(auditRunKey(pair.actor.id, pair.vibeIdx, runId), {
    type: "json",
    consistency: "strong",
  });
  return run ? attachVerdict(store, pair, run) : null;
}

async function attachVerdict(store, pair, run) {
  const normalizedRun = normalizeLegacyRunEvidence(run);
  const [operatorVerdict, calibration, reasons, editorialFeedback] = await Promise.all([
    readFirstReceipt(store, auditVerdictPrefix(pair.actor.id, pair.vibeIdx, normalizedRun.runId), "decidedAt"),
    readFirstReceipt(store, auditCalibrationPrefix(pair.actor.id, pair.vibeIdx, normalizedRun.runId), "chosenAt"),
    readFirstReceipt(store, auditCalibrationReasonsPrefix(pair.actor.id, pair.vibeIdx, normalizedRun.runId), "annotatedAt"),
    readEditorialFeedback(store, pair, normalizedRun),
  ]);
  const boardDiagnostics = normalizedRun.boardDiagnostics
    || boardDiagnosticsFromRetainedEvidence(normalizedRun);
  return {
    ...normalizedRun,
    boardDiagnostics,
    editorialFeedback,
    operatorVerdict: operatorVerdict || null,
    blindReview: calibration
      ? { ...calibration, ...(reasons || {}) }
      : {
        status: comparableBoards(normalizedRun) ? "pending" : "unavailable",
        presentationOrder: presentationOrderFor(normalizedRun.runId),
        boards: blindBoards(normalizedRun, presentationOrderFor(normalizedRun.runId)),
      },
  };
}

function normalizeLegacyRunEvidence(run) {
  const curationVersion = run.curationVersion
    ?? run.curationReceipt?.curationVersion
    ?? run.curationReceipt?.version
    ?? 0;
  const legacyDigestUrls = new Map();
  if (curationVersion < CURATION_VERSION) {
    for (const item of run.rawResults || []) {
      if (!item.imageDigest) continue;
      const urls = legacyDigestUrls.get(item.imageDigest) || new Set();
      urls.add(String(item.thumbnail || ""));
      legacyDigestUrls.set(item.imageDigest, urls);
    }
  }
  const untrustedLegacyDigests = new Set([...legacyDigestUrls.entries()]
    .filter(([, urls]) => urls.size > 3)
    .map(([digest]) => digest));
  const rawResults = (run.rawResults || []).map(item => ({
    ...item,
    candidateId: item.candidateId || candidateIdForResult({
      ...item,
      batchKey: item.query,
      imageDigest: untrustedLegacyDigests.has(item.imageDigest) ? "" : item.imageDigest,
      digest: untrustedLegacyDigests.has(item.imageDigest) ? "" : item.imageDigest || "",
    }),
  }));
  const rawByThumbnail = new Map();
  for (const item of rawResults) {
    if (item.thumbnail && !rawByThumbnail.has(item.thumbnail)) {
      rawByThumbnail.set(item.thumbnail, item);
    }
  }
  const enrich = item => {
    if (!item) return item;
    const raw = rawByThumbnail.get(item.thumbnail);
    return {
      ...item,
      candidateId: item.candidateId
        || raw?.candidateId
        || candidateIdForResult({
          ...item,
          batchKey: item.query || raw?.query,
          digest: item.imageDigest || "",
        }),
      query: item.query || raw?.query,
      link: item.link || raw?.link,
      description: item.description || raw?.description,
    };
  };
  const enrichBoard = board => board ? {
    ...board,
    candidates: (board.candidates || []).map(enrich),
  } : board;
  const legacyDuplicateReason = reason =>
    curationVersion < CURATION_VERSION && reason === "exact_duplicate"
      ? "legacy_duplicate_unverified"
      : reason;
  const curationReceipt = run.curationReceipt ? {
    ...run.curationReceipt,
    rawCandidates: (run.curationReceipt.rawCandidates || []).map(enrich),
    dropped: (run.curationReceipt.dropped || []).map(enrich),
  } : run.curationReceipt;
  return {
    ...run,
    rawResults,
    curationReceipt,
    rejections: (run.rejections || []).map(item => item.kind === "image" ? {
      ...enrich(item),
      reason: legacyDuplicateReason(item.reason),
      dropDetail: curationVersion < CURATION_VERSION && item.reason === "exact_duplicate"
        ? "An older curation contract could not prove this was a duplicate. Treat it as retained evidence."
        : item.dropDetail,
    } : item),
    strongestEvent: enrichBoard(run.strongestEvent),
    strongestCompiled: enrichBoard(run.strongestCompiled),
    eventAlternatives: (run.eventAlternatives || []).map(enrichBoard),
    compiledAlternatives: (run.compiledAlternatives || []).map(enrichBoard),
    winner: run.winner ? { ...run.winner, board: enrichBoard(run.winner.board) } : run.winner,
    alternate: run.alternate ? { ...run.alternate, board: enrichBoard(run.alternate.board) } : run.alternate,
  };
}

function emptyEditorialFeedback() {
  return {
    schemaVersion: 1,
    eventCount: 0,
    flags: [],
    feedbackHash: feedbackHash([]),
    requestedReview: null,
    operatorRescueBoard: null,
  };
}

async function readEditorialFeedback(store, pair, run) {
  const listing = await store.list({
    prefix: auditFeedbackPrefix(pair.actor.id, pair.vibeIdx, run.runId),
  });
  const receipts = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const value = await store.get(blob.key, { type: "json", consistency: "strong" });
    return value ? { key: blob.key, value } : null;
  }))).filter(item => item?.value?.candidateId);
  receipts.sort((left, right) =>
    String(left.value.createdAt || "").localeCompare(String(right.value.createdAt || ""))
    || left.key.localeCompare(right.key));
  const latest = new Map();
  for (const receipt of receipts) {
    if (receipt.value.runId !== run.runId || receipt.value.actorId !== pair.actor.id
      || receipt.value.vibeKey !== pair.vibeKey) continue;
    latest.set(receipt.value.candidateId, receipt.value);
  }
  const flags = [...latest.values()]
    .filter(receipt => receipt.flagged === true)
    .map(receipt => ({
      ...receipt,
      ...feedbackDisposition(receipt, candidateGate(run, receipt.candidateId)),
    }))
    .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  const feedback = {
    schemaVersion: 1,
    eventCount: receipts.length,
    flags,
    feedbackHash: feedbackHash(flags),
    requestedReview: null,
    operatorRescueBoard: await readLatestReceipt(
      store,
      auditRescueBoardPrefix(pair.actor.id, pair.vibeIdx, run.runId),
      "savedAt",
    ),
  };
  if (flags.length) {
    feedback.requestedReview = await store.get(
      auditRequestedReviewKey(pair.actor.id, pair.vibeIdx, run.runId, feedback.feedbackHash),
      { type: "json", consistency: "strong" },
    );
  }
  return feedback;
}

function feedbackHash(flags) {
  return recordHash(flags.map(flag => ({
    candidateId: flag.candidateId,
    eventId: flag.eventId,
    flagged: flag.flagged,
    intent: flag.intent,
    reasons: flag.reasons || [],
  }))).slice(0, 32);
}

function nextReviewPreferenceIds(run) {
  if (!run) return [];
  return [...new Set((run.editorialFeedback?.flags || [])
    .filter(flag =>
      flag.disposition === "requested"
      && ["pin", "hero", "supporting"].includes(flag.intent)
      && typeof flag.candidateId === "string")
    .map(flag => flag.candidateId))];
}

function candidateGate(run, candidateId) {
  const raw = (run.rawResults || []).find(item =>
    item.candidateId === candidateId
    || (!item.candidateId && candidateIdForResult({ ...item, batchKey: item.query }) === candidateId));
  if (!raw) return { disposition: "blocked", blockedReason: "not_retained" };
  const rawCandidates = run.curationReceipt?.rawCandidates || [];
  const dropped = (run.curationReceipt?.dropped || []).find(item =>
    item.candidateId === candidateId);
  const analyzed = rawCandidates.find(item => item.candidateId === candidateId);
  const reason = dropped?.dropReason || analyzed?.dropReason || null;
  if (!raw.thumbnail || reason === "image_load_failed") {
    return { disposition: "blocked", blockedReason: "unavailable" };
  }
  if (!analyzed) return { disposition: "blocked", blockedReason: "not_analyzed_in_audit" };
  return { disposition: "requested", blockedReason: null };
}

async function persistRequestedReview(store, pair, run, now) {
  const flags = run.editorialFeedback?.flags || [];
  if (!flags.length) return null;
  const hash = feedbackHash(flags);
  const key = auditRequestedReviewKey(pair.actor.id, pair.vibeIdx, run.runId, hash);
  const existing = await store.get(key, { type: "json", consistency: "strong" });
  if (existing) return existing;
  const eligibleFlags = flags.filter(flag => flag.disposition === "requested");
  const board = eligibleFlags.length ? buildFrozenRescueBoard(run, flags) : null;
  const review = {
    schemaVersion: 1,
    sourceRunId: run.runId,
    feedbackHash: hash,
    generatedAt: now().toISOString(),
    status: eligibleFlags.length ? "needs_more_candidates" : "blocked",
    flaggedCandidates: flags.map(flag => ({
      candidateId: flag.candidateId,
      title: flag.candidate?.title || "",
      thumbnail: flag.candidate?.thumbnail || "",
      intent: flag.intent || "pin",
      reasons: flag.reasons || [],
      disposition: flag.disposition,
      blockedReason: flag.blockedReason,
    })),
    blockedCandidates: flags
      .filter(flag => flag.disposition !== "requested")
      .map(flag => ({
        candidateId: flag.candidateId,
        reason: flag.blockedReason,
        equivalentRequest: flag.equivalentRequest || null,
      })),
    board,
    summary: board
      ? "A provisional rescue board was composed from this run's retained, displayable evidence. Algorithm labels remain attached but do not veto the operator's rescue."
      : eligibleFlags.length
        ? "Choose exactly nine retained, displayable images for the rescue board."
        : "Every preference is excluded or unavailable.",
  };
  review.status = board ? "provisional_board" : eligibleFlags.length ? "needs_more_candidates" : "blocked";
  const write = await store.setJSON(key, review, { onlyIfNew: true });
  return write?.modified === false ? store.get(key, { type: "json", consistency: "strong" }) : review;
}

function feedbackDisposition(receipt, gate) {
  if (receipt.intent === "exclude") {
    return { disposition: "excluded", blockedReason: null };
  }
  return gate;
}

function buildFrozenRescueBoard(run, flags) {
  const excludedIds = new Set(flags
    .filter(flag => flag.disposition === "excluded")
    .map(flag => flag.candidateId));
  const byId = canonicalFrozenCandidates(run, excludedIds);
  const approved = [...byId.values()];
  const requested = flags
    .filter(flag =>
      flag.disposition === "requested"
      && ["pin", "hero", "supporting"].includes(flag.intent)
      && byId.has(flag.candidateId))
    .sort((left, right) => intentPriority(left.intent) - intentPriority(right.intent)
      || left.candidateId.localeCompare(right.candidateId));
  const winnerMode = run.winner?.mode;
  const winnerBoard = winnerMode === "event" ? run.strongestEvent : run.strongestCompiled;
  const ordered = [];
  const add = candidate => {
    const frozen = candidate && byId.get(candidate.candidateId);
    if (frozen && !ordered.some(item => item.candidateId === frozen.candidateId)) ordered.push(frozen);
  };
  requested.forEach(flag => add(byId.get(flag.candidateId)));
  (winnerBoard?.candidates || []).forEach(add);
  [...approved].sort((left, right) => left.candidateId.localeCompare(right.candidateId)).forEach(add);
  const requestedHeroIds = new Set(requested
    .filter(flag => flag.intent === "hero")
    .map(flag => flag.candidateId));
  const hero = ordered.find(candidate => requestedHeroIds.has(candidate.candidateId))
    || (winnerBoard?.candidates?.[4] && byId.get(winnerBoard.candidates[4].candidateId)
      ? byId.get(winnerBoard.candidates[4].candidateId)
      : null)
    || ordered[0];
  if (!hero) return null;
  const remaining = ordered.filter(candidate => candidate.candidateId !== hero.candidateId);
  if (ordered.length < 9) return null;
  const arranged = Array(9);
  arranged[4] = hero;
  for (const slot of [1, 3, 5, 7]) arranged[slot] = remaining.shift();
  for (const slot of [0, 2, 6, 8]) arranged[slot] = remaining.shift();
  if (arranged.some(candidate => !candidate)) return null;
  return {
    mode: "operator_rescue",
    operatorOverride: true,
    candidates: arranged,
    promise: {
      coreCount: arranged.filter(candidate =>
        candidate.promise?.coreSatisfied && candidate.promise?.incompatibleCluster !== true).length,
      heroFulfillment: arranged[4].promise?.heroSatisfied === true ? 1 : 0,
      singleFrameRatio: Math.min(...arranged.map(candidate =>
        Number(candidate.promise?.singleFrameRatio ?? 1))),
    },
    requestedCandidateIds: requested.map(flag => flag.candidateId),
    honoredCandidateIds: requested
      .filter(flag => arranged.some(candidate => candidate.candidateId === flag.candidateId))
      .map(flag => flag.candidateId),
  };
}

function validateRescueArrangement(run, candidateIds) {
  if (!Array.isArray(candidateIds) || candidateIds.length !== 9
    || candidateIds.some(candidateId => typeof candidateId !== "string")
    || new Set(candidateIds).size !== 9) {
    return { ok: false, error: "A rescue arrangement must contain nine distinct retained candidates." };
  }
  const excludedIds = new Set((run.editorialFeedback?.flags || [])
    .filter(flag => flag.disposition === "excluded")
    .map(flag => flag.candidateId));
  const approved = canonicalFrozenCandidates(run, excludedIds);
  const candidates = candidateIds.map(candidateId => approved.get(candidateId));
  if (candidates.some(candidate => !candidate)) {
    return {
      ok: false,
      error: "A rescue board can only use this run's retained, displayable, non-excluded candidates.",
    };
  }
  const coreCount = candidates.filter(candidate =>
    candidate.promise?.coreSatisfied && candidate.promise?.incompatibleCluster !== true).length;
  return {
    ok: true,
    board: {
      mode: "operator_rescue",
      operatorOverride: true,
      candidates,
      promise: {
        coreCount,
        heroFulfillment: candidates[4].promise?.heroSatisfied === true ? 1 : 0,
        singleFrameRatio: Math.min(...candidates.map(candidate =>
          Number(candidate.promise?.singleFrameRatio ?? 1))),
      },
    },
  };
}

function canonicalFrozenCandidates(run, excludedIds = new Set()) {
  const unavailableIds = new Set((run.curationReceipt?.dropped || [])
    .filter(candidate => candidate.dropReason === "image_load_failed")
    .map(candidate => candidate.candidateId));
  const canonicalById = new Map();
  const evidence = [
    ...(run.curationReceipt?.rawCandidates || []),
    ...(run.rawResults || []),
  ];
  for (const candidate of evidence) {
    if (!candidate?.candidateId
      || !candidate.thumbnail
      || candidate.dropReason === "image_load_failed"
      || unavailableIds.has(candidate.candidateId)
      || excludedIds.has(candidate.candidateId)
      || canonicalById.has(candidate.candidateId)) continue;
    canonicalById.set(candidate.candidateId, candidate);
  }
  return canonicalById;
}

function intentPriority(intent) {
  return intent === "hero" ? 0 : intent === "pin" ? 1 : intent === "supporting" ? 2 : 3;
}

function boardDiagnosticsFromRetainedEvidence(run) {
  const requiredCount = 9;
  const usableCount = Number(run?.curationReceipt?.analyzedCount) || 0;
  const exactDuplicateCount = (run?.rejections || [])
    .filter(item => item?.kind === "image" && item?.reason === "exact_duplicate")
    .length;
  const distinctUsableCount = Math.max(0, usableCount - exactDuplicateCount);
  const largestFamilyCount = (run?.detectedEvents || []).reduce(
    (largest, family) => Math.max(largest, Number(family?.size) || 0),
    0,
  );
  const diagnostic = mode => {
    const board = run?.[mode === "event" ? "strongestEvent" : "strongestCompiled"];
    if (Array.isArray(board?.candidates) && board.candidates.length >= requiredCount) {
      return {
        available: true,
        requiredCount,
        candidateCount: board.candidates.length,
        usableCount,
        distinctUsableCount,
        largestFamilyCount,
        reasonCodes: [],
        reasonCode: null,
        summary: `A complete ${requiredCount}-card ${mode === "event" ? "Event" : "Compiled"} board qualified.`,
      };
    }

    let reasonCode;
    let summary;
    if (usableCount < requiredCount) {
      reasonCode = "too_few_usable_images";
      summary = `${mode === "event" ? "Event" : "Compiled"} had ${usableCount} usable image${usableCount === 1 ? "" : "s"}; ${requiredCount} are required.`;
    } else if (mode === "compiled" || distinctUsableCount < requiredCount || largestFamilyCount >= requiredCount) {
      reasonCode = "too_much_visual_duplication";
      summary = mode === "event"
        ? `The strongest retained Event family had ${largestFamilyCount} frames, but visual duplication kept it from producing ${requiredCount} distinct cards.`
        : `Compiled had enough usable images, but visual overlap prevented ${requiredCount} sufficiently distinct frames from forming one varied board.`;
    } else if (largestFamilyCount === 0) {
      reasonCode = "no_bounded_role_family";
      summary = "No bounded work or role family produced enough distinct frames for an Event board. Make the query more specific.";
    } else {
      reasonCode = "event_family_too_small";
      summary = `The strongest retained Event family had ${largestFamilyCount} frames; ${requiredCount} distinct frames are required.`;
    }
    return {
      available: false,
      requiredCount,
      candidateCount: 0,
      usableCount,
      distinctUsableCount,
      largestFamilyCount,
      reasonCodes: [reasonCode],
      reasonCode,
      summary,
    };
  };
  return {
    event: diagnostic("event"),
    compiled: diagnostic("compiled"),
  };
}

function comparableBoards(run) {
  return [run?.strongestEvent, run?.strongestCompiled]
    .every(board => Array.isArray(board?.candidates) && board.candidates.length >= 9);
}

function presentationOrderFor(runId) {
  const bit = Number.parseInt(createHash("sha256").update(`blind:${runId}`).digest("hex").slice(0, 8), 16) % 2;
  return bit === 0 ? ["event", "compiled"] : ["compiled", "event"];
}

function boardHash(board) {
  return createHash("sha256").update(JSON.stringify(
    (board?.candidates || []).map(candidate => ({
      thumbnail: candidate.thumbnail || "",
      title: candidate.title || "",
      source: candidate.source || "",
      batchRank: candidate.batchRank ?? null,
    })),
  )).digest("hex");
}

function boardSnapshot(board, mode) {
  return board ? {
    mode,
    boardId: `${mode}-${boardHash(board).slice(0, 16)}`,
    boardHash: boardHash(board),
  } : null;
}

function blindBoards(run, order) {
  return order.map(mode => ({
    mode,
    label: mode === "event" ? "Event" : "Compiled",
    board: run?.[mode === "event" ? "strongestEvent" : "strongestCompiled"]
      ? {
        candidates: run[mode === "event" ? "strongestEvent" : "strongestCompiled"].candidates || [],
      }
      : null,
  }));
}

function createCalibration(pair, run, choice, operator, now) {
  const presentationOrder = presentationOrderFor(run.runId);
  return {
    schemaVersion: 1,
    status: "revealed",
    runId: run.runId,
    actorId: pair.actor.id,
    actorName: pair.actor.name,
    vibeKey: pair.vibeKey,
    vibeLabel: pair.vibe.label_en || pair.vibe.label || pair.vibeKey,
    presentationOrder,
    experiment: {
      auditRunId: run.runId,
      actorId: pair.actor.id,
      actorName: pair.actor.name,
      vibeKey: pair.vibeKey,
      vibeLabel: pair.vibe.label_en || pair.vibe.label || pair.vibeKey,
      eventBoard: boardSnapshot(run.strongestEvent, "event"),
      compiledBoard: boardSnapshot(run.strongestCompiled, "compiled"),
      curationVersion: run.curationReceipt?.curationVersion || run.curationReceipt?.version || null,
      identityProfileVersion: run.identityProfileVersion || run.profileVersion || null,
      aestheticClusterVersion: run.aestheticClusterVersion || null,
      promiseContractVersion: run.promiseContractVersion || null,
      systemWinner: run.winner?.mode || null,
    },
    choice,
    chosenAt: now().toISOString(),
    chosenBy: operator.user.accountId,
    agreement: choice !== "neither" && choice === run.winner?.mode,
    systemWinner: run.winner?.mode || null,
    boards: blindBoards(run, presentationOrder),
  };
}

function isDisagreement(run, review) {
  return Boolean(review?.choice && review.choice !== run?.winner?.mode);
}

function calibrationSnapshot(review, verdict, notes, decidedAt, decidedBy) {
  return {
    schemaVersion: review.schemaVersion || 1,
    auditRunId: review.experiment?.auditRunId || review.runId,
    actorId: review.experiment?.actorId || review.actorId,
    vibeKey: review.experiment?.vibeKey || review.vibeKey,
    eventBoard: review.experiment?.eventBoard || null,
    compiledBoard: review.experiment?.compiledBoard || null,
    presentationOrder: review.presentationOrder || [],
    curationVersion: review.experiment?.curationVersion || null,
    identityProfileVersion: review.experiment?.identityProfileVersion || null,
    aestheticClusterVersion: review.experiment?.aestheticClusterVersion || null,
    promiseContractVersion: review.experiment?.promiseContractVersion || null,
    humanChoice: review.choice,
    humanChoiceAt: review.chosenAt,
    humanChoiceBy: review.chosenBy,
    systemWinner: review.systemWinner || null,
    agreement: review.agreement === true,
    reasonCodes: review.reasonCodes || [],
    disagreementNote: review.note || "",
    disagreementAnnotatedAt: review.annotatedAt || null,
    disagreementAnnotatedBy: review.annotatedBy || null,
    finalSchedulingVerdict: verdict,
    finalSchedulingNotes: notes,
    finalSchedulingAt: decidedAt,
    finalSchedulingBy: decidedBy,
  };
}

function parseReasons(value) {
  if (!Array.isArray(value) || value.length > DISAGREEMENT_REASONS.size) return null;
  const reasons = [...new Set(value)];
  return reasons.every(reason => typeof reason === "string" && DISAGREEMENT_REASONS.has(reason))
    ? reasons
    : null;
}

function parseChallengeReasons(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CHALLENGE_REASONS.size) return null;
  const reasons = [...new Set(value)];
  return reasons.every(reason => typeof reason === "string" && CHALLENGE_REASONS.has(reason))
    ? reasons
    : null;
}

function clientRun(run, pair) {
  if (!run) return null;
  const review = run.blindReview || {
    status: comparableBoards(run) ? "pending" : "unavailable",
    presentationOrder: presentationOrderFor(run.runId),
    boards: blindBoards(run, presentationOrderFor(run.runId)),
  };
  if (review.choice || review.status === "unavailable") return run;
  return {
    runId: run.runId,
    schemaVersion: run.schemaVersion,
    profileVersion: run.profileVersion,
    identityProfileVersion: run.identityProfileVersion,
    aestheticClusterVersion: run.aestheticClusterVersion,
    promiseContractVersion: run.promiseContractVersion,
    curationVersion: run.curationVersion ?? run.curationReceipt?.curationVersion ?? null,
    pairingFingerprint: run.pairingFingerprint,
    scope: run.scope,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    queryCount: run.queryCount,
    blindReview: review,
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
  };
}

async function readFirstReceipt(store, prefix, timestampField) {
  const listing = await store.list({ prefix });
  const receipts = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const value = await store.get(blob.key, { type: "json", consistency: "strong" });
    return value ? { key: blob.key, value } : null;
  }))).filter(Boolean);
  receipts.sort((left, right) =>
    String(left.value[timestampField] || "").localeCompare(String(right.value[timestampField] || ""))
    || left.key.localeCompare(right.key));
  return receipts[0]?.value || null;
}

async function readLatestReceipt(store, prefix, timestampField) {
  const listing = await store.list({ prefix });
  const receipts = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const value = await store.get(blob.key, { type: "json", consistency: "strong" });
    return value ? { key: blob.key, value } : null;
  }))).filter(Boolean);
  receipts.sort((left, right) =>
    String(right.value[timestampField] || "").localeCompare(String(left.value[timestampField] || ""))
    || right.key.localeCompare(left.key));
  return receipts[0]?.value || null;
}

function recordHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeEligibility(store, pair, snapshot) {
  const value = snapshot || {
    schemaVersion: 1,
    profileVersion: IDENTITY_PROFILE_VERSION,
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    vibeIdx: pair.vibeIdx,
    pairingFingerprint: pairingFingerprintFor(pair.actor, pair.vibeIdx),
    verdict: null,
    eligible: false,
  };
  await store.setJSON(eligibilityKey(pair.actor.id, pair.vibeIdx), value);
}

export function vibeKeyFor(actorId, vibeIdx) {
  return auditVibeKey(actorId, vibeIdx);
}

function resolvePair(packs, actorId, vibeKey) {
  if (typeof actorId !== "string" || typeof vibeKey !== "string") return null;
  const actor = packs.find(item => item.id === actorId);
  if (!actor) return null;
  const match = vibeKey.match(new RegExp(`^${escapeRegex(actorId)}:(\\d+)$`));
  if (!match) return null;
  const vibeIdx = Number(match[1]);
  const vibe = actor.vibes?.[vibeIdx];
  return vibe ? { actor, vibe, vibeIdx, vibeKey } : null;
}

function parseScope(value) {
  return value === "representative" || value === "full" ? value : null;
}

function boundedText(value, max) {
  if (value === undefined) return "";
  return typeof value === "string" && value.length <= max ? value.trim() : null;
}

async function readJson(req) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new TypeError("Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new TypeError("Request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError("Request must be valid JSON.");
  }
}

function requireSameOrigin(req) {
  if (req.headers.get("origin") !== new URL(req.url).origin) {
    const error = new Error("Cross-origin requests are not allowed.");
    error.status = 403;
    throw error;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
