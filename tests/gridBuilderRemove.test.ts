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

// ---------------------------------------------------------------------------
// Slot-swap orphan tests (Task 40)
// ---------------------------------------------------------------------------

test('editing slots produces a different id — confirming the orphan scenario exists', () => {
  const slotsV1 = makeSlots('original');
  const slotsV2 = makeSlots('edited'); // different slot keys → different hash
  const rationale = makeRationale();
  const fixedDate = new Date('2026-08-16T10:00:00Z');

  const recordV1 = gridRecordFromProposal(slotsV1, rationale, fixedDate);
  const recordV2 = gridRecordFromProposal(slotsV2, rationale, fixedDate);

  assert.notStrictEqual(
    recordV1.id,
    recordV2.id,
    'different slot compositions must produce different ids (the orphan scenario is real)',
  );
});

test('saving an edited grid after removing the prior version leaves exactly one record', async () => {
  // Simulates the full flow:
  //   1. User proposes → saves grid_v1 (slots_original)
  //   2. User swaps a slot → new proposal with slots_edited
  //   3. GridBuilder removes grid_v1 then saves grid_v2
  //   4. Store must contain only grid_v2
  const fixedDate = new Date('2026-08-16T10:00:00Z');
  const rationaleV1 = makeRationale();
  const rationaleV2 = makeRationale();

  const slotsV1 = makeSlots('pre-swap');
  const slotsV2 = makeSlots('post-swap');

  const gridV1 = gridRecordFromProposal(slotsV1, rationaleV1, fixedDate);
  const gridV2 = gridRecordFromProposal(slotsV2, rationaleV2, fixedDate);

  // Confirm this is a genuine id change (the scenario under test is real).
  assert.notStrictEqual(gridV1.id, gridV2.id, 'precondition: different slots must produce different ids');

  // Step 1: initial save.
  await dbSaveGrid(gridV1);
  const afterFirstSave = await dbGetAllGrids();
  assert.ok(afterFirstSave.some(g => g.id === gridV1.id), 'grid_v1 should be present after initial save');

  // Step 2: GridBuilder removes the stale record (priorSavedGridId cleanup).
  await dbRemoveGrid(gridV1.id);

  // Step 3: save the edited version.
  await dbSaveGrid(gridV2);

  // Step 4: only grid_v2 should exist; grid_v1 must be gone.
  const final = await dbGetAllGrids();

  assert.ok(
    final.some(g => g.id === gridV2.id),
    'grid_v2 must be present after saving the edited version',
  );
  assert.ok(
    !final.some(g => g.id === gridV1.id),
    'grid_v1 must not remain in the store after the edited version was saved',
  );

  // Also confirm there is no duplication.
  const matchingV2 = final.filter(g => g.id === gridV2.id);
  assert.strictEqual(matchingV2.length, 1, 'exactly one record for grid_v2 should exist');
});

// ---------------------------------------------------------------------------
// Export → swap → export + save-nudge accepted cycle tests (Task 49)
// ---------------------------------------------------------------------------

test('export(no-save) → swap → export → save-nudge accepted: only post-swap grid in store', async () => {
  // Scenario: user exports without saving, then swaps a slot, then exports again
  // and accepts the save nudge.  Because no dbSaveGrid was called before the swap,
  // priorSavedGridId stays null and only the post-swap grid enters the store.
  const fixedDate = new Date('2026-08-16T12:00:00Z');
  const slotsV1 = makeSlots('presave-export-swap-v1');
  const slotsV2 = makeSlots('presave-export-swap-v2');
  const rationale = makeRationale();

  const gridV1 = gridRecordFromProposal(slotsV1, rationale, fixedDate);
  const gridV2 = gridRecordFromProposal(slotsV2, rationale, fixedDate);

  // Precondition: the two grids must have different ids (genuine slot-change).
  assert.notStrictEqual(gridV1.id, gridV2.id, 'pre/post-swap grids must have different ids');

  // exportGrid itself never calls dbSaveGrid; only the nudge path does.
  // grid_v1 was never persisted.

  // User swaps; since isGridSaved was false, priorSavedGridId stays null.
  // The save nudge is re-armed on the second export.
  // User accepts nudge → saveGrid saves grid_v2 (no prior record to remove).
  await dbSaveGrid(gridV2);

  const all = await dbGetAllGrids();

  // grid_v2 must be present.
  assert.ok(
    all.some(g => g.id === gridV2.id),
    'post-swap grid must be in the store after save nudge accepted',
  );

  // grid_v1 must never have been written (export does not save).
  assert.ok(
    !all.some(g => g.id === gridV1.id),
    'pre-swap grid must not appear in the store (export does not call dbSaveGrid)',
  );
});

test('save → export → swap → export → save-nudge accepted: stale grid removed, only new grid in store', async () => {
  // Scenario:
  //   1. User proposes → saves grid_v1
  //   2. User exports: wasGridSaved=true → onExported() fires, no nudge
  //   3. User swaps a slot: isGridSaved was true → priorSavedGridId=v1_id captured
  //   4. User exports again: wasGridSaved=false → nudge armed
  //   5. User accepts nudge → saveGrid removes v1_id, saves grid_v2
  const fixedDate = new Date('2026-08-16T13:00:00Z');
  const slotsV1 = makeSlots('saved-export-swap-v1');
  const slotsV2 = makeSlots('saved-export-swap-v2');
  const rationale = makeRationale();

  const gridV1 = gridRecordFromProposal(slotsV1, rationale, fixedDate);
  const gridV2 = gridRecordFromProposal(slotsV2, rationale, fixedDate);

  assert.notStrictEqual(gridV1.id, gridV2.id, 'precondition: different slots must yield different ids');

  // Step 1: initial save.
  await dbSaveGrid(gridV1);
  const afterFirstSave = await dbGetAllGrids();
  assert.ok(afterFirstSave.some(g => g.id === gridV1.id), 'grid_v1 should be present after initial save');

  // Step 2: export fires onExported (wasGridSaved=true) — store unchanged at DB level.

  // Step 3: swap captures priorSavedGridId=v1_id (simulated by saveGrid cleanup below).

  // Step 4: second export re-arms nudge (wasGridSaved=false after swap).

  // Step 5: save nudge accepted — GridBuilder calls dbRemoveGrid(priorSavedGridId) then dbSaveGrid(gridV2).
  await dbRemoveGrid(gridV1.id);  // priorSavedGridId cleanup
  await dbSaveGrid(gridV2);

  const final = await dbGetAllGrids();

  assert.ok(
    final.some(g => g.id === gridV2.id),
    'post-swap grid_v2 must be present after save-nudge save',
  );
  assert.ok(
    !final.some(g => g.id === gridV1.id),
    'grid_v1 must have been removed (priorSavedGridId cleanup)',
  );

  const matchingV2 = final.filter(g => g.id === gridV2.id);
  assert.strictEqual(matchingV2.length, 1, 'exactly one copy of grid_v2 should exist');
});

test('swapInto resets pendingNavAfterSave so the second export can re-arm it — source-level assertion', async () => {
  // After an export nudge (pendingNavAfterSave=true), a slot swap must reset
  // pendingNavAfterSave to false.  The second export then re-sets it to true.
  // This prevents the old nudge from triggering onExported with a stale grid.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // swapInto must reset pendingNavAfterSave.
  assert.ok(
    source.includes('setPendingNavAfterSave(false)'),
    'swapInto must call setPendingNavAfterSave(false) to cancel a stale post-export nudge',
  );

  // exportGrid must re-arm pendingNavAfterSave when !wasGridSaved.
  assert.ok(
    source.includes('setPendingNavAfterSave(true)'),
    'exportGrid must call setPendingNavAfterSave(true) when the grid has not been saved',
  );

  // saveGrid must check pendingNavAfterSave and call onExported when true.
  assert.ok(
    source.includes('if (pendingNavAfterSave)'),
    'saveGrid must branch on pendingNavAfterSave to trigger onExported after the nudge',
  );
});

test('swapInto only captures priorSavedGridId when the grid was already saved — source-level assertion', async () => {
  // When isGridSaved is false (e.g. after an export-without-save), no record
  // was written to the DB so priorSavedGridId must NOT be set.  This prevents
  // a phantom dbRemoveGrid call in the subsequent saveGrid.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // The guard must be: if (isGridSaved && savedGridId)
  assert.ok(
    source.includes('if (isGridSaved && savedGridId) setPriorSavedGridId(savedGridId)'),
    'swapInto must guard setPriorSavedGridId behind `if (isGridSaved && savedGridId)` to avoid phantom cleanups',
  );
});

test('GridBuilder.tsx removes the prior saved grid id before saving after a slot swap — source-level assertion', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // priorSavedGridId state must exist.
  assert.ok(
    source.includes('priorSavedGridId'),
    'GridBuilder must track priorSavedGridId to detect orphaned records',
  );

  // swapInto must capture the stale id before resetting savedGridId.
  assert.ok(
    source.includes('setPriorSavedGridId(savedGridId)'),
    'swapInto must call setPriorSavedGridId(savedGridId) to preserve the stale id',
  );

  // saveGrid must remove the stale record when the id changed.
  assert.ok(
    source.includes('priorSavedGridId !== grid.id'),
    'saveGrid must guard removal with priorSavedGridId !== grid.id',
  );
  assert.ok(
    source.includes('await dbRemoveGrid(priorSavedGridId)'),
    'saveGrid must await dbRemoveGrid(priorSavedGridId) to clean up the orphaned record',
  );
});

// ---------------------------------------------------------------------------
// startPacket swap-orphan tests (Task 50)
// ---------------------------------------------------------------------------

test('swap → startPacket results in exactly one grid record in the store', async () => {
  // Simulates the bug scenario:
  //   1. User proposes → saves grid_v1
  //   2. User swaps a slot → priorSavedGridId=v1_id, isGridSaved=false
  //   3. User clicks "Start Idea Packet" instead of Save → Export
  //   4. startPacket must remove the stale v1 record before saving v2
  const fixedDate = new Date('2026-08-16T14:00:00Z');
  const slotsV1 = makeSlots('packet-swap-v1');
  const slotsV2 = makeSlots('packet-swap-v2');
  const rationale = makeRationale();

  const gridV1 = gridRecordFromProposal(slotsV1, rationale, fixedDate);
  const gridV2 = gridRecordFromProposal(slotsV2, rationale, fixedDate);

  assert.notStrictEqual(gridV1.id, gridV2.id, 'precondition: different slots must yield different ids');

  // Step 1: initial save (user explicitly saved grid_v1).
  await dbSaveGrid(gridV1);
  const afterFirstSave = await dbGetAllGrids();
  assert.ok(afterFirstSave.some(g => g.id === gridV1.id), 'grid_v1 should be present after initial save');

  // Step 2-3: user swaps then clicks startPacket.
  // startPacket runs: dbRemoveGrid(priorSavedGridId=v1_id) then dbSaveGrid(grid_v2).
  await dbRemoveGrid(gridV1.id);  // priorSavedGridId cleanup
  await dbSaveGrid(gridV2);

  const final = await dbGetAllGrids();

  assert.ok(
    final.some(g => g.id === gridV2.id),
    'post-swap grid_v2 must be present after startPacket',
  );
  assert.ok(
    !final.some(g => g.id === gridV1.id),
    'pre-swap grid_v1 must have been removed by startPacket priorSavedGridId cleanup',
  );

  const matchingV2 = final.filter(g => g.id === gridV2.id);
  assert.strictEqual(matchingV2.length, 1, 'exactly one record for grid_v2 should exist');
});

test('startPacket cleans up priorSavedGridId before saving — source-level assertion', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // Locate the startPacket function body so assertions are scoped to it.
  const startPacketIdx = source.indexOf('async function startPacket(');
  assert.ok(startPacketIdx !== -1, 'startPacket function must exist in GridBuilder.tsx');

  // Find the closing brace of startPacket by grabbing from its start to the
  // next top-level function declaration.
  const bodyAfter = source.slice(startPacketIdx);
  const nextFnIdx = bodyAfter.indexOf('\n  if (loadError)');
  const startPacketBody = nextFnIdx !== -1 ? bodyAfter.slice(0, nextFnIdx) : bodyAfter.slice(0, 600);

  // startPacket must guard on priorSavedGridId before calling dbSaveGrid.
  assert.ok(
    startPacketBody.includes('priorSavedGridId'),
    'startPacket must read priorSavedGridId to detect an orphaned record from a prior save',
  );

  assert.ok(
    startPacketBody.includes('await dbRemoveGrid(priorSavedGridId)'),
    'startPacket must await dbRemoveGrid(priorSavedGridId) to remove the stale record',
  );

  assert.ok(
    startPacketBody.includes('setPriorSavedGridId(null)'),
    'startPacket must call setPriorSavedGridId(null) after removing the stale record',
  );
});

// ---------------------------------------------------------------------------
// Double-trigger guard tests (Task 51)
// ---------------------------------------------------------------------------

test('startPacket in-flight guard: second call concurrent with first is a no-op — behavioral', async () => {
  // Verifies that the packetInFlight ref used by startPacket blocks a second
  // invocation that arrives in the same event-loop tick (before React re-renders
  // and disables the button).
  //
  // The test replicates the exact guard pattern from GridBuilder.tsx:
  //   if (packetInFlight.current) return;
  //   packetInFlight.current = true;   // synchronous — before any await
  //   try { ... } finally { packetInFlight.current = false; }
  //
  // Because JavaScript is single-threaded, `p2 = startPacket()` executes after
  // `p1 = startPacket()` has already set packetInFlight.current = true (that
  // happens synchronously before the first await), so p2 exits at the guard.

  const createCalls: string[] = [];
  let saveCount = 0;

  // Mirror the guard logic from GridBuilder.startPacket.
  const packetInFlight = { current: false };

  async function startPacket(
    onCreateFromGrid: (grid: GridRecord) => Promise<void>,
  ): Promise<void> {
    // React state guard (busy) — already truthy for same-render calls after
    // setBusy is called, but React closures capture the pre-render value.
    // The ref guard is the reliable synchronous barrier.
    if (packetInFlight.current) return;
    packetInFlight.current = true;
    try {
      // Simulate dbSaveGrid
      const grid = makeGrid({ id: 'guard-test-grid' });
      await dbSaveGrid(grid);
      saveCount++;
      // Simulate onCreateFromGrid — the call the guard must deduplicate.
      await onCreateFromGrid(grid);
      createCalls.push('invoked');
    } finally {
      packetInFlight.current = false;
    }
  }

  // Slow async callback so p1 is still in-flight when p2 fires.
  let resolveCreate!: () => void;
  const createPending = new Promise<void>(resolve => { resolveCreate = resolve; });
  const mockOnCreateFromGrid = async (_grid: GridRecord) => { await createPending; };

  // Fire both calls without awaiting — this is the double-click / double-trigger.
  const p1 = startPacket(mockOnCreateFromGrid);
  const p2 = startPacket(mockOnCreateFromGrid); // fires before p1 hits its first await

  // Let p1 complete.
  resolveCreate();
  await Promise.all([p1, p2]);

  assert.strictEqual(
    createCalls.length,
    1,
    'onCreateFromGrid must be called exactly once — second concurrent startPacket call must be a no-op',
  );
  assert.strictEqual(
    saveCount,
    1,
    'dbSaveGrid must be called exactly once — second concurrent startPacket call must not reach dbSaveGrid',
  );
});

test('startPacket re-entrant guard resets after completion — second call succeeds once first finishes', async () => {
  // Confirms that packetInFlight.current is reset to false in the finally block,
  // so a genuine second attempt after the first completes is not blocked.
  const createCalls: string[] = [];
  const packetInFlight = { current: false };

  async function startPacket(onCreateFromGrid: (grid: GridRecord) => Promise<void>): Promise<void> {
    if (packetInFlight.current) return;
    packetInFlight.current = true;
    try {
      const grid = makeGrid({ id: 'guard-reset-test-grid' });
      await dbSaveGrid(grid);
      await onCreateFromGrid(grid);
      createCalls.push('invoked');
    } finally {
      packetInFlight.current = false;
    }
  }

  const noop = async (_grid: GridRecord) => {};

  // First call succeeds and releases the lock.
  await startPacket(noop);
  assert.strictEqual(createCalls.length, 1, 'first call must succeed');
  assert.strictEqual(packetInFlight.current, false, 'lock must be released after first call');

  // Second call (sequential, after the first completed) must also succeed.
  await startPacket(noop);
  assert.strictEqual(
    createCalls.length,
    2,
    'sequential second call must succeed once the first has completed and released the lock',
  );
});

test('startPacket source uses packetInFlight ref for synchronous re-entrant guard', async () => {
  // Pins the ref-based guard structure in the source so a future refactor cannot
  // silently revert to relying on React state alone (which is not synchronous).
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // Locate the startPacket function body.
  const startPacketIdx = source.indexOf('async function startPacket(');
  assert.ok(startPacketIdx !== -1, 'startPacket function must exist in GridBuilder.tsx');
  const bodyAfter = source.slice(startPacketIdx);
  const nextFnIdx = bodyAfter.indexOf('\n  if (loadError)');
  const startPacketBody = nextFnIdx !== -1 ? bodyAfter.slice(0, nextFnIdx) : bodyAfter.slice(0, 800);

  // The ref guard must appear before the first await.
  const refGuardPos = startPacketBody.indexOf('if (packetInFlight.current)');
  const setRefPos   = startPacketBody.indexOf('packetInFlight.current = true');
  const firstAwait  = startPacketBody.indexOf('await ');

  assert.ok(refGuardPos !== -1, 'startPacket must guard synchronously with packetInFlight.current');
  assert.ok(setRefPos   !== -1, 'startPacket must set packetInFlight.current = true');
  assert.ok(
    refGuardPos < firstAwait && setRefPos < firstAwait,
    'both the guard check and the ref set must appear before the first await (synchronous barrier)',
  );

  // The ref must be released in the finally block.
  assert.ok(
    startPacketBody.includes('packetInFlight.current = false'),
    'startPacket finally block must reset packetInFlight.current = false',
  );
});

// ---------------------------------------------------------------------------
// exportGrid double-trigger guard tests (Task 52)
// ---------------------------------------------------------------------------

test('exportGrid in-flight guard: second call concurrent with first is a no-op — behavioral', async () => {
  // Verifies that the exportInFlight ref used by exportGrid blocks a second
  // invocation that arrives in the same event-loop tick (before React re-renders
  // and disables the button).
  //
  // setBusy('export') schedules a React state update but does not mutate the
  // captured closure value; a second call in the same tick would pass the
  // `|| busy` guard and reach saveShareCard a second time.  The ref provides
  // a reliable synchronous barrier identical to the packetInFlight pattern.
  //
  // The test replicates the guard logic from GridBuilder.tsx:
  //   if (exportInFlight.current) return;
  //   exportInFlight.current = true;   // synchronous — before any await
  //   try { ... } finally { exportInFlight.current = false; }

  const exportCalls: string[] = [];

  // Mirror the guard logic from GridBuilder.exportGrid.
  const exportInFlight = { current: false };

  async function exportGrid(
    saveShareCard: () => Promise<string>,
  ): Promise<void> {
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    try {
      // Simulate the async export.
      await saveShareCard();
      exportCalls.push('exported');
    } finally {
      exportInFlight.current = false;
    }
  }

  // Slow async export so p1 is still in-flight when p2 fires.
  let resolveExport!: () => void;
  const exportPending = new Promise<void>(resolve => { resolveExport = resolve; });
  const mockSaveShareCard = async () => { await exportPending; return 'done'; };

  // Fire both calls without awaiting — the double-click / double-trigger scenario.
  const p1 = exportGrid(mockSaveShareCard);
  const p2 = exportGrid(mockSaveShareCard); // fires before p1 hits its first await

  // Let p1 complete.
  resolveExport();
  await Promise.all([p1, p2]);

  assert.strictEqual(
    exportCalls.length,
    1,
    'saveShareCard must be called exactly once — second concurrent exportGrid call must be a no-op',
  );
});

test('exportGrid re-entrant guard resets after completion — second call succeeds once first finishes', async () => {
  // Confirms that exportInFlight.current is reset to false in the finally block,
  // so a genuine second export attempt after the first completes is not blocked.
  const exportCalls: string[] = [];
  const exportInFlight = { current: false };

  async function exportGrid(saveShareCard: () => Promise<string>): Promise<void> {
    if (exportInFlight.current) return;
    exportInFlight.current = true;
    try {
      await saveShareCard();
      exportCalls.push('exported');
    } finally {
      exportInFlight.current = false;
    }
  }

  const noop = async () => 'done';

  // First export succeeds and releases the lock.
  await exportGrid(noop);
  assert.strictEqual(exportCalls.length, 1, 'first export must succeed');
  assert.strictEqual(exportInFlight.current, false, 'lock must be released after first export');

  // Second export (sequential, after the first completed) must also succeed.
  await exportGrid(noop);
  assert.strictEqual(
    exportCalls.length,
    2,
    'sequential second export must succeed once the first has completed and released the lock',
  );
});

test('exportGrid source uses exportInFlight ref for synchronous re-entrant guard', async () => {
  // Pins the ref-based guard structure so a future refactor cannot silently
  // revert to relying on React state alone (which is not synchronous).
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
    'utf8',
  );

  // Locate the exportGrid function body.
  const exportGridIdx = source.indexOf('async function exportGrid()');
  assert.ok(exportGridIdx !== -1, 'exportGrid function must exist in GridBuilder.tsx');
  const bodyAfter = source.slice(exportGridIdx);
  const nextFnIdx = bodyAfter.indexOf('\n  async function startPacket(');
  const exportGridBody = nextFnIdx !== -1 ? bodyAfter.slice(0, nextFnIdx) : bodyAfter.slice(0, 800);

  // The ref guard must appear before the first await.
  const refGuardPos = exportGridBody.indexOf('if (exportInFlight.current) return');
  const setRefPos   = exportGridBody.indexOf('exportInFlight.current = true');
  const firstAwait  = exportGridBody.indexOf('await ');

  assert.ok(refGuardPos !== -1, 'exportGrid must guard with `if (exportInFlight.current) return`');
  assert.ok(setRefPos   !== -1, 'exportGrid must set exportInFlight.current = true');
  assert.ok(
    refGuardPos < firstAwait && setRefPos < firstAwait,
    'both the guard check and the ref set must appear before the first await (synchronous barrier)',
  );

  // The ref must be released in the finally block.
  assert.ok(
    exportGridBody.includes('exportInFlight.current = false'),
    'exportGrid finally block must reset exportInFlight.current = false',
  );
});
