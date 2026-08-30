import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCollectionMedia } from '../src/utils/collectionMedia.ts';
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