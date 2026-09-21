import assert from 'node:assert/strict'
;

import 
{
 readFile 
}
 from 'node:fs/promises'
;

import 
{
 test 
}
 from 'node:test'
;

import 
{
 type Page 
}
 from '@playwright/test'
;

import 
{

  closeBrowserAndServer,
  launchBrowserForServer,
  launchPageForServer,
  startViteTestServer,
}
 from './browserEngines.ts'
;


const ACTOR_ID = 'browser-test-actor'
;

const VIBE_KEY = `${ACTOR_ID}:0`
;

const RESCUE_RECEIPT_ID = 'rescue-receipt-1'
;


type AnyRecord = Record<string, any>
;


async function startApp() 
{

  return startViteTestServer()
;

}


function candidate(index: number): AnyRecord 
{

  const candidateId = String(index + 1).padStart(2, '0').repeat(12)
;

  return {

    candidateId,
    query: 'browser calibration query',
    title: `Browser evidence card ${index + 1}`,
    description: 'A retained test still.',
    source: 'browser-evidence.test',
    link: `https://browser-evidence.test/card-${index + 1}`,
    thumbnail: `https://images.browser-evidence.test/card-${index + 1}.jpg`,
  
}
;

}


function candidates(): AnyRecord[] 
{

  return Array.from(
{
 length: 9 
}
, (_, index) => candidate(index))
;

}


function actor(pairingState: string, eligible = false): AnyRecord 
{

  return {

    actorId: ACTOR_ID,
    canonicalName: 'Browser Test Actor',
    romanizedName: 'Browser Test Actor',
    profileVersion: 1,
    aliases: ['Test'],
    commonCollisions: [],
    representativeWorks: ['Browser Test Drama'],
    knownContamination: [],
    productStockMeanings: [],
    trustedSourcePatterns: ['browser-evidence.test'],
    problematicSourcePatterns: [],
    pairings: [
{

      vibeKey: VIBE_KEY,
      labels: ['Browser Calibration Vibe'],
      queryCount: 1,
      auditState: pairingState,
      eligible,
      currentRunId: null,
      calibrationEvidenceCount: pairingState === 'not_run' ? 0 : 1,
      calibrationProof: null,
    
}
, 
{

      vibeKey: `${ACTOR_ID}:1`,
      labels: ['Retired Signal Vibe'],
      queryCount: 1,
      auditState: 'calibration_reaudit_required',
      eligible: false,
      currentRunId: null,
      calibrationEvidenceCount: 0,
      calibrationProof: null,
    
}
],
  
}
;

}


function contract(): AnyRecord 
{

  return {

    status: 'current',
    isCurrent: true,
    isLegacy: false,
    legacyReasons: [],
    currentVersions: 
{

      identityProfileVersion: 1,
      aestheticClusterVersion: 1,
      promiseContractVersion: 1,
      curationVersion: 1,
    
}
,
  
}
;

}


function board(mode: string, items: AnyRecord[]): AnyRecord 
{

  return {

    boardId: `${mode}-browser-board`,
    mode,
    score: mode === 'compiled' ? 0.8 : 0.7,
    candidates: items,
    scoreBreakdown: 
{

      sourceRange: 
{
 value: 1, weight: 0.2, contribution: 0.2 
}
,
    
}
,
    promise: 
{

      coreCount: 9,
      heroFulfillment: 1,
      singleFrameRatio: 1,
    
}
,
  
}
;

}


function feedback(savedBoard?: AnyRecord, calibrationEvidence?: AnyRecord): AnyRecord 
{

  const rescue = savedBoard
    ? 
{
 ...savedBoard, ...(calibrationEvidence ? 
{
 calibrationEvidence 
}
 : 
{
}
) 
}

    : null
;

  return {

    schemaVersion: 1,
    eventCount: savedBoard ? 0 : 0,
    flags: [],
    feedbackHash: 'browser-feedback-hash',
    requestedReview: null,
    operatorRescueBoard: rescue,
    operatorRescueBoards: rescue ? [rescue] : [],
  
}
;

}


function calibrationProfile(): AnyRecord 
{

  return {

    calibrationVersion: 1,
    evidenceCount: 1,
    sourceReceiptIds: [RESCUE_RECEIPT_ID],
    positiveCandidateIds: [candidate(0).candidateId],
    negativeCandidateIds: [candidate(8).candidateId],
    positiveQueries: ['browser calibration query'],
    negativeQueries: [],
    positiveSources: ['browser-evidence test'],
    negativeSources: [],
  
}
;

}


function mixedCalibrationApprovalProfile(activeApproval = false): AnyRecord 
{

  const profile: AnyRecord = 
{

    ...calibrationProfile(),
    evidenceCount: 6,
    reviewedRunCount: 3,
    minimumApprovalEvidenceCount: 2,
    approvalReady: true,
    reusableSignalDeltas: 
{

      queries: [
        
{
 value: 'signal-a', delta: 0.3, selectedEvidenceCount: 3, omittedEvidenceCount: 0 
}
,
        
{
 value: 'signal-b', delta: 0.25, selectedEvidenceCount: 2, omittedEvidenceCount: 0 
}
,
      ],
    
}
,
    signalInventory: [
      
{

        sourceRescueReceiptId: 'rescue-support-1',
        evidenceType: 'rescue',
        sourceRunId: 'joint-run',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-a', 'signal-b'] 
}
 
}
,
      
}
,
      
{

        sourceRescueReceiptId: 'blind-support-1',
        evidenceType: 'blind_review_disagreement',
        sourceRunId: 'joint-run',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-a', 'signal-b'] 
}
 
}
,
      
}
,
      
{

        sourceRescueReceiptId: 'rescue-partial-a',
        evidenceType: 'rescue',
        sourceRunId: 'partial-run-a',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-a'] 
}
 
}
,
      
}
,
      
{

        sourceRescueReceiptId: 'blind-partial-b',
        evidenceType: 'blind_review_disagreement',
        sourceRunId: 'partial-run-b',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-b'] 
}
 
}
,
      
}
,
      
{

        sourceRescueReceiptId: 'rescue-missing-run',
        evidenceType: 'rescue',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-a', 'signal-b'] 
}
 
}
,
      
}
,
      
{

        sourceRescueReceiptId: 'blind-empty-run',
        evidenceType: 'blind_review_disagreement',
        sourceRunId: '',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-a', 'signal-b'] 
}
 
}
,
      
}
,
      
{

        sourceRescueReceiptId: 'rescue-whitespace-run',
        evidenceType: 'rescue',
        sourceRunId: '   ',
        directionalSignals: 
{
 queries: 
{
 positive: ['signal-a', 'signal-b'] 
}
 
}
,
      
}
,
    ],
  
}
;

  if (activeApproval) 
{

    profile.activeApproval = 
{

      approvalId: 'approval-mixed-evidence',
      adjustment: 
{

        type: 'query_ladder',
        signalFamily: 'queries',
        direction: 'positive',
        signalValues: ['signal-a', 'signal-b'],
      
}
,
      evidenceCount: 6,
      aggregateEvidenceHash: 'mixed-evidence-aggregate-hash',
      approvedAt: '2026-09-14T12:00:00.000Z',
    
}
;

  
}

  return profile
;

}


function boundedLegacyRecoveryProfile(): AnyRecord 
{

  return mixedCalibrationApprovalProfile(true)
;

}


function run(runId: string, revealed: boolean, proof = false): AnyRecord 
{

  const retained = candidates()
;

  const event = board('event', retained)
;

  const compiled = board('compiled', [...retained].reverse())
;

  const result: AnyRecord = 
{

    runId,
    schemaVersion: 1,
    profileVersion: 1,
    identityProfileVersion: 1,
    aestheticClusterVersion: 1,
    promiseContractVersion: 1,
    curationVersion: 1,
    pairingFingerprint: 'browser-pairing-fingerprint',
    scope: 'representative',
    startedAt: '2026-08-31T12:00:00.000Z',
    completedAt: revealed ? '2026-08-31T12:01:00.000Z' : null,
    queryCount: 1,
    auditContract: contract(),
    blindReview: revealed
      ? 
{

        status: 'revealed',
        choice: 'compiled',
        agreement: true,
        systemWinner: 'compiled',
        presentationOrder: ['event', 'compiled'],
        boards: [
          
{
 mode: 'event', label: 'Event board', board: event 
}
,
          
{
 mode: 'compiled', label: 'Compiled board', board: compiled 
}
,
        ],
        experiment: 
{

          eventBoard: 
{
 boardId: event.boardId 
}
,
          compiledBoard: 
{
 boardId: compiled.boardId 
}
,
          curationVersion: 1,
        
}
,
      
}

      : 
{

        status: 'pending',
        presentationOrder: ['event', 'compiled'],
        boards: [
          
{
 mode: 'event', label: 'Event board', board: event 
}
,
          
{
 mode: 'compiled', label: 'Compiled board', board: compiled 
}
,
        ],
      
}
,
  
}
;


  if (!revealed) return result
;


  result.queryRuns = [
{
 query: 'browser calibration query', provider: 'browser-test', rank: 0 
}
]
;

  result.rawResults = retained
;

  result.rejections = []
;

  result.identityEvidence = 
{

    collisionSignals: 0,
    heuristic: 'Browser test evidence does not prove identity by itself.',
  
}
;

  result.detectedEvents = []
;

  result.strongestEvent = event
;

  result.strongestCompiled = compiled
;

  result.winner = 
{
 mode: 'compiled', board: compiled 
}
;

  result.alternate = 
{
 mode: 'event', board: event 
}
;

  result.eventAlternatives = []
;

  result.compiledAlternatives = []
;

  result.curationReceipt = 
{

    rawCandidates: retained,
    sourceEvidenceCandidates: retained,
    dropped: [],
    curationVersion: 1,
    calibrationSignals: proof
      ? 
{

        calibrationVersion: 1,
        evidenceCount: 1,
        affected: false,
        selectedSignalCount: 1,
        beyondExactSavedNineCount: 0,
        scoreDelta: 0,
        messages: ['Only exact saved candidates matched.'],
        comparison: 
{

          method: 'same_evidence_uncalibrated_control',
          sameInput: true,
          improved: false,
          beyondExactSavedNineEffectCount: 0,
          summary: 'The calibrated result did not improve new evidence through a transferable query, source, or visual-cluster signal.',
        
}
,
      
}

      : null,
  
}
;

  result.displayCount = 9
;

  result.materialSufficient = true
;

  result.suggestedState = 'needs_operator_verdict'
;

  result.operatorVerdict = null
;

  result.editorialFeedback = feedback()
;

  if (proof) 
{

    result.calibrationProof = 
{

      schemaVersion: 1,
      calibrationVersion: 1,
      sourceReceiptIds: [RESCUE_RECEIPT_ID],
      evidenceCount: 1,
      selectedSignalCount: 1,
      beyondExactSavedNineCount: 0,
      scoreDelta: 0,
      ready: false,
      status: 'reaudit_not_yet_reproduced',
      summary: 'This run did not yet prove a positive operator signal on evidence beyond the exact saved nine.',
      comparison: result.curationReceipt.calibrationSignals.comparison,
    
}
;

  
}

  return result
;

}


function withRetrievalRepetition(result: AnyRecord): AnyRecord 
{

  result.retrievalRepetition = 
{

    occurrenceCount: 7,
    uniqueCandidateIdentityCount: 6,
    uniqueImageIdentityCount: 5,
    repeatedImageOccurrenceCount: 2,
    rungs: [
{

      ladderRung: 0,
      query: 'broad browser query',
      occurrenceCount: 4,
      uniqueImageIdentityCount: 4,
      incrementalImageIdentityCount: 4,
      overlapsWithEarlierRungs: [],
    
}
, 
{

      ladderRung: 1,
      query: 'focused browser query',
      occurrenceCount: 3,
      uniqueImageIdentityCount: 2,
      incrementalImageIdentityCount: 1,
      overlapsWithEarlierRungs: [
{

        ladderRung: 0,
        exactImageIdentityOverlapCount: 1,
      
}
],
    
}
],
  
}
;

  result.calibrationAnalysis = 
{

    failureDistribution: 
{

      queryNotVisibleToCuration: 1,
      filteredBeforeAnalysis: 2,
      exactDuplicates: 1,
      transformedDuplicates: 0,
      promiseRejected: 3,
      selected: 9,
      published: 0,
      publishedStatus: 'not_published',
    
}
,
    queryVisualYield: [],
    sameShootFamilies: [],
    candidates: [
{

      occurrenceId: 'rejected-occurrence-1',
      selected: false,
      title: 'Downstream rejected candidate',
      visualClass: 'expressive_single',
      dropReason: 'promise_not_fulfilled',
    
}
],
    classificationLimitations: 'Downstream classifications are separate from retrieval repetition.',
  
}
;

  return result
;

}


function withPartialRetrievalRepetition(result: AnyRecord): AnyRecord 
{

  withRetrievalRepetition(result)
;

  delete result.retrievalRepetition.uniqueCandidateIdentityCount
;

  result.retrievalRepetition.repeatedImageOccurrenceCount = 0
;

  delete result.retrievalRepetition.rungs[0].occurrenceCount
;

  result.retrievalRepetition.rungs[0].uniqueImageIdentityCount = 0
;

  result.retrievalRepetition.rungs[1].occurrenceCount = 0
;

  delete result.retrievalRepetition.rungs[1].uniqueImageIdentityCount
;

  delete result.retrievalRepetition.rungs[1].incrementalImageIdentityCount
;

  delete result.retrievalRepetition.rungs[0].overlapsWithEarlierRungs
;

  delete result.retrievalRepetition.rungs[1].overlapsWithEarlierRungs
;

  delete result.calibrationAnalysis.failureDistribution.filteredBeforeAnalysis
;

  delete result.calibrationAnalysis.failureDistribution.promiseRejected
;

  return result
;

}


function withoutCalibrationProofMetrics(result: AnyRecord): AnyRecord 
{

  delete result.calibrationProof?.beyondExactSavedNineCount
;

  delete result.calibrationProof?.scoreDelta
;

  return result
;

}

function withMalformedCalibrationProofMetrics(result: AnyRecord): AnyRecord
{
  result.calibrationProof.beyondExactSavedNineCount = -1.5;
  result.calibrationProof.scoreDelta = 'not-a-score';
  result.calibrationProof.ready = true;
  result.calibrationProof.status = 'reproduced_beyond_saved_nine';
  result.calibrationProof.summary = 'Malformed proof must not be trusted.';
  return result;
}


function legacyRun(runId: string, proof = false): AnyRecord 
{

  const result = run(runId, true, proof)
;

  result.displayCount = 0
;

  result.queryCount = 0
;

  result.auditContract = 
{

    ...contract(),
    status: 'legacy',
    isCurrent: false,
    isLegacy: true,
    legacyReasons: ['promise_contract_changed'],
  
}
;

  return result
;

}


function rescueCalibrationDetails(): AnyRecord 
{

  return {

    schemaVersion: 1,
    calibrationVersion: 1,
    status: 'confirmed',
    sourceRescueReceiptId: RESCUE_RECEIPT_ID,
    sourceRunId: 'run-1',
    confirmedAt: '2026-08-31T12:02:00.000Z',
    confirmedBy: 'browser-operator',
  
}
;

}


function responseBody(
  currentRun: AnyRecord | null,
  pairingState: string,
  savedBoard?: AnyRecord,
  calibration?: AnyRecord,
): AnyRecord 
{

  return {

    actor: actor(pairingState, false),
    pairing: actor(pairingState).pairings[0],
    actorId: ACTOR_ID,
    vibeKey: VIBE_KEY,
    currentRun,
    priorRuns: [],
    verdict: null,
    notes: '',
    verdictAt: null,
    calibrationProfile: calibration ? calibrationProfile() : null,
    ...(currentRun?.blindReview?.choice ? 
{

      currentRun: 
{

        ...currentRun,
        editorialFeedback: savedBoard
          ? feedback(savedBoard, calibration ? rescueCalibrationDetails() : undefined)
          : currentRun.editorialFeedback,
      
}
,
    
}
 : 
{
}
),
  
}
;

}


function publicationReviewRun(runId: string, historical = false, includePublicationJoin = true): AnyRecord 
{

  const result = run(runId, true)
;

  if (!includePublicationJoin) return result
;

  result.publicationJoinReceipt = 
{

    kind: 'vibe-atlas-audit-publication-join',
    readOnly: true,
    counts: historical
      ? 
{
 matched: 2, missing: 1, ambiguous: 0, identity_unavailable: 1 
}

      : 
{
 matched: 1, missing: 1, ambiguous: 1, identity_unavailable: 1 
}
,
    occurrences: historical
      ? [
        
{

          auditOccurrenceId: 'historical-matched',
          auditIndex: 0,
          status: 'matched',
          matches: [
{
 publicationDate: '2026-08-28', position: 2, manifestId: 'manifest-2026-08-28' 
}
],
        
}
,
        
{

          auditOccurrenceId: 'historical-identity-unavailable',
          auditIndex: 1,
          status: 'identity_unavailable',
          matches: [],
        
}
,
      ]
      : [
        
{

          auditOccurrenceId: 'current-matched',
          auditIndex: 0,
          status: 'matched',
          matches: [
{
 publicationDate: '2026-09-03', position: 4, manifestId: 'manifest-2026-09-03' 
}
],
        
}
,
        
{

          auditOccurrenceId: 'current-missing',
          auditIndex: 1,
          status: 'missing',
          matches: [],
        
}
,
        
{

          auditOccurrenceId: 'current-ambiguous',
          auditIndex: 2,
          status: 'ambiguous',
          matches: [
            
{
 publicationDate: '2026-09-04', position: 0, manifestId: 'manifest-2026-09-04' 
}
,
            
{
 publicationDate: '2026-09-05', position: 7, manifestId: 'manifest-2026-09-05' 
}
,
          ],
        
}
,
        
{

          auditOccurrenceId: 'current-identity-unavailable',
          auditIndex: 3,
          status: 'identity_unavailable',
          matches: [],
        
}
,
      ],
  
}
;

  return result
;

}


async function configureNetwork(page: Page, 
{
 missingRetirementRun = false, visualReview = false, completedVisualReview = false, failVisualJudgment = false, contendVisualJudgmentIndex = false, slowVisualJudgment = false, unfinishedBoardReview = false, publicationReview = false, returnCalibrationJsonErrorOnce = false, returnCalibrationGatewayOnce = false, returnMalformedCalibrationExportOnce = false, malformedCalibrationExportContentType = 'application/json', calibrationExportContentType = 'application/json', failCalibrationExportOnce = false, dropCalibrationExportOnce = false, mixedCalibrationApproval = false, activeMixedCalibrationApproval = false, boundedLegacyRecovery = false, retrievalRepetition = false, partialRetrievalRepetition = false, partialCalibrationProofMetrics = false, malformedCalibrationProofMetrics = false, currentLegacy = false, initialActiveRunId = null as string | null, publicationIndexRepairHealth = null as AnyRecord | null, failRepairHealthRecovery = false, auditHistoryDetailDelays = {} as Record<string, number[]>, auditHistoryDetailErrors = {} as Record<string, string[]>, auditHistoryDetailDrops = {} as Record<string, boolean[]>
}
 = 
{
}
): Promise<
{

  auditRequests: AnyRecord[]
;

  calibrationRequests: AnyRecord[]
;

  calibrationExportRequests: URL[]
;

  exportRequests: AnyRecord[]
;

  misprintRequests: AnyRecord[]
;

  getMediaUploads: () => number
;

  getCollectionSyncRequests: () => AnyRecord[]
;

}
> 
{

  let activeRunId: string | null = currentLegacy ? 'current-legacy' : unfinishedBoardReview ? 'board-review-current' : initialActiveRunId
;

  let savedBoard: AnyRecord | undefined
;

  let calibrationConfirmed = false
;

  let runNumber = 0
;

  let revealed = false
;

  const visualJudgments: AnyRecord[] = completedVisualReview
    ? [0, 1].map(index => (
{

      receiptId: `visual-receipt-${index + 1}`,
      judgmentToken: `visual-token-${index + 1}`,
      sourceOccurrenceId: `visual-token-${index + 1}`,
      classification: index === 0 ? 'core' : 'supporting',
      judgedAt: '2026-09-10T12:00:00.000Z',
    
}
))
    : []
;

  const auditRequests: AnyRecord[] = []
;

  const calibrationRequests: AnyRecord[] = []
;

  const calibrationExportRequests: URL[] = []
;

  const exportRequests: AnyRecord[] = []
;

  const misprintRequests: AnyRecord[] = []
;

  const collectionSyncRequests: AnyRecord[] = []
;

  let mediaUploads = 0
;

  let calibrationExportGateways = 0
;

  let malformedCalibrationExports = 0
;

  let calibrationExportFailures = 0
;

  let calibrationExportDrops = 0
;


  await page.route('**/api/auth/session', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{

      user: 
{

        accountId: 'browser-operator',
        email: 'operator@example.test',
        isAdmin: true,
      
}
,
    
}
),
  
}
))
;

  await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{

      actorName: 'Browser Test Actor',
      actorShortNameEn: 'Browser Test Actor',
      vibeEmoji: '🧪',
      vibeLabel: 'Browser Calibration Vibe',
      vibeLabelEn: 'Browser Calibration Vibe',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      rankedBatches: [
{
 query: 'browser test', results: [] 
}
],
      date: '2026-08-31',
    
}
),
  
}
))
;

  await page.route('**/api/membership/status', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{
 state: 'inactive', isMember: false 
}
),
  
}
))
;

  await page.route('**/.netlify/functions/image-proxy?*', route => route.fulfill(
{

    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  
}
))
;

  await page.route('**/api/collection/media?*', route => 
{

    mediaUploads += 1
;

    const itemId = new URL(route.request().url()).searchParams.get('itemId') || ''
;

    return route.fulfill(
{

      contentType: 'application/json',
      body: JSON.stringify(
{

        media: 
{

          schemaVersion: 1,
          assetId: `11111111-1111-4111-8111-${String(mediaUploads).padStart(12, '0')}`,
          deliveryUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}.png`,
          thumbnailUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}-thumb.png`,
          mimeType: 'image/png',
          sizeBytes: 68,
          checksum: String(mediaUploads).padStart(64, 'a').slice(-64),
          dimensions: 
{
 width: 1, height: 1 
}
,
          association: 
{
 type: 'collection', id: 'vibe-atlas', itemId 
}
,
        
}
,
      
}
),
    
}
)
;

  
}
)
;

  await page.route('**/api/collection/sync', route => 
{

    const request = route.request().postDataJSON() as AnyRecord
;

    collectionSyncRequests.push(request)
;

    const operation = request.operations[0]
;

    return route.fulfill(
{

      contentType: 'application/json',
      body: JSON.stringify(
{

        cursor: collectionSyncRequests.length,
        items: [
{
 ...operation.item, id: 'rescue-grid-1', localId: operation.localId 
}
],
        tombstones: [],
        mappings: 
{
 [operation.localId]: 'rescue-grid-server-1' 
}
,
        acknowledgedMutationIds: [operation.mutationId],
      
}
),
    
}
)
;

  
}
)
;

  await page.route('**/.netlify/functions/actor-audits**', async route => 
{

    const request = route.request()
;

    const url = new URL(request.url())
;

    if (request.method() === 'GET') 
{

      if (url.searchParams.get('export') === 'calibration') 
{

        calibrationExportRequests.push(url)
;

        if (returnCalibrationJsonErrorOnce && calibrationExportRequests.length === 1) 
{

          await route.fulfill(
{

            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
{

              error: 'Upstream service returned a valid JSON error document.',
              requestId: 'gateway-request-1',
            
}
),
          
}
)
;

          return
;

        
}

        if (returnCalibrationGatewayOnce && calibrationExportGateways === 0) 
{

          calibrationExportGateways += 1
;

          await route.fulfill(
{

            status: 200,
            contentType: 'text/html',
            body: '<!doctype html><title>Gateway</title><h1>Temporary gateway response</h1>',
          
}
)
;

          return
;

        
}

        if (returnMalformedCalibrationExportOnce && malformedCalibrationExports === 0) 
{

          malformedCalibrationExports += 1
;

          await route.fulfill(
{

            status: 200,
            contentType: malformedCalibrationExportContentType,
            body: '{"packet":',
          
}
)
;

          return
;

        
}

        if (failCalibrationExportOnce && calibrationExportFailures === 0) 
{

          calibrationExportFailures += 1
;

          await route.fulfill(
{

            status: 503,
            contentType: 'application/json',
            body: JSON.stringify(
{
 error: 'Editorial packet service is temporarily unavailable. Retry the download.' 
}
),
          
}
)
;

          return
;

        
}

        if (dropCalibrationExportOnce && calibrationExportDrops === 0) 
{

          calibrationExportDrops += 1
;

          await route.abort('connectionreset')
;

          return
;

        
}

        const statuses = ['matched', 'missing', 'ambiguous', 'identity_unavailable']
;

        const runs: AnyRecord[] = statuses.map((status, index) => (
{

          source: 
{

            actorId: ACTOR_ID,
            vibeKey: VIBE_KEY,
            runId: `publication-join-${status}`,
          
}
,
          publicationJoinReceipt: 
{

            kind: 'vibe-atlas-audit-publication-join',
            counts: 
{

              matched: status === 'matched' ? 1 : 0,
              missing: status === 'missing' ? 1 : 0,
              ambiguous: status === 'ambiguous' ? 1 : 0,
              identity_unavailable: status === 'identity_unavailable' ? 1 : 0,
            
}
,
            occurrences: [
{

              auditOccurrenceId: `occurrence-${index + 1}`,
              status,
              matches: status === 'matched'
                ? [
{
 publicationDate: '2026-09-03', manifestId: 'manifest-matched' 
}
]
                : status === 'ambiguous'
                  ? [
                    
{
 publicationDate: '2026-09-03', manifestId: 'manifest-ambiguous-1' 
}
,
                    
{
 publicationDate: '2026-09-04', manifestId: 'manifest-ambiguous-2' 
}
,
                  ]
                  : [],
            
}
],
          
}
,
          links: 
{

            pairing: `https://fandom.example/?adminView=actor-preflight&runId=publication-join-${status}`,
            editions: status === 'matched'
              ? [
{
 date: '2026-09-03', url: 'https://fandom.example/vibe-atlas?date=2026-09-03' 
}
]
              : status === 'ambiguous'
                ? [
                  
{
 date: '2026-09-03', url: 'https://fandom.example/vibe-atlas?date=2026-09-03' 
}
,
                  
{
 date: '2026-09-04', url: 'https://fandom.example/vibe-atlas?date=2026-09-04' 
}
,
                ]
                : [],
          
}
,
        
}
))
;

        runs.unshift(
{

          source: 
{

            actorId: ACTOR_ID,
            vibeKey: VIBE_KEY,
            runId: 'legacy-before-publication-matching',
          
}
,
          links: 
{

            pairing: 'https://fandom.example/?adminView=actor-preflight&runId=legacy-before-publication-matching',
            editions: [],
          
}
,
        
}
)
;

        await route.fulfill(
{

          contentType: calibrationExportContentType,
          headers: 
{

            'Content-Disposition': 'attachment; filename="actor-calibration-2026-09-01-2026-09-10.json"',
          
}
,
          body: JSON.stringify(
{

            schemaVersion: 1,
            exportMetadata: 
{

              readOnly: true,
              type: 'date-bounded-curation-calibration-audit',
              dateRange: 
{
 from: '2026-09-01', to: '2026-09-10', dayCount: 10 
}
,
              runCount: runs.length,
            
}
,
            runs,
          
}
),
        
}
)
;

        return
;

      
}

      if (!url.searchParams.has('actorId')) 
{

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{

            actors: [actor(calibrationConfirmed ? 'calibration_reaudit_required' : 'not_run')],
            releaseInventory: 
{

              schemaVersion: 1,
              timeZone: 'Asia/Shanghai',
              cutoff: '12:00',
              ...(publicationIndexRepairHealth ? 
{
 publicationIndexRepairHealth 
}
 : 
{
}
),
              releaseReadyPairingCount: 1,
              freshCuratorPairingCount: 1,
              rescueBackupPairingCount: 0,
              rescueBackupBoardCount: 0,
              unavailablePairingCount: 1,
              actorPacks: [
{

                actorId: ACTOR_ID,
                actorName: 'Browser Test Actor',
                actorShortNameEn: 'Browser Test Actor',
                releaseReadyPairingCount: 1,
                freshCuratorPairingCount: 1,
                rescueBackupPairingCount: 0,
                rescueBackupBoardCount: 0,
                unavailablePairingCount: 1,
                unavailablePairings: [
{

                  actorId: ACTOR_ID,
                  vibeKey: `${ACTOR_ID}:1`,
                  vibeLabel: 'Retired Signal Vibe',
                  availability: 'unavailable',
                  reasonCode: 'retired_calibration_signal',
                  summary: 'Unavailable because retired source signal affects confirmed rescue receipt rescue-receipt-7.',
                  retiredSignals: [
{

                    signalFamily: 'source',
                    sourceRescueReceiptId: 'rescue-receipt-7',
                    sourceRunId: 'run-7',
                    retirementId: 'retirement-7',
                    reason: 'Source no longer preserves confirmed identity.',
                  
}
],
                
}
],
                pairings: [
{

                  vibeKey: VIBE_KEY,
                  vibeLabel: 'Browser Calibration Vibe',
                  freshCurator: true,
                  rescueBackupBoardCount: 0,
                
}
],
                 recentlyUsed: true,
                 recentDailyDropCount: 1,
                 recentDailyDropDates: ['2026-08-30'],
                 lastDailyDropDate: '2026-08-30',
              
}
],
            
}
,
          
}
),
        
}
)
;

        return
;

      
}

      const requestedHistoryRunId = url.searchParams.get('runId')
;

      const requestedHistoryDelays = requestedHistoryRunId ? auditHistoryDetailDelays[requestedHistoryRunId] : undefined
;

      const requestedHistoryDelay = requestedHistoryDelays?.shift() ?? 0
;

      const requestedHistoryErrors = requestedHistoryRunId ? auditHistoryDetailErrors[requestedHistoryRunId] : undefined
;

      const requestedHistoryError = requestedHistoryErrors?.shift()
;

      const requestedHistoryDrops = requestedHistoryRunId ? auditHistoryDetailDrops[requestedHistoryRunId] : undefined
;

      const requestedHistoryDrop = requestedHistoryDrops?.shift()
;

      if (requestedHistoryDelay > 0) 
{

        await new Promise(resolve => setTimeout(resolve, requestedHistoryDelay))
;

      
}

      if (requestedHistoryDrop) 
{

        await route.abort('connectionreset')
;

        return
;

      
}

      if (requestedHistoryError) 
{

        await route.fulfill(
{

          status: 503,
          contentType: 'application/json',
          body: JSON.stringify(
{
 error: requestedHistoryError 
}
),
        
}
)
;

        return
;

      
}

      if (publicationReview) 
{

        const current = publicationReviewRun('publication-current')
;

        const historical = publicationReviewRun('publication-historical', true)
;

        const prePublicationJoin = publicationReviewRun('publication-pre-join', true, false)
;

        const requestedRunId = url.searchParams.get('runId')
;

        if (requestedRunId) 
{

          await route.fulfill(
{

            contentType: 'application/json',
            body: JSON.stringify(
{

              run: requestedRunId === historical.runId
                ? historical
                : requestedRunId === prePublicationJoin.runId
                  ? prePublicationJoin
                  : current,
              receiptId: null,
            
}
),
          
}
)
;

          return
;

        
}

        const response = responseBody(current, 'needs_operator_verdict')
;

        response.priorRuns = [historical, prePublicationJoin]
;

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(response),
        
}
)
;

        return
;

      
}

      if (url.searchParams.get('runId') === 'run-7') 
{

        if (missingRetirementRun) 
{

          await route.fulfill(
{

            status: 404,
            contentType: 'application/json',
            body: JSON.stringify(
{

              error: 'Source audit run run-7 is no longer retained. Rescue receipt rescue-receipt-7 remains recorded on the retirement warning.',
              runId: 'run-7',
              receiptId: 'rescue-receipt-7',
            
}
),
          
}
)
;

          return
;

        
}

        const historical = run('run-7', true)
;

        const historicalReceipt = 
{

          schemaVersion: 1,
          receiptId: 'rescue-receipt-7',
          runId: 'run-7',
          actorId: ACTOR_ID,
          vibeKey: `${ACTOR_ID}:1`,
          feedbackHash: 'retired-feedback-hash',
          board: 
{
 mode: 'operator_rescue', candidates: candidates() 
}
,
          savedAt: '2026-08-20T12:01:00.000Z',
          savedBy: 'browser-operator',
        
}
;

        historical.editorialFeedback = feedback(historicalReceipt, 
{

          ...rescueCalibrationDetails(),
          sourceRescueReceiptId: 'rescue-receipt-7',
          sourceRunId: 'run-7',
        
}
)
;

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{
 run: historical, receiptId: 'rescue-receipt-7' 
}
),
        
}
)
;

        return
;

      
}

      if (url.searchParams.get('runId') === 'run-1' && ['run-2', 'current-legacy'].includes(activeRunId ?? '')) 
{

        const retainedRun = run(
          'run-1',
          true,
          partialCalibrationProofMetrics || malformedCalibrationProofMetrics,
        )
;

        if (partialCalibrationProofMetrics) withoutCalibrationProofMetrics(retainedRun)
        if (malformedCalibrationProofMetrics) withMalformedCalibrationProofMetrics(retainedRun)
;

        delete retainedRun.displayCount
;

        delete retainedRun.queryCount
;

        if (partialRetrievalRepetition) delete retainedRun.rawResults
;

        if (partialRetrievalRepetition) withPartialRetrievalRepetition(retainedRun)
;

        else if (retrievalRepetition) withRetrievalRepetition(retainedRun)
;

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{
 run: retainedRun 
}
),
        
}
)
;

        return
;

      
}

      if (url.searchParams.get('runId') === 'run-legacy') 
{

        const requestedLegacyRun = legacyRun(
          'run-legacy',
          partialCalibrationProofMetrics || malformedCalibrationProofMetrics,
        )
;

        if (partialCalibrationProofMetrics) withoutCalibrationProofMetrics(requestedLegacyRun)
        if (malformedCalibrationProofMetrics) withMalformedCalibrationProofMetrics(requestedLegacyRun)
;

        if (partialRetrievalRepetition) requestedLegacyRun.rawResults = []
;

        if (partialRetrievalRepetition) withPartialRetrievalRepetition(requestedLegacyRun)
;

        else if (retrievalRepetition) withRetrievalRepetition(requestedLegacyRun)
;

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{
 run: requestedLegacyRun 
}
),
        
}
)
;

        return
;

      
}

      if (visualReview && ['visual-review-retained', 'visual-review-legacy'].includes(url.searchParams.get('runId') ?? '')) 
{

        const requestedRunId = url.searchParams.get('runId') as string
;

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{

            run: archivedVisualReviewRun(requestedRunId, requestedRunId === 'visual-review-legacy'),
            receiptId: requestedRunId === 'visual-review-legacy'
              ? 'visual-review-receipt-legacy'
              : 'visual-review-receipt-retained',
          
}
),
        
}
)
;

        return
;

      
}

      if (unfinishedBoardReview && url.searchParams.get('runId') === 'board-review-retained') 
{

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{

            run: run('board-review-retained', false),
            receiptId: 'board-review-receipt-retained',
          
}
),
        
}
)
;

        return
;

      
}

      const current = activeRunId
        ? currentLegacy
          ? legacyRun(activeRunId)
          : run(activeRunId, revealed, activeRunId === 'run-2' && revealed)
        : visualReview
          ? visualReviewRun(visualJudgments)
          : null
;

      if (partialRetrievalRepetition && current) withPartialRetrievalRepetition(current)
;

      if (currentLegacy && retrievalRepetition && current) withRetrievalRepetition(current)
;

      const isFreshBlocked = activeRunId === 'run-2' && calibrationConfirmed && revealed
;

      const response = responseBody(
        isFreshBlocked ? run('run-2', true, true) : current,
        isFreshBlocked ? 'calibration_reaudit_required' : calibrationConfirmed ? 'calibration_reaudit_required' : 'not_run',
        activeRunId === 'run-1' ? savedBoard : undefined,
        calibrationConfirmed ? rescueCalibrationDetails() : undefined,
      )
;

      if (mixedCalibrationApproval || activeMixedCalibrationApproval) 
{

        response.calibrationProfile = mixedCalibrationApprovalProfile(activeMixedCalibrationApproval)
;

      
}

      if (boundedLegacyRecovery) 
{

        response.calibrationProfile = boundedLegacyRecoveryProfile()
;

      
}

      if (currentLegacy) 
{

        response.priorRuns = [run('run-1', true), legacyRun('run-legacy')]
;

      
}

      if (initialActiveRunId === 'run-2')
{

        response.priorRuns = [run('run-1', true)]
;

}

      if (visualReview) 
{

        response.priorRuns = [
          archivedVisualReviewRun('visual-review-retained'),
          archivedVisualReviewRun('visual-review-legacy', true),
        ]
;

      
}

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(response),
      
}
)
;

      return
;

    
}


    const input = request.postDataJSON() as AnyRecord
;

    auditRequests.push(input)
;
    if (input.action === 'recover_publication_index_repair_health')
{
      if (failRepairHealthRecovery)
{
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Repair health recovery is temporarily unavailable.' }),
        })
;
        return
;
}
      publicationIndexRepairHealth = {
        status: 'healthy',
        warning: false,
        windowHours: 24,
        attemptCount: 0,
        failedAttemptCount: 0,
        lastAttemptAt: null,
        lastOutcome: null,
      }
;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          recovered: true,
          preservedEventCount: 0,
          repairHealth: publicationIndexRepairHealth,
        }),
      })
;
      return
;
}

    if (input.action === 'run') 
{

      runNumber += 1
;

      activeRunId = `run-${runNumber}`
;

      revealed = false
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(responseBody(
          run(activeRunId, false),
          calibrationConfirmed ? 'calibration_reaudit_required' : 'blind_review_pending',
          undefined,
          calibrationConfirmed ? rescueCalibrationDetails() : undefined,
        )),
      
}
)
;

      return
;

    
}

    if (input.action === 'blind_choice') 
{

      const selectedRunId = String(input.runId)
;

      const proof = selectedRunId === 'run-2'
;

      revealed = true
;

      const revealedRun = run(selectedRunId, true, proof)
;

      if (partialRetrievalRepetition) withPartialRetrievalRepetition(revealedRun)
;

      else if (retrievalRepetition) withRetrievalRepetition(revealedRun)
;

      if (selectedRunId === 'run-1' && savedBoard) 
{

        revealedRun.editorialFeedback = feedback(savedBoard, calibrationConfirmed ? rescueCalibrationDetails() : undefined)
;

      
}

      const response = responseBody(
        revealedRun,
        calibrationConfirmed ? 'calibration_reaudit_required' : 'comparison_unavailable',
        selectedRunId === 'run-1' ? savedBoard : undefined,
        calibrationConfirmed ? rescueCalibrationDetails() : undefined,
      )
;

      if (selectedRunId === 'run-2') 
{

        response.priorRuns = [run('run-1', true), legacyRun('run-legacy')]
;

      
}

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(response),
      
}
)
;

      return
;

    
}

    if (input.action === 'record_visual_judgment' && visualReview) 
{

      if (failVisualJudgment) 
{

        await route.fulfill(
{

          status: 503,
          contentType: 'application/json',
          body: JSON.stringify(
{

            error: 'LEAK SENTINEL QUERY · 47 · LEAK SENTINEL PROXY CLASS · LEAK SENTINEL BOARD RESULT · LEAK SENTINEL SYSTEM OUTCOME',
          
}
),
        
}
)
;

        return
;

      
}

      if (contendVisualJudgmentIndex) 
{

        await route.fulfill(
{

          status: 503,
          contentType: 'application/json',
          body: JSON.stringify(
{

            error: 'The judgment was saved, but its receipt index is busy.',
            receiptSaved: true,
            repairAction: 'repair_visual_judgment_index',
            runId: 'visual-review-current',
            receiptId: `visual-${input.judgmentToken}`,
          
}
),
        
}
)
;

        return
;

      
}

      if (slowVisualJudgment) 
{

        await new Promise(resolve => setTimeout(resolve, 250))
;

      
}

      visualJudgments.push(
{

        receiptId: `visual-receipt-${visualJudgments.length + 1}`,
        judgmentToken: input.judgmentToken,
        sourceOccurrenceId: input.judgmentToken,
        classification: input.classification,
        judgedAt: '2026-09-10T12:00:00.000Z',
      
}
)
;

      const response = responseBody(
        visualReviewRun(visualJudgments),
        'needs_operator_verdict',
      )
;

      response.priorRuns = [
        archivedVisualReviewRun('visual-review-retained'),
        archivedVisualReviewRun('visual-review-legacy', true),
      ]
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(response),
      
}
)
;

      return
;

    
}

    if (input.action === 'repair_visual_judgment_index' && visualReview) 
{

      visualJudgments.push(
{

        receiptId: input.receiptId,
        judgmentToken: String(input.receiptId).replace(/^visual-/, ''),
        sourceOccurrenceId: String(input.receiptId).replace(/^visual-/, ''),
        classification: 'core',
        judgedAt: '2026-09-10T12:00:00.000Z',
      
}
)
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          repaired: true,
          runId: input.runId,
          receiptId: input.receiptId,
          receiptUnchanged: true,
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'save_rescue_board') 
{

      assert.equal(input.runId, 'run-1')
;

      assert.deepEqual(input.candidateIds, candidates().map(item => item.candidateId))
;

      const savedRun = run('run-1', true)
;

      savedBoard = 
{

        schemaVersion: 1,
        receiptId: RESCUE_RECEIPT_ID,
        runId: 'run-1',
        actorId: ACTOR_ID,
        vibeKey: VIBE_KEY,
        feedbackHash: 'browser-feedback-hash',
        board: 
{
 mode: 'operator_rescue', candidates: candidates() 
}
,
        savedAt: '2026-08-31T12:01:00.000Z',
        savedBy: 'browser-operator',
      
}
;

      savedRun.editorialFeedback = feedback(savedBoard)
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(responseBody(savedRun, 'needs_operator_verdict', savedBoard)),
      
}
)
;

      return
;

    
}

    if (input.action === 'export_rescue_board') 
{

      exportRequests.push(input)
;

      assert.equal(input.runId, 'run-1')
;

      assert.equal(input.receiptId, RESCUE_RECEIPT_ID)
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          rescueExport: 
{

            gridId: 'rescue-grid-1',
            runId: 'run-1',
            receiptId: RESCUE_RECEIPT_ID,
            arrangedAt: '2026-08-31T12:01:00.000Z',
            exportedAt: '2026-08-31T12:02:00.000Z',
            actor: 
{
 id: ACTOR_ID, name: 'Browser Test Actor', nameEn: 'Browser Test Actor', accentColor: '#123456' 
}
,
            vibe: 
{

              key: VIBE_KEY,
              label: 'Browser Calibration Vibe',
              labelEn: 'Browser Calibration Vibe',
              emoji: '🧪',
              subtitle: '',
              subtitleEn: '',
              searchSpell: 'browser calibration query',
            
}
,
            candidates: candidates(),
          
}
,
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'mark_rescue_calibration') 
{

      calibrationRequests.push(input)
;

      assert.equal(input.runId, 'run-1')
;

      assert.equal(input.receiptId, RESCUE_RECEIPT_ID)
;

      calibrationConfirmed = true
;

      const markedRun = run('run-1', true)
;

      markedRun.editorialFeedback = feedback(savedBoard, rescueCalibrationDetails())
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          ...responseBody(markedRun, 'calibration_reaudit_required', savedBoard, rescueCalibrationDetails()),
          actor: actor('calibration_reaudit_required'),
          pairing: actor('calibration_reaudit_required').pairings[0],
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'mark_misprint') 
{

      misprintRequests.push(input)
;

      const receipt = 
{

        receiptId: 'misprint-receipt-1',
        sourceRunId: input.runId,
        candidateId: input.candidateId,
        reason: input.reason,
        label: 'Some Other Man™',
        correctionScope: 'actor_identity',
        actualIdentity: input.actualIdentity || null,
        note: input.note || '',
        markedAt: '2026-08-31T12:03:00.000Z',
        markedBy: 'browser-operator',
      
}
;

      const correctedRun = run(String(activeRunId), true, activeRunId === 'run-2')
;

      correctedRun.editorialFeedback = 
{

        ...feedback(),
        eventCount: 1,
        misprints: [receipt],
        flags: [
{

          candidateId: input.candidateId,
          intent: 'exclude',
          disposition: 'excluded',
          createdAt: receipt.markedAt,
          createdBy: receipt.markedBy,
          misprint: receipt,
        
}
],
      
}
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          ...responseBody(
            correctedRun,
            calibrationConfirmed ? 'calibration_reaudit_required' : 'needs_operator_verdict',
            undefined,
            calibrationConfirmed ? rescueCalibrationDetails() : undefined,
          ),
          misprint: receipt,
        
}
),
      
}
)
;

      return
;

    
}

    throw new Error(`Unexpected actor audit action: ${String(input.action)}`)
;

  
}
)
;


  return {

    auditRequests,
    calibrationRequests,
    calibrationExportRequests,
    exportRequests,
    misprintRequests,
    getMediaUploads: () => mediaUploads,
    getCollectionSyncRequests: () => collectionSyncRequests,
  
}
;

}


async function configureCacheDiagnosticNetwork(
  page: Page,
  
{

    failFirstRefresh = false,
    initialDiagnostic = null,
    manifestQueries = ['browser cache proof query'],
  
}
: 
{

    failFirstRefresh?: boolean
;

    initialDiagnostic?: AnyRecord | null
;

    manifestQueries?: string[]
;

  
}
 = 
{
}
,
): Promise<
{

  providerSearchRequests: AnyRecord[]
;

  receiptSaveRequests: AnyRecord[]
;

}
> 
{

  const providerSearchRequests: AnyRecord[] = []
;

  const receiptSaveRequests: AnyRecord[] = []
;

  let savedDiagnostic: AnyRecord | null = initialDiagnostic
;

  let refreshFailures = 0
;


  await page.route('**/api/auth/session', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{

      user: 
{

        accountId: 'browser-operator',
        email: 'operator@example.test',
        isAdmin: true,
      
}
,
    
}
),
  
}
))
;

  await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{

      actorName: 'Browser Test Actor',
      actorShortNameEn: 'Browser Test Actor',
      vibeEmoji: '🧪',
      vibeLabel: 'Browser Calibration Vibe',
      vibeLabelEn: 'Browser Calibration Vibe',
      rankedBatches: [],
      date: '2026-09-20',
    
}
),
  
}
))
;

  await page.route('**/api/membership/status', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{
 state: 'inactive', isMember: false 
}
),
  
}
))
;

  await page.route('**/.netlify/functions/actor-audits**', async route => 
{

    const request = route.request()
;

    const url = new URL(request.url())
;

    if (request.method() === 'GET') 
{

      if (!url.searchParams.has('actorId')) 
{

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{
 actors: [actor('not_run')] 
}
),
        
}
)
;

        return
;

      
}

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          actor: actor('not_run'),
          pairing: actor('not_run').pairings.find(
            (item: 
{
 vibeKey: string 
}
) => item.vibeKey === url.searchParams.get('vibeKey'),
          ),
          currentRun: null,
          priorRuns: [],
          cacheDiagnostics: savedDiagnostic ? 
{
 full: savedDiagnostic 
}
 : 
{
}
,
        
}
),
      
}
)
;

      return
;

    
}


    const input = request.postDataJSON() as AnyRecord
;

    if (input.action === 'cache_diagnostic_manifest') 
{

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          diagnostic: 
{

            schemaVersion: 2,
            diagnosticId: 'cache-proof-browser',
            actorId: input.actorId,
            vibeKey: input.vibeKey,
            scope: input.scope,
            frozenQueries: manifestQueries,
            comparisonId: 'browser-comparison-id',
            reservationExpiresAt: '2099-09-20T12:05:00.000Z',
          
}
,
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'cache_diagnostic_fetch') 
{

      providerSearchRequests.push(input)
;

      if (failFirstRefresh && input.cacheMode === 'refresh' && refreshFailures++ === 0) 
{

        await route.fulfill(
{

          status: 500,
          contentType: 'application/json',
          body: JSON.stringify(
{
 error: 'Temporary refresh search failure.' 
}
),
        
}
)
;

        return
;

      
}

      const identity = input.cacheMode === 'refresh' ? 'refresh-image' : 'default-image'
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          search: 
{

            resultFingerprint: `${identity}-fingerprint`,
            providerFetchOrder: [identity],
            resultIdentities: [
{
 identity, title: identity 
}
],
            resultIdentityCapture: 
{
 truncated: false 
}
,
          
}
,
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'cache_diagnostic_receipt') 
{

      receiptSaveRequests.push(input)
;

      savedDiagnostic = 
{

        schemaVersion: 2,
        diagnosticId: 'cache-proof-browser',
        actorId: input.actorId,
        vibeKey: input.vibeKey,
        scope: input.scope,
        frozenQueries: input.frozenQueries,
        comparisonId: input.comparisonId,
        reservationExpiresAt: input.reservationExpiresAt,
        queryContract: 
{

          status: 'current',
          isCurrent: true,
          checkedAt: '2026-09-20T12:00:00.000Z',
          currentQueries: input.frozenQueries,
        
}
,
        comparedAt: input.comparedAt,
        savedAt: '2026-09-20T12:00:00.000Z',
        comparisons: input.comparisons,
      
}
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{
 diagnostic: savedDiagnostic 
}
),
      
}
)
;

      return
;

    
}

    throw new Error(`Unexpected cache diagnostic action: ${String(input.action)}`)
;

  
}
)
;


  return {
 providerSearchRequests, receiptSaveRequests 
}
;

}


test('saved cache proof reopens after refresh without provider searches and stays scoped to its pairing', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 providerSearchRequests, receiptSaveRequests 
}
 = await configureCacheDiagnosticNetwork(page)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    const diagnostic = page.getByRole('region', 
{
 name: 'Search cache diagnostic' 
}
)
;

    await diagnostic.getByRole('button', 
{
 name: 'Compare normal vs bypass', exact: true 
}
).click()
;

    await diagnostic.getByText('Comparison receipt · Current query set · 1 of 1 complete', 
{
 exact: true 
}
).waitFor()
;


    assert.equal(providerSearchRequests.length, 2, 'creating the proof should run one normal and one bypassed provider search')
;

    assert.deepEqual(providerSearchRequests.map(request => request.cacheMode).sort(), ['default', 'refresh'])
;

    assert.equal(receiptSaveRequests.length, 1, 'the completed comparison should be persisted once')
;


    const searchesBeforeRefresh = providerSearchRequests.length
;

    await page.reload()
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    const refreshedDiagnostic = page.getByRole('region', 
{
 name: 'Search cache diagnostic' 
}
)
;

    await refreshedDiagnostic.getByText('Comparison receipt · Current query set · 1 of 1 complete', 
{
 exact: true 
}
).waitFor()
;

    await refreshedDiagnostic.getByText('1. browser cache proof query', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      providerSearchRequests.length,
      searchesBeforeRefresh,
      'reopening the saved receipt after refresh must not invoke diagnostic provider searches',
    )
;


    await page.getByLabel('Audit scope').selectOption('representative')
;

    assert.equal(
      await refreshedDiagnostic.getByText('Comparison receipt · Current query set · 1 of 1 complete', 
{
 exact: true 
}
).count(),
      0,
      'a full-scope receipt must not appear under representative scope',
    )
;


    await page.getByLabel('Audit scope').selectOption('full')
;

    await refreshedDiagnostic.getByText('Comparison receipt · Current query set · 1 of 1 complete', 
{
 exact: true 
}
).waitFor()
;

    await page.getByRole('button', 
{
 name: 'Retired Signal Vibe', exact: false 
}
).click()
;

    assert.equal(
      await refreshedDiagnostic.getByText('Comparison receipt · Current query set · 1 of 1 complete', 
{
 exact: true 
}
).count(),
      0,
      'a receipt from another pairing must not be displayed',
    )
;

    assert.equal(providerSearchRequests.length, searchesBeforeRefresh, 'switching pairing or scope must not invoke provider searches')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('historical cache proof keeps its frozen evidence and starts a new current-query comparison', 
{
 timeout: 60_000 
}
, async () => 
{

  const removedQuery = 'removed frozen cache proof query'
;

  const movedLaterQuery = 'moved later cache proof query'
;

  const movedEarlierQuery = 'moved earlier cache proof query'
;

  const addedQuery = 'added current cache proof query'
;

  const frozenQueries = [removedQuery, movedLaterQuery, movedEarlierQuery]
;

  const currentQueries = [addedQuery, movedEarlierQuery, movedLaterQuery]
;

  const historicalDiagnostic = 
{

    schemaVersion: 2,
    diagnosticId: 'historical-cache-proof-browser',
    actorId: ACTOR_ID,
    vibeKey: VIBE_KEY,
    scope: 'full',
    frozenQueries,
    comparisonId: 'historical-comparison-id',
    queryContract: 
{

      status: 'historical',
      isCurrent: false,
      checkedAt: '2026-09-20T12:00:00.000Z',
      currentQueries,
      changes: 
{

        added: [
{
 query: addedQuery, currentIndex: 0 
}
],
        removed: [
{
 query: removedQuery, frozenIndex: 0 
}
],
        reordered: [
          
{
 query: movedLaterQuery, frozenIndex: 1, currentIndex: 2 
}
,
          
{
 query: movedEarlierQuery, frozenIndex: 2, currentIndex: 1 
}
,
        ],
      
}
,
    
}
,
    comparedAt: '2026-09-19T12:00:00.000Z',
    savedAt: '2026-09-19T12:01:00.000Z',
    comparisons: frozenQueries.map((query, index) => (
{

      query,
      normal: 
{

        resultFingerprint: `historical-default-fingerprint-${index}`,
        resultIdentities: [
{
 identity: `historical-default-image-${index}`, title: `Historical default image ${index + 1}` 
}
],
      
}
,
      bypassed: 
{

        resultFingerprint: `historical-refresh-fingerprint-${index}`,
        resultIdentities: [
{
 identity: `historical-refresh-image-${index}`, title: `Historical refresh image ${index + 1}` 
}
],
      
}
,
    
}
)),
  
}
;

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 providerSearchRequests, receiptSaveRequests 
}
 = await configureCacheDiagnosticNetwork(page, 
{

    initialDiagnostic: historicalDiagnostic,
    manifestQueries: currentQueries,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByLabel('Audit scope').selectOption('full')
;

    const diagnostic = page.getByRole('region', 
{
 name: 'Search cache diagnostic' 
}
)
;


    await diagnostic.getByText('Comparison receipt · Historical query set · 3 of 3 complete', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await diagnostic.getByText('This saved proof used an older frozen query set. Its original queries and evidence remain below. Run a new comparison only when current proof is needed.', 
{
 exact: true 
}
).isVisible(),
      true,
    )
;

    const queryChanges = diagnostic.locator('[aria-label="Query contract changes"]')
;

    assert.deepEqual(await queryChanges.locator('p').allTextContents(), [
      `Added1. ${addedQuery}`,
      `Removed1. ${removedQuery}`,
      `Reordered${movedLaterQuery} (2 → 3) · ${movedEarlierQuery} (3 → 2)`,
    ])
;

    const frozenQueryHeadings = diagnostic.locator('div > strong').filter(
{
 hasText: /cache proof query$/ 
}
)
;

    assert.deepEqual(await frozenQueryHeadings.allTextContents(), frozenQueries.map((query, index) => `${index + 1}. ${query}`))
;

    assert.equal(
      await queryChanges.evaluate((summary, frozenHeading) =>
        Boolean(summary.compareDocumentPosition(frozenHeading as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
      await frozenQueryHeadings.first().elementHandle()),
      true,
      'the frozen receipt queries must remain visible below the change summary',
    )
;

    assert.equal(await diagnostic.getByText('Historical default image 1', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await diagnostic.getByText('Historical refresh image 3', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(providerSearchRequests.length, 0, 'opening historical proof must not repeat its frozen searches')
;

    assert.equal(receiptSaveRequests.length, 0, 'opening historical proof must not write a diagnostic, audit, or publication receipt')
;


    const newComparison = diagnostic.getByRole('button', 
{
 name: 'Run new comparison with current queries', exact: true 
}
)
;

    await newComparison.click()
;

    await diagnostic.getByText('Comparison receipt · Current query set · 3 of 3 complete', 
{
 exact: true 
}
).waitFor()
;


    assert.deepEqual(
      providerSearchRequests.map(request => (
{
 queryIndex: request.queryIndex, cacheMode: request.cacheMode 
}
)),
      [
        
{
 queryIndex: 0, cacheMode: 'default' 
}
,
        
{
 queryIndex: 1, cacheMode: 'default' 
}
,
        
{
 queryIndex: 2, cacheMode: 'default' 
}
,
        
{
 queryIndex: 0, cacheMode: 'refresh' 
}
,
        
{
 queryIndex: 1, cacheMode: 'refresh' 
}
,
        
{
 queryIndex: 2, cacheMode: 'refresh' 
}
,
      ],
      'the historical action must start both cache paths for the new manifest',
    )
;

    assert.equal(receiptSaveRequests.length, 1)
;

    assert.deepEqual(receiptSaveRequests[0].frozenQueries, currentQueries)
;

    assert.deepEqual(receiptSaveRequests[0].comparisons.map((comparison: AnyRecord) => comparison.query), currentQueries)
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('legacy historical cache proof marks its query-change summary unavailable without searches or writes', 
{
 timeout: 60_000 
}
, async () => 
{

  const frozenQuery = 'legacy frozen cache proof query'
;

  const historicalDiagnostic = 
{

    schemaVersion: 1,
    diagnosticId: 'legacy-historical-cache-proof-browser',
    actorId: ACTOR_ID,
    vibeKey: VIBE_KEY,
    scope: 'full',
    frozenQueries: [frozenQuery],
    queryContract: 
{

      status: 'historical',
      isCurrent: false,
      checkedAt: '2026-09-20T12:00:00.000Z',
      currentQueries: ['current cache proof query'],
    
}
,
    comparedAt: '2026-09-18T12:00:00.000Z',
    savedAt: '2026-09-18T12:01:00.000Z',
    comparisons: [
{

      query: frozenQuery,
      normal: 
{

        resultFingerprint: 'legacy-default-fingerprint',
        resultIdentities: [
{
 identity: 'legacy-default-image', title: 'Legacy default evidence' 
}
],
      
}
,
      bypassed: 
{

        resultFingerprint: 'legacy-refresh-fingerprint',
        resultIdentities: [
{
 identity: 'legacy-refresh-image', title: 'Legacy bypass evidence' 
}
],
      
}
,
    
}
],
  
}
;

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 providerSearchRequests, receiptSaveRequests 
}
 = await configureCacheDiagnosticNetwork(page, 
{

    initialDiagnostic: historicalDiagnostic,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByLabel('Audit scope').selectOption('full')
;

    const diagnostic = page.getByRole('region', 
{
 name: 'Search cache diagnostic' 
}
)
;


    await diagnostic.getByText('Comparison receipt · Historical query set · 1 of 1 complete', 
{
 exact: true 
}
).waitFor()
;

    const queryChanges = diagnostic.locator('[aria-label="Query contract changes"]')
;

    await queryChanges.getByText('Change summary unavailable for this older receipt.', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(await queryChanges.getByText(/^(Added|Removed|Reordered)None$/).count(), 0)
;

    assert.equal(await diagnostic.getByText(`1. ${frozenQuery}`, 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await diagnostic.getByText('Legacy default evidence', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await diagnostic.getByText('Legacy bypass evidence', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(providerSearchRequests.length, 0, 'opening a legacy historical proof must not invoke provider searches')
;

    assert.equal(receiptSaveRequests.length, 0, 'opening a legacy historical proof must not create audit or publication writes')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a failed cache comparison retries immediately with its active saved reservation', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 providerSearchRequests, receiptSaveRequests 
}
 = await configureCacheDiagnosticNetwork(
    page,
    
{
 failFirstRefresh: true 
}
,
  )
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    const diagnostic = page.getByRole('region', 
{
 name: 'Search cache diagnostic' 
}
)
;

    await diagnostic.getByRole('button', 
{
 name: 'Compare normal vs bypass', exact: true 
}
).click()
;

    const retry = diagnostic.getByRole('button', 
{
 name: 'Retry failed searches', exact: true 
}
)
;

    await retry.waitFor()
;

    assert.equal(providerSearchRequests.length, 2)
;

    assert.equal(receiptSaveRequests.length, 1)
;


    await retry.click()
;

    await diagnostic.getByText('Comparison receipt · Current query set · 1 of 1 complete', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(providerSearchRequests.length, 3, 'retry should search only the failed cache side')
;

    assert.equal(providerSearchRequests[2].cacheMode, 'refresh')
;

    assert.equal(providerSearchRequests[2].comparisonId, 'browser-comparison-id')
;

    assert.equal(receiptSaveRequests.length, 2)
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('retrieval repetition stays visibly separate from the downstream rejection funnel and read-only', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  await configureNetwork(page, 
{
 retrievalRepetition: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;


    const funnel = page.getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
;

    const repetition = funnel.getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    await repetition.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    const retrievalValues = await repetition.locator('strong').allTextContents()
;

    assert.deepEqual(retrievalValues.slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('unique candidate identities', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('unique image identities', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('repeated image occurrences', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('Exact overlap receipt', 
{
 exact: true 
}
).isVisible(), true)
;


    assert.equal(await funnel.getByText('failed image or safety gates', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await funnel.getByText('contradictory or irrelevant', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(
      await funnel.getByText('failed image or safety gates', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(),
      '2',
    )
;

    assert.equal(
      await funnel.getByText('contradictory or irrelevant', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(),
      '3',
    )
;

    assert.equal(
      await funnel.locator('summary').filter(
{
 hasText: 'Blind rejected-candidate classification' 
}
).isVisible(),
      true,
    )
;

    assert.equal(await repetition.getByRole('button').count(), 0)
;

    assert.equal(await repetition.locator('input, select, textarea').count(), 0)
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('partial retrieval receipts distinguish unavailable counts from recorded zeroes without mutations', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 partialRetrievalRepetition: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;


    const currentReceipt = page.getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    const currentFunnel = page.getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
;

    await currentReceipt.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    assert.deepEqual((await currentReceipt.locator('strong').allTextContents()).slice(0, 4), ['7', 'Unavailable', '5', '0'])
;

    assert.equal(await currentReceipt.getByText('Unavailable occurrences · 0 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await currentReceipt.getByText('0 occurrences · Unavailable unique images · Unavailable new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await currentReceipt.getByText('Exact overlap detail unavailable for this rung', 
{
 exact: true 
}
).count(), 2)
;

    assert.equal(await currentFunnel.getByText('failed image or safety gates', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), 'Unavailable')
;

    assert.equal(await currentFunnel.getByText('contradictory or irrelevant', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), 'Unavailable')
;

    assert.equal(await currentFunnel.getByText('transformed copies measured', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), '0')
;

    assert.equal(await currentFunnel.getByText('not published', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), '0')
;


    const currentRequestsBeforeExpansion = structuredClone(auditRequests)
;

    const currentPartialReceipt = currentReceipt.locator('details').filter(
{
 hasText: 'Partial retrieval receipt · exact overlap unavailable' 
}
)
;

    await currentPartialReceipt.locator('summary').click()
;

    assert.equal(await currentPartialReceipt.getByText('Exact overlap detail is unavailable in this retained receipt.', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await currentReceipt.locator('button, input, select, textarea, form').count(), 0)
;

    assert.deepEqual(auditRequests, currentRequestsBeforeExpansion, 'expanding a current partial receipt must not run or mutate an audit')
;


    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;

    const requestsBeforeRetainedReview = structuredClone(auditRequests)
;

    await page.getByLabel('Audit run').selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;


    const retainedReceipt = page.getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    const retainedFunnel = page.getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
;

    await retainedReceipt.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await page.getByText('displayable retained images',
{
 exact: true
}
).locator('xpath=preceding-sibling::strong[1]').textContent(),
      'Unavailable',
    )
;

    assert.equal(
      await page.getByText('retained results',
{
 exact: true
}
).locator('xpath=preceding-sibling::strong[1]').textContent(),
      'Unavailable',
    )
;

    assert.deepEqual((await retainedReceipt.locator('strong').allTextContents()).slice(0, 4), ['7', 'Unavailable', '5', '0'])
;

    const retainedRawResults = page.locator('details').filter(
{
 has: page.locator('summary').filter({ hasText: /^Bounded raw results/ })
}
)
;

    assert.match(
      await retainedRawResults.locator(':scope > summary').innerText(),
      /Bounded raw results Retained · frozen read-only · Unavailable/,
      'an omitted retained evidence section must be labeled unavailable before expansion',
    )
;

    await retainedRawResults.locator(':scope > summary').click()
;

    assert.equal(
      await retainedRawResults.getByText('Unavailable — this evidence was not recorded for this audit.', { exact: true }).isVisible(),
      true,
      'an expanded omitted retained evidence section must explain that the evidence was unavailable',
    )
;

    assert.equal(
      await retainedRawResults.locator('button, input, select, textarea, form').count(),
      0,
      'expanded unavailable retained evidence must remain read-only',
    )
;

    assert.equal(await retainedReceipt.getByText('Unavailable occurrences · 0 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await retainedReceipt.getByText('0 occurrences · Unavailable unique images · Unavailable new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await retainedFunnel.getByText('failed image or safety gates', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), 'Unavailable')
;

    assert.equal(await retainedFunnel.getByText('transformed copies measured', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), '0')
;

    const retainedPartialReceipt = retainedReceipt.locator('details').filter(
{
 hasText: 'Partial retrieval receipt · exact overlap unavailable' 
}
)
;

    await retainedPartialReceipt.locator('summary').click()
;

    assert.equal(await retainedPartialReceipt.getByText('Exact overlap detail is unavailable in this retained receipt.', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await retainedReceipt.locator('button, input, select, textarea, form').count(), 0)
;

    assert.deepEqual(auditRequests, requestsBeforeRetainedReview, 'switching to and expanding a retained partial receipt must not run or mutate an audit')
;


    await page.getByLabel('Audit run').selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    const legacyReceipt = page.getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    const legacyFunnel = page.getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
;

    await legacyReceipt.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await page.getByText('displayable retained images',
{
 exact: true
}
).locator('xpath=preceding-sibling::strong[1]').textContent(),
      '0',
    )
;

    assert.equal(
      await page.getByText('retained results',
{
 exact: true
}
).locator('xpath=preceding-sibling::strong[1]').textContent(),
      '0',
    )
;

    assert.deepEqual((await legacyReceipt.locator('strong').allTextContents()).slice(0, 4), ['7', 'Unavailable', '5', '0'])
;

    const legacyRawResults = page.locator('details').filter(
{
 has: page.locator('summary').filter({ hasText: /^Bounded raw results/ })
}
)
;

    assert.match(
      await legacyRawResults.locator(':scope > summary').innerText(),
      /Bounded raw results Legacy · frozen read-only · 0 records/,
      'a recorded empty Legacy evidence section must remain visible as zero records',
    )
;

    await legacyRawResults.locator(':scope > summary').click()
;

    assert.equal(
      await legacyRawResults.getByText('0 records were recorded for this audit.', { exact: true }).isVisible(),
      true,
      'an expanded recorded-empty Legacy evidence section must preserve the recorded zero count',
    )
;

    assert.equal(
      await legacyRawResults.getByText('Unavailable — this evidence was not recorded for this audit.', { exact: true }).count(),
      0,
      'a recorded empty Legacy evidence section must not be labeled unavailable',
    )
;

    assert.equal(
      await legacyRawResults.locator('button, input, select, textarea, form').count(),
      0,
      'expanded recorded-empty Legacy evidence must remain read-only',
    )
;

    assert.equal(await legacyReceipt.getByText('Unavailable occurrences · 0 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await legacyReceipt.getByText('0 occurrences · Unavailable unique images · Unavailable new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await legacyFunnel.getByText('contradictory or irrelevant', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), 'Unavailable')
;

    assert.equal(await legacyFunnel.getByText('not published', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').textContent(), '0')
;

    assert.equal(await legacyFunnel.locator('button, input, select, textarea, form').count(), 0)
;

    assert.deepEqual(auditRequests, requestsBeforeRetainedReview, 'switching to and reading a Legacy partial receipt must not run or mutate an audit')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('calibration proof metrics reject malformed retained and Legacy history without mutations',
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

    const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 malformedCalibrationProofMetrics: true
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;


    const currentProof = page.getByRole('region', 
{
 name: 'Rescue learning review' 
}
)
;

    await currentProof.getByText('0 effects beyond the exact saved nine · score delta 0.000', 
{
 exact: true 
}
).waitFor()
;


    const requestsBeforeHistoryReview = structuredClone(auditRequests)
;

    const runSelect = page.getByLabel('Audit run')
;


    await runSelect.selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;

    const retainedProof = page.getByRole('region', 
{
 name: 'Rescue learning review' 
}
)
;

    await retainedProof.getByText('Effect count unavailable · score delta unavailable', 
{
 exact: true 
}
).waitFor()
;

    await retainedProof.getByText('Transfer not reproduced', { exact: true }).waitFor()
;

    assert.equal(await retainedProof.locator('button, input, select, textarea, form').count(), 0)
;


    await runSelect.selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    const legacyProof = page.getByRole('region', 
{
 name: 'Rescue learning review' 
}
)
;

    await legacyProof.getByText('Effect count unavailable · score delta unavailable', 
{
 exact: true 
}
).waitFor()
;

    await legacyProof.getByText('Transfer not reproduced', { exact: true }).waitFor()
;

    assert.equal(await legacyProof.locator('button, input, select, textarea, form').count(), 0)
;

    assert.deepEqual(auditRequests, requestsBeforeHistoryReview, 'reading retained and Legacy proof metrics must not run or mutate an audit')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('retrieval repetition remains visible and read-only after switching to a retained audit', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 retrievalRepetition: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;


    const requestsBeforeHistoryReview = structuredClone(auditRequests)
;

    await page.getByLabel('Audit run').selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;


    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    await repetition.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;


    const overlapReceipt = repetition.locator('details').filter(
{
 hasText: 'Exact overlap receipt' 
}
)
;

    await overlapReceipt.locator('summary').click()
;

    assert.equal(await overlapReceipt.getByText('"exactImageIdentityOverlapCount": 1', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByRole('button').count(), 0)
;

    assert.equal(await repetition.locator('input, select, textarea, form').count(), 0)
;

    assert.equal(
      await page.getByText('This is a frozen historical review. Return to the current run to revise scheduling eligibility.', 
{
 exact: true 
}
).isVisible(),
      true,
    )
;

    assert.deepEqual(
      auditRequests,
      requestsBeforeHistoryReview,
      'switching to and reading a retained retrieval receipt must not run or mutate an audit',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('retrieval repetition remains visible beneath Legacy warnings without audit mutations', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 retrievalRepetition: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;


    const requestsBeforeLegacyReview = structuredClone(auditRequests)
;

    await page.getByLabel('Audit run').selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    assert.equal(await page.getByText('Fully read-only retained Legacy run.', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await page.getByText('Read-only Legacy rescue history:', 
{
 exact: false 
}
).isVisible(), true)
;


    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    await repetition.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;


    const overlapReceipt = repetition.locator('details').filter(
{
 hasText: 'Exact overlap receipt' 
}
)
;

    await overlapReceipt.locator('summary').click()
;

    assert.equal(await overlapReceipt.getByText('"exactImageIdentityOverlapCount": 1', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await repetition.locator('button, input, select, textarea, form').count(), 0)
;

    assert.deepEqual(
      auditRequests,
      requestsBeforeLegacyReview,
      'switching to and reading a Legacy retrieval receipt must not run or mutate an audit',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a date-bounded editorial packet download preserves publication join outcomes without mutations', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{

    auditRequests,
    calibrationRequests,
    calibrationExportRequests,
    exportRequests,
    misprintRequests,
  
}
 = await configureNetwork(page)
;

  const mutationRequests: Array<
{
 method: string
;
 url: string 
}
> = []
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (
      request.method() !== 'GET'
      && (
        url.pathname.includes('/.netlify/functions/actor-audits')
        || url.pathname.includes('/.netlify/functions/star-of-day')
      )
    ) 
{

      mutationRequests.push(
{
 method: request.method(), url: request.url() 
}
)
;

    
}

  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    const exportPanel = page.getByLabel('Read-only calibration export')
;

    await exportPanel.getByLabel('From').fill('2026-09-01')
;

    await exportPanel.getByLabel('To').fill('2026-09-10')
;


    const downloadPromise = page.waitForEvent('download')
;

    await exportPanel.getByRole('button', 
{
 name: 'Download editorial review packet', exact: true 
}
).click()
;

    const download = await downloadPromise
;

    const downloadPath = await download.path()
;

    assert.ok(downloadPath, 'the browser should retain the downloaded editorial packet')
;

    const payload = JSON.parse(await readFile(downloadPath, 'utf8')) as AnyRecord
;


    assert.equal(download.suggestedFilename(), 'actor-calibration-2026-09-01-2026-09-10.json')
;

    assert.equal(calibrationExportRequests.length, 1)
;

    assert.deepEqual(
      Object.fromEntries(calibrationExportRequests[0].searchParams),
      
{
 export: 'calibration', from: '2026-09-01', to: '2026-09-10' 
}
,
      'the browser must request the operator-selected date bounds',
    )
;

    assert.equal(payload.exportMetadata.readOnly, true)
;

    assert.deepEqual(
      payload.runs
        .filter((runItem: AnyRecord) => runItem.publicationJoinReceipt)
        .map((runItem: AnyRecord) => runItem.publicationJoinReceipt.occurrences[0].status),
      ['matched', 'missing', 'ambiguous', 'identity_unavailable'],
      'the downloaded contract must preserve every publication join outcome explicitly',
    )
;

    assert.deepEqual(
      payload.runs[0],
      
{

        source: 
{

          actorId: ACTOR_ID,
          vibeKey: VIBE_KEY,
          runId: 'legacy-before-publication-matching',
        
}
,
        links: 
{

          pairing: 'https://fandom.example/?adminView=actor-preflight&runId=legacy-before-publication-matching',
          editions: [],
        
}
,
      
}
,
      'legacy retained runs must not gain fabricated publication counts, outcomes, or edition links',
    )
;

    assert.ok(
      payload.runs.slice(1).every((runItem: AnyRecord) =>
        runItem.publicationJoinReceipt.kind === 'vibe-atlas-audit-publication-join'),
      'publication joins must remain separate receipts on each exported run',
    )
;

    assert.equal(payload.runs[1].publicationJoinReceipt.occurrences[0].matches.length, 1)
;

    assert.equal(payload.runs[2].publicationJoinReceipt.occurrences[0].matches.length, 0)
;

    assert.equal(payload.runs[3].publicationJoinReceipt.occurrences[0].matches.length, 2)
;

    assert.equal(payload.runs[4].publicationJoinReceipt.occurrences[0].matches.length, 0)
;

    assert.deepEqual(payload.runs[1].links.editions, [
      
{
 date: '2026-09-03', url: 'https://fandom.example/vibe-atlas?date=2026-09-03' 
}
,
    ])
;

    assert.deepEqual(payload.runs[3].links.editions, [
      
{
 date: '2026-09-03', url: 'https://fandom.example/vibe-atlas?date=2026-09-03' 
}
,
      
{
 date: '2026-09-04', url: 'https://fandom.example/vibe-atlas?date=2026-09-04' 
}
,
    ])
;

    await page.getByText(
      'Read-only cross-audit editorial review, retained evidence, and publication receipts downloaded. No audit was rerun or changed.',
      
{
 exact: true 
}
,
    ).waitFor()
;


    assert.deepEqual(mutationRequests, [], 'downloading must not issue audit or publication mutations')
;

    assert.deepEqual(auditRequests, [], 'downloading must not search, score, rerun, or mutate an audit')
;

    assert.deepEqual(calibrationRequests, [], 'downloading must not change calibration')
;

    assert.deepEqual(exportRequests, [], 'downloading must not export or persist a rescue board')
;

    assert.deepEqual(misprintRequests, [], 'downloading must not alter publication correction records')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


for (const 
{
 label, contentType 
}
 of [
  
{
 label: 'vendor JSON', contentType: 'application/vnd.fandom.calibration+json' 
}
,
  
{
 label: 'parameterized JSON', contentType: 'application/json; charset=utf-8' 
}
,
]) 
{

  test(`a valid ${label} editorial packet downloads exactly once without mutations`, 
{
 timeout: 60_000 
}
, async () => 
{

    const 
{
 server, origin 
}
 = await startApp()
;

    const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

    try 
{

    const 
{

      auditRequests,
      calibrationRequests,
      calibrationExportRequests,
      exportRequests,
      misprintRequests,
    
}
 = await configureNetwork(page, 
{

      calibrationExportContentType: contentType,
    
}
)
;

    const mutationRequests: Array<
{
 method: string
;
 url: string 
}
> = []
;

    let downloads = 0
;

    page.on('download', () => 
{

      downloads += 1
;

    
}
)
;

    page.on('request', request => 
{

      const url = new URL(request.url())
;

      if (
        request.method() !== 'GET'
        && (
          url.pathname.includes('/.netlify/functions/actor-audits')
          || url.pathname.includes('/.netlify/functions/star-of-day')
        )
      ) 
{

        mutationRequests.push(
{
 method: request.method(), url: request.url() 
}
)
;

      
}

    
}
)
;


      await page.goto(`${origin}/vibe-atlas?admin=true`)
;

      await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

      const exportPanel = page.getByLabel('Read-only calibration export')
;

      await exportPanel.getByLabel('From').fill('2026-09-01')
;

      await exportPanel.getByLabel('To').fill('2026-09-10')
;


      const downloadPromise = page.waitForEvent('download')
;

      await exportPanel.getByRole('button', 
{
 name: 'Download editorial review packet', exact: true 
}
).click()
;

      const download = await downloadPromise
;

      const downloadPath = await download.path()
;

      assert.ok(downloadPath, `the browser should retain the ${label} editorial packet`)
;

      const payload = JSON.parse(await readFile(downloadPath, 'utf8')) as AnyRecord
;


      assert.equal(download.suggestedFilename(), 'actor-calibration-2026-09-01-2026-09-10.json')
;

      assert.equal(downloads, 1, `the valid ${label} response should trigger exactly one download`)
;

      assert.equal(calibrationExportRequests.length, 1, 'the download should require only one read-only packet request')
;

      assert.equal(payload.exportMetadata.readOnly, true, 'the downloaded body should remain a valid editorial packet')
;

      assert.ok(Array.isArray(payload.runs), 'the downloaded editorial packet should retain its run list')
;

      assert.deepEqual(mutationRequests, [], `downloading ${label} must not issue audit or publication mutations`)
;

      assert.deepEqual(auditRequests, [], `downloading ${label} must not search, score, rerun, or mutate an audit`)
;

      assert.deepEqual(calibrationRequests, [], `downloading ${label} must not change calibration`)
;

      assert.deepEqual(exportRequests, [], `downloading ${label} must not export or persist a rescue board`)
;

      assert.deepEqual(misprintRequests, [], `downloading ${label} must not alter publication correction records`)
;

    
}
 finally 
{

      await closeBrowserAndServer(browser, server)
;

    
}

  
}
)
;

}


test('retained-run publication summaries keep outcomes and immutable edition links visible without mutations', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 publicationReview: true 
}
)
;

  const actorAuditRequests: Array<
{
 method: string
;
 url: URL 
}
> = []
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (url.pathname.includes('/.netlify/functions/actor-audits')) 
{

      actorAuditRequests.push(
{
 method: request.method(), url 
}
)
;

    
}

  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;


    const runSelect = page.getByLabel('Audit run')
;

    await runSelect.selectOption('publication-current')
;

    const summary = page.getByRole('region', 
{
 name: 'Publication matches' 
}
)
;

    await summary.getByText('Read-only join to immutable Daily Drop editions. Historical audits and manifests are unchanged.', 
{
 exact: true 
}
).waitFor()
;


    for (const [status, count, label] of [
      ['matched', '1', 'matched'],
      ['missing', '1', 'missing'],
      ['ambiguous', '1', 'ambiguous'],
      ['identity_unavailable', '1', 'Identity unavailable'],
    ] as const) 
{

      const badge = summary.locator(`[data-status="${status}"]`).first()
;

      assert.equal(await badge.locator('b').textContent(), count)
;

      assert.equal((await badge.textContent())?.trim(), `${count}${label}`)
;

    
}

    await summary.getByText('No immutable edition match', 
{
 exact: true 
}
).waitFor()
;

    await summary.getByText('No stable image identity was retained', 
{
 exact: true 
}
).waitFor()
;

    await summary.getByRole('link', 
{
 name: '2026-09-03 · card 5', exact: true 
}
).waitFor()
;

    await summary.getByRole('link', 
{
 name: '2026-09-04 · card 1', exact: true 
}
).waitFor()
;

    await summary.getByRole('link', 
{
 name: '2026-09-05 · card 8', exact: true 
}
).waitFor()
;

    assert.equal(await summary.getByRole('link', 
{
 name: '2026-09-03 · card 5' 
}
).getAttribute('href'), '/vibe-atlas?date=2026-09-03')
;

    assert.equal(await summary.getByRole('link', 
{
 name: '2026-09-04 · card 1' 
}
).getAttribute('href'), '/vibe-atlas?date=2026-09-04')
;

    assert.equal(await summary.getByRole('link', 
{
 name: '2026-09-05 · card 8' 
}
).getAttribute('href'), '/vibe-atlas?date=2026-09-05')
;


    await runSelect.selectOption('publication-historical')
;

    await summary.getByRole('link', 
{
 name: '2026-08-28 · card 3', exact: true 
}
).waitFor()
;

    assert.equal(await summary.getByRole('link', 
{
 name: '2026-08-28 · card 3' 
}
).getAttribute('href'), '/vibe-atlas?date=2026-08-28')
;

    assert.equal(await summary.locator('[data-status="matched"]').first().locator('b').textContent(), '2')
;


    await runSelect.selectOption('publication-pre-join')
;

    await summary.getByText(
      'No publication join is loaded for this retained run. Older audit history may predate publication matching.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(await summary.locator('[data-status]').count(), 0, 'a missing historical join must not invent publication counts')
;

    assert.equal(await summary.getByRole('link').count(), 0, 'a missing historical join must not invent edition links')
;


    await runSelect.selectOption('publication-current')
;

    await summary.getByRole('link', 
{
 name: '2026-09-03 · card 5', exact: true 
}
).waitFor()
;

    assert.equal(await summary.getByRole('link', 
{
 name: '2026-09-03 · card 5' 
}
).getAttribute('href'), '/vibe-atlas?date=2026-09-03')
;

    assert.equal(await summary.locator('[data-status="matched"]').first().locator('b').textContent(), '1')
;


    assert.equal(await summary.locator('button, input, select, textarea, form').count(), 0, 'the publication join must expose no mutation control')
;

    assert.ok(actorAuditRequests.length >= 5, 'initial loading and retained-run selections should read audit details')
;

    assert.ok(actorAuditRequests.every(request => request.method === 'GET'), 'selecting publication summaries must perform only read requests')
;

    assert.deepEqual(auditRequests, [], 'retained-run switching must not issue an audit action')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('failed editorial packet downloads stay useful and retryable without mutations', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{

    auditRequests,
    calibrationRequests,
    calibrationExportRequests,
    exportRequests,
    misprintRequests,
  
}
 = await configureNetwork(page, 
{

    returnCalibrationJsonErrorOnce: true,
    returnCalibrationGatewayOnce: true,
    failCalibrationExportOnce: true,
    dropCalibrationExportOnce: true,
  
}
)
;

  const mutationRequests: Array<
{
 method: string
;
 url: string 
}
> = []
;

  let downloads = 0
;

  page.on('download', () => 
{

    downloads += 1
;

  
}
)
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (
      request.method() !== 'GET'
      && (
        url.pathname.includes('/.netlify/functions/actor-audits')
        || url.pathname.includes('/.netlify/functions/star-of-day')
      )
    ) 
{

      mutationRequests.push(
{
 method: request.method(), url: request.url() 
}
)
;

    
}

  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    const exportPanel = page.getByLabel('Read-only calibration export')
;

    await exportPanel.getByLabel('From').fill('2026-09-01')
;

    await exportPanel.getByLabel('To').fill('2026-09-10')
;

    const downloadButton = exportPanel.getByRole('button', 
{
 name: 'Download editorial review packet', exact: true 
}
)
;


    await downloadButton.click()
;

    await page.getByText(
      'Editorial packet response did not contain the expected review data. Retry the download.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(downloads, 0, 'a valid JSON error document must not be downloaded as an editorial packet')
;

    assert.equal(await downloadButton.isEnabled(), true, 'the unrelated JSON response should restore the download action')
;


    await downloadButton.click()
;

    await page.getByText(
      'Editorial packet response was not valid JSON. Retry the download.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(downloads, 0, 'a successful gateway page must not be downloaded as an editorial packet')
;

    assert.equal(await downloadButton.isEnabled(), true, 'the gateway response should restore the download action')
;


    await downloadButton.click()
;

    await page.getByText(
      'Editorial packet service is temporarily unavailable. Retry the download.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(await downloadButton.isEnabled(), true, 'the server failure should restore the download action')
;


    await downloadButton.click()
;

    await page.getByText(
      'Editorial packet download failed. Check your connection and retry.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    await downloadButton.waitFor(
{
 state: 'visible' 
}
)
;

    assert.equal(await downloadButton.isEnabled(), true, 'the failed download action should be restored for retry')
;

    assert.equal(calibrationExportRequests.length, 4)
;


    const downloadPromise = page.waitForEvent('download')
;

    await downloadButton.click()
;

    const download = await downloadPromise
;

    assert.equal(download.suggestedFilename(), 'actor-calibration-2026-09-01-2026-09-10.json')
;

    assert.equal(downloads, 1, 'only the validated JSON response should trigger a download')
;

    assert.equal(calibrationExportRequests.length, 5, 'each retry should repeat only the same read-only packet request')
;


    assert.deepEqual(mutationRequests, [], 'failure and retry must not issue audit or publication mutations')
;

    assert.deepEqual(auditRequests, [], 'failure and retry must not search, score, rerun, or mutate an audit')
;

    assert.deepEqual(calibrationRequests, [], 'failure and retry must not change calibration')
;

    assert.deepEqual(exportRequests, [], 'failure and retry must not export or persist a rescue board')
;

    assert.deepEqual(misprintRequests, [], 'failure and retry must not alter publication correction records')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


for (const malformedContentType of ['application/json', 'application/vnd.fandom.calibration+json']) 
{

  test(`malformed ${malformedContentType} editorial packet responses stay retryable without downloads or mutations`, 
{
 timeout: 60_000 
}
, async () => 
{

    const 
{
 server, origin 
}
 = await startApp()
;

    const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

    try 
{

    const 
{

      auditRequests,
      calibrationRequests,
      calibrationExportRequests,
      exportRequests,
      misprintRequests,
    
}
 = await configureNetwork(page, 
{

      returnMalformedCalibrationExportOnce: true,
      malformedCalibrationExportContentType: malformedContentType,
    
}
)
;

    const mutationRequests: Array<
{
 method: string
;
 url: string 
}
> = []
;

    let downloads = 0
;

    page.on('download', () => 
{

      downloads += 1
;

    
}
)
;

    page.on('request', request => 
{

      const url = new URL(request.url())
;

      if (
        request.method() !== 'GET'
        && (
          url.pathname.includes('/.netlify/functions/actor-audits')
          || url.pathname.includes('/.netlify/functions/star-of-day')
        )
      ) 
{

        mutationRequests.push(
{
 method: request.method(), url: request.url() 
}
)
;

      
}

    
}
)
;


      await page.goto(`${origin}/vibe-atlas?admin=true`)
;

      await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

      const exportPanel = page.getByLabel('Read-only calibration export')
;

      await exportPanel.getByLabel('From').fill('2026-09-01')
;

      await exportPanel.getByLabel('To').fill('2026-09-10')
;

      const downloadButton = exportPanel.getByRole('button', 
{
 name: 'Download editorial review packet', exact: true 
}
)
;


      await downloadButton.click()
;

      await page.getByText(
        'Editorial packet response was not valid JSON. Retry the download.',
        
{
 exact: true 
}
,
      ).waitFor()
;


      assert.equal(downloads, 0, `an invalid ${malformedContentType} body must not trigger a download`)
;

      assert.equal(await downloadButton.isEnabled(), true, 'the malformed response should restore the download action')
;

      assert.equal(calibrationExportRequests.length, 1, 'the malformed response should require only the read-only packet request')
;

      assert.deepEqual(mutationRequests, [], 'the malformed response must not issue audit or publication mutations')
;

      assert.deepEqual(auditRequests, [], 'the malformed response must not search, score, rerun, or mutate an audit')
;

      assert.deepEqual(calibrationRequests, [], 'the malformed response must not change calibration')
;

      assert.deepEqual(exportRequests, [], 'the malformed response must not export or persist a rescue board')
;

      assert.deepEqual(misprintRequests, [], 'the malformed response must not alter publication correction records')
;

    
}
 finally 
{

      await closeBrowserAndServer(browser, server)
;

    
}

  
}
)
;

}


function visualReviewRun(receipts: AnyRecord[]): AnyRecord 
{

  const result = run('visual-review-current', true)
;

  result.queryRuns = [
{

    query: 'LEAK SENTINEL QUERY',
    provider: 'browser-test',
    rank: 47,
  
}
]
;

  result.rawResults = [
{

    ...candidate(0),
    query: 'LEAK SENTINEL QUERY',
    rank: 47,
    proxyClass: 'LEAK SENTINEL PROXY CLASS',
    boardResult: 'LEAK SENTINEL BOARD RESULT',
    systemOutcome: 'LEAK SENTINEL SYSTEM OUTCOME',
  
}
]
;

  result.visualJudgmentQueue = [0, 1].map(index => (
{

    occurrenceId: `visual-occurrence-${index + 1}`,
    judgmentToken: `visual-token-${index + 1}`,
    thumbnail: candidate(index).thumbnail,
    query: 'LEAK SENTINEL QUERY',
    rank: 47 + index,
    proxyClass: 'LEAK SENTINEL PROXY CLASS',
    boardResult: 'LEAK SENTINEL BOARD RESULT',
    systemOutcome: 'LEAK SENTINEL SYSTEM OUTCOME',
  
}
))
;

  result.humanVisualJudgments = receipts
;

  result.blindReview.systemWinner = 'LEAK SENTINEL SYSTEM OUTCOME'
;

  return result
;

}


function archivedVisualReviewRun(runId: string, legacy = false): AnyRecord 
{

  const result = visualReviewRun([])
;

  result.runId = runId
;

  result.auditContract = legacy
    ? 
{

      ...contract(),
      status: 'legacy',
      isCurrent: false,
      isLegacy: true,
      legacyReasons: ['promise_contract_changed'],
    
}

    : contract()
;

  return result
;

}


function completeCompiledHeroReviewRun(runId = 'complete-hero-review'): AnyRecord 
{

  const retained = candidates()
;

  const compiledProposal = board('compiled', retained)
;

  compiledProposal.promise.heroFulfillment = 0
;

  const result = run(runId, true)
;

  result.blindReview = 
{

    status: 'unavailable',
    presentationOrder: ['event', 'compiled'],
    boards: [],
  
}
;

  result.strongestEvent = null
;

  result.strongestCompiled = null
;

  result.winner = null
;

  result.alternate = null
;

  result.boardDiagnostics = 
{

    event: 
{

      available: false,
      completeProposalAvailable: false,
      proposal: null,
      requiredCount: 9,
      candidateCount: 0,
      usableCount: 0,
      summary: 'No complete Event proposal formed.',
    
}
,
    compiled: 
{

      available: false,
      completeProposalAvailable: true,
      proposal: compiledProposal,
      requiredCount: 9,
      candidateCount: 9,
      usableCount: 9,
      distinctUsableCount: 9,
      heroFulfillment: 0,
      reasonCode: 'hero_not_fulfilled',
      summary: 'A complete Compiled board formed, but its proposed hero did not fulfill the promise.',
    
}
,
  
}
;

  result.rawResults = retained
;

  result.rejections = []
;

  result.completeProposalCardCount = 9
;

  result.displayCount = 0
;

  result.editorialFeedback = feedback()
;

  return result
;

}


async function configureCompleteHeroReviewNetwork(
  page: Page,
  
{
 staleOnVerdict = false, newerRunOnVerdict = false, newerRunOnRescueSave = false 
}
: 
{

    staleOnVerdict?: boolean
;

    newerRunOnVerdict?: boolean
;

    newerRunOnRescueSave?: boolean
;

  
}
 = 
{
}
,
): Promise<
{

  saveRequests: AnyRecord[]
;

  verdictRequests: AnyRecord[]
;

}
> 
{

  let savedBoard: AnyRecord | undefined
;

  let newerRunCurrent = false
;

  const saveRequests: AnyRecord[] = []
;

  const verdictRequests: AnyRecord[] = []
;


  await page.route('**/api/auth/session', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{

      user: 
{

        accountId: 'browser-operator',
        email: 'operator@example.test',
        isAdmin: true,
      
}
,
    
}
),
  
}
))
;

  await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{

      actorName: 'Browser Test Actor',
      actorShortNameEn: 'Browser Test Actor',
      vibeEmoji: '🧪',
      vibeLabel: 'Browser Calibration Vibe',
      vibeLabelEn: 'Browser Calibration Vibe',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      rankedBatches: [
{
 query: 'browser test', results: [] 
}
],
      date: '2026-08-31',
    
}
),
  
}
))
;

  await page.route('**/api/membership/status', route => route.fulfill(
{

    contentType: 'application/json',
    body: JSON.stringify(
{
 state: 'inactive', isMember: false 
}
),
  
}
))
;

  await page.route('**/.netlify/functions/image-proxy?*', route => route.fulfill(
{

    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  
}
))
;

  let mediaUploads = 0
;

  await page.route('**/api/collection/media?*', route => 
{

    mediaUploads += 1
;

    const itemId = new URL(route.request().url()).searchParams.get('itemId') || ''
;

    return route.fulfill(
{

      contentType: 'application/json',
      body: JSON.stringify(
{

        media: 
{

          schemaVersion: 1,
          assetId: `11111111-1111-4111-8111-${String(mediaUploads).padStart(12, '0')}`,
          deliveryUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}.png`,
          thumbnailUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}-thumb.png`,
          mimeType: 'image/png',
          sizeBytes: 68,
          checksum: String(mediaUploads).padStart(64, 'a').slice(-64),
          dimensions: 
{
 width: 1, height: 1 
}
,
          association: 
{
 type: 'collection', id: 'vibe-atlas', itemId 
}
,
        
}
,
      
}
),
    
}
)
;

  
}
)
;

  await page.route('**/api/collection/sync', route => 
{

    const operation = (route.request().postDataJSON() as AnyRecord).operations[0]
;

    return route.fulfill(
{

      contentType: 'application/json',
      body: JSON.stringify(
{

        cursor: 1,
        items: [
{
 ...operation.item, id: 'rescue-grid-1', localId: operation.localId 
}
],
        tombstones: [],
        mappings: 
{
 [operation.localId]: 'rescue-grid-server-1' 
}
,
        acknowledgedMutationIds: [operation.mutationId],
      
}
),
    
}
)
;

  
}
)
;

  await page.route('**/.netlify/functions/actor-audits**', async route => 
{

    const request = route.request()
;

    const url = new URL(request.url())
;

    if (request.method() === 'GET') 
{

      if (!url.searchParams.has('actorId')) 
{

        await route.fulfill(
{

          contentType: 'application/json',
          body: JSON.stringify(
{

            actors: [actor('needs_operator_verdict')],
            releaseInventory: 
{

              schemaVersion: 1,
              timeZone: 'Asia/Shanghai',
              cutoff: '12:00',
              releaseReadyPairingCount: 0,
              freshCuratorPairingCount: 0,
              rescueBackupPairingCount: 0,
              rescueBackupBoardCount: 0,
              actorPacks: [],
            
}
,
          
}
),
        
}
)
;

        return
;

      
}

      const currentRun = completeCompiledHeroReviewRun(newerRunCurrent
        ? 'newer-current-audit'
        : 'complete-hero-review')
;

      if (savedBoard && !newerRunCurrent) currentRun.editorialFeedback = feedback(savedBoard)
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          actor: actor('needs_operator_verdict'),
          pairing: actor('needs_operator_verdict').pairings[0],
          actorId: ACTOR_ID,
          vibeKey: VIBE_KEY,
          currentRun,
          priorRuns: [],
          verdict: null,
          notes: '',
          verdictAt: null,
          calibrationProfile: null,
        
}
),
      
}
)
;

      return
;

    
}


    const input = request.postDataJSON() as AnyRecord
;

    if (input.action === 'save_rescue_board') 
{

      saveRequests.push(input)
;

      assert.equal(input.runId, 'complete-hero-review')
;

      if (newerRunOnRescueSave) 
{

        newerRunCurrent = true
;

        await route.fulfill(
{

          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(
{

            error: 'Only the current audit run can save an Operator Rescue Board.',
          
}
),
        
}
)
;

        return
;

      
}

      const retainedById = new Map(candidates().map(item => [item.candidateId, item]))
;

      savedBoard = 
{

        schemaVersion: 1,
        receiptId: RESCUE_RECEIPT_ID,
        runId: 'complete-hero-review',
        actorId: ACTOR_ID,
        vibeKey: VIBE_KEY,
        feedbackHash: 'browser-feedback-hash',
        board: 
{

          mode: 'operator_rescue',
          candidates: input.candidateIds.map((candidateId: string) => retainedById.get(candidateId)),
        
}
,
        savedAt: '2026-08-31T12:01:00.000Z',
        savedBy: 'browser-operator',
      
}
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          actor: actor('needs_operator_verdict'),
          pairing: actor('needs_operator_verdict').pairings[0],
          actorId: ACTOR_ID,
          vibeKey: VIBE_KEY,
          currentRun: 
{

            ...completeCompiledHeroReviewRun(),
            editorialFeedback: feedback(savedBoard),
          
}
,
          priorRuns: [],
          verdict: null,
          notes: '',
          verdictAt: null,
          calibrationProfile: null,
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'export_rescue_board') 
{

      assert.equal(input.runId, 'complete-hero-review')
;

      assert.equal(input.receiptId, RESCUE_RECEIPT_ID)
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          rescueExport: 
{

            gridId: 'rescue-grid-1',
            runId: 'complete-hero-review',
            receiptId: RESCUE_RECEIPT_ID,
            arrangedAt: '2026-08-31T12:01:00.000Z',
            exportedAt: '2026-08-31T12:02:00.000Z',
            actor: 
{
 id: ACTOR_ID, name: 'Browser Test Actor', nameEn: 'Browser Test Actor', accentColor: '#123456' 
}
,
            vibe: 
{
 key: VIBE_KEY, label: 'Browser Calibration Vibe', labelEn: 'Browser Calibration Vibe', emoji: '🧪', subtitle: '', subtitleEn: '', searchSpell: 'browser calibration query' 
}
,
            candidates: candidates(),
          
}
,
        
}
),
      
}
)
;

      return
;

    
}

    if (input.action === 'verdict') 
{

      verdictRequests.push(input)
;

      assert.equal(input.runId, 'complete-hero-review')
;

      assert.equal(input.verdict, 'approved')
;

      assert.equal(input.vibeConfirmed, true)
;

      assert.equal(input.publishableConfirmed, true)
;

      assert.equal(input.rescuePreferred, true)
;

      assert.equal(input.rescueReceiptId, RESCUE_RECEIPT_ID)
;

      assert.ok(savedBoard, 'the scheduling verdict must follow the rescue-board save')
;

      if (newerRunOnVerdict) 
{

        assert.equal(input.notes, 'Keep this decision while the newer audit is reviewed.')
;

        newerRunCurrent = true
;

        await route.fulfill(
{

          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(
{

            error: 'A newer audit run became current. Review that run before scheduling.',
          
}
),
        
}
)
;

        return
;

      
}

      if (staleOnVerdict) 
{

        await route.fulfill(
{

          status: 409,
          contentType: 'application/json',
          body: JSON.stringify(
{

            error: 'The selected rescue board is stale or unavailable. Rebuild and save it from the current image choices before recording this approval.',
          
}
),
        
}
)
;

        return
;

      
}

      const approvedRun = 
{

        ...completeCompiledHeroReviewRun(),
        editorialFeedback: feedback(savedBoard),
        operatorVerdict: 
{

          verdict: 'approved',
          notes: input.notes,
          vibeConfirmed: true,
          publishableConfirmed: true,
          rescuePreference: 
{

            preferred: true,
            rescueReceiptId: RESCUE_RECEIPT_ID,
          
}
,
          publicationSource: 
{

            type: 'operator_rescue',
            rescueReceiptId: RESCUE_RECEIPT_ID,
            boardHash: 'browser-rescue-board-hash',
            feedbackHash: 'browser-feedback-hash',
          
}
,
        
}
,
      
}
;

      await route.fulfill(
{

        contentType: 'application/json',
        body: JSON.stringify(
{

          actor: actor('needs_operator_verdict', true),
          pairing: actor('needs_operator_verdict', true).pairings[0],
          actorId: ACTOR_ID,
          vibeKey: VIBE_KEY,
          currentRun: approvedRun,
          priorRuns: [],
          verdict: 'approved',
          notes: input.notes,
          calibrationProfile: null,
        
}
),
      
}
)
;

      return
;

    
}

    throw new Error(`Unexpected complete hero review action: ${String(input.action)}`)
;

  
}
)
;


  return {
 saveRequests, verdictRequests 
}
;

}


test('an authenticated image-only review stays completed after read-only history switching', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 visualReview: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const assertHistoryLabels = async () => 
{

      const runSelect = page.getByLabel('Audit run')
;

      assert.match(await runSelect.locator('option[value="visual-review-current"]').textContent() ?? '', /^Current · visual-review-current · /)
;

      assert.match(await runSelect.locator('option[value="visual-review-retained"]').textContent() ?? '', /^Retained · visual-review-retained · /)
;

      assert.match(await runSelect.locator('option[value="visual-review-legacy"]').textContent() ?? '', /^Legacy history · visual-review-legacy · /)
;

    
}
;

    const review = page.getByLabel('Blind rejected thumbnail review')
;

    await review.getByRole('img', 
{
 name: 'Rejected thumbnail for blind visual judgment' 
}
).waitFor()
;

    await assertHistoryLabels()
;

    for (const choice of ['Core', 'Supporting', 'Connective', 'Contradictory', 'Irrelevant']) 
{

      assert.equal(
        await review.getByRole('button', 
{
 name: choice, exact: true 
}
).isVisible(),
        true,
        `the image-only queue must expose the ${choice} human choice`,
      )
;

    
}

    for (const leakedValue of [
      'LEAK SENTINEL QUERY',
      '47',
      'LEAK SENTINEL PROXY CLASS',
      'LEAK SENTINEL BOARD RESULT',
      'LEAK SENTINEL SYSTEM OUTCOME',
    ]) 
{

      assert.equal(
        await page.getByText(leakedValue, 
{
 exact: true 
}
).count(),
        0,
        `${leakedValue} must remain absent while image judgments are outstanding`,
      )
;

    
}

    assert.equal(await page.locator('summary').filter(
{
 hasText: 'Query ladder' 
}
).count(), 0)
;

    assert.equal(await page.getByLabel('Visual board comparison').count(), 0)
;

    assert.equal(await page.getByText('System winner:', 
{
 exact: false 
}
).count(), 0)
;


    await review.getByRole('button', 
{
 name: 'Core', exact: true 
}
).click()
;

    await review.getByText('2/2 · 1 receipt', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(await page.locator('summary').filter(
{
 hasText: 'Query ladder' 
}
).count(), 0)
;

    assert.equal(await page.getByText('LEAK SENTINEL QUERY', 
{
 exact: true 
}
).count(), 0)
;


    await review.getByRole('button', 
{
 name: 'Supporting', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · visual-review-current', exact: true 
}
).waitFor()
;

    await page.getByLabel('Visual board comparison').waitFor()
;

    await assertHistoryLabels()
;

    const queryDiagnostics = page.locator('summary').filter(
{
 hasText: 'Query ladder' 
}
)
;

    assert.equal(await queryDiagnostics.count(), 1)
;

    await queryDiagnostics.click()
;

    assert.equal(await page.locator('pre').filter(
{
 hasText: 'LEAK SENTINEL QUERY' 
}
).isVisible(), true)
;

    assert.equal(await page.getByText('System winner: LEAK SENTINEL SYSTEM OUTCOME', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.deepEqual(
      auditRequests
        .filter(request => request.action === 'record_visual_judgment')
        .map(request => (
{
 judgmentToken: request.judgmentToken, classification: request.classification 
}
)),
      [
        
{
 judgmentToken: 'visual-token-1', classification: 'core' 
}
,
        
{
 judgmentToken: 'visual-token-2', classification: 'supporting' 
}
,
      ],
    )
;


    const runSelect = page.getByLabel('Audit run')
;

    for (const history of archivedReviewHistories) 
{

      await runSelect.selectOption(history.runId)
;

      await assertArchivedHistoricalReview(page, history, 'selector-driven')
;

    
}


    await runSelect.selectOption('visual-review-current')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · visual-review-current', exact: true 
}
).waitFor()
;

    assert.equal(await page.getByLabel('Visual board comparison').isVisible(), true)
;

    assert.equal(await page.getByLabel('Blind rejected thumbnail review').count(), 0)
;

    assert.deepEqual(
      auditRequests
        .filter(request => request.action === 'record_visual_judgment')
        .map(request => (
{
 judgmentToken: request.judgmentToken, classification: request.classification 
}
)),
      [
        
{
 judgmentToken: 'visual-token-1', classification: 'core' 
}
,
        
{
 judgmentToken: 'visual-token-2', classification: 'supporting' 
}
,
      ],
      'completed-state history switching must not create additional judgment receipts',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a failed image-only judgment stays blinded and ready to retry', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 visualReview: true, failVisualJudgment: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const review = page.getByLabel('Blind rejected thumbnail review')
;

    const thumbnail = review.getByRole('img', 
{
 name: 'Rejected thumbnail for blind visual judgment' 
}
)
;

    await thumbnail.waitFor()
;

    const originalThumbnail = await thumbnail.getAttribute('src')
;


    await review.getByRole('button', 
{
 name: 'Core', exact: true 
}
).click()
;

    await page.getByText('The image judgment was not saved. The same image remains ready—retry your choice.', 
{
 exact: true 
}
).waitFor()
;


    assert.equal(await thumbnail.getAttribute('src'), originalThumbnail)
;

    assert.equal(await review.getByText('1/2 · 0 receipts', 
{
 exact: true 
}
).isVisible(), true)
;

    for (const choice of ['Core', 'Supporting', 'Connective', 'Contradictory', 'Irrelevant']) 
{

      assert.equal(await review.getByRole('button', 
{
 name: choice, exact: true 
}
).isEnabled(), true)
;

    
}

    for (const leakedValue of [
      'LEAK SENTINEL QUERY',
      '47',
      'LEAK SENTINEL PROXY CLASS',
      'LEAK SENTINEL BOARD RESULT',
      'LEAK SENTINEL SYSTEM OUTCOME',
    ]) 
{

      assert.equal(await page.getByText(leakedValue, 
{
 exact: true 
}
).count(), 0)
;

    
}

    assert.equal(await page.locator('summary').filter(
{
 hasText: 'Query ladder' 
}
).count(), 0)
;

    assert.equal(await page.getByLabel('Visual board comparison').count(), 0)
;

    assert.equal(await page.getByText('System winner:', 
{
 exact: false 
}
).count(), 0)
;

    assert.deepEqual(
      auditRequests
        .filter(request => request.action === 'record_visual_judgment')
        .map(request => (
{
 judgmentToken: request.judgmentToken, classification: request.classification 
}
)),
      [
{
 judgmentToken: 'visual-token-1', classification: 'core' 
}
],
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a saved image judgment repairs index contention without repeating classification', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{

    visualReview: true,
    contendVisualJudgmentIndex: true,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const review = page.getByLabel('Blind rejected thumbnail review')
;

    await review.getByRole('img', 
{
 name: 'Rejected thumbnail for blind visual judgment' 
}
).waitFor()
;

    await review.getByRole('button', 
{
 name: 'Core', exact: true 
}
).click()
;

    await page.getByText(
      'Blind image judgment saved and its receipt index repaired. Production scoring is unchanged.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    await review.getByText('2/2 · 1 receipt', 
{
 exact: true 
}
).waitFor()
;


    assert.deepEqual(
      auditRequests
        .filter(request => request.action === 'record_visual_judgment')
        .map(request => (
{

          judgmentToken: request.judgmentToken,
          classification: request.classification,
        
}
)),
      [
{
 judgmentToken: 'visual-token-1', classification: 'core' 
}
],
    )
;

    assert.deepEqual(
      auditRequests
        .filter(request => request.action === 'repair_visual_judgment_index')
        .map(request => (
{

          runId: request.runId,
          receiptId: request.receiptId,
          classification: request.classification,
        
}
)),
      [
{

        runId: 'visual-review-current',
        receiptId: 'visual-visual-token-1',
        classification: undefined,
      
}
],
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a slow image-only judgment ignores a rapid repeated click', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 visualReview: true, slowVisualJudgment: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const review = page.getByLabel('Blind rejected thumbnail review')
;

    const core = review.getByRole('button', 
{
 name: 'Core', exact: true 
}
)
;

    await core.waitFor()
;

    await core.evaluate(button => 
{

      (button as HTMLElement).click()
;

      (button as HTMLElement).click()
;

    
}
)
;

    await review.getByText('2/2 · 1 receipt', 
{
 exact: true 
}
).waitFor()
;


    assert.deepEqual(
      auditRequests
        .filter(request => request.action === 'record_visual_judgment')
        .map(request => (
{
 judgmentToken: request.judgmentToken, classification: request.classification 
}
)),
      [
{
 judgmentToken: 'visual-token-1', classification: 'core' 
}
],
      'the same judgment token must have no more than one save in flight',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


const archivedReviewHistories = [
  
{

    name: 'retained',
    runId: 'visual-review-retained',
    receiptId: 'visual-review-receipt-retained',
    label: /^Retained · visual-review-retained · /,
  
}
,
  
{

    name: 'Legacy',
    runId: 'visual-review-legacy',
    receiptId: 'visual-review-receipt-legacy',
    label: /^Legacy history · visual-review-legacy · /,
  
}
,
] as const
;


const blindedDiagnosticValues = [
  'LEAK SENTINEL QUERY',
  '47',
  'LEAK SENTINEL PROXY CLASS',
  'LEAK SENTINEL BOARD RESULT',
  'LEAK SENTINEL SYSTEM OUTCOME',
] as const
;


async function assertArchivedHistoricalReview(
  page: Page,
  history: typeof archivedReviewHistories[number],
  entryPoint: 'direct-linked' | 'selector-driven' = 'direct-linked',
): Promise<void> 
{

  await page.getByText(`Image-only calibration · audit ${history.runId}`, 
{
 exact: true 
}
).waitFor()
;

  const review = page.getByLabel('Blind rejected thumbnail review')
;

  await review.getByRole('img', 
{
 name: 'Rejected thumbnail for blind visual judgment' 
}
).waitFor()
;

  for (const choice of ['Core', 'Supporting', 'Connective', 'Contradictory', 'Irrelevant']) 
{

    assert.equal(
      await review.getByRole('button', 
{
 name: choice, exact: true 
}
).isDisabled(),
      true,
      `the ${entryPoint} ${history.name} review must disable the ${choice} choice`,
    )
;

  
}

  for (const leakedValue of blindedDiagnosticValues) 
{

    assert.equal(
      await page.getByText(leakedValue, 
{
 exact: true 
}
).count(),
      0,
      `the ${entryPoint} ${history.name} review must hide ${leakedValue}`,
    )
;

  
}

  assert.equal(await page.locator('summary').filter(
{
 hasText: 'Query ladder' 
}
).count(), 0)
;

  assert.equal(await page.getByLabel('Visual board comparison').count(), 0)
;

  assert.equal(await page.getByText('System winner:', 
{
 exact: false 
}
).count(), 0)
;

  assert.equal(
    await page.getByText('Historical and Legacy runs are view-only. Open the current audit to record a judgment.', 
{
 exact: true 
}
).isVisible(),
    true,
  )
;

}


test('retained and Legacy image-only reviews stay read-only and blinded before returning to the active queue', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 visualReview: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const currentReview = page.getByLabel('Blind rejected thumbnail review')
;

    await page.getByText('Image-only calibration · audit visual-review-current', 
{
 exact: true 
}
).waitFor()
;

    await currentReview.getByRole('img', 
{
 name: 'Rejected thumbnail for blind visual judgment' 
}
).waitFor()
;

    for (const choice of ['Core', 'Supporting', 'Connective', 'Contradictory', 'Irrelevant']) 
{

      assert.equal(
        await currentReview.getByRole('button', 
{
 name: choice, exact: true 
}
).isEnabled(),
        true,
        `the current review must enable the ${choice} choice`,
      )
;

    
}


    const runSelect = page.getByLabel('Audit run')
;

    for (const history of archivedReviewHistories) 
{

      assert.match(
        await runSelect.locator(`option[value="${history.runId}"]`).textContent() ?? '',
        history.label,
      )
;

      await runSelect.selectOption(history.runId)
;

      await assertArchivedHistoricalReview(page, history, 'selector-driven')
;

    
}


    await runSelect.selectOption('visual-review-current')
;

    await page.getByText('Image-only calibration · audit visual-review-current', 
{
 exact: true 
}
).waitFor()
;

    for (const choice of ['Core', 'Supporting', 'Connective', 'Contradictory', 'Irrelevant']) 
{

      assert.equal(
        await page.getByLabel('Blind rejected thumbnail review').getByRole('button', 
{
 name: choice, exact: true 
}
).isEnabled(),
        true,
        `returning to the current review must enable the ${choice} choice`,
      )
;

    
}

    assert.equal(
      auditRequests.filter(request => request.action === 'record_visual_judgment').length,
      0,
      'browsing archived queues must not create judgment receipts',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('only the latest rapid audit-history selection can update the displayed run', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const abortedHistoryRunIds: string[] = []
;

  page.on('requestfailed', request => 
{

    const url = new URL(request.url())
;

    const runId = url.searchParams.get('runId')
;

    if (runId && request.failure()?.errorText === 'net::ERR_ABORTED') abortedHistoryRunIds.push(runId)
;

  
}
)
;

  await configureNetwork(page, 
{

    visualReview: true,
    auditHistoryDetailDelays: 
{

      'visual-review-current': [0, 0, 300],
      'visual-review-retained': [300, 0],
      'visual-review-legacy': [0, 300],
    
}
,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByText('Image-only calibration · audit visual-review-current', 
{
 exact: true 
}
).waitFor()
;

    const runSelect = page.getByLabel('Audit run')
;


    await runSelect.selectOption('visual-review-retained')
;

    await runSelect.selectOption('visual-review-legacy')
;

    await page.getByText('Image-only calibration · audit visual-review-legacy', 
{
 exact: true 
}
).waitFor()
;

    await new Promise(resolve => setTimeout(resolve, 350))
;

    assert.equal(await runSelect.inputValue(), 'visual-review-legacy')
;


    await runSelect.selectOption('visual-review-legacy')
;

    await runSelect.selectOption('visual-review-current')
;

    await page.getByText('Image-only calibration · audit visual-review-current', 
{
 exact: true 
}
).waitFor()
;

    await new Promise(resolve => setTimeout(resolve, 350))
;

    assert.equal(await runSelect.inputValue(), 'visual-review-current')
;


    await runSelect.selectOption('visual-review-current')
;

    await runSelect.selectOption('visual-review-retained')
;

    await page.getByText('Image-only calibration · audit visual-review-retained', 
{
 exact: true 
}
).waitFor()
;

    await new Promise(resolve => setTimeout(resolve, 350))
;

    assert.equal(await runSelect.inputValue(), 'visual-review-retained')
;

    assert.deepEqual(
      abortedHistoryRunIds,
      ['visual-review-retained', 'visual-review-legacy', 'visual-review-current'],
      'each superseded Current, Retained, or Legacy detail request must be aborted',
    )
;

    assert.equal(
      await page.getByText(/aborted|failed to fetch/i).count(),
      0,
      'aborted history requests must not show an operator-facing error',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a stale audit-history error cannot replace a newer successful selection', 
{
 timeout: 60_000 
}
, async () => 
{

  const staleError = 'The abandoned retained audit could not be loaded.'
;

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  await configureNetwork(page, 
{

    visualReview: true,
    auditHistoryDetailDelays: 
{

      'visual-review-retained': [300],
    
}
,
    auditHistoryDetailErrors: 
{

      'visual-review-retained': [staleError],
    
}
,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByText('Image-only calibration · audit visual-review-current', 
{
 exact: true 
}
).waitFor()
;

    const runSelect = page.getByLabel('Audit run')
;


    await runSelect.selectOption('visual-review-retained')
;

    await runSelect.selectOption('visual-review-legacy')
;

    await page.getByText('Image-only calibration · audit visual-review-legacy', 
{
 exact: true 
}
).waitFor()
;

    await new Promise(resolve => setTimeout(resolve, 350))
;


    assert.equal(await runSelect.inputValue(), 'visual-review-legacy')
;

    assert.equal(
      await page.getByText(staleError, 
{
 exact: true 
}
).count(),
      0,
      'an error from an abandoned history request must not obscure the selected run',
    )
;

    assert.equal(
      await page.getByText('Image-only calibration · audit visual-review-legacy', 
{
 exact: true 
}
).isVisible(),
      true,
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


async function runDirectHistoricalReviewScenario(
  history: typeof archivedReviewHistories[number],
  completedCurrentReview: boolean,
): Promise<void> 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{

    visualReview: true,
    completedVisualReview: completedCurrentReview,
  
}
)
;


    const params = new URLSearchParams(
{

      admin: 'true',
      actorId: ACTOR_ID,
      vibeKey: VIBE_KEY,
      runId: history.runId,
      receiptId: history.receiptId,
    
}
)
;

    await page.goto(`${origin}/vibe-atlas?${params}`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await assertArchivedHistoricalReview(page, history)
;


    const runSelect = page.getByLabel('Audit run')
;

    assert.match(
      await runSelect.locator(`option[value="${history.runId}"]`).textContent() ?? '',
      history.label,
    )
;


    await runSelect.selectOption('visual-review-current')
;

    if (completedCurrentReview) 
{

      await page.getByRole('heading', 
{
 name: 'Audit evidence · visual-review-current', exact: true 
}
).waitFor()
;

      assert.equal(await page.getByLabel('Visual board comparison').isVisible(), true)
;

      assert.equal(await page.getByLabel('Blind rejected thumbnail review').count(), 0)
;

    
}
 else 
{

      await page.getByText('Image-only calibration · audit visual-review-current', 
{
 exact: true 
}
).waitFor()
;

      const currentReview = page.getByLabel('Blind rejected thumbnail review')
;

      for (const choice of ['Core', 'Supporting', 'Connective', 'Contradictory', 'Irrelevant']) 
{

        assert.equal(
          await currentReview.getByRole('button', 
{
 name: choice, exact: true 
}
).isEnabled(),
          true,
          `the unfinished current review must enable the ${choice} choice`,
        )
;

      
}

    
}

    assert.equal(new URL(page.url()).searchParams.has('runId'), false)
;

    assert.equal(new URL(page.url()).searchParams.has('receiptId'), false)
;


    await runSelect.selectOption(history.runId)
;

    await assertArchivedHistoricalReview(page, history)
;

    assert.equal(
      auditRequests.filter(request => request.action === 'record_visual_judgment').length,
      0,
      `${completedCurrentReview ? 'completed' : 'unfinished'} direct-link ${history.name} history switching must not create judgment receipts`,
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}


for (const history of archivedReviewHistories) 
{

  for (const completedCurrentReview of [false, true]) 
{

    test(
      `a direct ${history.name}-review handoff stays read-only and blinded when the current image-only review is ${completedCurrentReview ? 'completed' : 'unfinished'}`,
      
{
 timeout: 60_000 
}
,
      () => runDirectHistoricalReviewScenario(history, completedCurrentReview),
    )
;

  
}

}


test('a direct unfinished retained board review stays frozen and blinded before returning to the current audit', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 unfinishedBoardReview: true 
}
)
;


    const params = new URLSearchParams(
{

      admin: 'true',
      actorId: ACTOR_ID,
      vibeKey: VIBE_KEY,
      runId: 'board-review-retained',
      receiptId: 'board-review-receipt-retained',
    
}
)
;

    await page.goto(`${origin}/vibe-atlas?${params}`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · board-review-retained', exact: true 
}
).waitFor()
;


    assert.equal(await page.getByText('This historical run was never independently judged and remains blinded.', 
{
 exact: true 
}
).isVisible(), true)
;

    for (const choice of ['Choose Event', 'Choose Compiled', 'Choose Neither']) 
{

      assert.equal(await page.getByRole('button', 
{
 name: choice, exact: true 
}
).count(), 0)
;

    
}

    assert.equal(await page.getByText('System winner:', 
{
 exact: false 
}
).count(), 0)
;

    assert.equal(await page.getByText(/^score \d/, 
{
 exact: false 
}
).count(), 0)
;

    assert.equal(await page.getByText('Automated promise recognition:', 
{
 exact: false 
}
).count(), 0)
;

    assert.equal(await page.locator('[class*="scoreBreakdown"]').count(), 0)
;


    await page.getByLabel('Audit run').selectOption('board-review-current')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · board-review-current', exact: true 
}
).waitFor()
;

    for (const choice of ['Choose Event', 'Choose Compiled', 'Choose Neither']) 
{

      assert.equal(await page.getByRole('button', 
{
 name: choice, exact: true 
}
).isEnabled(), true)
;

    
}

    assert.equal(new URL(page.url()).searchParams.has('runId'), false)
;

    assert.equal(new URL(page.url()).searchParams.has('receiptId'), false)
;

    assert.equal(auditRequests.filter(request => request.action === 'blind_choice').length, 0)
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a current Legacy audit keeps only annotation and rescue exceptions actionable', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 currentLegacy: true, retrievalRepetition: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · current-legacy', exact: true 
}
).waitFor()
;

    await page.getByText('Still available on this current Legacy head:', 
{
 exact: false 
}
).waitFor()
;

    await page.getByText('Retained rescue-board exception:', 
{
 exact: false 
}
).waitFor()
;

    const requestsBeforeReceiptReview = structuredClone(auditRequests)
;


    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    await repetition.getByText('result occurrences', 
{
 exact: true 
}
).waitFor()
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;


    const overlapReceipt = repetition.locator('details').filter(
{
 hasText: 'Exact overlap receipt' 
}
)
;

    await overlapReceipt.locator('summary').click()
;

    assert.equal(await overlapReceipt.getByText('"exactImageIdentityOverlapCount": 1', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await repetition.locator('button, input, select, textarea, form').count(), 0)
;


    const rawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    assert.match(await rawResults.locator(':scope > summary').innerText(), /Legacy · annotations only/)
;

    await rawResults.locator(':scope > summary').click()
;

    const firstResult = rawResults.locator('article').first()
;

    assert.equal(await firstResult.getByRole('button', 
{
 name: 'Pin for board', exact: true 
}
).isEnabled(), true)
;

    assert.equal(await firstResult.getByText('Retained annotation exception:', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await firstResult.locator('details').filter(
{
 hasText: 'Mark Misprint' 
}
).count(), 0)
;

    assert.equal(await page.getByRole('button', 
{
 name: 'Choose nine to save', exact: true 
}
).isDisabled(), true)
;

    assert.equal(
      await page.getByText(/Calibration confirmation and other run-scoped changes remain read-only/).isVisible(),
      true,
    )
;

    assert.equal(auditRequests.filter(request => request.action === 'mark_misprint').length, 0)
;

    assert.deepEqual(
      auditRequests,
      requestsBeforeReceiptReview,
      'reading the current Legacy retrieval receipt and exceptions must not run or mutate an audit',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a current Legacy retrieval receipt survives refresh and history switching without writes', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{
 currentLegacy: true, retrievalRepetition: true 
}
)
;

  const auditTraffic: Array<
{
 method: string
;
 runId: string | null 
}
> = []
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (url.pathname.endsWith('/actor-audits')) 
{

      auditTraffic.push(
{
 method: request.method(), runId: url.searchParams.get('runId') 
}
)
;

    
}

  
}
)
;


  async function assertCurrentLegacyReceipt(): Promise<void> 
{

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · current-legacy', exact: true 
}
).waitFor()
;

    await page.getByText('Still available on this current Legacy head:', 
{
 exact: false 
}
).waitFor()
;

    await page.getByText('Retained rescue-board exception:', 
{
 exact: false 
}
).waitFor()
;

    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;

    const overlapReceipt = repetition.locator('details').filter(
{
 hasText: 'Exact overlap receipt' 
}
)
;

    await overlapReceipt.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    assert.equal(await overlapReceipt.getByText('"exactImageIdentityOverlapCount": 1', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await repetition.locator('button, input, select, textarea, form').count(), 0)
;


    const rawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    await rawResults.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    const firstResult = rawResults.locator('article').first()
;

    assert.equal(await firstResult.getByRole('button', 
{
 name: 'Pin for board', exact: true 
}
).isEnabled(), true)
;

    assert.equal(await firstResult.getByText('Retained annotation exception:', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await firstResult.locator('details').filter(
{
 hasText: 'Mark Misprint' 
}
).count(), 0)
;

    assert.equal(await page.getByRole('button', 
{
 name: 'Choose nine to save', exact: true 
}
).isDisabled(), true)
;

  
}


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await assertCurrentLegacyReceipt()
;


    await page.reload()
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await assertCurrentLegacyReceipt()
;


    const runSelect = page.getByLabel('Audit run')
;

    await runSelect.selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;

    await runSelect.selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    await runSelect.selectOption('current-legacy')
;

    await assertCurrentLegacyReceipt()
;


    assert.deepEqual(
      auditTraffic.filter(request => request.runId).map(request => request.runId),
      ['current-legacy', 'current-legacy', 'run-1', 'run-legacy', 'current-legacy'],
      'refresh and history switching must use only read-only detail loads for the selected runs',
    )
;

    assert.equal(
      auditTraffic.every(request => request.method === 'GET'),
      true,
      'refresh and history switching must not send an audit mutation request',
    )
;

    assert.deepEqual(auditRequests, [], 'refresh and history switching must not run or mutate an audit')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a failed history detail load preserves the current Legacy retrieval receipt without writes', 
{
 timeout: 60_000 
}
, async () => 
{

  const historyError = 'The retained audit detail is temporarily unavailable.'
;

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{

    currentLegacy: true,
    retrievalRepetition: true,
    auditHistoryDetailErrors: 
{

      'run-1': [historyError],
    
}
,
  
}
)
;

  const auditTraffic: Array<
{
 method: string
;
 runId: string | null 
}
> = []
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (url.pathname.endsWith('/actor-audits')) 
{

      auditTraffic.push(
{
 method: request.method(), runId: url.searchParams.get('runId') 
}
)
;

    
}

  
}
)
;


  async function assertCurrentLegacyReceipt(): Promise<void> 
{

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · current-legacy', exact: true 
}
).waitFor()
;

    await page.getByText('Still available on this current Legacy head:', 
{
 exact: false 
}
).waitFor()
;

    await page.getByText('Retained rescue-board exception:', 
{
 exact: false 
}
).waitFor()
;

    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;

    const overlapReceipt = repetition.locator('details').filter(
{
 hasText: 'Exact overlap receipt' 
}
)
;

    await overlapReceipt.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    assert.equal(await overlapReceipt.getByText('"exactImageIdentityOverlapCount": 1', 
{
 exact: false 
}
).isVisible(), true)
;


    const rawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    await rawResults.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    const firstResult = rawResults.locator('article').first()
;

    assert.equal(await firstResult.getByRole('button', 
{
 name: 'Pin for board', exact: true 
}
).isEnabled(), true)
;

    assert.equal(await firstResult.getByText('Retained annotation exception:', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await page.getByRole('button', 
{
 name: 'Choose nine to save', exact: true 
}
).isDisabled(), true)
;

  
}


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await assertCurrentLegacyReceipt()
;


    const runSelect = page.getByLabel('Audit run')
;

    await runSelect.selectOption('run-1')
;

    await page.getByText(historyError, 
{
 exact: true 
}
).waitFor()
;

    assert.equal(await runSelect.inputValue(), 'current-legacy')
;

    await assertCurrentLegacyReceipt()
;


    await runSelect.selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    await runSelect.selectOption('current-legacy')
;

    await assertCurrentLegacyReceipt()
;


    assert.deepEqual(
      auditTraffic.filter(request => request.runId).map(request => request.runId),
      ['current-legacy', 'run-1', 'run-legacy', 'current-legacy'],
      'the failed detail and return to current must use only selected-run detail reads',
    )
;

    assert.equal(
      auditTraffic.every(request => request.method === 'GET'),
      true,
      'a failed history detail load and recovery must not send an audit mutation request',
    )
;

    assert.deepEqual(auditRequests, [], 'a failed history detail load and recovery must not run or mutate an audit')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a lost history connection preserves the current Legacy evidence and recovers without writes', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const browser = await launchBrowserForServer(server)
;

  const page = await browser.newPage()
;

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{

    currentLegacy: true,
    retrievalRepetition: true,
    auditHistoryDetailDrops: 
{

      'run-1': [true],
    
}
,
  
}
)
;

  const auditTraffic: Array<
{
 method: string
;
 runId: string | null 
}
> = []
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (url.pathname.endsWith('/actor-audits')) 
{

      auditTraffic.push(
{
 method: request.method(), runId: url.searchParams.get('runId') 
}
)
;

    
}

  
}
)
;


  async function assertCurrentLegacyEvidence(): Promise<void> 
{

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · current-legacy', exact: true 
}
).waitFor()
;

    await page.getByText('Still available on this current Legacy head:', 
{
 exact: false 
}
).waitFor()
;

    await page.getByText('Retained rescue-board exception:', 
{
 exact: false 
}
).waitFor()
;


    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;

    assert.equal(await repetition.getByText('4 occurrences · 4 unique images · +4 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('3 occurrences · 2 unique images · +1 new images', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await repetition.getByText('rung 1: 1 exact', 
{
 exact: true 
}
).isVisible(), true)
;

    const overlapReceipt = repetition.locator('details').filter(
{
 hasText: 'Exact overlap receipt' 
}
)
;

    await overlapReceipt.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    assert.equal(await overlapReceipt.getByText('"exactImageIdentityOverlapCount": 1', 
{
 exact: false 
}
).isVisible(), true)
;


    const rawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    await rawResults.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    const firstResult = rawResults.locator('article').first()
;

    assert.equal(await firstResult.getByRole('button', 
{
 name: 'Pin for board', exact: true 
}
).isEnabled(), true)
;

    assert.equal(await firstResult.getByText('Retained annotation exception:', 
{
 exact: false 
}
).isVisible(), true)
;

    assert.equal(await page.getByRole('button', 
{
 name: 'Choose nine to save', exact: true 
}
).isDisabled(), true)
;

  
}


  try 
{

    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await assertCurrentLegacyEvidence()
;


    const failedRequest = page.waitForEvent('requestfailed', request => 
{

      const url = new URL(request.url())
;

      return url.pathname.endsWith('/actor-audits') && url.searchParams.get('runId') === 'run-1'
;

    
}
)
;

    const runSelect = page.getByLabel('Audit run')
;

    await runSelect.selectOption('run-1')
;

    await failedRequest
;

    await page.getByText(
      'Audit history lost its connection. The evidence currently on screen is safe and unchanged. Retry the history selection when the connection returns; retrying only reads the selected audit.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(await page.getByText(/failed to fetch/i).count(), 0)
;

    assert.equal(await runSelect.inputValue(), 'current-legacy')
;

    await assertCurrentLegacyEvidence()
;


    await runSelect.selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;

    await runSelect.selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    await runSelect.selectOption('current-legacy')
;

    await assertCurrentLegacyEvidence()
;


    assert.deepEqual(
      auditTraffic.filter(request => request.runId).map(request => request.runId),
      ['current-legacy', 'run-1', 'run-1', 'run-legacy', 'current-legacy'],
      'the lost detail request and recovery must use only selected-run detail reads',
    )
;

    assert.equal(
      auditTraffic.every(request => request.method === 'GET'),
      true,
      'a lost history connection and recovery must not send an audit mutation request',
    )
;

    assert.deepEqual(auditRequests, [], 'a lost history connection and recovery must not run or mutate an audit')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a lost connection returning from Legacy history preserves the retained evidence without writes', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const browser = await launchBrowserForServer(server)
;

  const page = await browser.newPage()
;

  const 
{
 auditRequests 
}
 = await configureNetwork(page, 
{

    currentLegacy: true,
    retrievalRepetition: true,
    auditHistoryDetailDrops: 
{

      'current-legacy': [false, true],
    
}
,
  
}
)
;

  const auditTraffic: Array<
{
 method: string
;
 runId: string | null 
}
> = []
;

  page.on('request', request => 
{

    const url = new URL(request.url())
;

    if (url.pathname.endsWith('/actor-audits')) 
{

      auditTraffic.push(
{
 method: request.method(), runId: url.searchParams.get('runId') 
}
)
;

    
}

  
}
)
;


  try 
{

    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · current-legacy', exact: true 
}
).waitFor()
;


    const runSelect = page.getByLabel('Audit run')
;

    await runSelect.selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;


    const repetition = page
      .getByRole('region', 
{
 name: 'Candidate loss funnel' 
}
)
      .getByRole('region', 
{
 name: 'Retrieval repetition' 
}
)
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;


    const failedRequest = page.waitForEvent('requestfailed', request => 
{

      const url = new URL(request.url())
;

      return url.pathname.endsWith('/actor-audits') && url.searchParams.get('runId') === 'current-legacy'
;

    
}
)
;

    await runSelect.selectOption('current-legacy')
;

    await failedRequest
;

    await page.getByText(
      'Audit history lost its connection. The evidence currently on screen is safe and unchanged. Retry the history selection when the connection returns; retrying only reads the selected audit.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(await page.getByText(/failed to fetch/i).count(), 0)
;


    assert.equal(await runSelect.inputValue(), 'run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
;


    assert.deepEqual(
      auditTraffic.filter(request => request.runId).map(request => request.runId),
      ['current-legacy', 'run-legacy', 'current-legacy'],
      'opening retained history and the failed return must use only selected-run detail reads',
    )
;

    assert.equal(
      auditTraffic.every(request => request.method === 'GET'),
      true,
      'a failed return to current must not send an audit mutation request',
    )
;

    assert.deepEqual(auditRequests, [], 'a failed return to current must not run or mutate an audit')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a lost connection returning from retained history preserves the non-Legacy evidence without writes', {
  timeout: 60_000,
}, async () => {
  const { server, origin } = await startApp()
  const browser = await launchBrowserForServer(server)
  const page = await browser.newPage()
  const { auditRequests } = await configureNetwork(page, {
    initialActiveRunId: 'run-2',
    retrievalRepetition: true,
    auditHistoryDetailDelays: {
      'run-2': [0, 0, 500],
    },
    auditHistoryDetailDrops: {
      'run-2': [false, true, false],
    },
  })
  const auditTraffic: Array<{ method: string; runId: string | null }> = []

  page.on('request', request => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/actor-audits')) {
      auditTraffic.push({ method: request.method(), runId: url.searchParams.get('runId') })
    }
  })

  try {
    await page.goto(`${origin}/vibe-atlas?admin=true`)
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click()
    await page.getByRole('heading', { name: 'Audit evidence · run-2', exact: true }).waitFor()

    const runSelect = page.getByLabel('Audit run')
    await runSelect.selectOption('run-1')
    await page.getByRole('heading', { name: 'Audit evidence · run-1', exact: true }).waitFor()

    const repetition = page
      .getByRole('region', { name: 'Candidate loss funnel' })
      .getByRole('region', { name: 'Retrieval repetition' })
    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])

    const failedRequest = page.waitForEvent('requestfailed', request => {
      const url = new URL(request.url())
      return url.pathname.endsWith('/actor-audits') && url.searchParams.get('runId') === 'run-2'
    })

    await runSelect.selectOption('run-2')
    await failedRequest
    await page.getByText(
      'Audit history lost its connection. The evidence currently on screen is safe and unchanged. Retry the history selection when the connection returns; retrying only reads the selected audit.',
      { exact: true },
    ).waitFor()

    assert.equal(await page.getByText(/failed to fetch/i).count(), 0)
    assert.equal(await runSelect.inputValue(), 'run-1')
    await page.getByRole('heading', { name: 'Audit evidence · run-1', exact: true }).waitFor()
    assert.deepEqual((await repetition.locator('strong').allTextContents()).slice(0, 4), ['7', '6', '5', '2'])
    assert.deepEqual(
      auditTraffic.filter(request => request.runId).map(request => request.runId),
      ['run-2', 'run-1', 'run-2'],
      'opening retained history and the failed return must use only selected-run detail reads',
    )
    assert.equal(
      auditTraffic.every(request => request.method === 'GET'),
      true,
      'a failed return to current must not send an audit mutation request',
    )
    assert.deepEqual(auditRequests, [], 'a failed return to current must not run or mutate an audit')

    const recoveredRequest = page.waitForResponse(response => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/actor-audits') && url.searchParams.get('runId') === 'run-2'
    })

    await runSelect.selectOption('run-2')
    assert.equal(await runSelect.inputValue(), 'run-1', 'the selector must remain on retained history while the retry is pending')
    await page.getByRole('heading', { name: 'Audit evidence · run-1', exact: true }).waitFor()
    assert.deepEqual(
      (await repetition.locator('strong').allTextContents()).slice(0, 4),
      ['7', '6', '5', '2'],
      'retained evidence must remain intact until the successful retry response arrives',
    )

    await recoveredRequest
    await page.getByRole('heading', { name: 'Audit evidence · run-2', exact: true }).waitFor()
    assert.equal(await runSelect.inputValue(), 'run-2', 'the selector must align with the restored current audit')
    assert.deepEqual(
      auditTraffic.filter(request => request.runId).map(request => request.runId),
      ['run-2', 'run-1', 'run-2', 'run-2'],
      'the recovery retry must add only another selected-run detail read',
    )
    assert.equal(
      auditTraffic.every(request => request.method === 'GET'),
      true,
      'every retained-history retry must use GET',
    )
    assert.deepEqual(auditRequests, [], 'returning to current after recovery must not run or mutate an audit')
  } finally {
    await closeBrowserAndServer(browser, server)
  }
})
;


test('a signed-in operator saves a rescue board to Collection without calibrating it', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{

    auditRequests,
    calibrationRequests,
    exportRequests,
    misprintRequests,
    getMediaUploads,
    getCollectionSyncRequests,
  
}
 = await configureNetwork(page)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('heading', 
{
 name: 'Release Desk', exact: true 
}
).waitFor()
;

    await page.getByRole('heading', 
{
 name: 'Inventory', exact: true 
}
).waitFor()
;

    assert.equal(await page.getByText('1', 
{
 exact: true 
}
).first().isVisible(), true)
;

    assert.equal(await page.getByText(/12:00 PM Asia\/Shanghai/).isVisible(), true)
;

    assert.equal(await page.getByText('Actor repeat watch', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await page.getByText('Last Daily Drop · Aug 30, 2026', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await page.getByText('Unavailable after signal retirement', 
{
 exact: true 
}
).last().isVisible(), true)
;

    assert.equal(await page.getByText('Retired Signal Vibe', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await page.getByText('Source receipt rescue-receipt-7 · audit run-7', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await page.getByText('Source no longer preserves confirmed identity.', 
{
 exact: true 
}
).isVisible(), true)
;


    await page.getByRole('link', 
{
 name: 'Open exact evidence', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;

    await page.getByText('Opened source receipt rescue-receipt-7 from audit run-7.', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(await page.getByRole('heading', 
{
 name: 'Audit evidence · run-7', exact: true 
}
).isVisible(), true)
;

    assert.equal(await page.getByText(/rescue-receipt-7/).last().isVisible(), true)
;

    assert.equal(await page.getByText('Viewing saved arrangement', 
{
 exact: true 
}
).isVisible(), true)
;


    await page.getByRole('button', 
{
 name: /Browser Calibration Vibe/ 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose nine to save', exact: true 
}
).waitFor()
;


    const addButtons = page.getByRole('button', 
{
 name: /Add$/ 
}
)
;

    for (let index = 0
;
 index < 9
;
 index += 1) 
{

      await addButtons.first().click()
;

    
}

    await page.getByRole('button', 
{
 name: 'Save my nine to Collection', exact: true 
}
).click()
;

    await page.getByText('Rescue board saved and synced to Collection.', 
{
 exact: false 
}
).waitFor()
;

    await page.getByText('Saved rescue records', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await page.getByText('Each record is immutable and saves to Collection automatically.', 
{
 exact: false 
}
).isVisible(),
      true,
      'the saved record should explain its automatic Collection persistence',
    )
;

    assert.equal(exportRequests.length, 1, 'saving the board should export its exact receipt')
;

    assert.equal(getMediaUploads(), 9, 'all nine rescue images should be copied into MEDIA')
;

    assert.equal(getCollectionSyncRequests().length, 1, 'the saved rescue grid should sync to the operator account')
;

    assert.equal(getCollectionSyncRequests()[0].operations.length, 1, 'only the rescue grid should be synced')
;

    assert.equal(getCollectionSyncRequests()[0].operations[0].item.id, 'rescue-grid-1')
;

    assert.equal(
      await page.getByRole('button', 
{
 name: 'Use as calibration evidence', exact: true 
}
).count(),
      2,
      'calibration must be an explicit action on the saved receipt',
    )
;

    assert.equal(
      auditRequests.filter(request => request.action === 'mark_rescue_calibration').length,
      0,
      'saving a rescue board must not calibrate it implicitly',
    )
;


    await page.getByRole('tab', 
{
 name: 'Release Desk', exact: true 
}
).click()
;

    const savedGrid = page.getByLabel('Saved FANDOM grid')
;

    await savedGrid.waitFor()
;

    assert.equal(await savedGrid.inputValue(), 'rescue-grid-1', 'the rescue grid should be selectable for Workstation handoff')
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;


    await page.getByRole('button', 
{
 name: 'Use as calibration evidence', exact: true 
}
).first().click()
;

    await page.getByRole('button', 
{
 name: 'Calibration evidence confirmed', exact: true 
}
).first().waitFor()
;

    assert.equal(calibrationRequests.length, 1, 'one explicit calibration confirmation should be recorded')
;

    assert.equal(
      await page.getByRole('button', 
{
 name: 'Calibration evidence confirmed', exact: true 
}
).first().isDisabled(),
      true,
      'confirmed calibration evidence must be immutable in the operator UI',
    )
;

    assert.equal(
      await page.getByRole('button', 
{
 name: 'Use as calibration evidence', exact: true 
}
).count(),
      0,
      'a confirmed receipt must not offer a second mutable calibration action',
    )
;


    await page.getByRole('button', 
{
 name: 'Run audit', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Choose Compiled', exact: true 
}
).click()
;

    const signalDetails = page.locator('details').filter(
{
 hasText: 'Operator-derived curation signals' 
}
)
;

    const proofDetails = page.locator('details').filter(
{
 hasText: 'Calibration transfer proof' 
}
)
;

    await signalDetails.locator('summary').click()
;

    await proofDetails.locator('summary').click()
;

    assert.match(await signalDetails.locator('pre').innerText(), /same_evidence_uncalibrated_control/)
;

    assert.match(await signalDetails.locator('pre').innerText(), /beyondExactSavedNineEffectCount/)
;

    assert.match(await proofDetails.locator('pre').innerText(), /reaudit_not_yet_reproduced/)
;

    assert.equal(
      await page.getByText('Calibration reaudit required', 
{
 exact: true 
}
).count() > 0,
      true,
      'the pairing must stay blocked when no transferable proof is reproduced',
    )
;

    assert.equal(
      await page.getByRole('button', 
{
 name: 'Save scheduling verdict', exact: true 
}
).count(),
      0,
      'the blocked pairing must not expose scheduling approval controls',
    )
;

    assert.equal(
      auditRequests.filter(request => request.action === 'run').length,
      2,
      'the fresh audit must be a distinct audit request after calibration confirmation',
    )
;


    const runSelect = page.getByLabel('Audit run')
;

    const wideCurrentRawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    await wideCurrentRawResults.locator(':scope > summary').click()
;

    assert.equal(await wideCurrentRawResults.getAttribute('open'), '', 'the current raw evidence should open in the wide layout')
;

    await runSelect.selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;

    const wideRetainedRawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    assert.equal(
      await wideRetainedRawResults.getAttribute('open'),
      null,
      'switching to retained evidence in the wide layout must start its raw results collapsed',
    )
;

    await runSelect.selectOption('run-2')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-2', exact: true 
}
).waitFor()
;


    await page.setViewportSize(
{
 width: 360, height: 800 
}
)
;

    const rawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    assert.equal(await rawResults.getAttribute('open'), null, 'the current summary should be readable while collapsed')
;

    assert.match(
      await rawResults.locator(':scope > summary').innerText(),
      /Bounded raw results Current · writable · \d+ records/,
      'the current raw-results summary must identify its evidence as writable before expansion',
    )
;

    assert.equal(
      await rawResults.locator(':scope > summary').evaluate((summary) => 
{

        const status = summary.querySelector('span')
;

        const summaryRect = summary.getBoundingClientRect()
;

        const statusRect = status?.getBoundingClientRect()
;

        return summary.scrollWidth <= summary.clientWidth
          && Boolean(statusRect && statusRect.left >= summaryRect.left && statusRect.right <= summaryRect.right)
;

      
}
),
      true,
      'the current writable summary must remain inside the narrow viewport',
    )
;

    await rawResults.locator(':scope > summary').click()
;

    const firstResult = rawResults.locator('article').first()
;

    await runSelect.selectOption('run-1')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-1', exact: true 
}
).waitFor()
;

    assert.equal(
      await page.getByText('automatically publication-ready cards', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').innerText(),
      'Unavailable',
      'an omitted historical display total must not look like a measured zero',
    )
;

    assert.equal(
      await page.getByText('queries audited', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').innerText(),
      'Unavailable',
      'an omitted historical query total must not be inferred from the retained query array',
    )
;

    const historicalRawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    assert.equal(await historicalRawResults.getAttribute('open'), null, 'the retained summary should be readable while collapsed')
;

    assert.match(
      await historicalRawResults.locator(':scope > summary').innerText(),
      /Bounded raw results Retained · frozen read-only · \d+ records/,
      'the retained raw-results summary must identify its evidence as frozen before expansion',
    )
;

    assert.equal(
      await historicalRawResults.locator(':scope > summary').evaluate((summary) => 
{

        const status = summary.querySelector('span')
;

        const summaryRect = summary.getBoundingClientRect()
;

        const statusRect = status?.getBoundingClientRect()
;

        return summary.scrollWidth <= summary.clientWidth
          && Boolean(statusRect && statusRect.left >= summaryRect.left && statusRect.right <= summaryRect.right)
;

      
}
),
      true,
      'the retained frozen summary must remain inside the narrow viewport',
    )
;

    await historicalRawResults.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    const historicalFirstResult = historicalRawResults.locator('article').first()
;

    await historicalFirstResult.getByText('Frozen audit evidence', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await historicalFirstResult.getByText('This evidence is frozen. Image actions are available only on the current audit.', 
{
 exact: true 
}
).isVisible(),
      true,
      'a revealed retained result must clearly identify its evidence as frozen',
    )
;

    assert.equal(
      await historicalFirstResult.locator('button, input, select, textarea, form, details').count(),
      0,
      'a revealed retained result must hide all image mutation controls',
    )
;

    assert.equal(
      misprintRequests.length,
      0,
      'selecting historical evidence must not record a mark_misprint request',
    )
;

    await runSelect.selectOption('run-legacy')
;

    await page.getByRole('heading', 
{
 name: 'Legacy audit · retained history · run-legacy', exact: true 
}
).waitFor()
;

    assert.equal(
      await page.getByText('automatically publication-ready cards', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').innerText(),
      '0',
      'a recorded Legacy display total of zero must remain visible',
    )
;

    assert.equal(
      await page.getByText('queries audited', 
{
 exact: true 
}
).locator('xpath=preceding-sibling::strong[1]').innerText(),
      '0',
      'a recorded Legacy query total of zero must remain visible',
    )
;

    await page.getByText('Fully read-only retained Legacy run.', 
{
 exact: false 
}
).waitFor()
;

    await page.getByText('Read-only Legacy rescue history:', 
{
 exact: false 
}
).waitFor()
;

    assert.equal(
      await page.getByText('Still available on this current Legacy head:', 
{
 exact: false 
}
).count(),
      0,
      'a prior Legacy run must not advertise current-head write exceptions',
    )
;

    const legacyRawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    assert.equal(await legacyRawResults.getAttribute('open'), null, 'the Legacy summary should be readable while collapsed')
;

    assert.match(
      await legacyRawResults.locator(':scope > summary').innerText(),
      /Bounded raw results Legacy · frozen read-only · \d+ records/,
      'the Legacy raw-results summary must identify its evidence as frozen before expansion',
    )
;

    assert.equal(
      await legacyRawResults.locator(':scope > summary').evaluate((summary) => 
{

        const status = summary.querySelector('span')
;

        const summaryRect = summary.getBoundingClientRect()
;

        const statusRect = status?.getBoundingClientRect()
;

        return summary.scrollWidth <= summary.clientWidth
          && Boolean(statusRect && statusRect.left >= summaryRect.left && statusRect.right <= summaryRect.right)
;

      
}
),
      true,
      'the Legacy frozen summary must remain inside the narrow viewport',
    )
;

    await legacyRawResults.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    const legacyFirstResult = legacyRawResults.locator('article').first()
;

    await legacyFirstResult.getByText('Frozen audit evidence', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await legacyFirstResult.locator('button, input, select, textarea, form, details').count(),
      0,
      'a revealed Legacy result must hide all image mutation controls',
    )
;

    assert.equal(
      misprintRequests.length,
      0,
      'opening Legacy raw evidence must not record a mark_misprint request',
    )
;


    await runSelect.selectOption('run-2')
;

    await page.getByRole('heading', 
{
 name: 'Audit evidence · run-2', exact: true 
}
).waitFor()
;

    const currentRawResults = page.locator('summary').filter(
{
 hasText: /^Bounded raw results/ 
}
).locator('..')
;

    await currentRawResults.evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    const currentFirstResult = currentRawResults.locator('article').first()
;

    await currentFirstResult.locator('details').filter(
{
 hasText: 'Mark Misprint' 
}
).evaluate((element: HTMLDetailsElement) => 
{

      element.open = true
;

    
}
)
;

    assert.equal(
      await currentFirstResult.getByRole('button', 
{
 name: 'Preserve & correct', exact: true 
}
).isEnabled(),
      true,
      'returning to the current writable audit must restore the correction action',
    )
;

    await currentFirstResult.getByLabel('Who showed up? (optional)').fill('Zhang Linghe auditioning as Liu Xueyi')
;

    await currentFirstResult.getByLabel('Operator note (optional)').fill('Image metadata committed perjury.')
;

    await currentFirstResult.getByRole('button', 
{
 name: 'Preserve & correct', exact: true 
}
).click()
;

    await page.getByText('Some Other Man™ preserved in Misprints.', 
{
 exact: false 
}
).waitFor()
;


    assert.equal(misprintRequests.length, 1, 'the correction should create one candidate-level Misprint receipt')
;

    assert.deepEqual(misprintRequests[0], 
{

      action: 'mark_misprint',
      actorId: ACTOR_ID,
      vibeKey: VIBE_KEY,
      runId: 'run-2',
      candidateId: candidate(0).candidateId,
      reason: 'wrong_actor',
      actualIdentity: 'Zhang Linghe auditioning as Liu Xueyi',
      note: 'Image metadata committed perjury.',
    
}
)
;

    assert.equal(
      await firstResult.getByText('Preserved as a Misprint', 
{
 exact: true 
}
).isVisible(),
      true,
      'the failed result should remain visible as collectible evidence',
    )
;

    assert.equal(
      await currentFirstResult.getByRole('button', 
{
 name: 'Pin for board', exact: true 
}
).isDisabled(),
      true,
      'a Misprint cannot be turned back into positive curation evidence',
    )
;

    assert.equal(
      await currentFirstResult.getByText('Mark Misprint', 
{
 exact: true 
}
).count(),
      0,
      'an immutable Misprint should not offer a second correction action',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('release inventory repair warnings cover repeated and failed repairs, one successful bootstrap, and stay private', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const browser = await launchBrowserForServer(server)
;


  try 
{

    const repeatedRepairPage = await browser.newPage()
;

    await configureNetwork(repeatedRepairPage, 
{

      publicationIndexRepairHealth: 
{

        warning: true,
        attemptCount: 3,
        failedAttemptCount: 0,
        windowHours: 24,
      
}
,
    
}
)
;

    await repeatedRepairPage.goto(`${origin}/vibe-atlas?admin=true`)
;

    await repeatedRepairPage.getByRole('heading', 
{
 name: 'Release Desk', exact: true 
}
).waitFor()
;

    await repeatedRepairPage.getByText('Release inventory repair needs attention', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await repeatedRepairPage.getByText(
        '3 rebuilds were needed in the last 24 hours. Inventory remains fail-closed; check Blob listing and historical manifest health.',
        
{
 exact: true 
}
,
      ).isVisible(),
      true,
    )
;


    for (const failedAttemptCount of [1, 2]) 
{

      const failedRepairPage = await browser.newPage()
;

      await configureNetwork(failedRepairPage, 
{

        publicationIndexRepairHealth: 
{

          warning: true,
          attemptCount: failedAttemptCount,
          failedAttemptCount,
          windowHours: 24,
        
}
,
      
}
)
;

      await failedRepairPage.goto(`${origin}/vibe-atlas?admin=true`)
;

      await failedRepairPage.getByRole('heading', 
{
 name: 'Release Desk', exact: true 
}
).waitFor()
;

      await failedRepairPage.getByText('Release inventory repair needs attention', 
{
 exact: true 
}
).waitFor()
;

      assert.equal(
        await failedRepairPage.getByText(
          `${failedAttemptCount} repair attempt${failedAttemptCount === 1 ? '' : 's'} did not complete normally. Inventory remains fail-closed; check Blob listing and historical manifest health.`,
          
{
 exact: true 
}
,
        ).isVisible(),
        true,
        `the failed repair warning must retain ${failedAttemptCount === 1 ? 'singular' : 'plural'} count copy and fail-closed guidance`,
      )
;

      await failedRepairPage.close()
;

    
}


    for (const publicationIndexRepairHealth of [
      
{
 warning: true, failedAttemptCount: 0, windowHours: 24 
}
,
      
{
 warning: true, attemptCount: '3', failedAttemptCount: 0, windowHours: 24 
}
,
      
{
 warning: true, attemptCount: 3, failedAttemptCount: 0, windowHours: null 
}
,
    ]) 
{

      const incompleteRepairPage = await browser.newPage()
;

      await configureNetwork(incompleteRepairPage, 
{
 publicationIndexRepairHealth 
}
)
;

      await incompleteRepairPage.goto(`${origin}/vibe-atlas?admin=true`)
;

      await incompleteRepairPage.getByRole('heading', 
{
 name: 'Release Desk', exact: true 
}
).waitFor()
;

      assert.equal(
        await incompleteRepairPage.getByText(
          'Repair health details are incomplete, so recent repair counts are unavailable. Inventory remains fail-closed; check Blob listing and historical manifest health.',
          
{
 exact: true 
}
,
        ).isVisible(),
        true,
        'incomplete or invalid repair health must use explicit fallback copy and retain fail-closed guidance',
      )
;

      await incompleteRepairPage.close()
;

    
}


    const recoverableRepairPage = await browser.newPage()
;
    const recoverableNetwork = await configureNetwork(recoverableRepairPage, {
      publicationIndexRepairHealth: {
        status: 'unavailable',
        warning: true,
        attemptCount: 0,
        failedAttemptCount: 0,
        windowHours: 24,
        lastAttemptAt: null,
        lastOutcome: null,
      },
    })
;
    await recoverableRepairPage.goto(`${origin}/vibe-atlas?admin=true`)
;
    const recoverButton = recoverableRepairPage.getByRole('button', {
      name: 'Recover repair health',
      exact: true,
    })
;
    await recoverButton.waitFor()
;
    await recoverButton.click()
;
    await recoverableRepairPage.getByText(
      'Repair health recovered. 0 valid recent repair events preserved.',
      { exact: true },
    ).waitFor()
;
    assert.equal(
      await recoverableRepairPage.getByText(
        'Release inventory repair needs attention',
        { exact: true },
      ).count(),
      0,
      'successful recovery should refresh inventory and clear the warning',
    )
;
    assert.equal(
      recoverableNetwork.auditRequests.some(request =>
        request.action === 'recover_publication_index_repair_health'),
      true,
      'the recovery control should invoke the bounded admin action',
    )
;

    const failedRecoveryPage = await browser.newPage()
;
    await configureNetwork(failedRecoveryPage, {
      failRepairHealthRecovery: true,
      publicationIndexRepairHealth: {
        status: 'unavailable',
        warning: true,
        attemptCount: 0,
        failedAttemptCount: 0,
        windowHours: 24,
        lastAttemptAt: null,
        lastOutcome: null,
      },
    })
;
    await failedRecoveryPage.goto(`${origin}/vibe-atlas?admin=true`)
;
    await failedRecoveryPage.getByRole('button', {
      name: 'Recover repair health',
      exact: true,
    }).click()
;
    await failedRecoveryPage.getByText(
      'Repair health recovery is temporarily unavailable.',
      { exact: true },
    ).waitFor()
;
    assert.equal(
      await failedRecoveryPage.getByRole('button', {
        name: 'Recover repair health',
        exact: true,
      }).isEnabled(),
      true,
      'failed recovery should leave the control available for a deliberate retry',
    )
;

    const successfulBootstrapPage = await browser.newPage()
;

    await configureNetwork(successfulBootstrapPage, 
{

      publicationIndexRepairHealth: 
{

        warning: false,
        attemptCount: 1,
        failedAttemptCount: 0,
        windowHours: 24,
      
}
,
    
}
)
;

    await successfulBootstrapPage.goto(`${origin}/vibe-atlas?admin=true`)
;

    await successfulBootstrapPage.getByRole('heading', 
{
 name: 'Inventory', exact: true 
}
).waitFor()
;

    assert.equal(
      await successfulBootstrapPage.getByText('Release inventory repair needs attention', 
{
 exact: true 
}
).count(),
      0,
      'one successful bootstrap must not warn operators',
    )
;


    const publicPage = await browser.newPage()
;

    await configureNetwork(publicPage, 
{

      publicationIndexRepairHealth: 
{

        warning: true,
        attemptCount: 2,
        failedAttemptCount: 2,
        windowHours: 24,
      
}
,
    
}
)
;

    await publicPage.goto(`${origin}/vibe-atlas`)
;

    await publicPage.getByRole('heading', 
{
 name: /Vibe Atlas/ 
}
).first().waitFor()
;

    assert.equal(
      await publicPage.getByText('Release inventory repair needs attention', 
{
 exact: true 
}
).count(),
      0,
      'repair warning copy must remain private to the operator surface',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('mixed calibration evidence does not overstate joint bundle support', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const browser = await launchBrowserForServer(server)
;


  try 
{

    const selectionPage = await browser.newPage()
;

    await configureNetwork(selectionPage, 
{
 mixedCalibrationApproval: true 
}
)
;

    await selectionPage.goto(`${origin}/vibe-atlas?admin=true`)
;

    await selectionPage.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await selectionPage.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const approvalCard = selectionPage.getByRole('region', 
{
 name: 'Production calibration approval' 
}
)
;

    await approvalCard.getByLabel('signal-a · +0.3').check()
;

    await approvalCard.getByLabel('signal-b · +0.25').check()
;

    await approvalCard.getByText('Affected reviewed audits: joint-run', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await approvalCard.getByText('Affected reviewed audits: joint-run,', 
{
 exact: false 
}
).count(),
      0,
      'matching evidence with a missing, empty, or whitespace-only source run ID must not add a blank jointly supporting audit',
    )
;

    assert.equal(
      await approvalCard.getByText('partial-run-a', 
{
 exact: false 
}
).count(),
      0,
      'a run supporting only one selected signal must not count for the exact bundle',
    )
;

    assert.equal(
      await approvalCard.getByRole('button', 
{
 name: 'Approve bounded production calibration', exact: true 
}
).isDisabled(),
      true,
      'matching incomplete receipts must not enable approval when only one valid distinct run supports the whole bundle',
    )
;


    const activePage = await browser.newPage()
;

    await configureNetwork(activePage, 
{
 activeMixedCalibrationApproval: true 
}
)
;

    await activePage.goto(`${origin}/vibe-atlas?admin=true`)
;

    await activePage.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await activePage.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;

    const activeCard = activePage.getByRole('region', 
{
 name: 'Production calibration approval' 
}
)
;

    await activeCard.getByText(
      '1 jointly supporting reviewed audits: joint-run · 6 total evidence receipts',
      
{
 exact: false 
}
,
    ).waitFor()
;

    assert.equal(
      await activeCard.getByText('partial-run-a', 
{
 exact: false 
}
).count(),
      0,
      'the active approval summary must list only distinct runs supporting every approved signal',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a bounded legacy recovery keeps its active approval visible to operators', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  await configureNetwork(page, 
{
 boundedLegacyRecovery: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const approvalCard = page.getByRole('region', 
{
 name: 'Production calibration approval' 
}
)
;

    await approvalCard.getByText('Active approval approval', 
{
 exact: true 
}
).waitFor()
;

    await approvalCard.getByRole('button', 
{
 name: 'Revoke approved adjustment', exact: true 
}
).waitFor()
;

    assert.equal(await page.getByText('Legacy approval recovery paused', 
{
 exact: true 
}
).count(), 0)
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a retirement evidence handoff preserves the receipt identifier when its source run is gone', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  await configureNetwork(page, 
{
 missingRetirementRun: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('heading', 
{
 name: 'Release Desk', exact: true 
}
).waitFor()
;

    await page.getByRole('link', 
{
 name: 'Open exact evidence', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;

    await page.getByText(
      'Source audit run run-7 is no longer retained. Rescue receipt rescue-receipt-7 remains recorded on the retirement warning.',
      
{
 exact: true 
}
,
    ).waitFor()
;

    assert.equal(new URL(page.url()).searchParams.get('receiptId'), 'rescue-receipt-7')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a stale rescue approval keeps the recovery form visible without showing publication success', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 saveRequests, verdictRequests 
}
 = await configureCompleteHeroReviewNetwork(page, 
{
 staleOnVerdict: true 
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    await page.getByRole('button', 
{
 name: 'Save my nine to Collection', exact: true 
}
).click()
;

    await page.getByText('Saved rescue records', 
{
 exact: true 
}
).waitFor()
;

    await page.getByLabel('Publication decision').selectOption('approved')
;

    const vibeConfirmation = page.getByLabel('Yes, that’s the Vibe.')
;

    const publishableConfirmation = page.getByLabel('Yes, this is publishable.')
;

    await vibeConfirmation.check()
;

    await publishableConfirmation.check()
;

    const receiptSelect = page.getByLabel('Approved retained-evidence receipt')
;

    await receiptSelect.selectOption(RESCUE_RECEIPT_ID)
;


    const verdictButton = page.getByRole('button', 
{
 name: 'Save scheduling verdict', exact: true 
}
)
;

    assert.equal(await verdictButton.isEnabled(), true)
;

    await verdictButton.click()
;

    await page.getByText(
      'The selected rescue board is stale or unavailable. Rebuild and save it from the current image choices before recording this approval.',
      
{
 exact: true 
}
,
    ).waitFor()
;


    assert.equal(verdictRequests.length, 1, 'the selected receipt must be submitted before the conflict is shown')
;

    assert.equal(await receiptSelect.isVisible(), true, 'the selected receipt must remain available for recovery')
;

    assert.equal(await receiptSelect.inputValue(), RESCUE_RECEIPT_ID)
;

    assert.equal(await vibeConfirmation.isVisible(), true)
;

    assert.equal(await vibeConfirmation.isChecked(), true)
;

    assert.equal(await publishableConfirmation.isVisible(), true)
;

    assert.equal(await publishableConfirmation.isChecked(), true)
;

    assert.equal(await page.locator('[class*="approvalOutcome"]').count(), 0, 'a stale approval must not show a publication outcome')
;

    assert.equal(
      await page.getByText('Exact nine-card retained-evidence board approved for publication with both human confirmations.', 
{
 exact: true 
}
).count(),
      0,
      'a stale approval must not show publication success',
    )
;

    assert.equal(saveRequests.length, 1)
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a newer current audit keeps the approval draft intact until the operator refreshes', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 saveRequests, verdictRequests 
}
 = await configureCompleteHeroReviewNetwork(page, 
{

    newerRunOnVerdict: true,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    await page.getByRole('button', 
{
 name: 'Save my nine to Collection', exact: true 
}
).click()
;

    await page.getByText('Saved rescue records', 
{
 exact: true 
}
).waitFor()
;

    await page.getByLabel('Publication decision').selectOption('approved')
;

    const notes = page.getByLabel('Operator notes')
;

    const vibeConfirmation = page.getByLabel('Yes, that’s the Vibe.')
;

    const publishableConfirmation = page.getByLabel('Yes, this is publishable.')
;

    await notes.fill('Keep this decision while the newer audit is reviewed.')
;

    await vibeConfirmation.check()
;

    await publishableConfirmation.check()
;

    const receiptSelect = page.getByLabel('Approved retained-evidence receipt')
;

    await receiptSelect.selectOption(RESCUE_RECEIPT_ID)
;


    const verdictButton = page.getByRole('button', 
{
 name: 'Save scheduling verdict', exact: true 
}
)
;

    assert.equal(await verdictButton.isEnabled(), true)
;

    await verdictButton.click()
;

    await page.getByText(
      'A newer audit run became current. Review that run before scheduling.',
      
{
 exact: true 
}
,
    ).waitFor()
;


    assert.equal(verdictRequests.length, 1, 'the verdict must be submitted before the current-run conflict is shown')
;

    assert.equal(await page.getByLabel('Publication decision').inputValue(), 'approved')
;

    assert.equal(await notes.inputValue(), 'Keep this decision while the newer audit is reviewed.')
;

    assert.equal(await receiptSelect.inputValue(), RESCUE_RECEIPT_ID)
;

    assert.equal(await vibeConfirmation.isVisible(), true)
;

    assert.equal(await vibeConfirmation.isChecked(), true)
;

    assert.equal(await publishableConfirmation.isVisible(), true)
;

    assert.equal(await publishableConfirmation.isChecked(), true)
;

    assert.equal(await page.locator('[class*="approvalOutcome"]').count(), 0, 'a current-run conflict must not show a publication outcome')
;

    assert.equal(
      await page.getByText('Exact nine-card retained-evidence board approved for publication with both human confirmations.', 
{
 exact: true 
}
).count(),
      0,
      'a current-run conflict must not show publication success',
    )
;

    assert.equal(saveRequests.length, 1)
;


    await page.reload()
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;

    await page.getByText('Audit evidence · newer-current-audit', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(await page.getByLabel('Publication decision').inputValue(), '')
;

    assert.equal(await page.getByLabel('Operator notes').inputValue(), '')
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('a newer current audit keeps the rescue-board arrangement intact until the operator refreshes', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 saveRequests 
}
 = await configureCompleteHeroReviewNetwork(page, 
{

    newerRunOnRescueSave: true,
  
}
)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const rescueBoard = page.getByLabel('Editable rescue board')
;

    await rescueBoard.waitFor()
;

    await page.getByRole('button', 
{
 name: 'Move card 1 later', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Make card 1 the hero', exact: true 
}
).click()
;


    const boardTitles = () => rescueBoard.locator('article a').allInnerTexts()
;

    const heroTitle = () => rescueBoard.locator('[data-hero="true"] a').innerText()
;

    const beforeSaveTitles = await boardTitles()
;

    const beforeSaveHero = await heroTitle()
;

    assert.equal(beforeSaveTitles.length, 9, 'the rescue draft must contain nine chosen cards')
;

    assert.equal(beforeSaveHero, 'Hero · Browser evidence card 2')
;

    assert.equal(
      await page.locator('button[aria-pressed="true"]').count(),
      9,
      'the rescue picker must keep all nine choices visible',
    )
;


    await page.getByRole('button', 
{
 name: 'Save my nine to Collection', exact: true 
}
).click()
;

    await page.getByText(
      'Only the current audit run can save an Operator Rescue Board.',
      
{
 exact: true 
}
,
    ).waitFor()
;


    assert.equal(saveRequests.length, 1, 'the rescue board must be submitted before the conflict is shown')
;

    assert.deepEqual(await boardTitles(), beforeSaveTitles, 'the chosen card order must survive the conflict')
;

    assert.equal(await heroTitle(), beforeSaveHero, 'the chosen hero position must survive the conflict')
;

    assert.equal(
      await page.locator('button[aria-pressed="true"]').count(),
      9,
      'the chosen nine must remain visible after the conflict',
    )
;

    assert.equal(
      await page.getByText('Saved rescue records', 
{
 exact: true 
}
).count(),
      0,
      'a current-run conflict must not show saved-board success',
    )
;

    assert.equal(
      await page.getByText('Operator Rescue Board saved as a separate append-only receipt.', 
{
 exact: false 
}
).count(),
      0,
      'a current-run conflict must not show the rescue save success notice',
    )
;

    await page.getByText('Audit evidence · complete-hero-review', 
{
 exact: true 
}
).waitFor()
;


    await page.reload()
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;

    await page.getByText('Audit evidence · newer-current-audit', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(
      await page.getByText('Saved rescue records', 
{
 exact: true 
}
).count(),
      0,
      'refreshing must reveal the newer run rather than a falsely saved board',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;


test('an admin can hand off a complete compiled proposal that needs hero review', 
{
 timeout: 60_000 
}
, async () => 
{

  const 
{
 server, origin 
}
 = await startApp()
;

  const 
{
 browser, page 
}
 = await launchPageForServer(server)
;

  try 
{

  const 
{
 saveRequests, verdictRequests 
}
 = await configureCompleteHeroReviewNetwork(page)
;


    await page.goto(`${origin}/vibe-atlas?admin=true`)
;

    await page.getByRole('tab', 
{
 name: 'Actor Preflight Lab', exact: true 
}
).click()
;

    await page.getByRole('heading', 
{
 name: 'Actor preflight lab' 
}
).waitFor()
;


    const qualification = page.getByLabel('Board qualification diagnostics')
;

    await qualification.getByText('Compiled complete board · Hero review needed', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(await qualification.getByText('Event proposal missing', 
{
 exact: true 
}
).isVisible(), true)
;

    assert.equal(await qualification.getByText('Compiled complete board · Hero review needed', 
{
 exact: true 
}
).isVisible(), true)
;


    const publicationReadyLabel = page.getByText('automatically publication-ready cards', 
{
 exact: true 
}
)
;

    const publicationReadyCount = publicationReadyLabel.locator('xpath=preceding-sibling::strong[1]')
;

    assert.equal(await publicationReadyCount.innerText(), '0')
;


    const rescueBoard = page.locator('[aria-label="Editable rescue board"]')
;

    assert.deepEqual(
      (await rescueBoard.locator('a').allInnerTexts()).map(title => title.replace(/^Hero · /, '')),
      candidates().map(item => item.title),
      'the editable rescue board must start with the exact proposed nine',
    )
;

    assert.equal(
      (await rescueBoard.locator('[data-hero="true"] a').innerText()).replace(/^Hero · /, ''),
      candidate(4).title,
      'the proposed fifth card must be the initial hero slot',
    )
;


    await page.getByRole('button', 
{
 name: 'Move card 1 later', exact: true 
}
).click()
;

    await page.getByRole('button', 
{
 name: 'Make card 2 the hero', exact: true 
}
).click()
;


    const expectedIds = [
      candidate(1).candidateId,
      candidate(4).candidateId,
      candidate(2).candidateId,
      candidate(3).candidateId,
      candidate(0).candidateId,
      candidate(5).candidateId,
      candidate(6).candidateId,
      candidate(7).candidateId,
      candidate(8).candidateId,
    ]
;

    assert.deepEqual(
      (await rescueBoard.locator('a').allInnerTexts()).map(title => title.replace(/^Hero · /, '')),
      expectedIds.map(candidateId => candidates().find(item => item.candidateId === candidateId)?.title),
      'hero replacement and card reorder must update the live rescue board',
    )
;

    assert.equal(
      (await rescueBoard.locator('[data-hero="true"] a').innerText()).replace(/^Hero · /, ''),
      candidate(0).title,
    )
;


    const saveButton = page.getByRole('button', 
{
 name: 'Save my nine to Collection', exact: true 
}
)
;

    assert.equal(await saveButton.isEnabled(), true, 'the complete edited board must enable saving')
;

    await saveButton.click()
;

    await page.getByText('Saved rescue records', 
{
 exact: true 
}
).waitFor()
;

    assert.equal(saveRequests.length, 1)
;

    assert.deepEqual(saveRequests[0].candidateIds, expectedIds, 'the handoff must save the exact edited board')
;


    await page.getByLabel('Publication decision').selectOption('approved')
;

    await page.getByLabel('Yes, that’s the Vibe.').check()
;

    await page.getByLabel('Yes, this is publishable.').check()
;

    const receiptSelect = page.getByLabel('Approved retained-evidence receipt')
;

    await receiptSelect.selectOption(RESCUE_RECEIPT_ID)
;

    assert.equal(await receiptSelect.inputValue(), RESCUE_RECEIPT_ID)
;


    const verdictButton = page.getByRole('button', 
{
 name: 'Save scheduling verdict', exact: true 
}
)
;

    assert.equal(await verdictButton.isEnabled(), true, 'both publication checks and the selected receipt must enable approval')
;

    await verdictButton.click()
;

    await page.getByText(
      'Exact nine-card retained-evidence board approved for publication with both human confirmations.',
    ).waitFor()
;

    assert.equal(verdictRequests.length, 1)
;

    assert.deepEqual(verdictRequests[0], 
{

      action: 'verdict',
      actorId: ACTOR_ID,
      vibeKey: VIBE_KEY,
      runId: 'complete-hero-review',
      verdict: 'approved',
      notes: '',
      vibeConfirmed: true,
      publishableConfirmed: true,
      rescuePreferred: true,
      rescueReceiptId: RESCUE_RECEIPT_ID,
    
}
, 'approval must submit the exact selected rescue receipt')
;

    assert.equal(
      await page.getByText(`Exact approved receipt ${RESCUE_RECEIPT_ID.slice(0, 8)} is the publication board.`, 
{
 exact: true 
}
).isVisible(),
      true,
      'the approved receipt must remain the publication source after submission',
    )
;

  
}
 finally 
{

    await closeBrowserAndServer(browser, server)
;

  
}

}
)
;
