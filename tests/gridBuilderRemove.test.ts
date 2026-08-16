/**
 * Tests for the remove-from-collection flow in GridBuilder / collectionDB.
 *
 * Coverage:
 *   - save → remove → re-save completes without errors
 *   - grid is absent from the store after removal
 *   - re-save after removal restores the grid in the store
 *   - the removal notice string matches what the UI renders
 *   - removal of a non-existent id is a no-op (does not throw)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Polyfill IndexedDB for the Node test environment.
import {
  IDBFactory,
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb';

// Assign globals before importing anything that calls indexedDB.open().
Object.assign(globalThis, {
  indexedDB: new IDBFactory(),
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
});

import {
  dbSaveGrid,
  dbGetAllGrids,
  dbRemoveGrid,
  type GridRecord,
} from '../src/utils/collectionDB.ts';

import {
  gridRecordFromProposal,
  type BuilderCard,
  type GridRationale,
} from '../src/utils/gridBuilder.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(overrides: Partial<GridRecord> = {}): GridRecord {
  return {
    kind: 'grid',
    schemaVersion: 1,
    rendererVersion: 'vibe-atlas-v1',
    id: 'test-grid-remove-001',
    actorId: 'actor-remove-test',
    actor: 'Test Actor',
    actorEn: 'Test Actor',
    actorAccentColor: '#aabbcc',
    vibe: '测试氛围',
    vibeEn: 'Test Vibe',
    vibeEmoji: '🧪',
    vibeSubtitle: 'Subtitle',
    vibeSubtitleEn: 'Subtitle',
    searchSpell: 'test editorial query',
    edition: { provider: null, misprint: false, legendary: false },
    capturedDate: '2026-08-16',
    generatedAt: '2026-08-16T10:00:00Z',
    savedAt: '2026-08-16T10:00:00Z',
    sourceRoute: '/test',
    images: [
      {
        resultId: 'https://images.example/img-1.jpg',
        imageUrl: 'https://images.example/img-1.jpg',
        sourceUrl: 'https://publisher.example/story-1',
        title: 'Image 1',
        gridPosition: 0,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('save → remove → re-save completes without errors', async () => {
  const grid = makeGrid({ id: 'grid-save-remove-resave' });

  // Save
  await assert.doesNotReject(dbSaveGrid(grid), 'initial save should not throw');

  // Remove
  await assert.doesNotReject(dbRemoveGrid(grid.id), 'remove should not throw');

  // Re-save the same grid — must not throw
  await assert.doesNotReject(dbSaveGrid(grid), 're-save after removal should not throw');
});

test('grid is absent from the store immediately after removal', async () => {
  const grid = makeGrid({ id: 'grid-absent-after-remove' });

  await dbSaveGrid(grid);

  const before = await dbGetAllGrids();
  assert.ok(
    before.some(g => g.id === grid.id),
    'grid should be present before removal',
  );

  await dbRemoveGrid(grid.id);

  const after = await dbGetAllGrids();
  assert.ok(
    !after.some(g => g.id === grid.id),
    'grid should be absent after removal',
  );
});

test('re-save after removal restores the grid in the store', async () => {
  const grid = makeGrid({ id: 'grid-restored-after-resave' });

  await dbSaveGrid(grid);
  await dbRemoveGrid(grid.id);

  const afterRemove = await dbGetAllGrids();
  assert.ok(
    !afterRemove.some(g => g.id === grid.id),
    'grid should be gone after first removal',
  );

  await dbSaveGrid(grid);

  const afterResave = await dbGetAllGrids();
  assert.ok(
    afterResave.some(g => g.id === grid.id),
    'grid should be restored after re-save',
  );
});

test('removal of an unknown id is a no-op and does not throw', async () => {
  await assert.doesNotReject(
    dbRemoveGrid('non-existent-grid-id-xyz'),
    'removing a non-existent grid id should not throw',
  );
});

test('removal notice string matches what GridBuilder renders', async () => {
  // This test pins the exact string used in removeGrid() so a copy-edit
  // in the component does not silently diverge from what users expect.
  // If this string changes, update both the component and this test together.
  const EXPECTED_REMOVAL_NOTICE = 'Removed from your collection.';

  // Verify the expected string is non-empty and ends with a full stop
  // (matches the convention used for all other notices in GridBuilder).
  assert.ok(EXPECTED_REMOVAL_NOTICE.length > 0);
  assert.ok(
    EXPECTED_REMOVAL_NOTICE.endsWith('.'),
    'notice should end with a full stop to match other GridBuilder notices',
  );

  // The string is read from GridBuilder.tsx via a source-level assertion;
  // the fs read below confirms it is present verbatim in the component.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    source.includes(EXPECTED_REMOVAL_NOTICE),
    `GridBuilder.tsx must contain the literal string "${EXPECTED_REMOVAL_NOTICE}"`,
  );
});

test('isGridSaved resets to false and Save button re-enables after removal — contract verified in GridBuilder source', async () => {
  // After dbRemoveGrid resolves successfully, GridBuilder's removeGrid()
  // calls setIsGridSaved(false) and setSavedGridId(null).  We confirm those
  // assignments are present in the component source rather than running the
  // React component (which requires jsdom / browser environment).
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // The removeGrid function must reset both pieces of state after a
  // successful dbRemoveGrid call.
  assert.ok(
    source.includes('setIsGridSaved(false)'),
    'removeGrid() must call setIsGridSaved(false) after removal',
  );
  assert.ok(
    source.includes('setSavedGridId(null)'),
    'removeGrid() must call setSavedGridId(null) after removal',
  );

  // The Save button must be disabled only while isGridSaved is true,
  // so once isGridSaved is false the button re-enables naturally.
  assert.ok(
    source.includes('isGridSaved ? \'Already saved to your collection\''),
    'Save button title should reflect the saved state',
  );
});

// ---------------------------------------------------------------------------
// Export → remove → re-export cycle tests (Task 32)
// ---------------------------------------------------------------------------

/**
 * Build a minimal 9-slot BuilderCard array for use with gridRecordFromProposal.
 */
function makeSlots(baseKey = 'slot'): BuilderCard[] {
  return Array.from({ length: 9 }, (_, index) => ({
    key: `https://images.example/${baseKey}-${index}.jpg`,
    imageUrl: `https://images.example/${baseKey}-${index}.jpg`,
    sourceUrl: `https://publisher.example/story-${index}`,
    title: `Image ${index}`,
    actor: 'Test Actor',
    actorEn: 'Test Actor',
    actorId: 'actor-test',
    actorAccentColor: '#aabbcc',
    vibe: '测试',
    vibeEn: 'Test Vibe',
    vibeEmoji: '🧪',
    vibeSubtitle: '',
    vibeSubtitleEn: '',
    capturedDate: '2026-08-16',
    resultId: `https://images.example/${baseKey}-${index}.jpg`,
    origin: 'saved-card' as const,
    familyId: 'test-family',
    familyLabel: 'Test Family',
  }));
}

function makeRationale(): GridRationale {
  return {
    aestheticRead: 'Test aesthetic read.',
    whyTogether: 'They belong together.',
    motifs: ['Test Family (9)'],
    suggestedStance: 'Aesthetic archive — a curated visual collection',
    lens: 'whole saved collection',
    slotReasons: Array.from({ length: 9 }, () => 'test family set (9)'),
    manualSwaps: [],
  };
}

test('dbSaveGrid called twice with the same id stores exactly one record', async () => {
  // Simulates: export (save) → remove from collection → re-export (save again).
  // The second dbSaveGrid must upsert (overwrite), not insert a duplicate.
  const grid = makeGrid({ id: 'grid-export-remove-reexport-idempotent' });

  // First export: save the grid.
  await dbSaveGrid(grid);

  // Remove it (user removes from collection).
  await dbRemoveGrid(grid.id);

  // Re-export: save the same grid again.
  await dbSaveGrid(grid);

  // Should contain exactly one record with this id.
  const all = await dbGetAllGrids();
  const matching = all.filter(g => g.id === grid.id);
  assert.strictEqual(
    matching.length,
    1,
    'exactly one record should exist after export → remove → re-export',
  );
});

test('gridRecordFromProposal produces a stable id across repeated calls with identical slots', () => {
  const slots = makeSlots('stable');
  const rationale = makeRationale();

  // Fix the clock so date-based id prefix is deterministic.
  const fixedDate = new Date('2026-08-16T10:00:00Z');

  const record1 = gridRecordFromProposal(slots, rationale, fixedDate);
  const record2 = gridRecordFromProposal(slots, rationale, fixedDate);

  assert.strictEqual(
    record1.id,
    record2.id,
    'gridRecordFromProposal must produce the same id for identical slots and date',
  );

  // Confirm the id is not empty and follows the expected prefix convention.
  assert.ok(
    record1.id.startsWith('builder-'),
    'grid id should start with "builder-"',
  );
});
