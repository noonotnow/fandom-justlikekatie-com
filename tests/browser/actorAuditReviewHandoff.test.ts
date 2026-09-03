import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

const ACTOR_ID = 'browser-test-actor';
const VIBE_KEY = `${ACTOR_ID}:0`;
const RESCUE_RECEIPT_ID = 'rescue-receipt-1';

type AnyRecord = Record<string, any>;

async function startApp(): Promise<{ server: ViteDevServer; origin: string }> {
  const server = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5000, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    throw new Error('The browser test server did not expose a TCP port.');
  }
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (defaultLaunchError) {
    const executablePath = process.env.PATH
      ?.split(':')
      .map(directory => `${directory}/chromium`)
      .find(existsSync);
    if (!executablePath) throw defaultLaunchError;
    return chromium.launch({ executablePath, args: ['--no-sandbox'] });
  }
}

function candidate(index: number): AnyRecord {
  const candidateId = String(index + 1).padStart(2, '0').repeat(12);
  return {
    candidateId,
    query: 'browser calibration query',
    title: `Browser evidence card ${index + 1}`,
    description: 'A retained test still.',
    source: 'browser-evidence.test',
    link: `https://browser-evidence.test/card-${index + 1}`,
    thumbnail: `https://images.browser-evidence.test/card-${index + 1}.jpg`,
  };
}

function candidates(): AnyRecord[] {
  return Array.from({ length: 9 }, (_, index) => candidate(index));
}

function actor(pairingState: string, eligible = false): AnyRecord {
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
    pairings: [{
      vibeKey: VIBE_KEY,
      labels: ['Browser Calibration Vibe'],
      queryCount: 1,
      auditState: pairingState,
      eligible,
      currentRunId: null,
      calibrationEvidenceCount: pairingState === 'not_run' ? 0 : 1,
      calibrationProof: null,
    }],
  };
}

function contract(): AnyRecord {
  return {
    status: 'current',
    isCurrent: true,
    isLegacy: false,
    legacyReasons: [],
    currentVersions: {
      identityProfileVersion: 1,
      aestheticClusterVersion: 1,
      promiseContractVersion: 1,
      curationVersion: 1,
    },
  };
}

function board(mode: string, items: AnyRecord[]): AnyRecord {
  return {
    boardId: `${mode}-browser-board`,
    mode,
    score: mode === 'compiled' ? 0.8 : 0.7,
    candidates: items,
    scoreBreakdown: {
      sourceRange: { value: 1, weight: 0.2, contribution: 0.2 },
    },
    promise: {
      coreCount: 9,
      heroFulfillment: 1,
      singleFrameRatio: 1,
    },
  };
}

function feedback(savedBoard?: AnyRecord, calibrationEvidence?: AnyRecord): AnyRecord {
  const rescue = savedBoard
    ? { ...savedBoard, ...(calibrationEvidence ? { calibrationEvidence } : {}) }
    : null;
  return {
    schemaVersion: 1,
    eventCount: savedBoard ? 0 : 0,
    flags: [],
    feedbackHash: 'browser-feedback-hash',
    requestedReview: null,
    operatorRescueBoard: rescue,
    operatorRescueBoards: rescue ? [rescue] : [],
  };
}

function calibrationProfile(): AnyRecord {
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
  };
}

function run(runId: string, revealed: boolean, proof = false): AnyRecord {
  const retained = candidates();
  const event = board('event', retained);
  const compiled = board('compiled', [...retained].reverse());
  const result: AnyRecord = {
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
      ? {
        status: 'revealed',
        choice: 'compiled',
        agreement: true,
        systemWinner: 'compiled',
        presentationOrder: ['event', 'compiled'],
        boards: [
          { mode: 'event', label: 'Event board', board: event },
          { mode: 'compiled', label: 'Compiled board', board: compiled },
        ],
        experiment: {
          eventBoard: { boardId: event.boardId },
          compiledBoard: { boardId: compiled.boardId },
          curationVersion: 1,
        },
      }
      : {
        status: 'pending',
        presentationOrder: ['event', 'compiled'],
        boards: [
          { mode: 'event', label: 'Event board', board: event },
          { mode: 'compiled', label: 'Compiled board', board: compiled },
        ],
      },
  };

  if (!revealed) return result;

  result.queryRuns = [{ query: 'browser calibration query', provider: 'browser-test', rank: 0 }];
  result.rawResults = retained;
  result.rejections = [];
  result.identityEvidence = {
    collisionSignals: 0,
    heuristic: 'Browser test evidence does not prove identity by itself.',
  };
  result.detectedEvents = [];
  result.strongestEvent = event;
  result.strongestCompiled = compiled;
  result.winner = { mode: 'compiled', board: compiled };
  result.alternate = { mode: 'event', board: event };
  result.eventAlternatives = [];
  result.compiledAlternatives = [];
  result.curationReceipt = {
    rawCandidates: retained,
    sourceEvidenceCandidates: retained,
    dropped: [],
    curationVersion: 1,
    calibrationSignals: proof
      ? {
        calibrationVersion: 1,
        evidenceCount: 1,
        affected: false,
        selectedSignalCount: 1,
        beyondExactSavedNineCount: 0,
        scoreDelta: 0,
        messages: ['Only exact saved candidates matched.'],
        comparison: {
          method: 'same_evidence_uncalibrated_control',
          sameInput: true,
          improved: false,
          beyondExactSavedNineEffectCount: 0,
          summary: 'The calibrated result did not improve new evidence through a transferable query, source, or visual-cluster signal.',
        },
      }
      : null,
  };
  result.displayCount = 9;
  result.materialSufficient = true;
  result.suggestedState = 'needs_operator_verdict';
  result.operatorVerdict = null;
  result.editorialFeedback = feedback();
  if (proof) {
    result.calibrationProof = {
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
    };
  }
  return result;
}

function rescueCalibrationDetails(): AnyRecord {
  return {
    schemaVersion: 1,
    calibrationVersion: 1,
    status: 'confirmed',
    sourceRescueReceiptId: RESCUE_RECEIPT_ID,
    sourceRunId: 'run-1',
    confirmedAt: '2026-08-31T12:02:00.000Z',
    confirmedBy: 'browser-operator',
  };
}

function responseBody(
  currentRun: AnyRecord | null,
  pairingState: string,
  savedBoard?: AnyRecord,
  calibration?: AnyRecord,
): AnyRecord {
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
    ...(currentRun?.blindReview?.choice ? {
      currentRun: {
        ...currentRun,
        editorialFeedback: savedBoard
          ? feedback(savedBoard, calibration ? rescueCalibrationDetails() : undefined)
          : currentRun.editorialFeedback,
      },
    } : {}),
  };
}

async function configureNetwork(page: Page): Promise<{
  auditRequests: AnyRecord[];
  calibrationRequests: AnyRecord[];
  exportRequests: AnyRecord[];
  getMediaUploads: () => number;
  getCollectionSyncRequests: () => AnyRecord[];
}> {
  let activeRunId: string | null = null;
  let savedBoard: AnyRecord | undefined;
  let calibrationConfirmed = false;
  let runNumber = 0;
  let revealed = false;
  const auditRequests: AnyRecord[] = [];
  const calibrationRequests: AnyRecord[] = [];
  const exportRequests: AnyRecord[] = [];
  const collectionSyncRequests: AnyRecord[] = [];
  let mediaUploads = 0;

  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      user: {
        accountId: 'browser-operator',
        email: 'operator@example.test',
        isAdmin: true,
      },
    }),
  }));
  await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      actorName: 'Browser Test Actor',
      actorShortNameEn: 'Browser Test Actor',
      vibeEmoji: '🧪',
      vibeLabel: 'Browser Calibration Vibe',
      vibeLabelEn: 'Browser Calibration Vibe',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      rankedBatches: [{ query: 'browser test', results: [] }],
      date: '2026-08-31',
    }),
  }));
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ state: 'inactive', isMember: false }),
  }));
  await page.route('**/.netlify/functions/image-proxy?*', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.route('**/api/collection/media?*', route => {
    mediaUploads += 1;
    const itemId = new URL(route.request().url()).searchParams.get('itemId') || '';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        media: {
          schemaVersion: 1,
          assetId: `11111111-1111-4111-8111-${String(mediaUploads).padStart(12, '0')}`,
          deliveryUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}.png`,
          thumbnailUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}-thumb.png`,
          mimeType: 'image/png',
          sizeBytes: 68,
          checksum: String(mediaUploads).padStart(64, 'a').slice(-64),
          dimensions: { width: 1, height: 1 },
          association: { type: 'collection', id: 'vibe-atlas', itemId },
        },
      }),
    });
  });
  await page.route('**/api/collection/sync', route => {
    const request = route.request().postDataJSON() as AnyRecord;
    collectionSyncRequests.push(request);
    const operation = request.operations[0];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cursor: collectionSyncRequests.length,
        items: [{ ...operation.item, id: 'rescue-grid-1', localId: operation.localId }],
        tombstones: [],
        mappings: { [operation.localId]: 'rescue-grid-server-1' },
        acknowledgedMutationIds: [operation.mutationId],
      }),
    });
  });
  await page.route('**/.netlify/functions/actor-audits**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      if (!url.searchParams.has('actorId')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            actors: [actor(calibrationConfirmed ? 'calibration_reaudit_required' : 'not_run')],
            releaseInventory: {
              schemaVersion: 1,
              timeZone: 'Asia/Shanghai',
              cutoff: '12:00',
              releaseReadyPairingCount: 1,
              freshCuratorPairingCount: 1,
              rescueBackupPairingCount: 0,
              rescueBackupBoardCount: 0,
              actorPacks: [{
                actorId: ACTOR_ID,
                actorName: 'Browser Test Actor',
                actorShortNameEn: 'Browser Test Actor',
                releaseReadyPairingCount: 1,
                freshCuratorPairingCount: 1,
                rescueBackupPairingCount: 0,
                rescueBackupBoardCount: 0,
                pairings: [{
                  vibeKey: VIBE_KEY,
                  vibeLabel: 'Browser Calibration Vibe',
                  freshCurator: true,
                  rescueBackupBoardCount: 0,
                }],
                 recentlyUsed: true,
                 recentDailyDropCount: 1,
                 recentDailyDropDates: ['2026-08-30'],
                 lastDailyDropDate: '2026-08-30',
              }],
            },
          }),
        });
        return;
      }
      const current = activeRunId
        ? run(activeRunId, revealed, activeRunId === 'run-2' && revealed)
        : null;
      const isFreshBlocked = activeRunId === 'run-2' && calibrationConfirmed && revealed;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(responseBody(
          isFreshBlocked ? run('run-2', true, true) : current,
          isFreshBlocked ? 'calibration_reaudit_required' : calibrationConfirmed ? 'calibration_reaudit_required' : 'not_run',
          activeRunId === 'run-1' ? savedBoard : undefined,
          calibrationConfirmed ? rescueCalibrationDetails() : undefined,
        )),
      });
      return;
    }

    const input = request.postDataJSON() as AnyRecord;
    auditRequests.push(input);
    if (input.action === 'run') {
      runNumber += 1;
      activeRunId = `run-${runNumber}`;
      revealed = false;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(responseBody(
          run(activeRunId, false),
          calibrationConfirmed ? 'calibration_reaudit_required' : 'blind_review_pending',
          undefined,
          calibrationConfirmed ? rescueCalibrationDetails() : undefined,
        )),
      });
      return;
    }
    if (input.action === 'blind_choice') {
      const selectedRunId = String(input.runId);
      const proof = selectedRunId === 'run-2';
      revealed = true;
      const revealedRun = run(selectedRunId, true, proof);
      if (selectedRunId === 'run-1' && savedBoard) {
        revealedRun.editorialFeedback = feedback(savedBoard, calibrationConfirmed ? rescueCalibrationDetails() : undefined);
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(responseBody(
          revealedRun,
          calibrationConfirmed ? 'calibration_reaudit_required' : 'comparison_unavailable',
          selectedRunId === 'run-1' ? savedBoard : undefined,
          calibrationConfirmed ? rescueCalibrationDetails() : undefined,
        )),
      });
      return;
    }
    if (input.action === 'save_rescue_board') {
      assert.equal(input.runId, 'run-1');
      assert.deepEqual(input.candidateIds, candidates().map(item => item.candidateId));
      const savedRun = run('run-1', true);
      savedBoard = {
        schemaVersion: 1,
        receiptId: RESCUE_RECEIPT_ID,
        runId: 'run-1',
        actorId: ACTOR_ID,
        vibeKey: VIBE_KEY,
        feedbackHash: 'browser-feedback-hash',
        board: { mode: 'operator_rescue', candidates: candidates() },
        savedAt: '2026-08-31T12:01:00.000Z',
        savedBy: 'browser-operator',
      };
      savedRun.editorialFeedback = feedback(savedBoard);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(responseBody(savedRun, 'needs_operator_verdict', savedBoard)),
      });
      return;
    }
    if (input.action === 'export_rescue_board') {
      exportRequests.push(input);
      assert.equal(input.runId, 'run-1');
      assert.equal(input.receiptId, RESCUE_RECEIPT_ID);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          rescueExport: {
            gridId: 'rescue-grid-1',
            runId: 'run-1',
            receiptId: RESCUE_RECEIPT_ID,
            arrangedAt: '2026-08-31T12:01:00.000Z',
            exportedAt: '2026-08-31T12:02:00.000Z',
            actor: { id: ACTOR_ID, name: 'Browser Test Actor', nameEn: 'Browser Test Actor', accentColor: '#123456' },
            vibe: {
              key: VIBE_KEY,
              label: 'Browser Calibration Vibe',
              labelEn: 'Browser Calibration Vibe',
              emoji: '🧪',
              subtitle: '',
              subtitleEn: '',
              searchSpell: 'browser calibration query',
            },
            candidates: candidates(),
          },
        }),
      });
      return;
    }
    if (input.action === 'mark_rescue_calibration') {
      calibrationRequests.push(input);
      assert.equal(input.runId, 'run-1');
      assert.equal(input.receiptId, RESCUE_RECEIPT_ID);
      calibrationConfirmed = true;
      const markedRun = run('run-1', true);
      markedRun.editorialFeedback = feedback(savedBoard, rescueCalibrationDetails());
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...responseBody(markedRun, 'calibration_reaudit_required', savedBoard, rescueCalibrationDetails()),
          actor: actor('calibration_reaudit_required'),
          pairing: actor('calibration_reaudit_required').pairings[0],
        }),
      });
      return;
    }
    throw new Error(`Unexpected actor audit action: ${String(input.action)}`);
  });

  return {
    auditRequests,
    calibrationRequests,
    exportRequests,
    getMediaUploads: () => mediaUploads,
    getCollectionSyncRequests: () => collectionSyncRequests,
  };
}

function completeCompiledHeroReviewRun(runId = 'complete-hero-review'): AnyRecord {
  const retained = candidates();
  const compiledProposal = board('compiled', retained);
  compiledProposal.promise.heroFulfillment = 0;
  const result = run(runId, true);
  result.blindReview = {
    status: 'unavailable',
    presentationOrder: ['event', 'compiled'],
    boards: [],
  };
  result.strongestEvent = null;
  result.strongestCompiled = null;
  result.winner = null;
  result.alternate = null;
  result.boardDiagnostics = {
    event: {
      available: false,
      completeProposalAvailable: false,
      proposal: null,
      requiredCount: 9,
      candidateCount: 0,
      usableCount: 0,
      summary: 'No complete Event proposal formed.',
    },
    compiled: {
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
    },
  };
  result.rawResults = retained;
  result.rejections = [];
  result.completeProposalCardCount = 9;
  result.displayCount = 0;
  result.editorialFeedback = feedback();
  return result;
}

async function configureCompleteHeroReviewNetwork(
  page: Page,
  { staleOnVerdict = false, newerRunOnVerdict = false, newerRunOnRescueSave = false }: {
    staleOnVerdict?: boolean;
    newerRunOnVerdict?: boolean;
    newerRunOnRescueSave?: boolean;
  } = {},
): Promise<{
  saveRequests: AnyRecord[];
  verdictRequests: AnyRecord[];
}> {
  let savedBoard: AnyRecord | undefined;
  let newerRunCurrent = false;
  const saveRequests: AnyRecord[] = [];
  const verdictRequests: AnyRecord[] = [];

  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      user: {
        accountId: 'browser-operator',
        email: 'operator@example.test',
        isAdmin: true,
      },
    }),
  }));
  await page.route('**/.netlify/functions/star-of-day**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      actorName: 'Browser Test Actor',
      actorShortNameEn: 'Browser Test Actor',
      vibeEmoji: '🧪',
      vibeLabel: 'Browser Calibration Vibe',
      vibeLabelEn: 'Browser Calibration Vibe',
      vibeSubtitle: '',
      vibeSubtitleEn: '',
      rankedBatches: [{ query: 'browser test', results: [] }],
      date: '2026-08-31',
    }),
  }));
  await page.route('**/api/membership/status', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ state: 'inactive', isMember: false }),
  }));
  await page.route('**/.netlify/functions/image-proxy?*', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  }));
  let mediaUploads = 0;
  await page.route('**/api/collection/media?*', route => {
    mediaUploads += 1;
    const itemId = new URL(route.request().url()).searchParams.get('itemId') || '';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        media: {
          schemaVersion: 1,
          assetId: `11111111-1111-4111-8111-${String(mediaUploads).padStart(12, '0')}`,
          deliveryUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}.png`,
          thumbnailUrl: `https://media.justlikekatie.com/images/sha256/rescue-${mediaUploads}-thumb.png`,
          mimeType: 'image/png',
          sizeBytes: 68,
          checksum: String(mediaUploads).padStart(64, 'a').slice(-64),
          dimensions: { width: 1, height: 1 },
          association: { type: 'collection', id: 'vibe-atlas', itemId },
        },
      }),
    });
  });
  await page.route('**/api/collection/sync', route => {
    const operation = (route.request().postDataJSON() as AnyRecord).operations[0];
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        cursor: 1,
        items: [{ ...operation.item, id: 'rescue-grid-1', localId: operation.localId }],
        tombstones: [],
        mappings: { [operation.localId]: 'rescue-grid-server-1' },
        acknowledgedMutationIds: [operation.mutationId],
      }),
    });
  });
  await page.route('**/.netlify/functions/actor-audits**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') {
      if (!url.searchParams.has('actorId')) {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            actors: [actor('needs_operator_verdict')],
            releaseInventory: {
              schemaVersion: 1,
              timeZone: 'Asia/Shanghai',
              cutoff: '12:00',
              releaseReadyPairingCount: 0,
              freshCuratorPairingCount: 0,
              rescueBackupPairingCount: 0,
              rescueBackupBoardCount: 0,
              actorPacks: [],
            },
          }),
        });
        return;
      }
      const currentRun = completeCompiledHeroReviewRun(newerRunCurrent
        ? 'newer-current-audit'
        : 'complete-hero-review');
      if (savedBoard && !newerRunCurrent) currentRun.editorialFeedback = feedback(savedBoard);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
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
        }),
      });
      return;
    }

    const input = request.postDataJSON() as AnyRecord;
    if (input.action === 'save_rescue_board') {
      saveRequests.push(input);
      assert.equal(input.runId, 'complete-hero-review');
      if (newerRunOnRescueSave) {
        newerRunCurrent = true;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Only the current audit run can save an Operator Rescue Board.',
          }),
        });
        return;
      }
      const retainedById = new Map(candidates().map(item => [item.candidateId, item]));
      savedBoard = {
        schemaVersion: 1,
        receiptId: RESCUE_RECEIPT_ID,
        runId: 'complete-hero-review',
        actorId: ACTOR_ID,
        vibeKey: VIBE_KEY,
        feedbackHash: 'browser-feedback-hash',
        board: {
          mode: 'operator_rescue',
          candidates: input.candidateIds.map((candidateId: string) => retainedById.get(candidateId)),
        },
        savedAt: '2026-08-31T12:01:00.000Z',
        savedBy: 'browser-operator',
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          actor: actor('needs_operator_verdict'),
          pairing: actor('needs_operator_verdict').pairings[0],
          actorId: ACTOR_ID,
          vibeKey: VIBE_KEY,
          currentRun: {
            ...completeCompiledHeroReviewRun(),
            editorialFeedback: feedback(savedBoard),
          },
          priorRuns: [],
          verdict: null,
          notes: '',
          verdictAt: null,
          calibrationProfile: null,
        }),
      });
      return;
    }
    if (input.action === 'export_rescue_board') {
      assert.equal(input.runId, 'complete-hero-review');
      assert.equal(input.receiptId, RESCUE_RECEIPT_ID);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          rescueExport: {
            gridId: 'rescue-grid-1',
            runId: 'complete-hero-review',
            receiptId: RESCUE_RECEIPT_ID,
            arrangedAt: '2026-08-31T12:01:00.000Z',
            exportedAt: '2026-08-31T12:02:00.000Z',
            actor: { id: ACTOR_ID, name: 'Browser Test Actor', nameEn: 'Browser Test Actor', accentColor: '#123456' },
            vibe: { key: VIBE_KEY, label: 'Browser Calibration Vibe', labelEn: 'Browser Calibration Vibe', emoji: '🧪', subtitle: '', subtitleEn: '', searchSpell: 'browser calibration query' },
            candidates: candidates(),
          },
        }),
      });
      return;
    }
    if (input.action === 'verdict') {
      verdictRequests.push(input);
      assert.equal(input.runId, 'complete-hero-review');
      assert.equal(input.verdict, 'approved');
      assert.equal(input.vibeConfirmed, true);
      assert.equal(input.publishableConfirmed, true);
      assert.equal(input.rescuePreferred, true);
      assert.equal(input.rescueReceiptId, RESCUE_RECEIPT_ID);
      assert.ok(savedBoard, 'the scheduling verdict must follow the rescue-board save');
      if (newerRunOnVerdict) {
        assert.equal(input.notes, 'Keep this decision while the newer audit is reviewed.');
        newerRunCurrent = true;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'A newer audit run became current. Review that run before scheduling.',
          }),
        });
        return;
      }
      if (staleOnVerdict) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'The selected rescue board is stale or unavailable. Rebuild and save it from the current image choices before recording this approval.',
          }),
        });
        return;
      }
      const approvedRun = {
        ...completeCompiledHeroReviewRun(),
        editorialFeedback: feedback(savedBoard),
        operatorVerdict: {
          verdict: 'approved',
          notes: input.notes,
          vibeConfirmed: true,
          publishableConfirmed: true,
          rescuePreference: {
            preferred: true,
            rescueReceiptId: RESCUE_RECEIPT_ID,
          },
          publicationSource: {
            type: 'operator_rescue',
            rescueReceiptId: RESCUE_RECEIPT_ID,
            boardHash: 'browser-rescue-board-hash',
            feedbackHash: 'browser-feedback-hash',
          },
        },
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          actor: actor('needs_operator_verdict', true),
          pairing: actor('needs_operator_verdict', true).pairings[0],
          actorId: ACTOR_ID,
          vibeKey: VIBE_KEY,
          currentRun: approvedRun,
          priorRuns: [],
          verdict: 'approved',
          notes: input.notes,
          calibrationProfile: null,
        }),
      });
      return;
    }
    throw new Error(`Unexpected complete hero review action: ${String(input.action)}`);
  });

  return { saveRequests, verdictRequests };
}

test('a signed-in operator saves a rescue board to Collection without calibrating it', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const {
    auditRequests,
    calibrationRequests,
    exportRequests,
    getMediaUploads,
    getCollectionSyncRequests,
  } = await configureNetwork(page);

  try {
    await page.goto(`${origin}/vibe-atlas?admin=true`);
    await page.getByRole('heading', { name: 'Release Desk', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Inventory', exact: true }).waitFor();
    assert.equal(await page.getByText('1', { exact: true }).first().isVisible(), true);
    assert.equal(await page.getByText(/12:00 PM Asia\/Shanghai/).isVisible(), true);
    assert.equal(await page.getByText('Actor repeat watch', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Last Daily Drop · Aug 30, 2026', { exact: true }).isVisible(), true);

    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();
    await page.getByRole('button', { name: 'Run audit', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Compiled', exact: true }).click();
    await page.getByRole('button', { name: 'Choose nine to save', exact: true }).waitFor();

    const addButtons = page.getByRole('button', { name: /Add$/ });
    for (let index = 0; index < 9; index += 1) {
      await addButtons.first().click();
    }
    await page.getByRole('button', { name: 'Save my nine to Collection', exact: true }).click();
    await page.getByText('Rescue board saved and synced to Collection.', { exact: false }).waitFor();
    await page.getByText('Saved rescue records', { exact: true }).waitFor();
    assert.equal(
      await page.getByText('Each record is immutable and saves to Collection automatically.', { exact: false }).isVisible(),
      true,
      'the saved record should explain its automatic Collection persistence',
    );
    assert.equal(exportRequests.length, 1, 'saving the board should export its exact receipt');
    assert.equal(getMediaUploads(), 9, 'all nine rescue images should be copied into MEDIA');
    assert.equal(getCollectionSyncRequests().length, 1, 'the saved rescue grid should sync to the operator account');
    assert.equal(getCollectionSyncRequests()[0].operations.length, 1, 'only the rescue grid should be synced');
    assert.equal(getCollectionSyncRequests()[0].operations[0].item.id, 'rescue-grid-1');
    assert.equal(
      await page.getByRole('button', { name: 'Use as calibration evidence', exact: true }).count(),
      2,
      'calibration must be an explicit action on the saved receipt',
    );
    assert.equal(
      auditRequests.filter(request => request.action === 'mark_rescue_calibration').length,
      0,
      'saving a rescue board must not calibrate it implicitly',
    );

    await page.getByRole('tab', { name: 'Release Desk', exact: true }).click();
    const savedGrid = page.getByLabel('Saved FANDOM grid');
    await savedGrid.waitFor();
    assert.equal(await savedGrid.inputValue(), 'rescue-grid-1', 'the rescue grid should be selectable for Workstation handoff');
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();

    await page.getByRole('button', { name: 'Use as calibration evidence', exact: true }).first().click();
    await page.getByRole('button', { name: 'Calibration evidence confirmed', exact: true }).first().waitFor();
    assert.equal(calibrationRequests.length, 1, 'one explicit calibration confirmation should be recorded');
    assert.equal(
      await page.getByRole('button', { name: 'Calibration evidence confirmed', exact: true }).first().isDisabled(),
      true,
      'confirmed calibration evidence must be immutable in the operator UI',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Use as calibration evidence', exact: true }).count(),
      0,
      'a confirmed receipt must not offer a second mutable calibration action',
    );

    await page.getByRole('button', { name: 'Run audit', exact: true }).click();
    await page.getByRole('button', { name: 'Choose Compiled', exact: true }).click();
    const signalDetails = page.locator('details').filter({ hasText: 'Operator-derived curation signals' });
    const proofDetails = page.locator('details').filter({ hasText: 'Calibration transfer proof' });
    await signalDetails.locator('summary').click();
    await proofDetails.locator('summary').click();
    assert.match(await signalDetails.locator('pre').innerText(), /same_evidence_uncalibrated_control/);
    assert.match(await signalDetails.locator('pre').innerText(), /beyondExactSavedNineEffectCount/);
    assert.match(await proofDetails.locator('pre').innerText(), /reaudit_not_yet_reproduced/);
    assert.equal(
      await page.getByText('Calibration reaudit required', { exact: true }).count() > 0,
      true,
      'the pairing must stay blocked when no transferable proof is reproduced',
    );
    assert.equal(
      await page.getByRole('button', { name: 'Save scheduling verdict', exact: true }).count(),
      0,
      'the blocked pairing must not expose scheduling approval controls',
    );
    assert.equal(
      auditRequests.filter(request => request.action === 'run').length,
      2,
      'the fresh audit must be a distinct audit request after calibration confirmation',
    );
  } finally {
    await browser.close();
    await server.close();
  }
});

test('a stale rescue approval keeps the recovery form visible without showing publication success', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const { saveRequests, verdictRequests } = await configureCompleteHeroReviewNetwork(page, { staleOnVerdict: true });

  try {
    await page.goto(`${origin}/vibe-atlas?admin=true`);
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();

    await page.getByRole('button', { name: 'Save my nine to Collection', exact: true }).click();
    await page.getByText('Saved rescue records', { exact: true }).waitFor();
    await page.getByLabel('Publication decision').selectOption('approved');
    const vibeConfirmation = page.getByLabel('Yes, that’s the Vibe.');
    const publishableConfirmation = page.getByLabel('Yes, this is publishable.');
    await vibeConfirmation.check();
    await publishableConfirmation.check();
    const receiptSelect = page.getByLabel('Approved retained-evidence receipt');
    await receiptSelect.selectOption(RESCUE_RECEIPT_ID);

    const verdictButton = page.getByRole('button', { name: 'Save scheduling verdict', exact: true });
    assert.equal(await verdictButton.isEnabled(), true);
    await verdictButton.click();
    await page.getByText(
      'The selected rescue board is stale or unavailable. Rebuild and save it from the current image choices before recording this approval.',
      { exact: true },
    ).waitFor();

    assert.equal(verdictRequests.length, 1, 'the selected receipt must be submitted before the conflict is shown');
    assert.equal(await receiptSelect.isVisible(), true, 'the selected receipt must remain available for recovery');
    assert.equal(await receiptSelect.inputValue(), RESCUE_RECEIPT_ID);
    assert.equal(await vibeConfirmation.isVisible(), true);
    assert.equal(await vibeConfirmation.isChecked(), true);
    assert.equal(await publishableConfirmation.isVisible(), true);
    assert.equal(await publishableConfirmation.isChecked(), true);
    assert.equal(await page.locator('[class*="approvalOutcome"]').count(), 0, 'a stale approval must not show a publication outcome');
    assert.equal(
      await page.getByText('Exact nine-card retained-evidence board approved for publication with both human confirmations.', { exact: true }).count(),
      0,
      'a stale approval must not show publication success',
    );
    assert.equal(saveRequests.length, 1);
  } finally {
    await browser.close();
    await server.close();
  }
});

test('a newer current audit keeps the approval draft intact until the operator refreshes', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const { saveRequests, verdictRequests } = await configureCompleteHeroReviewNetwork(page, {
    newerRunOnVerdict: true,
  });

  try {
    await page.goto(`${origin}/vibe-atlas?admin=true`);
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();

    await page.getByRole('button', { name: 'Save my nine to Collection', exact: true }).click();
    await page.getByText('Saved rescue records', { exact: true }).waitFor();
    await page.getByLabel('Publication decision').selectOption('approved');
    const notes = page.getByLabel('Operator notes');
    const vibeConfirmation = page.getByLabel('Yes, that’s the Vibe.');
    const publishableConfirmation = page.getByLabel('Yes, this is publishable.');
    await notes.fill('Keep this decision while the newer audit is reviewed.');
    await vibeConfirmation.check();
    await publishableConfirmation.check();
    const receiptSelect = page.getByLabel('Approved retained-evidence receipt');
    await receiptSelect.selectOption(RESCUE_RECEIPT_ID);

    const verdictButton = page.getByRole('button', { name: 'Save scheduling verdict', exact: true });
    assert.equal(await verdictButton.isEnabled(), true);
    await verdictButton.click();
    await page.getByText(
      'A newer audit run became current. Review that run before scheduling.',
      { exact: true },
    ).waitFor();

    assert.equal(verdictRequests.length, 1, 'the verdict must be submitted before the current-run conflict is shown');
    assert.equal(await page.getByLabel('Publication decision').inputValue(), 'approved');
    assert.equal(await notes.inputValue(), 'Keep this decision while the newer audit is reviewed.');
    assert.equal(await receiptSelect.inputValue(), RESCUE_RECEIPT_ID);
    assert.equal(await vibeConfirmation.isVisible(), true);
    assert.equal(await vibeConfirmation.isChecked(), true);
    assert.equal(await publishableConfirmation.isVisible(), true);
    assert.equal(await publishableConfirmation.isChecked(), true);
    assert.equal(await page.locator('[class*="approvalOutcome"]').count(), 0, 'a current-run conflict must not show a publication outcome');
    assert.equal(
      await page.getByText('Exact nine-card retained-evidence board approved for publication with both human confirmations.', { exact: true }).count(),
      0,
      'a current-run conflict must not show publication success',
    );
    assert.equal(saveRequests.length, 1);

    await page.reload();
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();
    await page.getByText('Audit evidence · newer-current-audit', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Publication decision').inputValue(), '');
    assert.equal(await page.getByLabel('Operator notes').inputValue(), '');
  } finally {
    await browser.close();
    await server.close();
  }
});

test('a newer current audit keeps the rescue-board arrangement intact until the operator refreshes', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const { saveRequests } = await configureCompleteHeroReviewNetwork(page, {
    newerRunOnRescueSave: true,
  });

  try {
    await page.goto(`${origin}/vibe-atlas?admin=true`);
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();

    const rescueBoard = page.getByLabel('Editable rescue board');
    await rescueBoard.waitFor();
    await page.getByRole('button', { name: 'Move card 1 later', exact: true }).click();
    await page.getByRole('button', { name: 'Make card 1 the hero', exact: true }).click();

    const boardTitles = () => rescueBoard.locator('article a').allInnerTexts();
    const heroTitle = () => rescueBoard.locator('[data-hero="true"] a').innerText();
    const beforeSaveTitles = await boardTitles();
    const beforeSaveHero = await heroTitle();
    assert.equal(beforeSaveTitles.length, 9, 'the rescue draft must contain nine chosen cards');
    assert.equal(beforeSaveHero, 'Hero · Browser evidence card 2');
    assert.equal(
      await page.locator('button[aria-pressed="true"]').count(),
      9,
      'the rescue picker must keep all nine choices visible',
    );

    await page.getByRole('button', { name: 'Save my nine to Collection', exact: true }).click();
    await page.getByText(
      'Only the current audit run can save an Operator Rescue Board.',
      { exact: true },
    ).waitFor();

    assert.equal(saveRequests.length, 1, 'the rescue board must be submitted before the conflict is shown');
    assert.deepEqual(await boardTitles(), beforeSaveTitles, 'the chosen card order must survive the conflict');
    assert.equal(await heroTitle(), beforeSaveHero, 'the chosen hero position must survive the conflict');
    assert.equal(
      await page.locator('button[aria-pressed="true"]').count(),
      9,
      'the chosen nine must remain visible after the conflict',
    );
    assert.equal(
      await page.getByText('Saved rescue records', { exact: true }).count(),
      0,
      'a current-run conflict must not show saved-board success',
    );
    assert.equal(
      await page.getByText('Operator Rescue Board saved as a separate append-only receipt.', { exact: false }).count(),
      0,
      'a current-run conflict must not show the rescue save success notice',
    );
    await page.getByText('Audit evidence · complete-hero-review', { exact: true }).waitFor();

    await page.reload();
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();
    await page.getByText('Audit evidence · newer-current-audit', { exact: true }).waitFor();
    assert.equal(
      await page.getByText('Saved rescue records', { exact: true }).count(),
      0,
      'refreshing must reveal the newer run rather than a falsely saved board',
    );
  } finally {
    await browser.close();
    await server.close();
  }
});

test('an admin can hand off a complete compiled proposal that needs hero review', { timeout: 60_000 }, async () => {
  const { server, origin } = await startApp();
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const { saveRequests, verdictRequests } = await configureCompleteHeroReviewNetwork(page);

  try {
    await page.goto(`${origin}/vibe-atlas?admin=true`);
    await page.getByRole('tab', { name: 'Actor Preflight Lab', exact: true }).click();
    await page.getByRole('heading', { name: 'Actor preflight lab' }).waitFor();

    const qualification = page.getByLabel('Board qualification diagnostics');
    await qualification.getByText('Compiled complete board · Hero review needed', { exact: true }).waitFor();
    assert.equal(await qualification.getByText('Event proposal missing', { exact: true }).isVisible(), true);
    assert.equal(await qualification.getByText('Compiled complete board · Hero review needed', { exact: true }).isVisible(), true);

    const publicationReadyLabel = page.getByText('automatically publication-ready cards', { exact: true });
    const publicationReadyCount = publicationReadyLabel.locator('xpath=preceding-sibling::strong[1]');
    assert.equal(await publicationReadyCount.innerText(), '0');

    const rescueBoard = page.locator('[aria-label="Editable rescue board"]');
    assert.deepEqual(
      (await rescueBoard.locator('a').allInnerTexts()).map(title => title.replace(/^Hero · /, '')),
      candidates().map(item => item.title),
      'the editable rescue board must start with the exact proposed nine',
    );
    assert.equal(
      (await rescueBoard.locator('[data-hero="true"] a').innerText()).replace(/^Hero · /, ''),
      candidate(4).title,
      'the proposed fifth card must be the initial hero slot',
    );

    await page.getByRole('button', { name: 'Move card 1 later', exact: true }).click();
    await page.getByRole('button', { name: 'Make card 2 the hero', exact: true }).click();

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
    ];
    assert.deepEqual(
      (await rescueBoard.locator('a').allInnerTexts()).map(title => title.replace(/^Hero · /, '')),
      expectedIds.map(candidateId => candidates().find(item => item.candidateId === candidateId)?.title),
      'hero replacement and card reorder must update the live rescue board',
    );
    assert.equal(
      (await rescueBoard.locator('[data-hero="true"] a').innerText()).replace(/^Hero · /, ''),
      candidate(0).title,
    );

    const saveButton = page.getByRole('button', { name: 'Save my nine to Collection', exact: true });
    assert.equal(await saveButton.isEnabled(), true, 'the complete edited board must enable saving');
    await saveButton.click();
    await page.getByText('Saved rescue records', { exact: true }).waitFor();
    assert.equal(saveRequests.length, 1);
    assert.deepEqual(saveRequests[0].candidateIds, expectedIds, 'the handoff must save the exact edited board');

    await page.getByLabel('Publication decision').selectOption('approved');
    await page.getByLabel('Yes, that’s the Vibe.').check();
    await page.getByLabel('Yes, this is publishable.').check();
    const receiptSelect = page.getByLabel('Approved retained-evidence receipt');
    await receiptSelect.selectOption(RESCUE_RECEIPT_ID);
    assert.equal(await receiptSelect.inputValue(), RESCUE_RECEIPT_ID);

    const verdictButton = page.getByRole('button', { name: 'Save scheduling verdict', exact: true });
    assert.equal(await verdictButton.isEnabled(), true, 'both publication checks and the selected receipt must enable approval');
    await verdictButton.click();
    await page.getByText(
      'Exact nine-card retained-evidence board approved for publication with both human confirmations.',
      { exact: true },
    ).waitFor();
    assert.equal(verdictRequests.length, 1);
    assert.deepEqual(verdictRequests[0], {
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
    }, 'approval must submit the exact selected rescue receipt');
    assert.equal(
      await page.getByText(`Exact approved receipt ${RESCUE_RECEIPT_ID.slice(0, 8)} is the publication board.`, { exact: true }).isVisible(),
      true,
      'the approved receipt must remain the publication source after submission',
    );
  } finally {
    await browser.close();
    await server.close();
  }
});