import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/components/FandomAdmin/ActorPreflightLab.tsx', import.meta.url),
  'utf8',
);

test('cache comparison receipts cannot remain attributed to a different actor, Vibe, or scope', () => {
  assert.match(source, /cacheDiagnostic\?\.actorId===actorId/);
  assert.match(source, /cacheDiagnostic\?\.vibeKey===vibeKey/);
  assert.match(source, /cacheDiagnostic\?\.scope===scope/);
  assert.match(source, /cacheDiagnostics\[scope\]/);
  assert.match(source, /setCacheDiagnostics\(result\.cacheDiagnostics \?\? \{\}\)/);
  assert.match(source, /cacheDiagnostic\?\.actorId===actorId&&cacheDiagnostic\?\.vibeKey===vibeKey&&cacheDiagnostic\?\.scope===scope/);
  assert.match(source, /\{visibleCacheDiagnostic&&<details/);
  assert.doesNotMatch(source, /\{cacheDiagnostic&&<details/);
});

test('failed cache comparisons only reuse a current unexpired reservation', () => {
  assert.match(source, /queryContract\?\.status==='current'/);
  assert.match(source, /comparisons\?\.some\(\(item:AnyRecord\)=>item\.normalError\|\|item\.bypassedError\)/);
  assert.match(source, /visibleCacheDiagnostic\?\.comparisonId/);
  assert.match(source, /Date\.parse\(visibleCacheDiagnostic\?\.reservationExpiresAt\)>Date\.now\(\)/);
  assert.match(source, /comparisonId:manifest\.comparisonId/);
  assert.match(source, /reservationExpiresAt:diagnostic\.reservationExpiresAt/);
});

test('historical cache proof shows added, removed, and reordered query summaries', () => {
  assert.match(source, /aria-label="Query contract changes"/);
  assert.match(source, /queryContractChanges\.added/);
  assert.match(source, /queryContractChanges\.removed/);
  assert.match(source, /queryContractChanges\.reordered/);
  assert.match(source, /item\.frozenIndex\+1} → \$\{item\.currentIndex\+1/);
});