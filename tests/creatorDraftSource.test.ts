import assert from 'node:assert/strict';
import test from 'node:test';
import type { BuilderCard } from '../src/utils/gridBuilder.ts';
import { gridRecordFromProposal, manualGridRationale } from '../src/utils/gridBuilder.ts';
import {
  CREATOR_DRAFT_SOURCE_SCHEMA,
  creatorDraftSourceFromGrid,
  normalizeCreatorPlatforms,
} from '../src/utils/creatorDraft.ts';
import { sourceVersionForGrid } from '../netlify/functions/lib/creator-grid-handoff.js';
import {
  classifyGridProvenance,
  type ReleaseCandidateIdentity,
} from '../src/utils/approvedBoardProvenance.ts';

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

function approvedIdentity(orderedCandidateIds: string[]): ReleaseCandidateIdentity {
  return {
    schemaVersion: 1,
    auditRunId: 'audit-run-1',
    publicationManifestId: null,
    publicationSourceType: 'operator_rescue',
    rescueReceiptId: 'rescue-receipt-1',
    boardHash: 'a'.repeat(64),
    orderedCandidateIds,
    actorId: 'zhao-lusi',
    vibeKey: 'spring',
    curationVersion: 4,
    promiseContractVersion: 3,
    identityProfileVersion: 2,
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

test('Creator Draft source carries stable ordered provenance and creative context', async () => {
  const slots = [3, 1, 2, 4, 5, 6, 7, 8, 9].map(card);
  const grid = gridRecordFromProposal(
    slots,
    manualGridRationale(slots, '赵露思'),
    new Date('2026-08-30T12:00:00.000Z'),
  );
  const first = await creatorDraftSourceFromGrid(grid);
  const second = await creatorDraftSourceFromGrid(grid);

  assert.equal(first.schema, CREATOR_DRAFT_SOURCE_SCHEMA);
  assert.equal(first.sourceVersion, sourceVersionForGrid(grid));
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.deepEqual(first.orderedImages.map(image => image.resultId), slots.map(item => item.resultId));
  assert.match(first.creativeContext.brief, /Build Your Own/);
});

test('approved board provenance distinguishes exact, derived, and unverified grids', async () => {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card);
  const base = gridRecordFromProposal(
    slots,
    manualGridRationale(slots, '赵露思'),
    new Date('2026-08-30T12:00:00.000Z'),
  );
  const candidates = base.images.map(image => ({
    candidateId: image.resultId,
    imageDigest: 'a'.repeat(64),
    thumbnail: image.imageUrl,
    title: image.title,
    source: image.publisher || '',
    batchRank: image.batchRank ?? null,
  }));
  const identity = approvedIdentity(base.images.map(image => image.resultId));
  identity.boardHash = await hashBoard(candidates);
  const exact = {
    ...base,
    vibeKey: 'spring',
    images: base.images.map((image, index) => ({
      ...image,
      media: {
        schemaVersion: 1 as const,
        assetId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        deliveryUrl: image.imageUrl,
        thumbnailUrl: image.imageUrl,
        mimeType: 'image/jpeg' as const,
        sizeBytes: 100,
        checksum: 'a'.repeat(64),
        dimensions: { width: 1200, height: 1500 },
        association: { type: 'collection' as const, id: 'vibe-atlas', itemId: base.id },
      },
    })),
    releaseCandidateProvenance: {
      schemaVersion: 1 as const,
      source: 'actor-preflight-approval' as const,
      identity,
      candidates,
    },
  };
  const derived = {
    ...exact,
    images: [exact.images[1], exact.images[0], ...exact.images.slice(2)]
      .map((image, gridPosition) => ({ ...image, gridPosition })),
  };

  assert.deepEqual(await classifyGridProvenance(exact), {
    classification: 'exact-approved-board',
    approvalAuthority: true,
    releaseCandidateIdentity: identity,
    sourceReleaseCandidateIdentity: identity,
  });
  assert.equal((await classifyGridProvenance(derived)).classification, 'derived-from-approved-board');
  assert.equal((await classifyGridProvenance(derived)).approvalAuthority, false);
  const duplicatePosition = {
    ...exact,
    images: exact.images.map((image, index) => (
      index === 8 ? { ...image, gridPosition: 7 } : image
    )),
  };
  const missingPosition = { ...exact, images: exact.images.slice(0, 8) };
  const nonContiguousPosition = {
    ...exact,
    images: exact.images.map((image, index) => (
      index === 8 ? { ...image, gridPosition: 9 } : image
    )),
  };
  assert.equal(
    (await classifyGridProvenance(duplicatePosition)).classification,
    'derived-from-approved-board',
  );
  assert.equal(
    (await classifyGridProvenance(missingPosition)).classification,
    'derived-from-approved-board',
  );
  assert.equal(
    (await classifyGridProvenance(nonContiguousPosition)).classification,
    'derived-from-approved-board',
  );
  assert.equal((await classifyGridProvenance({
    ...exact,
    images: exact.images.map(image => ({ ...image, media: undefined })),
  })).classification, 'derived-from-approved-board');
  assert.equal((await classifyGridProvenance(base)).classification, 'unverified-saved-grid');

  const exactSource = await creatorDraftSourceFromGrid(exact);
  const derivedSource = await creatorDraftSourceFromGrid(derived);
  assert.equal(exactSource.boardProvenance.approvalAuthority, true);
  assert.equal(derivedSource.boardProvenance.approvalAuthority, false);
  assert.equal(derivedSource.boardProvenance.releaseCandidateIdentity, null);
  assert.deepEqual(derivedSource.boardProvenance.sourceReleaseCandidateIdentity, identity);
});

async function hashBoard(candidates: Array<{
  thumbnail: string;
  title: string;
  source: string;
  batchRank: number | null;
}>): Promise<string> {
  const material = JSON.stringify(candidates.map(({ thumbnail, title, source, batchRank }) => ({
    thumbnail,
    title,
    source,
    batchRank,
  })));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

test('Creator Draft source uses the server artifact identity when a synced record carries both ids', async () => {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card);
  const grid = {
    ...gridRecordFromProposal(
      slots,
      manualGridRationale(slots, '赵露思'),
      new Date('2026-08-30T12:00:00.000Z'),
    ),
    artifactId: 'server-grid-1',
  };

  const source = await creatorDraftSourceFromGrid(grid, ['instagram', 'rednote']);

  assert.equal(source.sourceId, 'server-grid-1');
  assert.equal(source.sourceVersion, sourceVersionForGrid(grid));
  assert.match(source.idempotencyKey, /^grid:server-grid-1:/);
});

test('Creator Draft source version changes for every mutable render and envelope input', async () => {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card);
  const grid = gridRecordFromProposal(
    slots,
    manualGridRationale(slots, '赵露思'),
    new Date('2026-08-30T12:00:00.000Z'),
  );
  const original = await creatorDraftSourceFromGrid(grid);
  const changedImage = await creatorDraftSourceFromGrid({
    ...grid,
    images: grid.images.map((image, index) => (
      index === 0 ? { ...image, imageUrl: 'https://media.example/replacement.jpg' } : image
    )),
  });
  const changedContext = await creatorDraftSourceFromGrid({
    ...grid,
    actor: '不同演员',
    vibe: '不同氛围',
    generationPrompt: 'A materially different creative brief.',
  });
  const changedRank = await creatorDraftSourceFromGrid({
    ...grid,
    images: grid.images.map((image, index) => (
      index === 0 ? { ...image, batchRank: 9 } : image
    )),
  });
  const changedRecoverySource = await creatorDraftSourceFromGrid({
    ...grid,
    images: grid.images.map((image, index) => (
      index === 0
        ? {
          ...image,
          mediaRecovery: {
            classification: 'media-backed' as const,
            status: 'recovered' as const,
            attemptedAt: '2026-08-30T12:30:00.000Z',
            sourceUrl: 'https://media.example/original.jpg',
          },
        }
        : image
    )),
  });

  assert.match(original.sourceVersion, /^sha256:[a-f0-9]{64}$/);
  assert.notEqual(changedImage.sourceVersion, original.sourceVersion);
  assert.notEqual(changedImage.idempotencyKey, original.idempotencyKey);
  assert.notEqual(changedContext.sourceVersion, original.sourceVersion);
  assert.notEqual(changedContext.idempotencyKey, original.idempotencyKey);
  assert.notEqual(changedRank.sourceVersion, original.sourceVersion);
  assert.notEqual(changedRecoverySource.sourceVersion, original.sourceVersion);
});

test('Creator Draft platform selections are canonical and part of handoff identity', async () => {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(card);
  const grid = gridRecordFromProposal(
    slots,
    manualGridRationale(slots, '赵露思'),
    new Date('2026-08-30T12:00:00.000Z'),
  );
  const rednote = await creatorDraftSourceFromGrid(grid, ['rednote']);
  const weibo = await creatorDraftSourceFromGrid(grid, ['weibo']);
  const both = await creatorDraftSourceFromGrid(grid, ['weibo', 'rednote', 'instagram']);

  assert.deepEqual(both.platforms, ['rednote', 'weibo', 'instagram']);
  assert.equal(rednote.sourceVersion, both.sourceVersion, 'the grid version is independent of distribution');
  assert.notEqual(rednote.idempotencyKey, weibo.idempotencyKey);
  assert.notEqual(rednote.idempotencyKey, both.idempotencyKey);
  const instagram = await creatorDraftSourceFromGrid(grid, ['instagram']);
  assert.deepEqual(instagram.platforms, ['instagram']);
  assert.notEqual(instagram.idempotencyKey, rednote.idempotencyKey);
  assert.throws(() => normalizeCreatorPlatforms([]), /Select Rednote/i);
  assert.throws(() => normalizeCreatorPlatforms(['rednote', 'rednote']), /Select Rednote/i);
});