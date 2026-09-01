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
  auditEligibilityDecisionKey,
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
  auditRescuePreferenceKey,
  auditRescueCalibrationKey,
  auditRescueCalibrationPrefix,
  auditRescueCalibrationRetirementKey,
  auditRescueCalibrationRetirementPrefix,
  auditVerdictKey,
  auditVerdictPrefix,
  auditVibeKey,
  eligibilityKey,
  pairingFingerprintFor,
  rescueCalibrationRetirementHash,
  getEligibility,
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
import { STAR_OF_DAY_VERSION } from "../star-of-day.js";

const MAX_BODY_BYTES = 48 * 1024;
const MAX_NOTE_LENGTH = 2000;
const MAX_CALIBRATION_NOTE_LENGTH = 1000;

const MAX_CALIBRATION_RETIREMENT_REASON_LENGTH = 1000;
const MAX_RETAINED_RUNS = 12;
const MAX_RAW_RESULTS = 36;
const MAX_IDENTITY_ITEMS = 36;
const MAX_FEEDBACK_EVENTS = 72;
const MAX_FEEDBACK_NOTE_LENGTH = 400;
const RESCUE_CALIBRATION_VERSION = 1;
const MIN_REUSABLE_SIGNAL_DELTA = 0.15;
const MIN_REUSABLE_SIGNAL_SUPPORT = 2;
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
  getPublicationStore = getStore,
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
        const calibrationProfile = await readRescueCalibrationProfile(store, pair);
        const reviewPreferenceCandidateIds = nextReviewPreferenceIds(previous.currentRun);
        const preferredCandidateIds = [
          ...new Set([
            ...reviewPreferenceCandidateIds,
            ...(calibrationProfile?.positiveCandidateIds || []),
          ]),
        ];
        const run = await runPreflight(pair, searchOneQuery, {
          now,
          createRunId,
          scope,
          curate,
          preferredCandidateIds,
          reviewPreferenceCandidateIds,
          calibrationProfile,
        });
        const { report, advanced } = await appendRun(store, pair, run);
        if (advanced) {
          await writeEligibility(store, pair, {
            schemaVersion: 1,
            profileVersion: IDENTITY_PROFILE_VERSION,
            identityProfileVersion: IDENTITY_PROFILE_VERSION,
            aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
            promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
            curationVersion: run.curationReceipt?.curationVersion || null,
            actorId: pair.actor.id,
            vibeKey: pair.vibeKey,
            vibeIdx: pair.vibeIdx,
            runId: run.runId,
            pairingFingerprint: run.pairingFingerprint,
            verdict: null,
            eligible: false,
            decisionReason: "fresh_audit_pending_verdict",
            decidedAt: run.completedAt,
          });
        }
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
        const plainApproval = input.verdict === "approved";
        const vibeConfirmed = plainApproval && input.vibeConfirmed === true;
        const publishableConfirmed = plainApproval && input.publishableConfirmed === true;
        if (input.rescuePreferred !== undefined && typeof input.rescuePreferred !== "boolean") {
          return json(400, { error: "Rescue preference must be true or false." });
        }
        const rescuePreferred = input.rescuePreferred === true;
        const rescueReceiptId = rescuePreferred ? input.rescueReceiptId : null;
        if (rescuePreferred && (
          typeof rescueReceiptId !== "string"
          || !/^[A-Za-z0-9_-]{1,128}$/.test(rescueReceiptId)
        )) {
          return json(400, { error: "Choose a saved rescue board when recording a rescue preference." });
        }
        if (!rescuePreferred && input.rescueReceiptId !== undefined && input.rescueReceiptId !== null) {
          return json(400, { error: "A rescue board can only be selected when rescue preference is enabled." });
        }
        if (input.verdict === "approved" && (!vibeConfirmed || !publishableConfirmed)) {
          return json(409, {
            error: "Approval requires both “Yes, that’s the Vibe” and “Yes, this is publishable.”",
          });
        }
        const report = await readReport(store, pair);
        if (!report?.currentRun || input.runId !== report.currentRun.runId) {
          return json(409, { error: "This verdict is not for the current audit run. Refresh and try again." });
        }
        if (!currentRunMatchesCurrentContract(report.currentRun, pair)) {
          return json(409, { error: "This audit is invalid under the current profile contract. Run a fresh audit before recording a scheduling verdict." });
        }
        const rescuePreference = {
          preferred: rescuePreferred,
          rescueReceiptId,
        };
        const existingVerdict = report.currentRun.operatorVerdict;
        if (existingVerdict) {
          if (!sameFinalVerdict(existingVerdict, {
            verdict: input.verdict,
            notes,
            vibeConfirmed,
            publishableConfirmed,
            rescuePreference,
          })) {
            return json(409, { error: "The final scheduling verdict for this audit run is immutable." });
          }
          return json(200, {
            actor: await actorSummary(store, actorPacks, pair.actor),
            pairing: pairingSummary(pair, report),
            ...detailResponse(pair, report),
          });
        }
        let preferredRescueBoard = null;
        if (rescuePreferred) {
          preferredRescueBoard = await store.get(
            auditRescueBoardKey(pair.actor.id, pair.vibeIdx, report.currentRun.runId, rescueReceiptId),
            { type: "json", consistency: "strong" },
          );
          const currentFeedbackHash = feedbackHash(report.currentRun.editorialFeedback?.flags || []);
          if (!preferredRescueBoard
            || preferredRescueBoard.receiptId !== rescueReceiptId
            || preferredRescueBoard.runId !== report.currentRun.runId
            || preferredRescueBoard.actorId !== pair.actor.id
            || preferredRescueBoard.vibeKey !== pair.vibeKey
            || preferredRescueBoard.feedbackHash !== currentFeedbackHash
            || !validateRescueArrangement(
              report.currentRun,
              preferredRescueBoard.board?.candidates?.map(candidate => candidate?.candidateId),
            ).ok) {
            return json(409, {
              error: "The preferred rescue board is stale or unavailable. Rebuild and save it from the current image choices before recording this preference.",
            });
          }
        }
        const hasComparableBoards = comparableBoards(report.currentRun);
        const singleCuratedBoard = singleCuratedBoardFor(report.currentRun);
        const operatorBoardApproval = Boolean(
          plainApproval
          && !hasComparableBoards
          && preferredRescueBoard,
        );
        const curatedBoardApproval = Boolean(
          plainApproval
          && !hasComparableBoards
          && singleCuratedBoard,
        );
        const exactBoardApproval = operatorBoardApproval || curatedBoardApproval;
        const blindReview = report.currentRun.blindReview;
        if (hasComparableBoards && !blindReview?.choice) {
          return json(409, { error: "Choose the more compelling board before recording a scheduling verdict." });
        }
        if (hasComparableBoards && isDisagreement(report.currentRun, blindReview)
          && !blindReview?.reasonCodes?.length) {
          return json(409, { error: "Capture at least one disagreement reason before recording a scheduling verdict." });
        }
        if (!hasComparableBoards && APPROVED_VERDICTS.has(input.verdict) && !exactBoardApproval) {
          return json(409, {
            error: "Approval requires one complete nine-card curated board or one saved nine-card retained-evidence board.",
          });
        }
        if (input.verdict === "approved"
          && !report.currentRun.materialSufficient
          && !exactBoardApproval) {
          return json(409, { error: "Insufficient material cannot be approved without an override." });
        }
        if (APPROVED_VERDICTS.has(input.verdict)
          && (report.calibrationProfile?.evidenceCount
            || report.calibrationProfile?.requiresFreshAudit)
          && !exactBoardApproval
          && !calibrationProofCoversProfile(report.currentRun, report.calibrationProfile)) {
          return json(409, {
            error: "Run a fresh audit that reproduces positive calibration signals beyond the exact saved nine before approving this pairing.",
          });
        }
        const stamp = now().toISOString();
        const rescuePreferenceIdentity = {
          runId: report.currentRun.runId,
          actorId: pair.actor.id,
          vibeKey: pair.vibeKey,
          preferred: rescuePreferred,
          rescueReceiptId,
          feedbackHash: preferredRescueBoard?.feedbackHash || null,
        };
        const preferenceReceiptId = recordHash(rescuePreferenceIdentity).slice(0, 24);
        let rescuePreferenceReceipt = {
          schemaVersion: 1,
          receiptId: preferenceReceiptId,
          ...rescuePreferenceIdentity,
          createdAt: stamp,
          createdBy: operator.user.accountId,
        };
        rescuePreference.receiptId = preferenceReceiptId;
        const preferenceWrite = await store.setJSON(
          auditRescuePreferenceKey(
            pair.actor.id,
            pair.vibeIdx,
            report.currentRun.runId,
            preferenceReceiptId,
          ),
          rescuePreferenceReceipt,
          { onlyIfNew: true },
        );
        if (preferenceWrite?.modified === false) {
          const existingPreference = await store.get(
            auditRescuePreferenceKey(
              pair.actor.id,
              pair.vibeIdx,
              report.currentRun.runId,
              preferenceReceiptId,
            ),
            { type: "json", consistency: "strong" },
          );
          if (!existingPreference
            || existingPreference.receiptId !== preferenceReceiptId
            || recordHash(rescuePreferenceIdentityFor(existingPreference))
              !== recordHash(rescuePreferenceIdentity)) {
            return json(409, { error: "The rescue preference receipt could not be verified." });
          }
          rescuePreferenceReceipt = existingPreference;
        }
        const operatorVerdict = {
          verdict: input.verdict,
          notes,
          vibeConfirmed,
          publishableConfirmed,
          rescuePreference,
          publicationSource: operatorBoardApproval
            ? {
              type: "operator_rescue",
              rescueReceiptId,
              boardHash: boardHash(preferredRescueBoard.board),
              feedbackHash: preferredRescueBoard.feedbackHash,
            }
            : curatedBoardApproval
              ? {
                type: "curated_board",
                mode: singleCuratedBoard.mode,
                boardHash: boardHash(singleCuratedBoard.board),
              }
              : null,
          decidedAt: stamp,
          decidedBy: operator.user.accountId,
          calibration: blindReview
            ? calibrationSnapshot(
              blindReview,
              input.verdict,
              notes,
              vibeConfirmed,
              publishableConfirmed,
              stamp,
              operator.user.accountId,
            )
            : null,
        };
        const verdictWrite = await store.setJSON(
          auditVerdictKey(pair.actor.id, pair.vibeIdx, report.currentRun.runId),
          operatorVerdict,
          { onlyIfNew: true },
        );
        if (verdictWrite?.modified === false) {
          const raced = await readReport(store, pair);
          if (sameFinalVerdict(raced.currentRun?.operatorVerdict, {
            verdict: input.verdict,
            notes,
            vibeConfirmed,
            publishableConfirmed,
            rescuePreference,
          })) {
            return json(200, {
              actor: await actorSummary(store, actorPacks, pair.actor),
              pairing: pairingSummary(pair, raced),
              ...detailResponse(pair, raced),
            });
          }
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
        if (!sameFinalVerdict(next.currentRun?.operatorVerdict, {
          verdict: input.verdict,
          notes,
          vibeConfirmed,
          publishableConfirmed,
          rescuePreference,
        })) {
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
          vibeConfirmed,
          publishableConfirmed,
          calibrationVersion: 1,
          calibrationHash: recordHash(operatorVerdict.calibration),
          rescueCalibrationVersion: report.calibrationProfile?.calibrationVersion || null,
          rescueCalibrationEvidenceCount: report.calibrationProfile?.evidenceCount || 0,
          rescueCalibrationRetiredEvidenceCount:
            report.calibrationProfile?.retiredEvidenceCount || 0,
          rescueCalibrationRetirementHash:
            report.calibrationProfile?.retirementHash || null,
          rescueCalibrationHash: report.calibrationProfile
            ? recordHash({
              sourceReceiptIds: [...report.calibrationProfile.sourceReceiptIds].sort(),
              proofStatus: report.currentRun.calibrationProof?.status || null,
            })
            : null,
          materialSufficient: report.currentRun.materialSufficient,
          publicationSource: operatorVerdict.publicationSource,
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
        if (!currentRunMatchesCurrentContract(report.currentRun, pair)) {
          return json(409, { error: "Legacy audits are retained history. Run a fresh audit before recording a board choice." });
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
        if (!currentRunMatchesCurrentContract(report.currentRun, pair)) {
          return json(409, { error: "Legacy audits are retained history. Their calibration cannot be changed." });
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
        if (currentRunMatchesCurrentContract(run, pair)
          && !run.blindReview?.choice
          && run.blindReview?.status !== "unavailable") {
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
        if (currentRunMatchesCurrentContract(run, pair)
          && !run.blindReview?.choice
          && run.blindReview?.status !== "unavailable") {
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
          calibrationBasis: rescueCalibrationBasis(run, validation.board),
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
        // Blob writes can become visible to list() after the write response.
        // Include the receipt we just committed so the operator can immediately
        // choose it for publication instead of seeing a stale approval form.
        const responseReport = reportWithRescueReceipt(next, pair, receipt);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, responseReport),
          ...detailResponse(pair, responseReport),
        });
      }

      if (input.action === "publish_backfill") {
        if (!isUsableBackfillDate(input.date)) {
          return json(400, { error: "Backfill date must be a valid YYYY-MM-DD calendar date." });
        }
        if (typeof input.runId !== "string" || !input.runId
          || typeof input.rescueReceiptId !== "string"
          || !/^[A-Za-z0-9_-]{1,128}$/.test(input.rescueReceiptId)) {
          return json(400, { error: "A current audit run and saved rescue receipt are required." });
        }
        const report = await readReport(store, pair);
        const run = report.currentRun;
        const approval = await getEligibility(store, pair.actor, pair.vibeIdx);
        if (!run || run.runId !== input.runId
          || run.operatorVerdict?.verdict !== "approved"
          || run.operatorVerdict?.vibeConfirmed !== true
          || run.operatorVerdict?.publishableConfirmed !== true
          || approval?.eligible !== true
          || approval.publicationSource?.type !== "operator_rescue"
          || approval.publicationSource.rescueReceiptId !== input.rescueReceiptId
          || !approval.publicationBoard
          || approval.publicationBoard.candidates?.length !== 9) {
          return json(409, {
            error: "Backfill requires the current saved rescue board to have an approved verdict and both human confirmations.",
          });
        }
        const payload = backfillPayloadForDate(input.date, pair, approval.publicationBoard);
        const publicationStore = getPublicationStore(context);
        const key = `starOfDay:${STAR_OF_DAY_VERSION}:${input.date}`;
        const existing = await publicationStore.get(key, { type: "json", consistency: "strong" });
        if (existing) {
          if (samePublicPayload(existing, payload)) {
            return json(200, {
              backfill: { date: input.date, status: "already_published" },
              payload: publicBackfillSummary(existing),
            });
          }
          return json(409, { error: "That edition date already contains a different published board." });
        }
        await publicationStore.setJSON(key, payload, { onlyIfNew: true });
        const written = await publicationStore.get(key, { type: "json", consistency: "strong" });
        if (!written || !samePublicPayload(written, payload)) {
          return json(409, { error: "The backfill could not be verified after writing. Refresh the archive before trying again." });
        }
        return json(200, {
          backfill: { date: input.date, status: "published" },
          payload: publicBackfillSummary(written),
        });
      }

      if (input.action === "mark_rescue_calibration") {
        if (typeof input.receiptId !== "string"
          || !/^[A-Za-z0-9_-]{1,128}$/.test(input.receiptId)
          || typeof input.runId !== "string") {
          return json(400, { error: "A saved rescue receipt is required." });
        }
        const run = await readRun(store, pair, input.runId);
        if (!run || run.runId !== input.runId) {
          return json(404, { error: "That audit run was not found." });
        }
        if (!currentRunMatchesCurrentContract(run, pair)) {
          return json(409, {
            error: "Legacy rescue boards remain historical records and cannot calibrate the current profile. Run a fresh audit and save a current-contract rescue board.",
          });
        }
        const receipt = await store.get(
          auditRescueBoardKey(pair.actor.id, pair.vibeIdx, run.runId, input.receiptId),
          { type: "json", consistency: "strong" },
        );
        if (!receipt
          || receipt.receiptId !== input.receiptId
          || receipt.runId !== run.runId
          || receipt.actorId !== pair.actor.id
          || receipt.vibeKey !== pair.vibeKey) {
          return json(404, { error: "That saved rescue arrangement was not found for this pairing." });
        }
        const key = auditRescueCalibrationKey(pair.actor.id, pair.vibeIdx, receipt.receiptId);
        const existing = await store.get(key, { type: "json", consistency: "strong" });
        if (!existing) {
          const calibration = createRescueCalibration(
            pair,
            run,
            receipt,
            operator,
            now,
          );
          const write = await store.setJSON(key, calibration, { onlyIfNew: true });
          if (write?.modified === false) {
            return json(409, { error: "Another operator marked this rescue board first." });
          }
        }
        const next = await readReport(store, pair);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      if (input.action === "retire_rescue_calibration") {
        if (typeof input.receiptId !== "string"
          || !/^[A-Za-z0-9_-]{1,128}$/.test(input.receiptId)) {
          return json(400, { error: "A confirmed calibration receipt is required." });
        }
        const reason = boundedText(input.reason, MAX_CALIBRATION_RETIREMENT_REASON_LENGTH);
        if (!reason) {
          return json(400, {
            error: "Explain why this calibration evidence should no longer guide future audits.",
          });
        }
        const calibration = await store.get(
          auditRescueCalibrationKey(pair.actor.id, pair.vibeIdx, input.receiptId),
          { type: "json", consistency: "strong" },
        );
        if (!calibration
          || calibration.sourceRescueReceiptId !== input.receiptId
          || calibration.actor?.id !== pair.actor.id
          || calibration.vibePack?.key !== pair.vibeKey
          || calibration.status !== "confirmed"
          || calibration.calibrationVersion !== RESCUE_CALIBRATION_VERSION) {
          return json(404, { error: "That confirmed calibration receipt was not found for this pairing." });
        }
        const retirementKey = auditRescueCalibrationRetirementKey(
          pair.actor.id,
          pair.vibeIdx,
          input.receiptId,
        );
        const existing = await store.get(retirementKey, {
          type: "json",
          consistency: "strong",
        });
        if (existing) {
          if (existing.reason !== reason) {
            return json(409, { error: "That calibration retirement receipt is immutable." });
          }
          const next = await readReport(store, pair);
          return json(200, {
            actor: await actorSummary(store, actorPacks, pair.actor),
            pairing: pairingSummary(pair, next),
            ...detailResponse(pair, next),
          });
        }
        const retirement = {
          schemaVersion: 1,
          retirementVersion: 1,
          retirementId: createFeedbackId(),
          status: "retired",
          sourceRescueReceiptId: input.receiptId,
          sourceRunId: calibration.sourceRunId || null,
          actorId: pair.actor.id,
          vibeKey: pair.vibeKey,
          reason,
          retiredAt: now().toISOString(),
          retiredBy: operator.user.accountId,
        };
        const write = await store.setJSON(retirementKey, retirement, { onlyIfNew: true });
        if (write?.modified === false) {
          return json(409, { error: "Another operator retired this calibration evidence first." });
        }
        const next = await readReport(store, pair);
        return json(200, {
          actor: await actorSummary(store, actorPacks, pair.actor),
          pairing: pairingSummary(pair, next),
          ...detailResponse(pair, next),
        });
      }

      if (input.action === "export_rescue_board") {
        const report = await readReport(store, pair);
        const run = report.currentRun;
        if (!run || input.runId !== run.runId) {
          return json(409, { error: "Only the current audit run can export an Operator Rescue Board." });
        }
        if (!currentRunMatchesCurrentContract(run, pair)) {
          return json(409, { error: "This rescue board belongs to an older audit contract. Run a fresh audit and rebuild it before exporting." });
        }
        if (typeof input.receiptId !== "string"
          || !/^[A-Za-z0-9_-]{1,128}$/.test(input.receiptId)) {
          return json(400, { error: "A saved rescue receipt is required." });
        }
        const receipt = await store.get(
          auditRescueBoardKey(pair.actor.id, pair.vibeIdx, run.runId, input.receiptId),
          { type: "json", consistency: "strong" },
        );
        if (!receipt || receipt.receiptId !== input.receiptId) {
          return json(404, { error: "That saved rescue arrangement was not found for this audit run." });
        }
        const currentFeedbackHash = feedbackHash(run.editorialFeedback?.flags || []);
        if (receipt.runId !== run.runId
          || receipt.actorId !== pair.actor.id
          || receipt.vibeKey !== pair.vibeKey
          || receipt.feedbackHash !== currentFeedbackHash) {
          return json(409, { error: "The saved rescue arrangement is stale. Rebuild and save it from the current image choices before exporting." });
        }
        const candidateIds = receipt.board?.candidates?.map(candidate => candidate?.candidateId);
        const validation = validateRescueArrangement(run, candidateIds);
        if (!validation.ok) {
          return json(409, { error: "The saved rescue arrangement no longer passes the current audit gates. Rebuild it before exporting." });
        }
        const exportedAt = now().toISOString();
        return json(200, {
          rescueExport: {
            schemaVersion: 1,
            gridId: `rescue-${pair.actor.id}-${receipt.receiptId}`,
            runId: run.runId,
            receiptId: receipt.receiptId,
            feedbackHash: receipt.feedbackHash,
            arrangedAt: receipt.savedAt,
            exportedAt,
            actor: {
              id: pair.actor.id,
              name: pair.actor.name,
              nameEn: pair.actor.shortName_en || pair.actor.shortName || pair.actor.name,
              accentColor: pair.actor.accentColor || "#c9a96e",
            },
            vibe: {
              key: pair.vibeKey,
              label: pair.vibe.label || pair.vibe.label_en || pair.vibeKey,
              labelEn: pair.vibe.label_en || pair.vibe.label || pair.vibeKey,
              emoji: pair.vibe.emoji || "✨",
              subtitle: pair.vibe.subtitle || "",
              subtitleEn: pair.vibe.subtitle_en || pair.vibe.subtitle || "",
              searchSpell: pair.vibe.queries?.[0] || pair.vibeKey,
            },
            candidates: validation.board.candidates.map(candidate => ({
              candidateId: candidate.candidateId,
              imageDigest: candidate.imageDigest || null,
              query: candidate.query || "",
              title: candidate.title || "",
              source: candidate.source || "",
              link: candidate.link || "",
              thumbnail: candidate.thumbnail || "",
            })),
          },
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
    reviewPreferenceCandidateIds = [],
    calibrationProfile = null,
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
  const baselineRanked = rankCandidates(candidates);
  const ranked = applyCalibrationQueryRanking(baselineRanked, calibrationProfile);
  const baselineTop = baselineRanked.slice(0, RANKED_BATCH_LIMIT);
  const calibratedTop = ranked.slice(0, RANKED_BATCH_LIMIT);
  const comparisonQueries = new Set([
    ...baselineTop.map(candidate => candidate.query),
    ...calibratedTop.map(candidate => candidate.query),
  ]);
  const baselineForCuration = baselineRanked.filter(candidate =>
    comparisonQueries.has(candidate.query));
  const rankedForCuration = ranked.filter(candidate =>
    comparisonQueries.has(candidate.query));
  const profileVersions = {
    identityProfileVersion: IDENTITY_PROFILE_VERSION,
    aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
    promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
  };
  const curationOptions = {
    diagnostics: true,
    promise: vibePromiseFor(pair.actor, pair.vibeIdx),
    profileVersions,
    candidateLimit: Math.min(
      96,
      rankedForCuration.reduce((count, batch) => count + (batch.results || []).length, 0),
    ),
  };
  const curated = rankedForCuration.length
    ? await curate(rankedForCuration, {
      ...curationOptions,
      preferredCandidateIds,
      calibrationProfile,
      calibrationControl: calibrationProfile?.evidenceCount ? {
        preferredCandidateIds: reviewPreferenceCandidateIds,
        batchRanks: Object.fromEntries(baselineForCuration.map((batch, index) =>
          [batch.query, index])),
      } : null,
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
  const calibrationComparison = compareCalibrationOutcomes(
    calibrationProfile,
    curated.controlDiagnostics,
    diagnostics,
    {
      baselineInputFingerprint: analysisFingerprintFromDiagnostics(curated.controlDiagnostics),
      calibratedInputFingerprint: analysisFingerprintFromDiagnostics(diagnostics),
    },
  );
  const calibrationSignals = diagnostics.calibrationSignals
    ? { ...diagnostics.calibrationSignals, comparison: calibrationComparison }
    : null;
  const curationReceipt = {
    ...(diagnostics.receipt || {}),
    ...(curated.curation || {}),
    rawCandidates: diagnostics.rawCandidates || [],
    sourceEvidenceCandidates: diagnostics.sourceEvidenceCandidates
      || diagnostics.rawCandidates
      || [],
    dropped: diagnostics.dropped || [],
    calibrationSignals,
  };
  const calibrationProof = calibrationProofFromDiagnostics(
    calibrationProfile,
    calibrationSignals,
    materialSufficient,
  );

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
    calibrationQueryRanking: calibrationProfile ? {
      positiveQueries: calibrationProfile.positiveQueries,
      negativeQueries: calibrationProfile.negativeQueries,
      baselineTopQueries: baselineTop.map(candidate => candidate.query),
      calibratedTopQueries: calibratedTop.map(candidate => candidate.query),
      comparisonUniverseQueries: [...comparisonQueries],
    } : null,
    inheritedPreferenceCandidateIds: preferredCandidateIds,
    inheritedCalibration: calibrationProfile ? {
      calibrationVersion: calibrationProfile.calibrationVersion,
      evidenceCount: calibrationProfile.evidenceCount,
      sourceReceiptIds: calibrationProfile.sourceReceiptIds,
    } : null,
    calibrationProof,
    rawResults: boundedRawResults(candidates, diagnostics),
    rejections: buildRejectionLedger(queryRuns, diagnostics),
    identityEvidence,
    detectedEvents: diagnostics.eventFamilies || [],
    boardDiagnostics: diagnostics.boardDiagnostics || null,
    partialClusters: diagnostics.partialClusters || [],
    strongestEvent: diagnostics.strongestEvent || null,
    strongestCompiled: diagnostics.strongestCompiled || null,
    eventAlternatives: diagnostics.eventAlternatives || [],
    compiledAlternatives: diagnostics.compiledAlternatives || [],
    runnerUpDiagnostics: diagnostics.runnerUpDiagnostics || null,
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

function applyCalibrationQueryRanking(ranked, profile) {
  if (!profile?.evidenceCount) return ranked;
  const positive = new Set(profile.positiveQueries || []);
  const negative = new Set(profile.negativeQueries || []);
  return ranked
    .map((candidate, index) => {
      const query = signalText(candidate.query);
      return {
        candidate,
        index,
        calibrationRank: Number(positive.has(query)) - Number(negative.has(query)),
      };
    })
    .sort((left, right) =>
      right.calibrationRank - left.calibrationRank
      || left.index - right.index)
    .map(item => item.candidate);
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
  const runWrite = await store.setJSON(
    auditRunKey(pair.actor.id, pair.vibeIdx, run.runId),
    run,
    { onlyIfNew: true },
  );
  if (runWrite?.modified === false) {
    const error = new Error("An audit run with this identifier already exists.");
    error.status = 409;
    throw error;
  }
  const headKey = auditHeadKey(pair.actor.id, pair.vibeIdx);
  const nextHead = {
    schemaVersion: 1,
    actorId: pair.actor.id,
    vibeIdx: pair.vibeIdx,
    currentRunId: run.runId,
    startedAt: run.startedAt,
    updatedAt: run.completedAt,
  };
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const entry = await getJSONEntry(store, headKey);
    if (entry?.data && compareAuditHeads(entry.data, nextHead) >= 0) {
      return { report: await readReport(store, pair), advanced: false };
    }
    const options = entry?.etag
      ? { onlyIfMatch: entry.etag }
      : entry?.data ? null : { onlyIfNew: true };
    if (!options) {
      const error = new Error("The audit store cannot safely advance the current run.");
      error.status = 503;
      throw error;
    }
    const write = await store.setJSON(headKey, nextHead, options);
    if (write?.modified !== false) {
      return { report: await readReport(store, pair), advanced: true };
    }
  }
  const error = new Error("Another audit run advanced concurrently. Refresh and try again.");
  error.status = 409;
  throw error;
}

async function getJSONEntry(store, key) {
  if (typeof store.getWithMetadata === "function") {
    return store.getWithMetadata(key, { type: "json", consistency: "strong" });
  }
  const data = await store.get(key, { type: "json", consistency: "strong" });
  return data ? { data, etag: null } : null;
}

function compareAuditHeads(left, right) {
  const timestamp = String(left?.startedAt || left?.updatedAt || "")
    .localeCompare(String(right?.startedAt || right?.updatedAt || ""));
  if (timestamp) return timestamp;
  return String(left?.currentRunId || "").localeCompare(String(right?.currentRunId || ""));
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
  const auditContract = current ? auditContractFor(current, pair) : null;
  const needsReapproval = Boolean(auditContract?.isLegacy);
  const operatorPublication = current?.operatorVerdict?.publicationSource?.type === "operator_rescue";
  const calibrationNeedsRerun = Boolean(
    !operatorPublication
    && (
    (report?.calibrationProfile?.requiresFreshAudit
      || report?.calibrationProfile?.evidenceCount)
    )
    && !calibrationProofCoversProfile(current, report.calibrationProfile),
  );
  const eligible = Boolean(
    current
    && auditContract?.isCurrent
    && !calibrationNeedsRerun
    && currentVerdict
    && (operatorPublication || current.blindReview?.choice)
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
      : calibrationNeedsRerun
        ? "calibration_reaudit_required"
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
    eligible: needsReapproval || calibrationNeedsRerun ? false : reviewPending ? null : eligible,
    auditContract,
    calibrationEvidenceCount: report?.calibrationProfile?.evidenceCount || 0,
    calibrationProof: current?.calibrationProof || null,
  };
}

function currentRunMatchesCurrentContract(run, pair) {
  return auditContractFor(run, pair).isCurrent;
}

function auditContractFor(run, pair) {
  const curationVersion = run?.curationVersion
    ?? run?.curationReceipt?.curationVersion
    ?? run?.curationReceipt?.version
    ?? null;
  const legacyReasons = [];
  if (run?.profileVersion !== IDENTITY_PROFILE_VERSION
    || run?.identityProfileVersion !== IDENTITY_PROFILE_VERSION) {
    legacyReasons.push("identity_profile_version");
  }
  if (run?.aestheticClusterVersion !== AESTHETIC_CLUSTER_VERSION) {
    legacyReasons.push("aesthetic_cluster_version");
  }
  if (run?.promiseContractVersion !== VIBE_PROMISE_CONTRACT_VERSION) {
    legacyReasons.push("promise_contract_version");
  }
  if (curationVersion !== CURATION_VERSION) {
    legacyReasons.push("curation_version");
  }
  if (run?.pairingFingerprint !== pairingFingerprintFor(pair.actor, pair.vibeIdx)) {
    legacyReasons.push("pairing_fingerprint");
  }
  return {
    status: legacyReasons.length ? "legacy" : "current",
    isLegacy: legacyReasons.length > 0,
    isCurrent: legacyReasons.length === 0,
    legacyReasons,
    currentVersions: {
      identityProfileVersion: IDENTITY_PROFILE_VERSION,
      aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
      promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      curationVersion: CURATION_VERSION,
    },
  };
}
function detailResponse(pair, report) {
  const revealed = Boolean(report?.currentRun?.blindReview?.choice);
  return {
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    currentContract: {
      identityProfileVersion: IDENTITY_PROFILE_VERSION,
      aestheticClusterVersion: AESTHETIC_CLUSTER_VERSION,
      promiseContractVersion: VIBE_PROMISE_CONTRACT_VERSION,
      curationVersion: CURATION_VERSION,
    },
    currentRun: clientRun(report?.currentRun, pair),
    priorRuns: (report?.priorRuns || []).map(run => clientRun(run, pair)),
    verdict: revealed ? report?.verdict || null : null,
    notes: revealed ? report?.notes || "" : "",
    verdictAt: revealed ? report?.verdictAt || null : null,
    calibrationProfile: report?.calibrationProfile || null,
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
    runnerUpDiagnostics: null,
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
  const calibrationProfile = await readRescueCalibrationProfile(store, pair);
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
    calibrationProfile,
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
    sourceEvidenceCandidates: (run.curationReceipt.sourceEvidenceCandidates || []).map(enrich),
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
    operatorRescueBoards: [],
  };
}

function reportWithRescueReceipt(report, pair, receipt) {
  if (!report?.currentRun || report.currentRun.runId !== receipt.runId) return report;
  const feedback = report.currentRun.editorialFeedback || emptyEditorialFeedback();
  const responseReceipt = { ...receipt, calibrationEvidence: null };
  const existingBoards = Array.isArray(feedback.operatorRescueBoards)
    ? feedback.operatorRescueBoards
    : [];
  const boards = [
    responseReceipt,
    ...existingBoards.filter(item => item?.receiptId !== responseReceipt.receiptId),
  ].sort((left, right) =>
    String(right.savedAt || "").localeCompare(String(left.savedAt || ""))
    || String(right.receiptId || "").localeCompare(String(left.receiptId || "")));
  return {
    ...report,
    currentRun: {
      ...report.currentRun,
      editorialFeedback: {
        ...feedback,
        operatorRescueBoards: boards,
        operatorRescueBoard: boards[0] || null,
      },
    },
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
  const [savedBoards, calibrations, retirements] = await Promise.all([
    readReceipts(
      store,
      auditRescueBoardPrefix(pair.actor.id, pair.vibeIdx, run.runId),
      "savedAt",
    ),
    readReceipts(
      store,
      auditRescueCalibrationPrefix(pair.actor.id, pair.vibeIdx),
      "confirmedAt",
    ),
    readReceipts(
      store,
      auditRescueCalibrationRetirementPrefix(pair.actor.id, pair.vibeIdx),
      "retiredAt",
    ),
  ]);
  const calibrationByReceipt = new Map(calibrations
    .filter(calibration => calibration.sourceRunId === run.runId)
    .map(calibration => [calibration.sourceRescueReceiptId, calibration]));
  const retirementByReceipt = new Map(retirements
    .filter(retirement =>
      retirement.status === "retired"
      && retirement.actorId === pair.actor.id
      && retirement.vibeKey === pair.vibeKey
      && typeof retirement.sourceRescueReceiptId === "string")
    .map(retirement => [retirement.sourceRescueReceiptId, retirement]));
  const operatorRescueBoards = savedBoards.filter(receipt =>
    receipt.runId === run.runId
    && receipt.actorId === pair.actor.id
    && receipt.vibeKey === pair.vibeKey
  ).map(receipt => ({
    ...receipt,
    calibrationEvidence: calibrationByReceipt.has(receipt.receiptId)
      ? {
        ...calibrationByReceipt.get(receipt.receiptId),
        retirement: retirementByReceipt.get(receipt.receiptId) || null,
      }
      : null,
  }));
  const feedback = {
    schemaVersion: 1,
    eventCount: receipts.length,
    flags,
    feedbackHash: feedbackHash(flags),
    requestedReview: null,
    operatorRescueBoards,
  };
  feedback.operatorRescueBoard = feedback.operatorRescueBoards[0] || null;
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

function signalText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .trim();
}

function calibrationCandidateSnapshot(candidate, {
  evidenceRank = null,
  boardPosition = null,
} = {}) {
  return {
    candidateId: candidate.candidateId,
    imageDigest: candidate.imageDigest || null,
    query: String(candidate.query || "").slice(0, 500),
    title: String(candidate.title || "").slice(0, 240),
    description: String(candidate.description || "").slice(0, 400),
    source: String(candidate.source || "").slice(0, 120),
    link: String(candidate.link || "").slice(0, 700),
    thumbnail: String(candidate.thumbnail || "").slice(0, 700),
    promise: candidate.promise || null,
    dropReason: candidate.dropReason || null,
    dropDetail: String(candidate.dropDetail || "").slice(0, 400) || null,
    evidenceRank,
    boardPosition,
  };
}

function signalValues(candidates) {
  const values = key => [...new Set(candidates.map(key).filter(Boolean))];
  const flattenedValues = key => [...new Set(candidates.flatMap(key).filter(Boolean))];
  return {
    candidateIds: values(candidate => candidate.candidateId),
    queries: values(candidate => signalText(candidate.query)),
    sources: values(candidate => signalText(candidate.source)),
    clusters: flattenedValues(candidate => (candidate.promise?.clusters || [])
      .map(cluster => signalText(cluster.id))),
    antiAnchors: flattenedValues(candidate => (candidate.promise?.hardAntiMatches || [])
      .map(signalText)),
  };
}

function signalValuesForCandidate(candidate, key) {
  if (key === "queries") return [signalText(candidate.query)].filter(Boolean);
  if (key === "sources") return [signalText(candidate.source)].filter(Boolean);
  if (key === "clusters") {
    return (candidate.promise?.clusters || []).map(cluster => signalText(cluster.id)).filter(Boolean);
  }
  if (key === "antiAnchors") {
    return (candidate.promise?.hardAntiMatches || []).map(signalText).filter(Boolean);
  }
  return [];
}

function reusableSignalPreferences(records, key) {
  const evidenceCount = Math.max(1, records.length);
  const values = new Map();
  const add = (value, field, amount = 1) => {
    const current = values.get(value) || {
      value,
      selectedCount: 0,
      omittedCount: 0,
      selectedRateTotal: 0,
      omittedRateTotal: 0,
    };
    current[field] += amount;
    values.set(value, current);
  };
  for (const record of records) {
    const selected = record.selectedNine || [];
    const omitted = record.omittedAlternatives || [];
    const selectedCounts = new Map();
    const omittedCounts = new Map();
    for (const candidate of selected) {
      for (const value of new Set(signalValuesForCandidate(candidate, key))) {
        selectedCounts.set(value, (selectedCounts.get(value) || 0) + 1);
      }
    }
    for (const candidate of omitted) {
      for (const value of new Set(signalValuesForCandidate(candidate, key))) {
        omittedCounts.set(value, (omittedCounts.get(value) || 0) + 1);
      }
    }
    for (const value of new Set([...selectedCounts.keys(), ...omittedCounts.keys()])) {
      const selectedCount = selectedCounts.get(value) || 0;
      const omittedCount = omittedCounts.get(value) || 0;
      add(value, "selectedCount", selectedCount);
      add(value, "omittedCount", omittedCount);
      add(value, "selectedRateTotal", selectedCount / Math.max(1, selected.length));
      add(value, "omittedRateTotal", omittedCount / Math.max(1, omitted.length));
    }
  }
  const deltas = [...values.values()].map(value => {
    const selectedRate = value.selectedRateTotal / evidenceCount;
    const omittedRate = value.omittedRateTotal / evidenceCount;
    return {
      value: value.value,
      selectedCount: value.selectedCount,
      omittedCount: value.omittedCount,
      selectedRate: Number(selectedRate.toFixed(4)),
      omittedRate: Number(omittedRate.toFixed(4)),
      delta: Number((selectedRate - omittedRate).toFixed(4)),
    };
  }).sort((left, right) => right.delta - left.delta || left.value.localeCompare(right.value));
  return {
    positive: deltas
      .filter(signal =>
        signal.selectedCount >= MIN_REUSABLE_SIGNAL_SUPPORT
        && signal.delta >= MIN_REUSABLE_SIGNAL_DELTA)
      .map(signal => signal.value),
    negative: deltas
      .filter(signal =>
        signal.omittedCount >= MIN_REUSABLE_SIGNAL_SUPPORT
        && signal.delta <= -MIN_REUSABLE_SIGNAL_DELTA)
      .map(signal => signal.value),
    deltas,
  };
}

export function rescueCalibrationBasis(run, board) {
  const completeSourceEvidence = run.curationReceipt?.sourceEvidenceCandidates
    || run.curationReceipt?.rawCandidates
    || run.rawResults
    || [];
  const evidenceRankById = new Map(completeSourceEvidence.map((candidate, index) =>
    [candidate.candidateId, index + 1]));
  const selectedNine = (board.candidates || []).map((candidate, boardPosition) =>
    calibrationCandidateSnapshot(candidate, {
      evidenceRank: evidenceRankById.get(candidate.candidateId) || null,
      boardPosition,
    }));
  const selectedIds = new Set(selectedNine.map(candidate => candidate.candidateId));
  const omittedAlternatives = completeSourceEvidence
    .filter(candidate => !selectedIds.has(candidate.candidateId))
    .map(candidate => calibrationCandidateSnapshot(candidate, {
      evidenceRank: evidenceRankById.get(candidate.candidateId) || null,
    }));
  const systemCandidates = [
    ...(run.strongestEvent?.candidates || []),
    ...(run.strongestCompiled?.candidates || []),
  ];
  const omittedSystemSelections = [...new Map(systemCandidates
    .filter(candidate => !selectedIds.has(candidate.candidateId))
    .map(candidate => [candidate.candidateId, candidate])).values()]
    .map(calibrationCandidateSnapshot);
  const hero = selectedNine[4] || null;
  const reusableSignals = Object.fromEntries(
    ["queries", "sources", "clusters", "antiAnchors"].map(key => [
      key,
      reusableSignalPreferences([{ selectedNine, omittedAlternatives }], key),
    ]),
  );
  const sourceEvidenceCandidateIds = [...new Set([
    ...selectedNine,
    ...omittedAlternatives,
    ...omittedSystemSelections,
  ].map(candidate => candidate.candidateId).filter(Boolean))];
  const rankingContrasts = selectedNine.flatMap(selected =>
    omittedAlternatives.map(omitted => ({
      preferredCandidateId: selected.candidateId,
      preferredBoardPosition: selected.boardPosition,
      preferredEvidenceRank: selected.evidenceRank,
      omittedCandidateId: omitted.candidateId,
      omittedEvidenceRank: omitted.evidenceRank,
      queryContrast: selected.query !== omitted.query,
      sourceContrast: selected.source !== omitted.source,
      clusterContrast: JSON.stringify(signalValues([selected]).clusters)
        !== JSON.stringify(signalValues([omitted]).clusters),
      antiAnchorContrast: JSON.stringify(signalValues([selected]).antiAnchors)
        !== JSON.stringify(signalValues([omitted]).antiAnchors),
    }))).slice(0, 144);
  return {
    schemaVersion: 1,
    selectedNine,
    arrangement: selectedNine.map((candidate, position) => ({
      position,
      candidateId: candidate.candidateId,
    })),
    hero: hero ? { position: 4, candidateId: hero.candidateId, candidate: hero } : null,
    omittedAlternatives,
    omittedSystemSelections,
    sourceEvidenceCandidateIds,
    rankingContrasts,
    provenance: {
      queries: (run.queryRuns || []).map(query => ({
        query: query.query,
        provider: query.provider || null,
        rank: query.rank ?? null,
        acceptedForCuration: query.acceptedForCuration === true,
      })),
      selectedQueries: signalValues(selectedNine).queries,
      selectedSources: signalValues(selectedNine).sources,
      omittedQueries: signalValues(omittedAlternatives).queries,
      omittedSources: signalValues(omittedAlternatives).sources,
    },
    signals: {
      positive: signalValues(selectedNine),
      negative: signalValues(omittedAlternatives),
      reusable: reusableSignals,
      hero: signalValues(hero ? [hero] : []),
      rankingContrasts,
      gateExceptions: selectedNine
        .filter(candidate => candidate.dropReason)
        .map(candidate => ({
          candidateId: candidate.candidateId,
          dropReason: candidate.dropReason,
          dropDetail: candidate.dropDetail,
        })),
    },
    contract: {
      calibrationVersion: RESCUE_CALIBRATION_VERSION,
      curationVersion: run.curationReceipt?.curationVersion || run.curationVersion || null,
      identityProfileVersion: run.identityProfileVersion || run.profileVersion || null,
      aestheticClusterVersion: run.aestheticClusterVersion || null,
      promiseContractVersion: run.promiseContractVersion || null,
      pairingFingerprint: run.pairingFingerprint || null,
    },
  };
}

function createRescueCalibration(pair, run, receipt, operator, now) {
  const basis = receipt.calibrationBasis || rescueCalibrationBasis(run, receipt.board);
  return {
    schemaVersion: 1,
    calibrationVersion: RESCUE_CALIBRATION_VERSION,
    status: "confirmed",
    sourceRescueReceiptId: receipt.receiptId,
    sourceRunId: run.runId,
    actor: {
      id: pair.actor.id,
      name: pair.actor.name,
    },
    vibePack: {
      key: pair.vibeKey,
      index: pair.vibeIdx,
      label: pair.vibe.label_en || pair.vibe.label || pair.vibeKey,
    },
    selectedNine: basis.selectedNine,
    arrangement: basis.arrangement,
    hero: basis.hero,
    omittedAlternatives: basis.omittedAlternatives,
    omittedSystemSelections: basis.omittedSystemSelections,
    sourceEvidenceCandidateIds: basis.sourceEvidenceCandidateIds || [...new Set([
      ...(basis.selectedNine || []).map(candidate => candidate.candidateId),
      ...(basis.omittedAlternatives || []).map(candidate => candidate.candidateId),
      ...(basis.omittedSystemSelections || []).map(candidate => candidate.candidateId),
    ].filter(Boolean))],
    rankingContrasts: basis.rankingContrasts,
    provenance: basis.provenance,
    signals: basis.signals,
    contract: basis.contract,
    confirmedAt: now().toISOString(),
    confirmedBy: operator.user.accountId,
  };
}

function preferredSignals(positiveValues, negativeValues) {
  const positives = new Set((positiveValues || []).filter(Boolean));
  const negatives = new Set((negativeValues || []).filter(Boolean));
  return {
    positive: [...positives].filter(value => !negatives.has(value)).sort(),
    negative: [...negatives].filter(value => !positives.has(value)).sort(),
  };
}

function rescueCalibrationMatchesCurrentContract(record, pair) {
  const contract = record?.contract;
  return contract?.curationVersion === CURATION_VERSION
    && contract?.identityProfileVersion === IDENTITY_PROFILE_VERSION
    && contract?.aestheticClusterVersion === AESTHETIC_CLUSTER_VERSION
    && contract?.promiseContractVersion === VIBE_PROMISE_CONTRACT_VERSION
    && contract?.pairingFingerprint === pairingFingerprintFor(pair.actor, pair.vibeIdx);
}

async function readRescueCalibrationProfile(store, pair) {
  const [confirmedReceipts, retirementReceipts] = await Promise.all([
    readReceipts(
      store,
      auditRescueCalibrationPrefix(pair.actor.id, pair.vibeIdx),
      "confirmedAt",
    ),
    readReceipts(
      store,
      auditRescueCalibrationRetirementPrefix(pair.actor.id, pair.vibeIdx),
      "retiredAt",
    ),
  ]);
  const currentRecords = confirmedReceipts.filter(record =>
    record.status === "confirmed"
    && record.calibrationVersion === RESCUE_CALIBRATION_VERSION
    && record.actor?.id === pair.actor.id
    && record.vibePack?.key === pair.vibeKey
    && rescueCalibrationMatchesCurrentContract(record, pair)
  );
  if (!currentRecords.length) return null;
  const currentReceiptIds = new Set(currentRecords.map(record =>
    record.sourceRescueReceiptId));
  const retirements = retirementReceipts.filter(retirement =>
    retirement.status === "retired"
    && retirement.actorId === pair.actor.id
    && retirement.vibeKey === pair.vibeKey
    && currentReceiptIds.has(retirement.sourceRescueReceiptId));
  const retirementByReceipt = new Map(retirements.map(retirement =>
    [retirement.sourceRescueReceiptId, retirement]));
  const records = currentRecords.filter(record =>
    !retirementByReceipt.has(record.sourceRescueReceiptId));
  const retiredReceiptIds = [...retirementByReceipt.keys()].sort();
  const retirementHash = retirements.length
    ? rescueCalibrationRetirementHash(retirements)
    : null;
  const positive = key => records.flatMap(record => record.signals?.positive?.[key] || []);
  const negative = key => records.flatMap(record => record.signals?.negative?.[key] || []);
  const candidateIds = preferredSignals(positive("candidateIds"), negative("candidateIds"));
  const queries = reusableSignalPreferences(records, "queries");
  const sources = reusableSignalPreferences(records, "sources");
  const clusters = reusableSignalPreferences(records, "clusters");
  const antiAnchors = reusableSignalPreferences(records, "antiAnchors");
  const rankingContrasts = records.flatMap(record =>
    record.rankingContrasts || record.signals?.rankingContrasts || []).slice(0, 512);
  const rankingWins = {};
  const rankingLosses = {};
  for (const contrast of rankingContrasts) {
    if (contrast.preferredCandidateId) {
      rankingWins[contrast.preferredCandidateId] =
        (rankingWins[contrast.preferredCandidateId] || 0) + 1;
    }
    if (contrast.omittedCandidateId) {
      rankingLosses[contrast.omittedCandidateId] =
        (rankingLosses[contrast.omittedCandidateId] || 0) + 1;
    }
  }
  const preferredPositions = {};
  for (const record of records) {
    for (const candidate of record.selectedNine || []) {
      if (candidate.candidateId && Number.isInteger(candidate.boardPosition)
        && preferredPositions[candidate.candidateId] === undefined) {
        preferredPositions[candidate.candidateId] = candidate.boardPosition;
      }
    }
  }
  return {
    schemaVersion: 1,
    calibrationVersion: RESCUE_CALIBRATION_VERSION,
    actorId: pair.actor.id,
    vibeKey: pair.vibeKey,
    evidenceCount: records.length,
    totalConfirmedEvidenceCount: currentRecords.length,
    retiredEvidenceCount: retirements.length,
    requiresFreshAudit: retirements.length > 0,
    sourceReceiptIds: records.map(record => record.sourceRescueReceiptId).sort(),
    retiredReceiptIds,
    retirementReceiptIds: retirements.map(retirement => retirement.retirementId).filter(Boolean).sort(),
    retirementHash,
    evidenceLedger: currentRecords
      .map(record => {
        const retirement = retirementByReceipt.get(record.sourceRescueReceiptId) || null;
        return {
          sourceRescueReceiptId: record.sourceRescueReceiptId,
          sourceRunId: record.sourceRunId || null,
          status: retirement ? "retired" : "active",
          confirmedAt: record.confirmedAt || null,
          confirmedBy: record.confirmedBy || null,
          retirement,
        };
      })
      .sort((left, right) =>
        String(right.confirmedAt || "").localeCompare(String(left.confirmedAt || ""))
        || left.sourceRescueReceiptId.localeCompare(right.sourceRescueReceiptId)),
    diagnostics: {
      activeEvidenceCount: records.length,
      retiredEvidenceCount: retirements.length,
      excludedReceiptIds: retiredReceiptIds,
      exclusions: retirements.map(retirement => ({
        reasonCode: "operator_retired_calibration_evidence",
        sourceRescueReceiptId: retirement.sourceRescueReceiptId,
        retirementId: retirement.retirementId || null,
        reason: retirement.reason,
        retiredAt: retirement.retiredAt,
        retiredBy: retirement.retiredBy,
      })),
      summary: retirements.length
        ? `${retirements.length} confirmed calibration receipt${retirements.length === 1 ? " was" : "s were"} excluded after an operator retirement receipt.`
        : "No confirmed calibration evidence is retired.",
    },
    positiveCandidateIds: candidateIds.positive,
    negativeCandidateIds: candidateIds.negative,
    sourceEvidenceCandidateIds: [...new Set(records.flatMap(record =>
      record.sourceEvidenceCandidateIds || [
        ...(record.selectedNine || []).map(candidate => candidate.candidateId),
        ...(record.omittedAlternatives || []).map(candidate => candidate.candidateId),
        ...(record.omittedSystemSelections || []).map(candidate => candidate.candidateId),
      ]).filter(Boolean))],
    heroCandidateIds: [...new Set(records.flatMap(record =>
      record.signals?.hero?.candidateIds || []))],
    positiveQueries: queries.positive,
    negativeQueries: queries.negative,
    positiveSources: sources.positive,
    negativeSources: sources.negative,
    positiveClusters: clusters.positive,
    negativeClusters: clusters.negative,
    positiveAntiAnchors: antiAnchors.positive,
    negativeAntiAnchors: antiAnchors.negative,
    reusableSignalDeltas: {
      queries: queries.deltas,
      sources: sources.deltas,
      clusters: clusters.deltas,
      antiAnchors: antiAnchors.deltas,
    },
    rankingContrasts,
    rankingWins,
    rankingLosses,
    preferredPositions,
  };
}

function calibrationProofFromDiagnostics(profile, diagnostics, materialSufficient) {
  if (!profile || (!profile.evidenceCount && !profile.requiresFreshAudit)) return null;
  const comparison = diagnostics?.comparison || null;
  const beyondExactSavedNineCount = Number(comparison?.beyondExactSavedNineEffectCount) || 0;
  const scoreDelta = Number(diagnostics?.scoreDelta) || 0;
  const activeEvidenceReady = profile.evidenceCount > 0
    && comparison?.improved === true
    && beyondExactSavedNineCount > 0;
  const retiredOnlyReady = profile.evidenceCount === 0 && profile.requiresFreshAudit;
  const ready = Boolean(materialSufficient && (activeEvidenceReady || retiredOnlyReady));
  return {
    schemaVersion: 1,
    calibrationVersion: profile.calibrationVersion,
    sourceReceiptIds: profile.sourceReceiptIds,
    retiredReceiptIds: profile.retiredReceiptIds || [],
    retirementReceiptIds: profile.retirementReceiptIds || [],
    retirementHash: profile.retirementHash || null,
    evidenceCount: profile.evidenceCount,
    selectedSignalCount: Number(diagnostics?.selectedSignalCount) || 0,
    beyondExactSavedNineCount,
    scoreDelta,
    comparison,
    ready,
    status: ready
      ? retiredOnlyReady
        ? "retired_evidence_excluded"
        : "reproduced_beyond_saved_nine"
      : "reaudit_not_yet_reproduced",
    summary: ready
      ? retiredOnlyReady
        ? "A fresh audit covered the active receipt set after retired calibration evidence was excluded."
        : "Fresh evidence beyond the exact saved nine inherited positive operator signals."
      : "This run did not yet prove a positive operator signal on evidence beyond the exact saved nine.",
  };
}

function winnerBoardFromDiagnostics(diagnostics) {
  if (diagnostics?.winner === "event") return diagnostics.strongestEvent?.candidates || [];
  if (diagnostics?.winner === "compiled") return diagnostics.strongestCompiled?.candidates || [];
  return [];
}

function analysisFingerprintFromDiagnostics(diagnostics) {
  if (!diagnostics) return null;
  return recordHash((diagnostics.rawCandidates || []).map(candidate => ({
    candidateId: candidate.candidateId,
    imageDigest: candidate.imageDigest,
    retrievalDigestCollision: candidate.retrievalDigestCollision === true,
    dropReason: candidate.dropReason || null,
    dropDetail: candidate.dropDetail || null,
    promise: candidate.promise || null,
  })).sort((left, right) => left.candidateId.localeCompare(right.candidateId)));
}

export function compareCalibrationOutcomes(profile, baseline, calibrated, input = {}) {
  if (!profile?.evidenceCount || !baseline || !calibrated) return null;
  const baselineBoard = winnerBoardFromDiagnostics(baseline);
  const calibratedBoard = winnerBoardFromDiagnostics(calibrated);
  const baselinePositions = new Map(baselineBoard.map((candidate, index) =>
    [candidate.candidateId, index]));
  const calibratedPositions = new Map(calibratedBoard.map((candidate, index) =>
    [candidate.candidateId, index]));
  const calibratedEvidence = new Map((calibrated.rawCandidates || []).map(candidate =>
    [candidate.candidateId, candidate.calibration || null]));
  const sourceEvidenceIds = new Set(profile.sourceEvidenceCandidateIds || [
    ...(profile.positiveCandidateIds || []),
    ...(profile.negativeCandidateIds || []),
  ]);
  const transferableSignals = signals => (signals || []).filter(signal =>
    /^(query|source|cluster):/.test(signal));
  const effects = [];
  for (const [candidateId, calibratedPosition] of calibratedPositions) {
    const signal = calibratedEvidence.get(candidateId);
    const signals = transferableSignals(signal?.positive);
    if (!signals.length || sourceEvidenceIds.has(candidateId)) continue;
    const baselinePosition = baselinePositions.get(candidateId);
    if (baselinePosition === undefined) {
      effects.push({
        type: "selected",
        candidateId,
        baselinePosition: null,
        calibratedPosition,
        signals,
      });
    } else if (calibratedPosition < baselinePosition) {
      effects.push({
        type: calibratedPosition === 4 && signal.hero ? "hero_promoted" : "promoted",
        candidateId,
        baselinePosition,
        calibratedPosition,
        signals,
      });
    }
  }
  for (const [candidateId, baselinePosition] of baselinePositions) {
    const signal = calibratedEvidence.get(candidateId);
    const signals = transferableSignals(signal?.negative);
    if (!signals.length || sourceEvidenceIds.has(candidateId)) continue;
    const calibratedPosition = calibratedPositions.get(candidateId);
    if (calibratedPosition === undefined) {
      effects.push({
        type: "removed",
        candidateId,
        baselinePosition,
        calibratedPosition: null,
        signals,
      });
    } else if (calibratedPosition > baselinePosition) {
      effects.push({
        type: "demoted",
        candidateId,
        baselinePosition,
        calibratedPosition,
        signals,
      });
    }
  }
  const boundedEffects = effects
    .sort((left, right) =>
      left.type.localeCompare(right.type)
      || left.candidateId.localeCompare(right.candidateId))
    .slice(0, 24);
  const sameInput = Boolean(
    input.baselineInputFingerprint
    && input.baselineInputFingerprint === input.calibratedInputFingerprint,
  );
  return {
    schemaVersion: 1,
    method: "same_evidence_uncalibrated_control",
    baselineInputFingerprint: input.baselineInputFingerprint || null,
    calibratedInputFingerprint: input.calibratedInputFingerprint || null,
    sameInput,
    baselineWinner: baseline.winner || null,
    calibratedWinner: calibrated.winner || null,
    baselineCandidateIds: baselineBoard.map(candidate => candidate.candidateId),
    calibratedCandidateIds: calibratedBoard.map(candidate => candidate.candidateId),
    effects: boundedEffects,
    beyondExactSavedNineEffectCount: effects.length,
    sourceEvidenceCandidateCount: sourceEvidenceIds.size,
    improved: sameInput && effects.length > 0,
    summary: !sameInput
      ? "The control and calibrated inputs differed, so no calibration proof was accepted."
      : effects.length
      ? `${effects.length} transferable ranking effect${effects.length === 1 ? "" : "s"} appeared on evidence absent from the source audit.`
      : "The calibrated result did not improve new evidence through a transferable query, source, or visual-cluster signal.",
  };
}

function calibrationProofCoversProfile(run, profile) {
  if (!profile) return true;
  if (!profile.evidenceCount && !profile.requiresFreshAudit) return true;
  const expected = [...new Set(profile.sourceReceiptIds || [])].sort();
  const proved = [...new Set(run?.calibrationProof?.sourceReceiptIds || [])].sort();
  const expectedRetired = [...new Set(profile.retiredReceiptIds || [])].sort();
  const provedRetired = [...new Set(run?.calibrationProof?.retiredReceiptIds || [])].sort();
  return Boolean(
    run?.calibrationProof?.ready === true
    && run.calibrationProof.calibrationVersion === profile.calibrationVersion
    && JSON.stringify(proved) === JSON.stringify(expected)
    && JSON.stringify(provedRetired) === JSON.stringify(expectedRetired)
    && run.calibrationProof.retirementHash === (profile.retirementHash || null)
  );
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

function singleCuratedBoardFor(run) {
  const boards = [
    { mode: "event", board: run?.strongestEvent },
    { mode: "compiled", board: run?.strongestCompiled },
  ].filter(({ board }) => Array.isArray(board?.candidates) && board.candidates.length >= 9);
  return boards.length === 1 ? boards[0] : null;
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

function calibrationSnapshot(
  review,
  verdict,
  notes,
  vibeConfirmed,
  publishableConfirmed,
  decidedAt,
  decidedBy,
) {
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
    vibeConfirmed,
    publishableConfirmed,
    finalSchedulingAt: decidedAt,
    finalSchedulingBy: decidedBy,
  };
}

function normalizeRescuePreference(value) {
  const preference = value?.rescuePreference ?? value;
  if (!preference || typeof preference !== "object") {
    return { preferred: false, rescueReceiptId: null };
  }
  return {
    preferred: preference.preferred === true,
    rescueReceiptId: preference.preferred === true
      && typeof preference.rescueReceiptId === "string"
      ? preference.rescueReceiptId
      : null,
  };
}

function sameFinalVerdict(left, right) {
  return Boolean(
    left
    && left.verdict === right.verdict
    && left.notes === right.notes
    && left.vibeConfirmed === right.vibeConfirmed
    && left.publishableConfirmed === right.publishableConfirmed
    && JSON.stringify(normalizeRescuePreference(left.rescuePreference))
      === JSON.stringify(normalizeRescuePreference(right.rescuePreference)),
  );
}

function rescuePreferenceIdentityFor(receipt) {
  return {
    runId: receipt?.runId || null,
    actorId: receipt?.actorId || null,
    vibeKey: receipt?.vibeKey || null,
    preferred: receipt?.preferred === true,
    rescueReceiptId: receipt?.preferred === true ? receipt?.rescueReceiptId || null : null,
    feedbackHash: receipt?.feedbackHash || null,
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
  const auditContract = auditContractFor(run, pair);
  const review = run.blindReview || {
    status: comparableBoards(run) ? "pending" : "unavailable",
    presentationOrder: presentationOrderFor(run.runId),
    boards: blindBoards(run, presentationOrderFor(run.runId)),
  };
  if (auditContract.isLegacy || review.choice || review.status === "unavailable") {
    return { ...run, auditContract };
  }
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
    auditContract,
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

async function readReceipts(store, prefix, timestampField) {
  const listing = await store.list({ prefix });
  const receipts = (await Promise.all((listing?.blobs || []).map(async blob => {
    if (typeof blob?.key !== "string") return null;
    const value = await store.get(blob.key, { type: "json", consistency: "strong" });
    return value ? { key: blob.key, value } : null;
  }))).filter(Boolean);
  receipts.sort((left, right) =>
    String(right.value[timestampField] || "").localeCompare(String(left.value[timestampField] || ""))
    || right.key.localeCompare(left.key));
  return receipts.map(receipt => receipt.value);
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
  const decisionId = recordHash(value).slice(0, 24);
  const immutableWrite = await store.setJSON(
    auditEligibilityDecisionKey(
      pair.actor.id,
      pair.vibeIdx,
      value.runId || "no-run",
      decisionId,
    ),
    value,
    { onlyIfNew: true },
  );
  if (immutableWrite?.modified === false) {
    const existing = await store.get(
      auditEligibilityDecisionKey(
        pair.actor.id,
        pair.vibeIdx,
        value.runId || "no-run",
        decisionId,
      ),
      { type: "json", consistency: "strong" },
    );
    if (recordHash(existing) !== recordHash(value)) {
      throw new Error("Eligibility decision history is immutable.");
    }
  }
  await store.setJSON(eligibilityKey(pair.actor.id, pair.vibeIdx), {
    ...value,
    decisionId,
  });
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
