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