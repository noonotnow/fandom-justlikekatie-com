import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  actorPackIdForLens,
  buildVibeAtlasPool,
} from '../src/utils/gridBuilder.ts';
import type { CardRecord } from '../src/utils/collectionDB.ts';

const source = await readFile(
  new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
  'utf8',
);

test('actor source notes stay actor-scoped and Collector-gated in the Builder', () => {
  assert.match(source, /actor-pack-depth\?\$\{params\.toString\(\)\}/);
  assert.match(source, /new URLSearchParams\(\{ actorId: selectedActorPackId \}\)/);
  assert.match(source, /if \(!hasCollectorAccess \|\| !selectedActorPackId/);
  assert.match(source, /credentials: 'include'/);
  assert.match(source, /Source: \{sourceNotes\.provenance\.attribution\}/);
});

test('saved cards preserve the canonical actor-pack id used by the depth request', () => {
  const savedCard: CardRecord = {
    imageUrl: 'https://images.example/dylan.jpg',
    thumbnailUrl: 'https://images.example/dylan-thumb.jpg',
    actor: '王鹤棣',
    actorEn: 'Dylan',
    actorId: 'dylan-wang',
    vibe: 'Red',
    vibeEn: 'Red',
    vibeEmoji: '🔥',
    capturedDate: '2026-09-20',
    resultId: 'dylan-result',
    collectionScope: 'vibe-atlas',
  };

  const pool = buildVibeAtlasPool([savedCard]);

  assert.equal(pool[0].actorId, 'dylan-wang');
  assert.equal(actorPackIdForLens(pool, '王鹤棣'), 'dylan-wang');
});

test('legacy saved cards use explicit canonical mappings before name slugging', () => {
  const legacyCard: CardRecord = {
    imageUrl: 'https://images.example/riley.jpg',
    thumbnailUrl: 'https://images.example/riley-thumb.jpg',
    actor: '王以纶',
    actorEn: 'Riley',
    vibe: 'Saved vibe',
    vibeEn: 'Saved vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-09-20',
    collectionScope: 'vibe-atlas',
  };

  const pool = buildVibeAtlasPool([legacyCard]);

  assert.equal(actorPackIdForLens(pool, '王以纶'), 'riley-wang');
});

test('free preview does not render protected source-depth values', () => {
  const previewStart = source.indexOf('!hasCollectorAccess ? (');
  const collectorStart = source.indexOf(') : sourceNotesBusy ? (', previewStart);
  assert.ok(previewStart >= 0 && collectorStart > previewStart);

  const preview = source.slice(previewStart, collectorStart);
  assert.doesNotMatch(preview, /sourceDepth|queries|authoringPrompt/);
  assert.match(preview, /Protected searches and notes stay available only to active Collectors/);
});

test('source-note failures remain local to the optional panel', () => {
  assert.match(source, /You can keep building with your saved images/);
  assert.doesNotMatch(source, /setLoadError\([^)]*Source notes/);
});