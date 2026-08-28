import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCollectionType,
  initialVibeAtlasPacketId,
  initialVibeAtlasView,
  resolveFandomProductRoute,
  vibeAtlasPacketPath,
} from '../src/utils/fandomRoutes.ts';

test('resolves the three Fandom product routes and keeps magic-link verification in Vibe Atlas', () => {
  assert.equal(resolveFandomProductRoute('/'), 'launchpad');
  assert.equal(resolveFandomProductRoute('/vibe-atlas'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/vibe-atlas/'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/memeforge/middle-earth'), 'middle-earth');
  assert.equal(resolveFandomProductRoute('/auth/verify'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/unknown'), 'launchpad');
});

test('reads the requested Vibe Atlas section without allowing arbitrary views', () => {
  assert.equal(initialVibeAtlasView('?view=plan'), 'plan');
  assert.equal(initialVibeAtlasView('?view=collection'), 'collection');
  assert.equal(initialVibeAtlasView('?view=results'), 'collection');
  assert.equal(initialVibeAtlasView('?view=builder'), 'collection');
  assert.equal(initialVibeAtlasView('?view=unknown'), 'daily');
  assert.equal(initialVibeAtlasView(''), 'daily');
});

test('collection links open the requested Vibe Atlas tool', () => {
  assert.equal(initialCollectionType('?view=collection'), 'grids');
  assert.equal(initialCollectionType('?view=results'), 'results');
  assert.equal(initialCollectionType('?view=builder'), 'builder');
  assert.equal(initialCollectionType(''), 'grids');
});

test('packet workspace URLs preserve the exact packet selection', () => {
  assert.equal(initialVibeAtlasPacketId('?view=plan&packet=packet-123'), 'packet-123');
  assert.equal(initialVibeAtlasPacketId('?view=plan&packet='), null);
  assert.equal(vibeAtlasPacketPath('packet with spaces'), '/vibe-atlas?view=plan&packet=packet%20with%20spaces');
});