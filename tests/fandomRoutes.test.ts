import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialVibeAtlasView,
  resolveFandomProductRoute,
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
  assert.equal(initialVibeAtlasView('?view=unknown'), 'daily');
  assert.equal(initialVibeAtlasView(''), 'daily');
});