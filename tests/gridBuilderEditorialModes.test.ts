import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gridRecordFromProposal,
  proposeGrid,
  rebuildRationale,
  type BuilderCard,
} from '../src/utils/gridBuilder.ts';
import { creatorDraftSourceFromGrid } from '../src/utils/creatorDraft.ts';
import { gridExportEventFromRecord } from '../src/utils/gridExportLog.ts';

function card(index: number, familyId: string, familyLabel = familyId): BuilderCard {
  return {
    key: `https://images.example/${familyId}-${index}.jpg`,
    imageUrl: `https://images.example/${familyId}-${index}.jpg`,
    sourceUrl: `https://sources.example/${familyId}/${index}`,
    title: `${familyLabel} frame ${index}`,
    publisher: `Source ${familyId}`,
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    actorId: 'liu-xueyi',
    actorAccentColor: '#c9a96e',
    vibe: index % 2 ? '月下' : '红衣',
    vibeEn: index % 2 ? 'Moonlit' : 'Red',
    vibeEmoji: '✨',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    batchKey: `${familyId} evidence`,
    capturedDate: `2026-08-${String(10 + index).padStart(2, '0')}`,
    resultId: `${familyId}-${index}`,
    origin: 'saved-card',
    familyId,
    familyLabel,
    familyEvidence: 'batch',
  };
}

test('Event mode stays in one family and expands to a bounded 12-frame composition', () => {
  const eventFamily = Array.from({ length: 14 }, (_, index) => card(index, 'event-family', 'One devastating appearance'));
  const noise = Array.from({ length: 8 }, (_, index) => card(index, `noise-${index}`));

  const proposal = proposeGrid([...noise, ...eventFamily], { actor: '刘学义' }, 'event');

  assert.equal(proposal.slots.length, 12);
  assert.equal(proposal.rationale.editorialMode, 'event');
  assert.equal(proposal.rationale.compositionSize, 12);
  assert.deepEqual(new Set(proposal.slots.map(item => item.familyId)), new Set(['event-family']));
  assert.equal(proposal.alternates.length, 2);
  assert.ok(proposal.alternates.every(item => item.familyId === 'event-family'));
  assert.match(proposal.rationale.whyTogether, /one bounded appearance/i);
});

test('Event mode fails honestly when its strongest family cannot fill nine frames', () => {
  const proposal = proposeGrid(
    Array.from({ length: 7 }, (_, index) => card(index, 'short-event')),
    { actor: '刘学义' },
    'event',
  );

  assert.equal(proposal.slots.length, 7);
  assert.equal(proposal.rationale.compositionSize, 9);
  assert.equal(proposal.rationale.editorialMode, 'event');
});

test('Event mode never upgrades a same-vibe fallback group into an appearance claim', () => {
  const sameVibeOnly = Array.from({ length: 12 }, (_, index) => ({
    ...card(index, 'vibe-moonlit', 'Moonlit fallback'),
    familyEvidence: 'fallback' as const,
  }));

  const proposal = proposeGrid(sameVibeOnly, { actor: '刘学义' }, 'event');

  assert.equal(proposal.slots.length, 0);
  assert.equal(proposal.rationale.familyEvidence, undefined);
});

test('Compiled mode keeps the ordinary nine-frame path and builds range across families', () => {
  const pool = [
    ...Array.from({ length: 6 }, (_, index) => card(index, 'family-a')),
    ...Array.from({ length: 5 }, (_, index) => card(index, 'family-b')),
    ...Array.from({ length: 4 }, (_, index) => card(index, 'family-c')),
    ...Array.from({ length: 3 }, (_, index) => card(index, 'family-d')),
  ];

  const proposal = proposeGrid(pool, { actor: '刘学义' }, 'compiled');
  const counts = new Map<string, number>();
  proposal.slots.forEach(item => counts.set(item.familyId, (counts.get(item.familyId) || 0) + 1));

  assert.equal(proposal.slots.length, 9);
  assert.equal(proposal.rationale.editorialMode, 'compiled');
  assert.equal(proposal.rationale.compositionSize, 9);
  assert.ok(counts.size >= 3);
  assert.ok([...counts.values()].every(count => count <= 3));
  assert.match(proposal.rationale.whyTogether, /balances/i);
});

test('automatic proposals never seat one MEDIA image twice through duplicate records', () => {
  const original = card(0, 'family-a');
  const duplicate = {
    ...card(99, 'family-b'),
    key: 'https://media.example/a-second-record.jpg',
    imageUrl: 'https://media.example/a-second-record.jpg',
    resultId: 'a-second-result-id',
    mediaChecksum: 'a'.repeat(64),
  };
  const firstRecord = {
    ...original,
    mediaChecksum: 'a'.repeat(64),
  };
  const proposal = proposeGrid(
    [firstRecord, duplicate, ...Array.from({ length: 12 }, (_, index) => card(index + 10, `family-${index % 4}`))],
    { actor: '刘学义' },
    'compiled',
  );

  assert.equal(proposal.slots.length, 9);
  assert.equal(
    [...proposal.slots, ...proposal.alternates]
      .filter(item => item.mediaChecksum === 'a'.repeat(64)).length,
    1,
  );
});

test('a 12-frame Event record preserves mode, family provenance, export order, and handoff context', async () => {
  const proposal = proposeGrid(
    Array.from({ length: 12 }, (_, index) => card(index, 'event-family', 'Magazine cover night')),
    { actor: '刘学义' },
    'event',
  );
  const grid = gridRecordFromProposal(
    proposal.slots,
    proposal.rationale,
    new Date('2026-08-31T12:00:00.000Z'),
  );
  const source = await creatorDraftSourceFromGrid(grid);
  const exportEvent = gridExportEventFromRecord(grid, 'premium');

  assert.equal(grid.images.length, 12);
  assert.deepEqual(grid.editorial, {
    mode: 'event',
    compositionSize: 12,
    arrangement: 'automatic',
    primaryFamilyId: 'event-family',
    primaryFamilyLabel: 'Magazine cover night',
    evidenceBasis: 'batch',
  });
  assert.ok(grid.images.every(image => image.familyId === 'event-family'));
  assert.equal(source.orderedImages.length, 12);
  assert.equal(source.creativeContext.editorialMode, 'event');
  assert.equal(source.creativeContext.compositionSize, 12);
  assert.equal(source.creativeContext.arrangement, 'automatic');
  assert.equal(source.creativeContext.primaryFamily, 'Magazine cover night');
  assert.equal(source.creativeContext.evidenceBasis, 'batch');
  assert.equal(exportEvent.editorialMode, 'event');
  assert.equal(exportEvent.compositionSize, 12);
  assert.equal(exportEvent.arrangement, 'automatic');
  assert.deepEqual(exportEvent.familyIds, ['event-family']);
});

test('manual swaps remain explicit after a smart proposal is creator-arranged', () => {
  const slots = Array.from({ length: 9 }, (_, index) => card(index, `family-${index % 3}`));
  const rationale = rebuildRationale(slots, {}, ['family-2'], 'compiled', 9);
  const grid = gridRecordFromProposal(slots, rationale, new Date('2026-08-31T12:00:00.000Z'));

  assert.equal(grid.editorial?.mode, 'compiled');
  assert.equal(grid.editorial?.arrangement, 'creator-arranged');
  assert.match(grid.generationPrompt || '', /Deliberately swapped in by the operator/);
});