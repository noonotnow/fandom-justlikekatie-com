import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/components/Plan/Plan.tsx', import.meta.url),
  'utf8',
);

test('PLAN drawer uses operator-facing lifecycle copy and an accessible confirmation action', () => {
  assert.match(source, /'Mark operator scheduled'/);
  assert.match(source, /already scheduled this exact post in Creator/);
  assert.match(source, /keep Status Approved and the current ScheduledDate/);
  assert.match(source, /Add public URL in XHS Admin/);
  assert.match(source, /aria-labelledby="publication-lifecycle-title"/);
  assert.match(source, /Backfill URL\/metrics|effectiveNextAction/);
});

test('PLAN UI does not expose internal execution ceremony language', () => {
  assert.doesNotMatch(
    source,
    /\b(attestation|manifest|batch|item hash|claim token|release acknowledgement|approval ceremony)\b/i,
  );
});
