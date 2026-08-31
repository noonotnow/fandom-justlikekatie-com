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
  assert.match(source, /Available candidate board/);
  assert.match(source, /function BoardQualificationSummary/);
  assert.match(source, /board missing/);
  assert.match(source, /diagnostic\?\.summary/);
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

test('the rescue board explains hard blocks and preserves the frozen audit boundary', () => {
  assert.match(source, /Operator rescue board/);
  assert.match(source, /find a usable equivalent/);
  assert.match(source, /This never changes the frozen audit or Daily Drop eligibility/);
  assert.match(source, /disabled=\{!isCurrent/);
  assert.match(source, /action:'save_rescue_board'/);
  assert.match(source, /Save this arrangement/);
  assert.match(source, /Move card \$\{index\+1\} earlier/);
  assert.match(source, /savedMatchesCurrentFeedback/);
  assert.match(source, /previous saved arrangement is retained as history/);
});