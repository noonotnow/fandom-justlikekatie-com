import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectorCardRecord, collectorGridCollectionId, collectorGridRecord,
} from '../src/utils/releasedPackCollection.ts';

const run = {
  id: 'saved-run',
  actorId: 'dylan-wang',
  vibeIdx: 2,
  generatedAt: '2026-09-24T12:00:00.000Z',
  images: Array.from({ length: 9 }, (_, index) => ({
    thumbnail: `https://media.example/run/card-${index + 1}`,
    title: `Dylan card ${index + 1}`,
    source: 'Editorial source',
    link: `https://source.example/${index + 1}`,
    query: 'approved search',
  })),
};
const actor = { id: 'dylan-wang', name: '王鹤棣', shortName_en: 'Dylan Wang' };
const vibe = { label: '玉色', label_en: 'Jade', emoji: '✦' };

test('a Collector can deliberately save one durable run image to My Collection', () => {
  const card = collectorCardRecord(run, 3, actor, vibe);
  assert.equal(card.imageUrl, run.images[3].thumbnail);
  assert.equal(card.resultId, 'saved-run:card-4');
  assert.equal(card.actorId, 'dylan-wang');
  assert.equal(card.sourceUrl, run.images[3].link);
  assert.equal(card.collectionScope, 'vibe-atlas');
});

test('a complete Collector run becomes a separate, stable My Collection grid', () => {
  const grid = collectorGridRecord(run, actor, vibe);
  assert.equal(grid.id, collectorGridCollectionId(run));
  assert.equal(grid.images.length, 9);
  assert.equal(grid.images[0].imageUrl, run.images[0].thumbnail);
  assert.equal(grid.images[8].resultId, 'saved-run:card-9');
  assert.equal(grid.sourceRoute, 'released-pack');
  assert.equal(grid.generatedAt, run.generatedAt);
  assert.throws(() => collectorGridRecord({ ...run, images: run.images.slice(0, 6) }, actor, vibe), /nine-image/);
});