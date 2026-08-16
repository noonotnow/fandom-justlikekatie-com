/**
 * Tests for custom court rulings storage and the AdminAccess popup merge.
 *
 * `getAllRulings()` is the exact function `AdminAccess` calls at render time to
 * populate its `allRulings` array (the lore popup content).  Testing it directly
 * means any regression in the component's merge will be caught here, not hidden
 * behind a test that independently reconstructs the same expression.
 *
 * Cases covered:
 *   1. No custom rulings → popup falls back to built-ins only
 *   2. A ruling added via addCustomRuling() appears in getAllRulings()
 *   3. Multiple rulings accumulate and all appear
 *   4. Removing a ruling by index keeps the rest intact
 *   5. saveCustomRulings() overwrites the list atomically
 *   6. Corrupt localStorage data does not crash; built-ins still show
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal localStorage stub — only the subset used by courtRulings.ts
// ---------------------------------------------------------------------------
function makeLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem:    (key: string) => store.get(key) ?? null,
    setItem:    (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear:      () => store.clear(),
    key:        (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  } as Storage;
}

// courtRulings.ts reads `localStorage` from globalThis at call time, so we
// reassign it to a fresh stub before each test group for full isolation.
function withFreshStorage(fn: () => void) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: makeLocalStorageStub(),
    writable: true,
    configurable: true,
  });
  fn();
}

import {
  getCustomRulings,
  saveCustomRulings,
  addCustomRuling,
  removeCustomRuling,
  getAllRulings,           // ← the function AdminAccess calls at render time
} from '../src/utils/courtRulings.ts';

import { RACCOON_COURT_RECORD } from '../src/data/raccoonCourtRecord.ts';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('empty custom list — getAllRulings returns only built-ins, popup still works', () => {
  withFreshStorage(() => {
    assert.deepEqual(getCustomRulings(), []);

    const all = getAllRulings();          // same call as AdminAccess makes
    assert.ok(all.length > 0, 'popup list must not be empty');
    assert.equal(all.length, RACCOON_COURT_RECORD.length);
    assert.deepEqual(all, RACCOON_COURT_RECORD);
  });
});

test('added ruling appears in getAllRulings — popup shows it after being saved', () => {
  withFreshStorage(() => {
    const ruling = 'Case #999: Test ruling added by the court. — Associate Justice 🦝';
    addCustomRuling(ruling);

    const all = getAllRulings();          // AdminAccess reads this at render
    assert.ok(all.includes(ruling), 'custom ruling must be present in the popup list');
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 1);

    // Custom rulings come after built-ins — verify ordering
    const customSlice = all.slice(RACCOON_COURT_RECORD.length);
    assert.deepEqual(customSlice, [ruling]);
  });
});

test('multiple rulings accumulate — all appear in getAllRulings popup list', () => {
  withFreshStorage(() => {
    const r1 = 'Case #100: First ruling. — Chief Justice 🦝';
    const r2 = 'Case #200: Second ruling. — Bailiff 🦝';
    const r3 = 'Case #300: Third ruling. — Clerk 🦝';

    addCustomRuling(r1);
    addCustomRuling(r2);
    addCustomRuling(r3);

    const all = getAllRulings();
    assert.ok(all.includes(r1));
    assert.ok(all.includes(r2));
    assert.ok(all.includes(r3));
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 3);
  });
});

test('removing a ruling by index — removed entry absent from getAllRulings, rest intact', () => {
  withFreshStorage(() => {
    addCustomRuling('Keep ruling A');
    addCustomRuling('Remove ruling B');
    addCustomRuling('Keep ruling C');

    removeCustomRuling(1);              // remove index 1 = "Remove ruling B"

    const all = getAllRulings();
    assert.ok(!all.includes('Remove ruling B'), 'removed ruling must not appear in popup');
    assert.ok(all.includes('Keep ruling A'));
    assert.ok(all.includes('Keep ruling C'));
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 2);
  });
});

test('saveCustomRulings overwrites — getAllRulings reflects new list immediately', () => {
  withFreshStorage(() => {
    addCustomRuling('Old ruling');
    saveCustomRulings(['Fresh ruling 1', 'Fresh ruling 2']);

    const all = getAllRulings();
    assert.ok(!all.includes('Old ruling'));
    assert.ok(all.includes('Fresh ruling 1'));
    assert.ok(all.includes('Fresh ruling 2'));
    assert.equal(all.length, RACCOON_COURT_RECORD.length + 2);
  });
});

test('corrupt localStorage — getAllRulings falls back to built-ins, popup does not crash', () => {
  withFreshStorage(() => {
    localStorage.setItem('raccoon-court-custom-rulings', 'not-valid-json{{{');

    const all = getAllRulings();
    assert.equal(all.length, RACCOON_COURT_RECORD.length, 'corrupt data must not add or drop built-ins');
    assert.deepEqual(all, RACCOON_COURT_RECORD);
  });
});
