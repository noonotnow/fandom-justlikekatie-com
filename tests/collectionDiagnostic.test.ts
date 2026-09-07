import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollectionDiagnostic } from '../src/utils/collectionDiagnostic.ts';
import type {
  CardRecord,
  CollectionSyncState,
  GridRecord,
} from '../src/utils/collectionDB.ts';

test('preserves collection provenance in a diagnostic export', () => {
  const card = {
    localId: 'local-card',
    serverId: 'server-card',
    imageUrl: 'https://media.example/card.jpg',
    thumbnailUrl: 'https://media.example/card-thumb.jpg',
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    vibe: 'Vibe',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    capturedDate: '2026-07-28',
    resultId: 'shared-result',
    sourceUrl: 'https://source.example/card',
    contentKind: 'middle-earth-meme' as const,
    collectionScope: 'vibe-atlas' as const,
  } satisfies CardRecord;
  const grid = {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: 'grid-1',
    actorId: 'liu-xueyi',
    actor: '刘学义',
    actorEn: 'Liu Xueyi',
    actorAccentColor: '#fff',
    vibe: 'Vibe',
    vibeEn: 'Vibe',
    vibeEmoji: '✨',
    vibeSubtitle: 'Subtitle',
    vibeSubtitleEn: 'Subtitle',
    searchSpell: 'query',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: '2026-07-28',
    generatedAt: '2026-07-28T12:00:00.000Z',
    savedAt: '2026-07-28T12:01:00.000Z',
    sourceRoute: '/vibe-atlas',
    images: [],
  } satisfies GridRecord;
  const syncState = {
    key: 'state',
    clientId: 'client-1',
    activeAccountId: 'account-1',
    cursors: {},
    mergeDecisions: {},
    mappingsByAccount: {
      'account-1': { 'local-card': 'server-card' },
    },
    pendingDeletesByAccount: {},
    acknowledgedUpsertsByAccount: {},
  } satisfies CollectionSyncState;

  const diagnostic = createCollectionDiagnostic(
    [card],
    [grid],
    syncState,
    new Date('2026-09-07T14:30:00.000Z'),
    'account-1',
  );

  assert.deepEqual(diagnostic.counts, { cards: 1, grids: 1 });
  assert.equal(diagnostic.exportedAt, '2026-09-07T14:30:00.000Z');
  assert.equal(diagnostic.cards[0].localId, 'local-card');
  assert.equal(diagnostic.cards[0].resultId, 'shared-result');
  assert.equal(diagnostic.cards[0].contentKind, 'middle-earth-meme');
  assert.equal(diagnostic.cards[0].collectionScope, 'vibe-atlas');
  assert.equal(diagnostic.syncState.mappingsByAccount['account-1']['local-card'], 'server-card');
});
