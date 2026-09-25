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

test('available empty query-change summaries render every category as None', () => {
  assert.match(
    source,
    /changeSummaryAvailability === 'available'[\s\S]*?\? <p>Change summary unavailable for this older receipt\.<\/p>[\s\S]*?queryContractChanges\.added\.length[\s\S]*?:'None'[\s\S]*?queryContractChanges\.removed\.length[\s\S]*?:'None'[\s\S]*?queryContractChanges\.reordered\.length[\s\S]*?:'None'/,
  );
});

test('unavailable legacy query-change summaries render the unavailable message instead of empty categories', () => {
  assert.match(
    source,
    /!queryChangeSummaryAvailable\s*\? <p>Change summary unavailable for this older receipt\.<\/p>\s*: <>/,
  );
});

test('retained structured summaries remain available without the compatibility field', () => {
  assert.match(
    source,
    /changeSummaryAvailability === undefined\s*&& hasStructuredQueryContractChanges/,
  );
  assert.match(
    source,
    /Array\.isArray\(queryContractChanges\?\.added\)[\s\S]*?Array\.isArray\(queryContractChanges\?\.removed\)[\s\S]*?Array\.isArray\(queryContractChanges\?\.reordered\)/,
  );
});