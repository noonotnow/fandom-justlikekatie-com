import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublicArchiveEdition,
  publicArchiveInventoryNotices,
} from '../src/hooks/usePublicArchiveInventory';
import type { PublicArchiveRecord } from '../src/contracts/publicArchiveRecord.js';

test('dated public inventory normalization preserves verified per-image edition links', () => {
  const publicRecord: PublicArchiveRecord = {
    actorPath: '/vibe-atlas/actors/archive-actor',
    editionPath: '/vibe-atlas/editions/2026-09-19/archive-actor',
  };
  const edition = normalizePublicArchiveEdition({
    date: '2026-09-19',
    actorId: 'archive-actor',
    actorName: 'Archive Actor',
    actorShortNameEn: 'Archive Actor',
    actorAccentColor: '#123456',
    vibeEmoji: '✨',
    vibeLabel: 'Archive',
    vibeLabelEn: 'Archive',
    vibeSubtitle: 'Archive edition',
    vibeSubtitleEn: 'Archive edition',
    publicRecord,
    rankedBatches: [{
      query: 'archive',
      results: [{
        imageId: 'archive:2026-09-19:card-0',
        title: 'Archive image',
        thumbnail: 'https://images.example/archive.jpg',
        link: 'https://source.example/archive',
        source: 'Publisher',
      }],
    }],
  }, '2026-09-19');

  assert.deepEqual(edition.publicRecord, publicRecord);
  assert.deepEqual(edition.rankedBatches[0].results[0].archiveSource, {
    date: '2026-09-19',
    publicRecord,
  });
});

test('public Archive partial-page metadata clearly reports omitted editions and bounded scans', () => {
  assert.deepEqual(
    publicArchiveInventoryNotices({
      page: {
        status: 'partial',
        partial: true,
        scanned: 24,
        unavailableCount: 2,
        scanLimitReached: true,
      },
      actorInventory: { complete: false },
    }),
    [
      '2 Archive editions were omitted because their public records could not be verified.',
      'The safe Archive scan limit was reached; additional editions may be available on later pages.',
      'The star count covers loaded editions only, not the complete Archive.',
    ],
  );
});

test('public Archive surfaces explicit partialFailures metadata without trusting backend copy', () => {
  assert.deepEqual(
    publicArchiveInventoryNotices({
      partialFailures: [{ date: '2026-09-19', reason: 'sensitive backend detail' }],
      page: { hasMore: false, nextCursor: null },
    }),
    ['1 Archive edition was omitted because its public record could not be verified.'],
  );
});

test('complete public Archive pages do not display omission warnings', () => {
  assert.deepEqual(
    publicArchiveInventoryNotices({
      page: {
        status: 'complete',
        partial: false,
        unavailableCount: 0,
        scanLimitReached: false,
      },
      actorInventory: { complete: true },
    }),
    [],
  );
});