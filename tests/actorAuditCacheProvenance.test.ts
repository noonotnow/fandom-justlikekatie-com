import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/components/FandomAdmin/ActorPreflightLab.tsx', import.meta.url),
  'utf8',
);

test('cache comparison receipts cannot remain attributed to a different actor, Vibe, or scope', () => {
  assert.match(source, /diagnostic\?\.actorId===actorId/);
  assert.match(source, /diagnostic\?\.vibeKey===vibeKey/);
  assert.match(source, /diagnostic\?\.scope===scope/);
  assert.match(source, /setCacheDiagnostic\(null\).*\[scope\]/s);
  assert.match(source, /cacheDiagnostic\?\.actorId===actorId&&cacheDiagnostic\?\.vibeKey===vibeKey&&cacheDiagnostic\?\.scope===scope/);
  assert.match(source, /\{visibleCacheDiagnostic&&<details/);
  assert.doesNotMatch(source, /\{cacheDiagnostic&&<details/);
});