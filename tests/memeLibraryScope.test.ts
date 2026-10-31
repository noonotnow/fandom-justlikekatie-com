import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBFactory } from 'fake-indexeddb';
import {
  collectionScopeForCard, normalizeCardForCollection, dbSaveCard,
  dbGetVisibleCardsByScope, dbBuildSyncRequest, dbSetActiveAccount, dbSetMergeDecision,
  dbApplySyncResponse, dbRemoveCard, dbReplaceCardImage, dbGetAllCards, type CardRecord,
} from '../src/utils/collectionDB.ts';
import type { MediaReference } from '../src/utils/mediaReference.ts';

const card = (id: string, scope?: CardRecord['collectionScope']): CardRecord => ({
  localId: id, imageUrl: `https://images.example.com/${id}.png`,
  thumbnailUrl: `https://images.example.com/${id}.png`,
  actor: 'C-drama', actorEn: 'C-drama', vibe: 'Finished meme', vibeEn: 'Finished meme',
  vibeEmoji: '', capturedDate: '2026-10-31', collectionScope: scope,
});

test('C-drama classification is distinct and does not reinterpret ordinary Vibe Atlas or LOTR records', () => {
  const cdrama = { ...card('c'), contentKind: 'c-drama-meme' as const };
  assert.equal(collectionScopeForCard(cdrama), 'c-drama');
  assert.equal(collectionScopeForCard({ ...card('route'), sourceRoute: '/memeforge/c-drama' }), 'c-drama');
  assert.equal(collectionScopeForCard(card('v')), 'vibe-atlas');
  assert.equal(collectionScopeForCard({ ...card('m'), contentKind: 'middle-earth-meme' }), 'middle-earth');
  assert.deepEqual(normalizeCardForCollection(cdrama), cdrama);
  assert.equal(collectionScopeForCard({ ...cdrama, collectionScope: 'vibe-atlas' }), 'vibe-atlas', 'explicit scope remains authoritative');
});

test('shared storage and free sync retain the C-drama scope, exclude LOTR from non-admin sync, and propagate removals', async () => {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  try {
    const c = { ...card('cdrama', 'c-drama'), contentKind: 'c-drama-meme' as const };
    await dbSaveCard(c);
    await dbSaveCard({ ...card('lotr', 'middle-earth'), contentKind: 'middle-earth-meme' });
    await dbSaveCard(card('atlas', 'vibe-atlas'));
    assert.equal((await dbGetVisibleCardsByScope(undefined, 'c-drama')).length, 1);
    assert.equal((await dbGetVisibleCardsByScope(undefined, 'vibe-atlas')).length, 1);
    await dbSetActiveAccount('account');
    await dbSetMergeDecision('account', true);
    const request = await dbBuildSyncRequest('account', false);
    const operations = request.operations as Array<{ localId: string; type: string; mutationId: string; item?: Record<string, unknown> }>;
    const upsert = operations.find(op => op.localId === 'cdrama')!;
    assert.equal(upsert.item?.collectionScope, 'c-drama');
    assert.equal(upsert.item?.contentKind, 'c-drama-meme');
    assert.equal(operations.some(op => op.localId === 'lotr'), false);
    await dbApplySyncResponse('account', {
      cursor: 1, items: [{ ...upsert.item, id: 'remote-cdrama', localId: 'cdrama', ownerAccountId: 'account', revision: 1 }],
      tombstones: [],
    }, [upsert]);
    const saved = await dbGetVisibleCardsByScope('account', 'c-drama');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].contentKind, 'c-drama-meme');
    await dbRemoveCard(saved[0].imageUrl);
    const removed = await dbBuildSyncRequest('account', false);
    assert.ok(removed.operations.some(op => op.type === 'delete' && op.localId === 'cdrama'));
    assert.equal((await dbGetVisibleCardsByScope('account', 'vibe-atlas')).length, 1);
    assert.equal((await dbGetVisibleCardsByScope('account', 'middle-earth')).length, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('identical MEDIA bytes cannot replace a different saved item or lens', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}');
  try {
    const canonical = card('collision-existing', 'middle-earth');
    const local = card('collision-local', 'c-drama');
    await dbSaveCard(canonical);
    await dbSaveCard(local);
    const media: MediaReference = {
      schemaVersion: 1, assetId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      deliveryUrl: canonical.imageUrl, thumbnailUrl: canonical.thumbnailUrl,
      mimeType: 'image/png', sizeBytes: 100, checksum: 'a'.repeat(64),
      dimensions: { width: 10, height: 10 },
      association: { type: 'collection', id: 'c-drama', itemId: local.localId! },
    };
    await assert.rejects(dbReplaceCardImage(local.imageUrl, media), /local copy was kept/);
    const records = await dbGetAllCards();
    assert.ok(records.some(item => item.localId === canonical.localId && item.collectionScope === 'middle-earth'));
    assert.ok(records.some(item => item.localId === local.localId && item.collectionScope === 'c-drama'));
  } finally { globalThis.fetch = originalFetch; }
});
