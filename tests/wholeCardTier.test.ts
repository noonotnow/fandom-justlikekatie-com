import assert from 'node:assert/strict';
import test from 'node:test';
import type { RankedBatch, StarOfDayData } from '../src/hooks/useStarOfDay.ts';
import { buildExportPayload, classifyEditionTier } from '../src/utils/exportCanvas.ts';
import { renderGridCardPng } from '../src/utils/planHandoff.ts';
import {
  applyWholeCardTierOverride,
  boardIdentity,
  resolveWholeCardTier,
} from '../src/utils/wholeCardTier.ts';

// A batch that auto-classifies as 'standard' under classifyEditionTier's
// heuristics (plenty of results, plenty of distinct sources, primary
// provider) — used to prove manual overrides win regardless of the
// underlying retrieval shape.
const standardBatch: RankedBatch = {
  query: '刘学义 碎裂美感',
  results: Array.from({ length: 9 }, (_, i) => ({
    title: `Result ${i}`,
    thumbnail: `/thumb-${i}`,
    link: `https://source.example/${i}`,
    source: `source-${i % 5}`,
  })),
  count: 9,
  distinctSources: 5,
  provider: 'primary',
};

// A batch that auto-classifies as 'legendary' via the deep-fallback +
// low-count/low-diversity heuristic — used to prove that leaving the
// override unset (`null`) preserves automatic inference rather than
// forcing 'standard'.
const autoLegendaryBatch: RankedBatch = {
  query: '刘学义 罕见氛围',
  results: [
    { title: 'A', thumbnail: '/a', link: 'https://source.example/a', source: 'only-source' },
  ],
  count: 3,
  distinctSources: 1,
  provider: 'yandex_images',
};

const baseData: StarOfDayData = {
  actorId: 'liu-xueyi',
  actorName: '刘学义',
  actorShortNameEn: 'Liu Xueyi',
  actorAccentColor: '#123456',
  vibeEmoji: '✨',
  vibeLabel: '碎裂美感',
  vibeLabelEn: 'Shattered Beauty',
  vibeSubtitle: '漂亮得不太稳定',
  vibeSubtitleEn: 'Beauty on the verge',
  date: '2026-07-31',
  generatedAt: '2026-07-31T13:00:00.000Z',
  rankedBatches: [standardBatch, autoLegendaryBatch],
};

test('boardIdentity is a stable key derived from date and actorId', () => {
  assert.equal(boardIdentity(baseData), '2026-07-31::liu-xueyi');
  assert.notEqual(
    boardIdentity(baseData),
    boardIdentity({ ...baseData, date: '2026-08-01' }),
  );
  assert.notEqual(
    boardIdentity(baseData),
    boardIdentity({ ...baseData, actorId: 'other-actor' }),
  );
});

test('applyWholeCardTierOverride does not mutate the original data or its ranked batches', () => {
  const before = JSON.parse(JSON.stringify(baseData));
  const overridden = applyWholeCardTierOverride(baseData, 'misprint');

  assert.notEqual(overridden, baseData);
  assert.notEqual(overridden.rankedBatches, baseData.rankedBatches);
  assert.notEqual(overridden.rankedBatches[0], baseData.rankedBatches[0]);
  assert.deepEqual(baseData, before, 'original StarOfDayData must be untouched');
  assert.equal(
    baseData.rankedBatches[0].misprint,
    undefined,
    'original chosen batch must not gain a misprint flag',
  );
});

test('applyWholeCardTierOverride only touches the chosen (first) ranked batch, never other batches or images', () => {
  const overridden = applyWholeCardTierOverride(baseData, 'legendary');

  // Only rankedBatches[0] is classified — individual images/other batches
  // (retrieval/ranking data) are passed through by reference, untouched.
  assert.equal(overridden.rankedBatches[1], baseData.rankedBatches[1]);
  assert.equal(overridden.rankedBatches[0].results, baseData.rankedBatches[0].results);
  assert.equal(overridden.rankedBatches.length, baseData.rankedBatches.length);
});

test('setting the override to "misprint" or "legendary" forces classifyEditionTier regardless of auto-classification heuristics', () => {
  const misprintOverride = applyWholeCardTierOverride(baseData, 'misprint');
  assert.equal(classifyEditionTier(misprintOverride.rankedBatches[0]), 'misprint');

  const legendaryOverride = applyWholeCardTierOverride(baseData, 'legendary');
  assert.equal(classifyEditionTier(legendaryOverride.rankedBatches[0]), 'legendary');

  // Sanity: the un-overridden standard batch really would auto-classify as
  // 'standard', proving the override above is what changed the outcome.
  assert.equal(classifyEditionTier(standardBatch), 'standard');
});

test('intentional cross-fandom records export as Legendary Misprints rather than automatic Legendary editions', () => {
  const chosen = {
    ...standardBatch,
    misprint: true,
    legendary: true,
    intentionalMisprint: true,
  };
  assert.equal(classifyEditionTier(chosen), 'legendary-misprint');
});

test('clearing the override (tier: null) restores automatic classification instead of forcing "standard"', () => {
  const dataWithAutoLegendaryChosen: StarOfDayData = {
    ...baseData,
    rankedBatches: [autoLegendaryBatch, standardBatch],
  };

  const cleared = applyWholeCardTierOverride(dataWithAutoLegendaryChosen, null);

  assert.equal(cleared.rankedBatches[0].misprint, false);
  assert.equal(cleared.rankedBatches[0].legendary, false);
  // Automatic heuristics still classify this batch as legendary — clearing
  // the manual override must not silently force 'standard'.
  assert.equal(classifyEditionTier(cleared.rankedBatches[0]), 'legendary');
});

test('resolveWholeCardTier preserves the tier while the board identity is unchanged', () => {
  assert.equal(resolveWholeCardTier('2026-07-31::liu-xueyi', '2026-07-31::liu-xueyi', 'misprint'), 'misprint');
  assert.equal(resolveWholeCardTier(null, null, null), null);
});

test('resolveWholeCardTier resets to null whenever the board identity changes (new board/actor/date)', () => {
  assert.equal(resolveWholeCardTier('2026-07-31::liu-xueyi', '2026-08-01::liu-xueyi', 'misprint'), null);
  assert.equal(resolveWholeCardTier('2026-07-31::liu-xueyi', '2026-07-31::other-actor', 'legendary'), null);
  assert.equal(resolveWholeCardTier(null, '2026-07-31::liu-xueyi', 'misprint'), null);
});

test('the whole-board override flows through the exact Send-to-PLAN grid-card render/handoff path', async () => {
  const overridden = applyWholeCardTierOverride(baseData, 'legendary');
  let receivedData: StarOfDayData | undefined;

  const fakeCanvas = {
    toBlob(callback: BlobCallback) {
      callback(new Blob(['whole-card'], { type: 'image/png' }));
    },
  } as HTMLCanvasElement;

  await renderGridCardPng(overridden, async (data, variant) => {
    receivedData = data;
    assert.equal(variant, 'full');
    return fakeCanvas;
  });

  assert.equal(receivedData, overridden);
  assert.equal(classifyEditionTier(receivedData!.rankedBatches[0]), 'legendary');
});

// saveShareCard (the "Save full share card" action wired to ExportButton /
// useExportCard) itself draws to an actual <canvas> and loads fonts/images
// over the network, so it isn't unit-testable end-to-end in this plain-Node
// test runner (no jsdom/canvas here) — same constraint that made the
// Send-to-PLAN test above inject a fake renderer rather than calling the
// real one. buildExportPayload is the pure, DOM-free seam saveShareCard and
// renderExportCanvas both call *before* touching the canvas: it is where
// `payload.chosen` and `payload.badgeTier` — the values that drive both the
// composited corner badge and the toast/filename edition tag — are derived
// from `classifyEditionTier`. Proving the override survives into this
// payload proves it reaches saveShareCard's real tier-resolution path.
test('the whole-board override flows into the exact Save-full-share-card payload (buildExportPayload)', () => {
  const misprintOverride = applyWholeCardTierOverride(baseData, 'misprint');
  const misprintPayload = buildExportPayload(misprintOverride);
  assert.equal(classifyEditionTier(misprintPayload.chosen), 'misprint');
  assert.equal(misprintPayload.badgeTier, 'misprint');

  const legendaryOverride = applyWholeCardTierOverride(baseData, 'legendary');
  const legendaryPayload = buildExportPayload(legendaryOverride);
  assert.equal(classifyEditionTier(legendaryPayload.chosen), 'legendary');
  assert.equal(legendaryPayload.badgeTier, 'legendary');

  // Clearing the override (tier: null) must not force 'standard' — automatic
  // classification should still drive the share-card badge.
  const dataWithAutoLegendaryChosen: StarOfDayData = {
    ...baseData,
    rankedBatches: [autoLegendaryBatch, standardBatch],
  };
  const clearedPayload = buildExportPayload(
    applyWholeCardTierOverride(dataWithAutoLegendaryChosen, null),
  );
  assert.equal(classifyEditionTier(clearedPayload.chosen), 'legendary');
  assert.equal(clearedPayload.badgeTier, 'legendary');
});
