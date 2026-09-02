import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasInvalidVibeAtlasEditionDate,
  initialCollectionType,
  initialVibeAtlasEditionDate,
  initialVibeAtlasView,
  isAdminEntryLocation,
  isVibeAtlasArchiveLocation,
  isValidVibeAtlasEditionDate,
  resolveFandomProductRoute,
} from '../src/utils/fandomRoutes.ts';

test('resolves the three Fandom product routes and keeps magic-link verification in Vibe Atlas', () => {
  assert.equal(resolveFandomProductRoute('/'), 'launchpad');
  assert.equal(resolveFandomProductRoute('/', '?admin=true'), 'vibe-atlas');
  assert.equal(isAdminEntryLocation('/', '?admin=true'), true);
  assert.equal(isAdminEntryLocation('/auth/verify', '', '#token=redacted&next=plan'), true);
  assert.equal(isAdminEntryLocation('/auth/verify', '', '#token=redacted&next=collection'), false);
  assert.equal(resolveFandomProductRoute('/vibe-atlas'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/vibe-atlas/'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/vibe-atlas/archive'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/memeforge/middle-earth'), 'middle-earth');
  assert.equal(resolveFandomProductRoute('/auth/verify'), 'vibe-atlas');
  assert.equal(resolveFandomProductRoute('/vibe-atlas/veteran-journal'), 'veteran-journal');
  assert.equal(resolveFandomProductRoute('/vibe-atlas/veteran-journal/'), 'veteran-journal');
  assert.equal(resolveFandomProductRoute('/unknown'), 'launchpad');
});

test('reads the requested Vibe Atlas section without allowing arbitrary views', () => {
  assert.equal(initialVibeAtlasView('?view=membership'), 'membership');
  assert.equal(initialVibeAtlasView('?view=plan'), 'plan');
  assert.equal(initialVibeAtlasView('?admin=true'), 'plan');
  assert.equal(initialVibeAtlasView('?view=collection'), 'collection');
  assert.equal(initialVibeAtlasView('?view=results'), 'collection');
  assert.equal(initialVibeAtlasView('?view=builder'), 'collection');
  assert.equal(initialVibeAtlasView('?view=unknown'), 'daily');
  assert.equal(initialVibeAtlasView(''), 'daily');
});

test('accepts only real calendar dates for shareable Vibe Atlas editions', () => {
  assert.equal(isValidVibeAtlasEditionDate('2026-08-30'), true);
  assert.equal(isValidVibeAtlasEditionDate('2026-02-29'), false);
  assert.equal(isValidVibeAtlasEditionDate('2026-13-01'), false);
  assert.equal(isValidVibeAtlasEditionDate('2026-8-1'), false);
  assert.equal(initialVibeAtlasEditionDate('?date=2026-08-30'), '2026-08-30');
  assert.equal(initialVibeAtlasEditionDate('?date=2026-02-29'), null);
  assert.equal(initialVibeAtlasEditionDate(''), null);
  assert.equal(hasInvalidVibeAtlasEditionDate('?date=2026-02-29'), true);
  assert.equal(hasInvalidVibeAtlasEditionDate('?view=collection'), false);
});

test('collection links open the requested Vibe Atlas tool', () => {
  assert.equal(initialCollectionType('?view=collection'), 'grids');
  assert.equal(initialCollectionType('?view=results'), 'results');
  assert.equal(initialCollectionType('?view=builder'), 'builder');
  assert.equal(initialCollectionType(''), 'grids');
});

test('the archive has a dedicated public route', () => {
  assert.equal(isVibeAtlasArchiveLocation('/vibe-atlas/archive'), true);
  assert.equal(isVibeAtlasArchiveLocation('/vibe-atlas/archive/'), true);
  assert.equal(isVibeAtlasArchiveLocation('/vibe-atlas'), false);
});