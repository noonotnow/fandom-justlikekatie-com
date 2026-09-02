import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  classifyCollectionMedia,
  persistGridImagesToMedia,
} from '../src/utils/collectionMedia.ts';
import { dbGetAllGrids, dbSaveGrid } from '../src/utils/collectionDB.ts';
import {
  isVerifiedMediaReference,
  reassignMediaToCollection,
  type MediaReference,
} from '../src/utils/mediaReference.ts';
import type { CardRecord, GridRecord } from '../src/utils/collectionDB.ts';

const media: MediaReference = {
  schemaVersion: 1,
  assetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  deliveryUrl: 'https://media.justlikekatie.com/images/sha256/asset.jpg',
  thumbnailUrl: 'https://media.justlikekatie.com/images/sha256/asset-thumb.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1234,
  checksum: 'a'.repeat(64),
  dimensions: { width: 1200, height: 800 },
  association: { type: 'collection', id: 'vibe-atlas', itemId: 'local-1' },
};

function card(overrides: Partial<CardRecord> = {}): CardRecord {
  return {
    imageUrl: 'https://images.example/result.jpg',
    thumbnailUrl: 'https://images.example/result-thumb.jpg',
    actor: 'Actor',
    actorEn: 'Actor',
    vibe: 'Vibe',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-08-28',
    ...overrides,
  };
}

function grid(overrides: Partial<GridRecord> = {}): GridRecord {
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: 'grid-1',
    actorId: 'actor-1',
    actor: 'Actor',
    actorEn: 'Actor',
    actorAccentColor: '#c9a96e',
    vibe: 'Vibe',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    searchSpell: 'vibe',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: '2026-08-28',
    generatedAt: '2026-08-28T00:00:00Z',
    savedAt: '2026-08-28T00:00:00Z',
    sourceRoute: '/',
    images: [{
      resultId: 'https://images.example/grid.jpg',
      imageUrl: 'https://images.example/grid.jpg',
      sourceUrl: 'https://publisher.example/story',
      title: 'Grid image',
      gridPosition: 0,
    }],
    ...overrides,
  };
}

test('classifies saved records without treating a plain URL as verified MEDIA', () => {
  assert.equal(classifyCollectionMedia(card()), 'url-only');
  assert.equal(classifyCollectionMedia(card({ media })), 'media-backed');
  assert.equal(classifyCollectionMedia(grid({ legacyCompositeUrl: 'https://images.example/grid.png' })), 'legacy-composite');
  assert.equal(classifyCollectionMedia(grid()), 'url-only');
});


test('accepts only complete stable MEDIA provenance and re-associates the same asset safely', () => {
  assert.equal(isVerifiedMediaReference(media), true);
  assert.equal(isVerifiedMediaReference({ ...media, checksum: 'not-a-checksum' }), false);
  assert.deepEqual(reassignMediaToCollection(media, 'middle-earth', 'local-1').association, {
    type: 'collection',
    id: 'middle-earth',
    itemId: 'local-1',
  });
});

test('copies each grid image independently and retains remote provenance on partial failure', async () => {
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, { indexedDB: new IDBFactory() });
  const imageBytes = Uint8Array.from([1, 2, 3, 4]);
  const imageChecksum = 'b'.repeat(64);
  let uploadCount = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.startsWith('data:image/png;base64,')) {
      return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url.startsWith('/.netlify/functions/image-proxy?url=')) {
      const position = decodeURIComponent(url).includes('gone') ? 1 : 0;
      if (position === 1) throw new Error('The publisher image is gone.');
      return new Response(imageBytes, { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (url.startsWith('/api/collection/media?')) {
      uploadCount += 1;
      return new Response(JSON.stringify({
        media: {
          ...media,
          assetId: `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee${uploadCount}`,
          deliveryUrl: `https://media.justlikekatie.com/images/sha256/${imageChecksum}-${uploadCount}.png`,
          thumbnailUrl: `https://media.justlikekatie.com/images/sha256/${imageChecksum}-${uploadCount}-thumb.png`,
          mimeType: 'image/png',
          sizeBytes: imageBytes.byteLength,
          checksum: imageChecksum,
          association: { type: 'collection', id: 'vibe-atlas', itemId: `grid-local-${uploadCount - 1}` },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const savedGrid = grid({
    id: 'partial-media-grid',
    localId: 'grid-local',
    images: [0, 1, 2].map(gridPosition => ({
      resultId: `candidate-${gridPosition}`,
      imageUrl: `/.netlify/functions/image-proxy?url=${encodeURIComponent(`https://images.example/${gridPosition === 1 ? 'gone' : 'kept'}.jpg`)}`,
      sourceUrl: `https://publisher.example/story-${gridPosition}`,
      title: `Candidate ${gridPosition}`,
      batchKey: `query-${gridPosition}`,
      gridPosition,
    })),
  });

  try {
    await dbSaveGrid(savedGrid);
    const result = await persistGridImagesToMedia(savedGrid);
    assert.equal(result.copiedCount, 2);
    assert.deepEqual(result.failures.map(failure => failure.gridPosition), [1]);
    assert.equal(uploadCount, 2);

    const persisted = (await dbGetAllGrids()).find(item => item.id === savedGrid.id);
    assert.ok(persisted);
    assert.match(persisted!.images[0].imageUrl, /^https:\/\/media\.justlikekatie\.com\//);
    assert.equal(persisted!.images[0].sourceUrl, savedGrid.images[0].sourceUrl);
    assert.equal(persisted!.images[0].resultId, savedGrid.images[0].resultId);
    assert.equal(persisted!.images[0].batchKey, savedGrid.images[0].batchKey);
    assert.equal(persisted!.images[0].gridPosition, savedGrid.images[0].gridPosition);
    assert.equal(persisted!.images[1].imageUrl, savedGrid.images[1].imageUrl);
    assert.equal(persisted!.images[1].mediaRecovery?.status, 'unrecoverable');
    assert.equal(persisted!.images[1].sourceUrl, savedGrid.images[1].sourceUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});