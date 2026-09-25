import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyLens,
  buildDailyDropPool,
  buildVibeAtlasPool,
  gridRecordFromProposal,
  proposeGrid,
} from '../src/utils/gridBuilder';
import {
  historicalEditionHref,
  markGridAsLegendaryMisprint,
  normalizeGridRecord,
  type CardRecord,
  type GridRecord,
} from '../src/utils/collectionDB';
import { starDataFromCollectionGrid } from '../src/utils/collectionHistoryModel';
import { classifyEditionTier } from '../src/utils/exportCanvas';

test('Daily Drop inventory stays a distinct builder source rather than a saved Collection', () => {
  const pool = buildDailyDropPool({
    actorId: 'actor-1',
    actorName: '今日之星',
    actorShortNameEn: 'Star Today',
    actorAccentColor: '#123456',
    vibeEmoji: '✨',
    vibeLabel: '今日氛围',
    vibeLabelEn: 'Today Vibe',
    vibeSubtitle: '今天',
    vibeSubtitleEn: 'Today',
    date: '2026-09-20',
    rankedBatches: [{
      query: 'approved daily family',
      results: [{
        title: 'Approved image',
        thumbnail: 'https://images.example.test/a.jpg',
        link: 'https://source.example.test/a',
        source: 'Source',
      }],
    }],
  });

  assert.equal(pool.length, 1);
  assert.equal(pool[0].origin, 'daily-drop');
  assert.equal(pool[0].capturedDate, '2026-09-20');
  assert.equal(pool[0].sourceUrl, 'https://source.example.test/a');
  assert.match(pool[0].imageUrl, /^\/\.netlify\/functions\/image-proxy\?url=/);
});

test('saved grids preserve historical edition provenance without copying edition cards into saved results', () => {
  const pool = buildDailyDropPool({
    actorId: 'actor-archive',
    actorName: '往期之星',
    actorShortNameEn: 'Archive Star',
    actorAccentColor: '#654321',
    vibeEmoji: '🌙',
    vibeLabel: '往期氛围',
    vibeLabelEn: 'Archive Vibe',
    vibeSubtitle: '往期',
    vibeSubtitleEn: 'Archive',
    date: '2026-09-19',
    rankedBatches: [{
      query: 'immutable edition family',
      results: Array.from({ length: 9 }, (_, index) => ({
        title: `Edition image ${index + 1}`,
        thumbnail: `https://images.example.test/archive-${index + 1}.jpg`,
      })),
    }],
  });
  const proposal = proposeGrid(pool, {}, 'compiled');
  const record = gridRecordFromProposal(
    proposal.slots,
    proposal.rationale,
    new Date('2026-09-20T12:00:00.000Z'),
    undefined,
    { kind: 'edition', editionDate: '2026-09-19' },
  );

  assert.deepEqual(record.sourceProvenance, {
    kind: 'edition',
    editionDate: '2026-09-19',
  });
  assert.deepEqual(normalizeGridRecord(record).sourceProvenance, record.sourceProvenance);
  assert.equal(historicalEditionHref(record), '/vibe-atlas?date=2026-09-19');
  assert.equal(record.images.length, 9);
  assert.ok(record.images.every(image => image.resultId.includes('/archive-')));
});

test('older grids without valid historical provenance render without an archive link', () => {
  const legacy = normalizeGridRecord({
    id: 'legacy-grid',
    sourceProvenance: undefined,
  });
  const malformed = normalizeGridRecord({
    id: 'malformed-grid',
    sourceProvenance: { kind: 'edition', editionDate: 'not-a-date' },
  });

  assert.equal(legacy.sourceProvenance, undefined);
  assert.equal(historicalEditionHref(legacy), undefined);
  assert.equal(malformed.sourceProvenance, undefined);
  assert.equal(historicalEditionHref(malformed), undefined);
});

function card(actor: string, id: string, collectionScope: CardRecord['collectionScope'] = 'vibe-atlas'): CardRecord {
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
    collectionScope,
  };
}

function grid(actor: string, id: string, sourceRoute = '/collection'): GridRecord {
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
    sourceRoute,
    images: [{
      resultId: `${id}-image`,
      imageUrl: `https://images.example/${id}.jpg`,
      sourceUrl: `https://sources.example/${id}`,
      title: actor,
      gridPosition: 0,
    }],
  };
}

test('Vibe Atlas builder uses saved result scope and does not unpack finished grids', () => {
  const pool = buildVibeAtlasPool(
    [
      card('Liu Xueyi', 'romanized-cdrama-card'),
      card('刘学义', 'cdrama-card'),
      card('Gandalf', 'gandalf-card', 'middle-earth'),
    ],
  );
  assert.deepEqual(
    [...new Set(pool.map(item => item.actor))].sort(),
    ['Liu Xueyi', '刘学义'],
  );
  assert.equal(pool.some(item => /Gandalf|Middle-earth/.test(item.actor)), false);
});

test('builder and automatic proposals preserve every distinct saved record', () => {
  const first = {
    ...card('刘学义', 'first-record'),
    media: {
      schemaVersion: 1 as const,
      assetId: '11111111-1111-4111-8111-111111111111',
      deliveryUrl: 'https://media.example/first.jpg',
      thumbnailUrl: 'https://media.example/first-thumb.jpg',
      mimeType: 'image/jpeg' as const,
      sizeBytes: 1024,
      checksum: 'a'.repeat(64),
      dimensions: { width: 800, height: 1200 },
      association: { type: 'collection' as const, id: 'collection', itemId: 'first' },
    },
  };
  const second = {
    ...card('刘学义', 'second-record'),
    media: {
      ...first.media,
      assetId: '22222222-2222-4222-8222-222222222222',
      deliveryUrl: 'https://media.example/second.jpg',
      thumbnailUrl: 'https://media.example/second-thumb.jpg',
      association: { type: 'collection' as const, id: 'collection', itemId: 'second' },
    },
  };

  const pool = buildVibeAtlasPool([first, second]);

  assert.equal(pool.length, 2);
  assert.deepEqual(pool.map(item => item.imageUrl), [
    'https://media.example/first-thumb.jpg',
    'https://media.example/second-thumb.jpg',
  ]);
  assert.equal(proposeGrid(pool, {}, 'compiled').slots.length, 2);
});

test('saved actor identity stays authoritative over stale search spell metadata', () => {
  const songWeilong = {
    ...card('宋威龙', 'song-weilong'),
    actorEn: 'Song Weilong',
    gridContext: {
      batchKey: '敖瑞鹏 笑容 帅气',
      position: 0,
    },
  };
  const duplicateSave = {
    ...songWeilong,
    localId: 'second-save',
  };

  const pool = buildVibeAtlasPool([songWeilong, duplicateSave]);

  assert.equal(pool.length, 2);
  assert.deepEqual(pool.map(item => item.actor), ['宋威龙', '宋威龙']);
  assert.deepEqual(pool.map(item => item.actorEn), ['Song Weilong', 'Song Weilong']);
  assert.equal(proposeGrid(pool, {}, 'compiled').slots.length, 2);
});

test('actor lenses preserve every saved record even when image URLs overlap', () => {
  const song = Array.from({ length: 5 }, (_, index) => ({
    ...card('宋威龙', `song-${index}`),
    actorEn: 'Song Weilong',
    imageUrl: `https://images.example/shared-${index}.jpg`,
    thumbnailUrl: `https://images.example/shared-${index}.jpg`,
  }));
  const ao = song.map((record, index) => ({
    ...record,
    localId: `ao-save-${index}`,
    resultId: `ao-result-${index}`,
    actor: '敖瑞鹏',
    actorEn: 'Ao Ruipeng',
  }));

  const pool = buildVibeAtlasPool([...song, ...ao]);

  assert.equal(applyLens(pool, { actor: '宋威龙' }).length, 5);
  assert.equal(applyLens(pool, { actor: '敖瑞鹏' }).length, 5);
});

test('generic publication markers do not become Event families', () => {
  const records = Array.from({ length: 3 }, (_, index) => ({
    ...card('刘宇宁', `published-${index}`),
    publisher: 'Liu Yuning · source.example',
    gridContext: {
      batchKey: 'verified-publication-manifest',
      position: index,
    },
  }));

  const pool = buildVibeAtlasPool(records);

  assert.ok(pool.every(item => item.familyLabel === 'Liu Yuning · source.example'));
  assert.ok(pool.every(item => item.familyEvidence === 'publisher'));
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

  assert.deepEqual(buildVibeAtlasPool([ordinary, marked]).map(item => item.resultId), ['ordinary']);
  const misprintPool = buildVibeAtlasPool([ordinary, marked], 'misprints');
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
  const pool = buildVibeAtlasPool(markedCards, 'misprints');
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

test('a creator-marked Gandalf grid stays in the Grids collection', () => {
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

  assert.equal(buildVibeAtlasPool([]).length, 0);
  assert.equal(buildVibeAtlasPool([], 'misprints').length, 0);

  const exportData = starDataFromCollectionGrid(marked);
  assert.equal(classifyEditionTier(exportData.rankedBatches[0]), 'legendary-misprint');
});