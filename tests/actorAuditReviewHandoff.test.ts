import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.join(dirname, '../src/components/FandomAdmin/ActorPreflightLab.tsx'),
  'utf8',
);
const releaseDeskSource = readFileSync(
  path.join(dirname, '../src/components/FandomAdmin/ReleaseDesk.tsx'),
  'utf8',
);

function functionBody(name: string): string {
  const start = source.indexOf(`async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
      opened = true;
    } else if (source[index] === '}') {
      depth -= 1;
      if (opened && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not read ${name}`);
}

const startAudit = functionBody('startAudit');
const markRescueCalibration = functionBody('markRescueCalibration');
const saveRescueBoard = functionBody('saveRescueBoard');
const saveRescueReceiptToCollection = functionBody('saveRescueReceiptToCollection');
const requestedReviewStart = source.indexOf('function RequestedGridReview');
const requestedReviewEnd = source.indexOf('\nfunction PartialBoards', requestedReviewStart);
const requestedReview = source.slice(requestedReviewStart, requestedReviewEnd);

test('a completed actor audit reloads its authoritative saved review', () => {
  const runRequest = startAudit.indexOf("api({action:'run'");
  const detailRequest = startAudit.indexOf('api(undefined,{actorId,vibeKey})');
  assert.ok(runRequest >= 0, 'the audit must first be started');
  assert.ok(detailRequest > runRequest, 'the saved detail must be fetched after the audit completes');
  assert.match(startAudit, /refreshed\.currentRun\?\.runId===startedRunId/);
});

test('a success notice requires two complete pending boards and moves them into view', () => {
  assert.match(startAudit, /boards\.length===2/);
  assert.match(startAudit, /item\.board\?\.candidates/);
  assert.match(startAudit, /item\.board\.candidates\.length>=9/);
  assert.match(startAudit, /getElementById\('actor-audit-evidence'\)\?\.scrollIntoView/);
  assert.match(source, /id="actor-audit-evidence"/);
});

test('an unavailable comparison is not described as ready for a blind choice', () => {
  assert.match(startAudit, /status==='unavailable'/);
  assert.match(startAudit, /did not produce two complete boards/);
  assert.match(startAudit, /Choose between the two boards below/);
  assert.match(source, /function PartialBoards/);
  assert.match(source, /Complete nine-card proposal/);
  assert.match(source, /automated gate not passed/);
  assert.match(source, /older audit format did not retain its exact arrangement/);
  assert.match(source, /displayable retained images/);
  assert.match(source, /complete proposal cards/);
  assert.match(source, /automatically publication-ready cards/);
  assert.doesNotMatch(source, /No candidate board reached nine images/);
  assert.match(source, /function BoardQualificationSummary/);
  assert.match(source, /proposal missing/);
  assert.match(source, /diagnostic\?\.summary/);
  const unavailableStart = source.indexOf("review?.status === 'unavailable'");
  const unavailableEnd = source.indexOf(': <section', unavailableStart);
  const unavailableBranch = source.slice(unavailableStart, unavailableEnd);
  assert.match(unavailableBranch, /<RunnerUpDiagnostics run=\{run\}/);
  assert.match(source, /aria-label="Runner-up availability"/);
  assert.match(source, /diagnostics\[mode\]\?\.summary/);
  assert.match(source, /No meaningful \$\{mode === 'event' \? 'Event' : 'Compiled'\} runner-up/);
});

test('retained evidence exposes image-level editorial intents after review', () => {
  assert.match(source, /action:'flag_candidate'/);
  assert.match(source, /Pin for board/);
  assert.match(source, /Hero candidate/);
  assert.match(source, /Good supporting card/);
  assert.match(source, /Exclude/);
  assert.match(source, /Optional: dispute the system’s rejection label/);
  assert.match(source, /Save classification dispute/);
  assert.match(source, /className=\{styles.resultVisual\}/);
  assert.match(source, /className=\{styles.resultSourceLink\}/);
  assert.match(source, /Pin this image/);
  assert.match(source, /flag\?\.reasons/);
});

test('the rescue board is a manual operator override without changing the frozen audit', () => {
  assert.match(source, /Operator rescue board/);
  assert.match(source, /This is your override/);
  assert.match(source, /Choose your nine/);
  assert.match(source, /Only unavailable images and your exclusions stay out/);
  assert.match(source, /The original audit and Daily Drop eligibility never change/);
  assert.match(source, /disabled=\{!isCurrent/);
  assert.match(source, /action:'save_rescue_board'/);
  assert.match(source, /Save my nine/);
  assert.match(source, /Clear board/);
  assert.match(source, /Make card \$\{index\+1\} the hero/);
  assert.match(source, /Move card \$\{index\+1\} earlier/);
  assert.match(source, /savedMatchesCurrentFeedback/);
  assert.match(source, /previous saved arrangement is retained as history/);
});

test('the Release Desk shows grouped release depth and the Shanghai noon cutoff', () => {
  assert.match(releaseDeskSource, /<h3 id="release-desk-title">Release Desk<\/h3>/);
  assert.match(releaseDeskSource, /<h4 id="release-inventory-title">Inventory<\/h4>/);
  assert.match(releaseDeskSource, /release-ready actor × Vibe pairings/);
  assert.match(releaseDeskSource, /fresh-curator pairings/);
  assert.match(releaseDeskSource, /explicit publishable rescue boards/);
  assert.match(releaseDeskSource, /Actor repeat watch/);
  assert.match(releaseDeskSource, /Pair repeat ·/);
  assert.match(releaseDeskSource, /Last actor Daily Drop/);
  assert.match(releaseDeskSource, /12:00 PM Asia\/Shanghai/);
  assert.match(releaseDeskSource, /inventory\.actorPacks/);
  assert.doesNotMatch(source, /ReleaseInventory|releaseInventory/);
});

test('saved rescue history exposes immutable records and Collection exports', () => {
  assert.match(saveRescueBoard, /saveRescueReceiptToCollection\(currentRun\.runId,receiptId\)/);
  assert.match(saveRescueReceiptToCollection, /action:'export_rescue_board'/);
  assert.match(saveRescueReceiptToCollection, /dbSaveGrid\(grid\)/);
  assert.match(saveRescueReceiptToCollection, /persistGridImagesToMedia\(grid\)/);
  assert.match(saveRescueReceiptToCollection, /getPublicSession\(\)/);
  assert.match(saveRescueReceiptToCollection, /syncPublicGrid\(session,grid\.id\)/);
  assert.match(source, /operatorRescueBoards/);
  assert.match(source, /Saved rescue records/);
  assert.match(source, /Each record is immutable and saves to Collection automatically/);
  assert.match(source, /Retry Collection save/);
  assert.match(source, /Viewing saved arrangement/);
  assert.match(source, /Use as starting point/);
  assert.match(source, /read-only record/);
  const draftSeedStart = requestedReview.indexOf('const initialCandidates');
  const draftSeedEnd = requestedReview.indexOf('const [candidates', draftSeedStart);
  const draftSeed = requestedReview.slice(draftSeedStart, draftSeedEnd);
  assert.match(draftSeed, /reviewCandidates/);
  assert.doesNotMatch(draftSeed, /saved|operatorRescueBoard/);
  assert.match(source, /savedMatchesCurrentFeedback&&saved/);
  assert.match(source, /Save my nine to Collection/);
  assert.match(source, /resultId: candidate\.candidateId/);
  assert.match(source, /gridPosition/);
});

test('legacy audits are visibly historical and require a fresh audit', () => {
  assert.match(source, /Legacy audit · retained history/);
  assert.match(source, /Retained history — invalid under the current profile contract/);
  assert.match(source, /This board is preserved as historical evidence only/);
  assert.match(source, /cannot establish Daily Drop eligibility/);
  assert.match(source, /Run a fresh audit/);
  assert.match(source, /currentRun\?\.auditContract\?\.isLegacy/);
  assert.match(source, /freshAuditButton/);
  assert.match(source, /legacyBoardReview/);
});

test('rescue calibration is explicit, future-facing, and reports transfer proof', () => {
  assert.match(markRescueCalibration, /action:'mark_rescue_calibration'/);
  assert.match(markRescueCalibration, /fresh audit must reproduce its signals beyond these exact nine/i);
  assert.match(source, /Rescue learning used in this fresh audit/);
  assert.match(source, /Learned rescue queries used/);
  assert.match(source, /Calibration-backed supporting cards/);
  assert.match(source, /supportingAdmissionEvidence/);
  assert.match(source, /Failed transfer remains visible/);
  assert.match(source, /Calibration remains a separate choice/i);
  assert.match(source, /Use as calibration evidence/);
  assert.match(source, /calibrationEvidence/);
  assert.match(source, /Operator-derived curation signals/);
  assert.match(source, /Calibration transfer proof/);
  assert.match(source, /calibration_reaudit_required/);
  assert.match(source, /Legacy evidence · records only/);
  assert.match(source, /run\.auditContract\?\.isLegacy/);
});
