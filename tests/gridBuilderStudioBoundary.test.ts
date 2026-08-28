import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVibeAtlasPool,
  gridRecordFromProposal,
  isVibeAtlasActorIdentity,
  proposeGrid,
} from '../src/utils/gridBuilder';
import { markGridAsLegendaryMisprint, type CardRecord, type GridRecord } from '../src/utils/collectionDB';
import { starDataFromCollectionGrid } from '../src/utils/collectionHistoryModel';
import { classifyEditionTier } from '../src/utils/exportCanvas';
import { packetFromCollectionGrid } from '../src/utils/ideaPackets';

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

test('creator-marked mismatches are excluded ordinarily and included only in the Misprints lens', () => {
  const ordinary = card('刘学义', 'ordinary');
  const marked = {
    ...card('刘学义', 'gandalf'),
    legendaryMisprint: {
      kind: 'legendary-misprint' as const,
      confirmedByCreator: true as const,
      markedAt: '2026-08-28T12:00:00.000Z',
      intendedIdentity: {
        actor: '刘学义',
        actorEn: 'Liu Xueyi',
        vibe: 'Saved vibe',
        vibeEn: 'Saved vibe',
        collectionScope: 'vibe-atlas' as const,
      },
      unexpectedImageIdentity: { label: 'Gandalf', collectionScope: 'middle-earth' as const },
      provenance: {
        imageUrl: 'https://images.example/gandalf.jpg',
        resultId: 'gandalf',
        sourceUrl: 'https://sources.example/gandalf',
        searchQuery: '刘学义 editorial',
      },
    },
  };

  assert.deepEqual(buildVibeAtlasPool([ordinary, marked], []).map(item => item.resultId), ['ordinary']);
  const misprintPool = buildVibeAtlasPool([ordinary, marked], [], 'misprints');
  assert.deepEqual(misprintPool.map(item => item.resultId), ['gandalf']);
  assert.equal(misprintPool[0].legendaryMisprint?.unexpectedImageIdentity.label, 'Gandalf');
});

test('a Misprints-lens grid preserves both identities and intentional provenance', () => {
  const markedCards = Array.from({ length: 9 }, (_, index) => ({
    ...card('刘学义', `gandalf-${index}`),
    legendaryMisprint: {
      kind: 'legendary-misprint' as const,
      confirmedByCreator: true as const,
      markedAt: '2026-08-28T12:00:00.000Z',
      intendedIdentity: {
        actor: '刘学义',
        actorEn: 'Liu Xueyi',
        vibe: 'Saved vibe',
        vibeEn: 'Saved vibe',
        collectionScope: 'vibe-atlas' as const,
      },
      unexpectedImageIdentity: { label: 'Gandalf' },
      provenance: {
        imageUrl: `https://images.example/gandalf-${index}.jpg`,
        resultId: `gandalf-${index}`,
      },
    },
  }));
  const pool = buildVibeAtlasPool(markedCards, [], 'misprints');
  const proposal = proposeGrid(pool, { mode: 'misprints' });
  const record = gridRecordFromProposal(proposal.slots, proposal.rationale, new Date('2026-08-28T12:00:00.000Z'));

  assert.equal(record.actor, '刘学义');
  assert.equal(record.intent, 'legendary-misprint');
  assert.deepEqual(record.misprintMetadata?.intendedIdentities, ['刘学义']);
  assert.deepEqual(record.misprintMetadata?.unexpectedImageIdentities, ['Gandalf']);
  assert.equal(record.edition.misprint, true);
  assert.equal(record.edition.legendary, true);
  assert.equal(record.images[0].legendaryMisprint?.provenance.resultId, record.images[0].resultId);
  assert.match(record.generationPrompt || '', /Lens: Legendary Misprints/);
});

test('a creator-marked Gandalf grid can round-trip through the Misprints builder, export, and CREATE', () => {
  const gandalfGrid = grid('Gandalf', 'gandalf-grid');
  gandalfGrid.images = Array.from({ length: 9 }, (_, index) => ({
    resultId: `gandalf-${index}`,
    imageUrl: `https://images.example/gandalf-${index}.jpg`,
    sourceUrl: `https://sources.example/gandalf-${index}`,
    title: `Gandalf frame ${index + 1}`,
    gridPosition: index,
  }));
  const marked = markGridAsLegendaryMisprint(
    gandalfGrid,
    new Date('2026-08-28T12:00:00.000Z'),
  );

  assert.equal(buildVibeAtlasPool([], [marked]).length, 0);
  const pool = buildVibeAtlasPool([], [marked], 'misprints');
  assert.equal(pool.length, 9);
  assert.equal(pool[0].legendaryMisprint?.intendedIdentity.actor, 'Vibe Atlas');
  assert.equal(pool[0].legendaryMisprint?.unexpectedImageIdentity.label, 'Gandalf');

  const proposal = proposeGrid(pool, { mode: 'misprints' });
  const rebuilt = gridRecordFromProposal(
    proposal.slots,
    proposal.rationale,
    new Date('2026-08-28T13:00:00.000Z'),
  );
  assert.equal(rebuilt.intent, 'legendary-misprint');
  assert.deepEqual(rebuilt.misprintMetadata?.intendedIdentities, ['Vibe Atlas']);
  assert.deepEqual(rebuilt.misprintMetadata?.unexpectedImageIdentities, ['Gandalf']);
  assert.equal(rebuilt.images[0].legendaryMisprint?.provenance.resultId, 'gandalf-0');

  const exportData = starDataFromCollectionGrid(rebuilt);
  assert.equal(classifyEditionTier(exportData.rankedBatches[0]), 'legendary-misprint');
  const packet = packetFromCollectionGrid(rebuilt);
  assert.match(packet.notes, /Intentional Legendary Misprint/);
  assert.match(packet.sourceCards[0].provenance, /"unexpectedImageIdentity":\{"label":"Gandalf"\}/);
});