/**
 * Tests for the export-then-save-nudge flow in GridBuilder.
 *
 * Coverage:
 *   - Nudge appears after a successful export when the grid has not been saved
 *   - Clicking the nudge button calls saveGrid(), which clears the nudge
 *   - Nudge does NOT appear when the grid was already saved before export
 *   - Proposal changes (re-propose, swap, lens toggle) reset showSaveNudge
 *
 * All assertions are scoped to the relevant function body or JSX region —
 * not the entire file — so a search cannot pass on an unrelated occurrence.
 *
 * GridBuilder is a browser-only React component (canvas, IndexedDB, navigator
 * share) that cannot be rendered in the Node test environment without a DOM
 * harness + module stubs; the project currently uses the Node built-in test
 * runner without jsdom and Node 20 does not expose mock.module.  The existing
 * gridBuilderRemove.test.ts and planLifecycleComponent.test.ts use the same
 * source-scoping approach, and the gridBuilderRemove tests additionally
 * exercise the real IDB layer through fake-indexeddb.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.join(__dirname, '../src/components/GridBuilder/GridBuilder.tsx'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Helper: extract a single top-level function body bounded by brace matching.
// Returns the content from the opening '{' to its matching '}', inclusive.
// Searches for `pattern` as the start anchor (e.g. 'async function exportGrid(').
// ---------------------------------------------------------------------------
function extractFunctionBody(src: string, pattern: string): string {
  const anchorIdx = src.indexOf(pattern);
  assert.notEqual(anchorIdx, -1, `Could not find function anchor: ${pattern}`);
  const braceIdx = src.indexOf('{', anchorIdx);
  assert.notEqual(braceIdx, -1, `No opening brace after anchor: ${pattern}`);
  let depth = 0;
  for (let i = braceIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(braceIdx, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for function: ${pattern}`);
}

// ---------------------------------------------------------------------------
// Helper: extract the JSX block that starts with a given opening marker and
// ends at the matching closing parenthesis/brace.  Used for JSX conditionals.
// ---------------------------------------------------------------------------
function extractJsxBlock(src: string, openMarker: string): string {
  const start = src.indexOf(openMarker);
  assert.notEqual(start, -1, `Could not find JSX marker: ${openMarker}`);
  // Walk forward tracking () and {} depth from the marker position.
  let parenDepth = 0;
  let braceDepth = 0;
  let i = start;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') { parenDepth--; if (parenDepth < 0 && braceDepth <= 0) return src.slice(start, i + 1); }
    else if (ch === '{') braceDepth++;
    else if (ch === '}') { braceDepth--; }
    i++;
  }
  return src.slice(start);
}

// Pre-extract the bodies we test against.
const exportGridBody  = extractFunctionBody(source, 'async function exportGrid(');
const saveGridBody    = extractFunctionBody(source, 'async function saveGrid(');
const removeGridBody  = extractFunctionBody(source, 'async function removeGrid(');
const toggleBody      = extractFunctionBody(source, 'function toggle(');
const proposeBody     = extractFunctionBody(source, 'function propose(');
const swapIntoBody    = extractFunctionBody(source, 'function swapInto(');
const saveNudgeJsx    = extractJsxBlock(source, '{showSaveNudge &&');

// ---------------------------------------------------------------------------
// exportGrid — nudge appears after export-without-save
// ---------------------------------------------------------------------------

test('exportGrid snapshots isGridSaved into wasGridSaved before the async call', () => {
  assert.ok(
    exportGridBody.includes('const wasGridSaved = isGridSaved;'),
    'exportGrid() must capture isGridSaved as wasGridSaved before the await',
  );
});

test('exportGrid sets showSaveNudge(true) in the !wasGridSaved branch', () => {
  assert.ok(
    exportGridBody.includes('if (!wasGridSaved) {'),
    'exportGrid() must branch on wasGridSaved',
  );
  // setShowSaveNudge(true) must appear AFTER the !wasGridSaved check.
  const branchStart = exportGridBody.indexOf('if (!wasGridSaved) {');
  const nudgeTrue   = exportGridBody.indexOf('setShowSaveNudge(true)', branchStart);
  assert.ok(nudgeTrue !== -1, 'setShowSaveNudge(true) must appear inside the !wasGridSaved branch of exportGrid()');
});

test('exportGrid resets showSaveNudge to false at the start of each export attempt', () => {
  // The reset must come before the try block so a previous nudge is cleared.
  const nudgeReset = exportGridBody.indexOf('setShowSaveNudge(false)');
  const tryIdx     = exportGridBody.indexOf('try {');
  assert.ok(nudgeReset !== -1, 'exportGrid() must call setShowSaveNudge(false)');
  assert.ok(tryIdx !== -1, 'exportGrid() must have a try block');
  assert.ok(
    nudgeReset < tryIdx,
    'setShowSaveNudge(false) must appear before the try block in exportGrid()',
  );
});

test('exportGrid calls onExported (not nudge) when grid was already saved', () => {
  // The else branch must call onExported instead of setShowSaveNudge(true).
  const elseIdx    = exportGridBody.indexOf('} else {');
  const navCall    = exportGridBody.indexOf('onExported?.()', elseIdx);
  assert.ok(elseIdx !== -1, 'exportGrid() must have an else branch for wasGridSaved === true');
  assert.ok(navCall !== -1, 'else branch must call onExported?.()');
  // Confirm setShowSaveNudge(true) does NOT appear in the else branch.
  const elseBody   = exportGridBody.slice(elseIdx);
  assert.ok(
    !elseBody.includes('setShowSaveNudge(true)'),
    'setShowSaveNudge(true) must not appear in the else (already-saved) branch',
  );
});

// ---------------------------------------------------------------------------
// saveGrid — nudge is cleared and navigation is triggered after save
// ---------------------------------------------------------------------------

test('saveGrid clears showSaveNudge(false) inside its try block, before the confirmation notice', () => {
  const tryIdx      = saveGridBody.indexOf('try {');
  const nudgeOff    = saveGridBody.indexOf('setShowSaveNudge(false)', tryIdx);
  const saveNotice  = saveGridBody.indexOf("setNotice('Grid saved to your collection.')", tryIdx);
  assert.ok(nudgeOff   !== -1, 'saveGrid() must call setShowSaveNudge(false) inside its try block');
  assert.ok(saveNotice !== -1, 'saveGrid() must call setNotice with the save confirmation');
  assert.ok(
    nudgeOff < saveNotice,
    'setShowSaveNudge(false) must appear before the confirmation setNotice in saveGrid()',
  );
});

test('saveGrid sets isGridSaved(true) after a successful save', () => {
  const tryIdx = saveGridBody.indexOf('try {');
  const saved  = saveGridBody.indexOf('setIsGridSaved(true)', tryIdx);
  assert.ok(saved !== -1, 'saveGrid() must call setIsGridSaved(true) inside its try block');
});

test('saveGrid triggers deferred navigation when pendingNavAfterSave is true', () => {
  assert.ok(
    saveGridBody.includes('if (pendingNavAfterSave) {'),
    'saveGrid() must check pendingNavAfterSave before calling onExported()',
  );
  const pendingIdx = saveGridBody.indexOf('if (pendingNavAfterSave) {');
  const navCall    = saveGridBody.indexOf('onExported?.()', pendingIdx);
  assert.ok(navCall !== -1, 'saveGrid() must call onExported?.() when pendingNavAfterSave is true');
});

test('saveGrid clears pendingNavAfterSave after triggering navigation', () => {
  assert.ok(
    saveGridBody.includes('setPendingNavAfterSave(false)'),
    'saveGrid() must call setPendingNavAfterSave(false) after triggering navigation',
  );
});

// ---------------------------------------------------------------------------
// JSX — nudge renders in the notice area and is wired to saveGrid
// ---------------------------------------------------------------------------

test('nudge button is inside the showSaveNudge conditional block and calls saveGrid', () => {
  // saveNudgeJsx contains exactly the conditional block starting with {showSaveNudge &&}.
  assert.ok(
    saveNudgeJsx.includes('onClick={saveGrid}'),
    'nudge <button> must have onClick={saveGrid} inside the showSaveNudge block',
  );
  assert.ok(
    saveNudgeJsx.includes('saveNudgeBtn'),
    'nudge <button> must use the saveNudgeBtn CSS class inside the showSaveNudge block',
  );
  assert.ok(
    saveNudgeJsx.includes('💾 Save to collection?'),
    'nudge button must contain the expected label text inside the showSaveNudge block',
  );
});

test('nudge block disables the button while a save is in progress', () => {
  assert.ok(
    saveNudgeJsx.includes('disabled={Boolean(busy)}'),
    'nudge button must be disabled while busy is truthy',
  );
});

test('notice area renders nudge alongside the notice text (not in a separate container)', () => {
  // The notice area must show both the notice text AND the nudge in the same role="status" div.
  const noticeBlock = extractJsxBlock(source, '{(notice || showSaveNudge) &&');
  assert.ok(
    noticeBlock.includes('role="status"'),
    'notice container must have role="status"',
  );
  assert.ok(
    noticeBlock.includes('{notice}'),
    'notice container must render {notice} alongside the nudge',
  );
  assert.ok(
    noticeBlock.includes('showSaveNudge &&'),
    'notice container must conditionally render the nudge within the same block',
  );
});

// ---------------------------------------------------------------------------
// Proposal mutations — every mutation resets showSaveNudge
// ---------------------------------------------------------------------------

test('toggle() resets showSaveNudge when the lens changes', () => {
  assert.ok(
    toggleBody.includes('setShowSaveNudge(false)'),
    'toggle() must call setShowSaveNudge(false)',
  );
});

test('propose() resets showSaveNudge on re-propose', () => {
  assert.ok(
    proposeBody.includes('setShowSaveNudge(false)'),
    'propose() must call setShowSaveNudge(false)',
  );
});

test('swapInto() resets showSaveNudge on slot swap', () => {
  assert.ok(
    swapIntoBody.includes('setShowSaveNudge(false)'),
    'swapInto() must call setShowSaveNudge(false)',
  );
});

test('toggle() also resets pendingNavAfterSave on lens change', () => {
  assert.ok(
    toggleBody.includes('setPendingNavAfterSave(false)'),
    'toggle() must call setPendingNavAfterSave(false)',
  );
});

test('propose() also resets pendingNavAfterSave on re-propose', () => {
  assert.ok(
    proposeBody.includes('setPendingNavAfterSave(false)'),
    'propose() must call setPendingNavAfterSave(false)',
  );
});

test('swapInto() also resets pendingNavAfterSave on slot swap', () => {
  assert.ok(
    swapIntoBody.includes('setPendingNavAfterSave(false)'),
    'swapInto() must call setPendingNavAfterSave(false)',
  );
});

// ---------------------------------------------------------------------------
// removeGrid does not interact with showSaveNudge (out of scope, but verify
// it doesn't accidentally re-enable the nudge)
// ---------------------------------------------------------------------------

test('removeGrid() does not touch showSaveNudge state', () => {
  assert.ok(
    !removeGridBody.includes('setShowSaveNudge'),
    'removeGrid() must not reference setShowSaveNudge — nudge is not related to removal',
  );
});
