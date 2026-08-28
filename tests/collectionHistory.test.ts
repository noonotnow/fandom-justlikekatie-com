import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cardStableResultId,
  collectionGridFromStar,
  legacyGridFromPlan,
  starDataFromCollectionGrid,
} from '../src/utils/collectionHistoryModel.ts';
import {
  mediaFromCollectionCard,
  packetFromCollectionGrid,
} from '../src/utils/ideaPackets.ts';

test('captures exported grids as reusable collection snapshots', () => {
  const grid = collectionGridFromStar({
    actorId: 'actor-1',
    actorName: 'Actor',
    actorShortNameEn: 'Actor',
    actorAccentColor: '#fff',
    vibeEmoji: '✨',
    vibeLabel: '氛围',
    vibeLabelEn: 'Vibe',
    vibeSubtitle: 'Seed',
    vibeSubtitleEn: 'Seed',
    date: '2026-08-04',
    generatedAt: '2026-08-04T12:00:00Z',
    rankedBatches: [{
      query: 'editorial query',
      count: 1,
      distinctSources: 1,
      provider: 'test',
      results: [{
        title: 'Result',
        thumbnail: 'https://images.example/result.jpg',
        link: 'https://publisher.example/story',
        source: 'Publisher',
      }],
    }],
  }, '/history', '2026-08-04T13:00:00Z');

  assert.equal(grid.id, 'vibe-atlas-2026-08-04-actor-1');
  assert.equal(grid.images[0].resultId, 'https://images.example/result.jpg');
  assert.equal(grid.images[0].sourceUrl, 'https://publisher.example/story');
  assert.equal(grid.searchSpell, 'editorial query');
  assert.equal(grid.actorAccentColor, '#fff');
  assert.equal(grid.vibeSubtitle, 'Seed');
  assert.equal(grid.rendererVersion, 'vibe-atlas-v1');
  assert.equal(starDataFromCollectionGrid(grid).rankedBatches[0].query, 'editorial query');
  const packet = packetFromCollectionGrid(grid);
  assert.equal(packet.provenance.gridId, grid.id);
  assert.deepEqual(packet.anchor.imageUrls, grid.images.map(image => image.imageUrl));
  assert.equal(packet.grids[0].searchSpell, 'editorial query');
});

test('adapts legacy grid exports from the existing plan store', () => {
  const grid = legacyGridFromPlan({
    imageUrl: 'https://media.example/grid.png',
    thumbnailUrl: 'https://media.example/grid.png',
    actor: 'Actor',
    actorEn: 'Actor',
    vibe: '氛围',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-08-03',
    addedAt: '2026-08-03T13:00:00Z',
    order: 0,
    gridContext: { batchKey: 'vibe-atlas-2026-08-03-actor-1', position: -1 },
  });
  assert.ok(grid);
  assert.equal(grid.legacyCompositeUrl, 'https://media.example/grid.png');
  assert.equal(grid.images[0].resultId, 'vibe-atlas-2026-08-03-actor-1:composite');
});

test('deduplicates new saved cards with live results and legacy cards by provenance', () => {
  const current = {
    imageUrl: '/proxy',
    thumbnailUrl: '/proxy',
    resultId: 'https://images.example/original.jpg',
    sourceUrl: 'https://publisher.example/story',
    actor: 'Actor',
    actorEn: 'Actor',
    vibe: '氛围',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-08-04',
    gridContext: { batchKey: 'query', position: 2 },
    media: {
      schemaVersion: 1 as const,
      assetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      deliveryUrl: 'https://media.justlikekatie.com/images/sha256/asset.jpg',
      thumbnailUrl: 'https://media.justlikekatie.com/images/sha256/asset.jpg',
      mimeType: 'image/jpeg' as const,
      sizeBytes: 1234,
      checksum: 'a'.repeat(64),
      dimensions: { width: 1200, height: 800 },
      association: { type: 'collection' as const, id: 'middle-earth', itemId: 'item-1' },
    },
  };
  const packetMedia = mediaFromCollectionCard(current, 'packet-1');
  assert.equal(packetMedia.resultId, current.resultId);
  assert.deepEqual(packetMedia.media?.association, { type: 'idea_packet', id: 'packet-1' });
  assert.equal(cardStableResultId(current), current.resultId);

  const legacy = { ...current, resultId: undefined, sourceUrl: undefined };
  assert.equal(cardStableResultId(legacy), cardStableResultId({ ...legacy, imageUrl: '/different-proxy' }));
});
