import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasMalformedGridBuilderSource,
  hasInvalidVibeAtlasEditionDate,
  initialCollectionType,
  initialGridBuilderSource,
  initialVibeAtlasEditionDate,
  initialVibeAtlasView,
  isAdminEntryLocation,
  isPublishingHandoffPreview,
  isVibeAtlasArchiveLocation,
  isValidVibeAtlasEditionDate,
  resolveFandomProductRoute,
} from '../src/utils/fandomRoutes.ts';

test('resolves the three Fandom product routes and keeps magic-link verification in Vibe Atlas', () => {
  assert.equal(resolveFandomProductRoute('/'), 'launchpad');
  assert.equal(resolveFandomProductRoute('/', '?admin=true'), 'vibe-atlas');
  assert.equal(isAdminEntryLocation('/', '?admin=true'), true);
  assert.equal(isAdminEntryLocation('/auth/verify', '', '#token=redacted&next=admin'), true);
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
  assert.equal(initialVibeAtlasView('?view=plan'), 'admin');
  assert.equal(initialVibeAtlasView('?admin=true'), 'admin');
  assert.equal(initialVibeAtlasView('?view=admin'), 'admin');
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

test('grid builder links keep Daily Drop and validated edition inventory separate from My Collection', () => {
  assert.equal(initialGridBuilderSource('?view=builder&source=daily'), 'daily');
  assert.equal(initialGridBuilderSource('?view=builder&source=edition&date=2026-09-19'), 'edition');
  assert.equal(initialGridBuilderSource('?view=builder&source=edition&date=2026-02-29'), 'collection');
  assert.equal(initialGridBuilderSource('?view=builder&source=edition'), 'collection');
  assert.equal(initialGridBuilderSource('?view=builder'), 'collection');
  assert.equal(initialGridBuilderSource('?view=builder&source=unknown'), 'collection');
  assert.equal(initialGridBuilderSource('?view=collection&source=daily'), 'collection');
  assert.equal(hasMalformedGridBuilderSource('?view=builder&source=unknown'), true);
  assert.equal(hasMalformedGridBuilderSource('?view=builder&source=edition&date=2026-02-29'), true);
  assert.equal(hasMalformedGridBuilderSource('?view=builder&source=edition&date=2026-09-19'), false);
  assert.equal(hasMalformedGridBuilderSource('?view=builder&source=daily'), false);
  assert.equal(hasMalformedGridBuilderSource('?view=builder&source=collection'), false);
  assert.equal(hasMalformedGridBuilderSource('?view=builder'), false);
  assert.equal(hasMalformedGridBuilderSource('?view=collection&source=unknown'), false);
});

test('publishing handoff preview access is explicit and limited to this Netlify deploy preview', () => {
  assert.equal(
    isPublishingHandoffPreview(
      'deploy-preview-74--earnest-gecko-17eb0c.netlify.app',
      '?view=builder&handoff-preview=1',
    ),
    true,
  );
  assert.equal(
    isPublishingHandoffPreview('fandom.justlikekatie.com', '?handoff-preview=1'),
    false,
  );
  assert.equal(
    isPublishingHandoffPreview('deploy-preview-74--earnest-gecko-17eb0c.netlify.app', '?view=builder'),
    false,
  );
  assert.equal(
    isPublishingHandoffPreview('deploy-preview-74--evil-example.netlify.app', '?handoff-preview=1'),
    false,
  );
});

test('the archive has a dedicated public route', () => {
  assert.equal(isVibeAtlasArchiveLocation('/vibe-atlas/archive'), true);
  assert.equal(isVibeAtlasArchiveLocation('/vibe-atlas/archive/'), true);
  assert.equal(isVibeAtlasArchiveLocation('/vibe-atlas'), false);
});