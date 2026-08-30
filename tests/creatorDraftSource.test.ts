import assert from 'node:assert/strict';
import test from 'node:test';
import type { BuilderCard } from '../src/utils/gridBuilder.ts';
import { gridRecordFromProposal, manualGridRationale } from '../src/utils/gridBuilder.ts';
import { CREATOR_DRAFT_SOURCE_SCHEMA, creatorDraftSourceFromGrid } from '../src/utils/creatorDraft.ts';

function card(position: number): BuilderCard {
  return {
    key: `image-${position}`,
    imageUrl: `https://media.example/image-${position}.jpg`,
    sourceUrl: `https://source.example/image-${position}`,
    title: `Saved image ${position}`,
    actor: '赵露思',
    actorEn: 'Zhao Lusi',
    actorId: 'zhao-lusi',
    actorAccentColor: '#c9a96e',
    vibe: '春日',
    vibeEn: 'Spring',
    vibeEmoji: '🌸',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    capturedDate: '2026-08-30',
    resultId: `result-${position}`,
    origin: 'saved-card',
    familyId: 'spring',
    familyLabel: 'Spring light',
  };
}

test('manual grids preserve the creator-selected order without fabricating a misprint', () => {
  const slots = [9, 2, 7, 1, 8, 3, 6, 4, 5].map(card);
  const rationale = manualGridRationale(slots, '赵露思');
  const grid = gridRecordFromProposal(slots, rationale, new Date('2026-08-30T12:00:00.000Z'));

  assert.deepEqual(grid.images.map(image => image.resultId), slots.map(item => item.resultId));
  assert.equal(grid.intent, 'standard');
  assert.equal(grid.edition.legendary, false);
  assert.match(grid.generationPrompt || '', /All nine images and their exact positions were deliberately chosen/);
  const smartGrid = gridRecordFromProposal(
    slots,
    {
      ...rationale,
      lens: 'Star: 赵露思',
      manualSwaps: [],
    },
    new Date('2026-08-30T12:00:00.000Z'),
  );
  assert.notEqual(grid.id, smartGrid.id, 'manual composition must not overwrite a smart proposal with the same images');
});

test('Creator Draft source carries stable ordered provenance and creative context', () => {
  const slots = [3, 1, 2, 4, 5, 6, 7, 8, 9].map(card);
  const grid = gridRecordFromProposal(
    slots,
    manualGridRationale(slots, '赵露思'),
    new Date('2026-08-30T12:00:00.000Z'),
  );
  const first = creatorDraftSourceFromGrid(grid);
  const second = creatorDraftSourceFromGrid(grid);

  assert.equal(first.schema, CREATOR_DRAFT_SOURCE_SCHEMA);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.deepEqual(first.orderedImages.map(image => image.resultId), slots.map(item => item.resultId));
  assert.match(first.creativeContext.brief, /Build Your Own/);
});