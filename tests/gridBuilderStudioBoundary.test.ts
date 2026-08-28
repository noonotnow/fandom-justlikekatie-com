import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVibeAtlasPool,
  isVibeAtlasActorIdentity,
} from '../src/utils/gridBuilder';
import type { CardRecord, GridRecord } from '../src/utils/collectionDB';

function card(actor: string, id: string): CardRecord {
  return {
    imageUrl: `https://images.example/${id}.jpg`,
    thumbnailUrl: `https://images.example/${id}-thumb.jpg`,
    actor,
    actorEn: actor,
    vibe: 'Saved vibe',
    vibeEn: 'Saved vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-08-28',
    resultId: id,
  };
}

function grid(actor: string, id: string): GridRecord {
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id,
    actorId: id,
    actor,
    actorEn: actor,
    actorAccentColor: '#c9a96e',
    vibe: 'Saved vibe',
    vibeEn: 'Saved vibe',
    vibeEmoji: '✨',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    searchSpell: '',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: '2026-08-28',
    generatedAt: '2026-08-28T00:00:00.000Z',
    savedAt: '2026-08-28T00:00:00.000Z',
    sourceRoute: '/',
    images: [{
      resultId: `${id}-image`,
      imageUrl: `https://images.example/${id}.jpg`,
      sourceUrl: `https://sources.example/${id}`,
      title: actor,
      gridPosition: 0,
    }],
  };
}

test('Vibe Atlas actor admission accepts C-drama identities and rejects fantasy labels', () => {
  assert.equal(isVibeAtlasActorIdentity('刘学义'), true);
  assert.equal(isVibeAtlasActorIdentity('张凌赫'), true);
  assert.equal(isVibeAtlasActorIdentity('Middle-earth'), false);
  assert.equal(isVibeAtlasActorIdentity('Gandalf'), false);
  assert.equal(isVibeAtlasActorIdentity('Frodo'), false);
  assert.equal(isVibeAtlasActorIdentity('The Fellowship'), false);
});

test('Vibe Atlas builder excludes Middle-earth cards and grids at the final pool boundary', () => {
  const pool = buildVibeAtlasPool(
    [card('刘学义', 'cdrama-card'), card('Gandalf', 'gandalf-card')],
    [grid('张凌赫', 'cdrama-grid'), grid('Frodo', 'frodo-grid')],
  );
  assert.deepEqual(
    [...new Set(pool.map(item => item.actor))].sort(),
    ['刘学义', '张凌赫'],
  );
  assert.equal(pool.some(item => /Gandalf|Frodo|Middle-earth|Fellowship/.test(item.actor)), false);
});