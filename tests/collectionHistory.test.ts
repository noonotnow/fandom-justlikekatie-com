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
  assert.deepEqual(packetMedia.media?.association, {
    type: 'idea_packet',
    id: 'packet-1',
    outputId: `individual-${packetMedia.id}`,
  });
  assert.equal(cardStableResultId(current), current.resultId);

  const legacy = { ...current, resultId: undefined, sourceUrl: undefined };
  assert.equal(cardStableResultId(legacy), cardStableResultId({ ...legacy, imageUrl: '/different-proxy' }));
});

test('intentional Legendary Misprint metadata survives export and CREATE packet conversion', () => {
  const grid = collectionGridFromStar({
    actorId: 'liu-xueyi',
    actorName: '刘学义',
    actorShortNameEn: 'Liu Xueyi',
    actorAccentColor: '#fff',
    vibeEmoji: '✨',
    vibeLabel: '仙门冷玉',
    vibeLabelEn: 'Cold jade',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    date: '2026-08-28',
    rankedBatches: [{
      query: '刘学义 editorial',
      count: 1,
      distinctSources: 1,
      provider: 'test',
      results: [{
        title: 'Unexpected Gandalf still',
        thumbnail: 'https://images.example/gandalf.jpg',
        link: 'https://publisher.example/gandalf',
        source: 'Publisher',
      }],
    }],
  });
  const misprint = {
    kind: 'legendary-misprint' as const,
    confirmedByCreator: true as const,
    markedAt: '2026-08-28T12:00:00.000Z',
    intendedIdentity: {
      actor: '刘学义',
      actorEn: 'Liu Xueyi',
      vibe: '仙门冷玉',
      vibeEn: 'Cold jade',
      collectionScope: 'vibe-atlas' as const,
    },
    unexpectedImageIdentity: { label: 'Gandalf' },
    provenance: {
      imageUrl: grid.images[0].imageUrl,
      resultId: grid.images[0].resultId,
      sourceUrl: grid.images[0].sourceUrl,
    },
  };
  grid.intent = 'legendary-misprint';
  grid.edition = { ...grid.edition, misprint: true, legendary: true };
  grid.misprintMetadata = {
    confirmedByCreator: true,
    intendedIdentities: ['刘学义'],
    unexpectedImageIdentities: ['Gandalf'],
    sourceResultIds: [grid.images[0].resultId],
  };
  grid.images[0].legendaryMisprint = misprint;

  const starData = starDataFromCollectionGrid(grid);
  assert.equal(starData.rankedBatches[0].intentionalMisprint, true);
  const packet = packetFromCollectionGrid(grid);
  assert.equal(packet.grids[0].intent, 'legendary-misprint');
  assert.match(packet.notes, /Intentional Legendary Misprint/);
  assert.match(packet.sourceCards[0].provenance, /"unexpectedImageIdentity":\{"label":"Gandalf"\}/);
});

test('an individual Misprint keeps its intentional label and dual identity in packet media', () => {
  const card = {
    imageUrl: 'https://images.example/gandalf.jpg',
    thumbnailUrl: 'https://images.example/gandalf-thumb.jpg',
    resultId: 'gandalf-result',
    sourceUrl: 'https://publisher.example/gandalf',
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    vibe: '仙门冷玉',
    vibeEn: 'Cold jade',
    vibeEmoji: '✨',
    capturedDate: '2026-08-28',
    legendaryMisprint: {
      kind: 'legendary-misprint' as const,
      confirmedByCreator: true as const,
      markedAt: '2026-08-28T12:00:00.000Z',
      intendedIdentity: {
        actor: '刘学义',
        actorEn: 'Liu Xueyi',
        vibe: '仙门冷玉',
        vibeEn: 'Cold jade',
        collectionScope: 'vibe-atlas' as const,
      },
      unexpectedImageIdentity: { label: 'Gandalf' },
      provenance: {
        imageUrl: 'https://images.example/gandalf.jpg',
        resultId: 'gandalf-result',
      },
    },
  };
  const media = mediaFromCollectionCard(card);
  assert.match(media.title, /Intentional Legendary Misprint/);
  assert.equal(media.legendaryMisprint?.intendedIdentity.actor, '刘学义');
  assert.equal(media.legendaryMisprint?.unexpectedImageIdentity.label, 'Gandalf');
});
