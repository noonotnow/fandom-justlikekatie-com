/**
 * Tests for persisting exported share cards.
 *
 * Coverage:
 *   - GridBuilder.exportGrid passes the CAPTURED saved-state value into the
 *     structured export log (the old bug passed a literal `true`)
 *   - The persistence upload is fire-and-forget: `void uploadExportedCard`,
 *     never awaited on the export path, and only fires for saved grids
 *   - Collection's export button also persists via a saveShareCard onBlob
 *     hook without awaiting the upload
 *   - saveShareCard swallows onBlob hook errors so persistence can never
 *     break the export itself
 *   - uploadExportedCard never throws (resolves false on network failure)
 *
 * GridBuilder/Collection are browser-only React components (canvas,
 * IndexedDB, navigator share) that cannot be rendered in the Node test
 * environment; like gridBuilderSaveNudge.test.ts, assertions are scoped to
 * the relevant function body via brace matching so a search cannot pass on
 * an unrelated occurrence. uploadExportedCard is pure fetch logic and is
 * exercised for real with a stubbed global fetch.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builderSource = readFileSync(
  path.join(__dirname, '../src/components/GridBuilder/GridBuilder.tsx'),
  'utf8',
);
const collectionSource = readFileSync(
  path.join(__dirname, '../src/components/Collection/Collection.tsx'),
  'utf8',
);
const exportCanvasSource = readFileSync(
  path.join(__dirname, '../src/utils/exportCanvas.ts'),
  'utf8',
);

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
  assert.fail(`Unbalanced braces after anchor: ${pattern}`);
}

// ---------------------------------------------------------------------------
// GridBuilder.exportGrid
// ---------------------------------------------------------------------------

const exportGridBody = extractFunctionBody(builderSource, 'async function exportGrid(');

test('exportGrid logs the captured saved-state value, not a literal true', () => {
  assert.match(
    exportGridBody,
    /gridExportEventFromRecord\(grid,\s*'full',\s*tier,\s*wasGridSaved/,
    'gridExportEventFromRecord must receive the captured wasGridSaved value',
  );
  assert.doesNotMatch(
    exportGridBody,
    /gridExportEventFromRecord\([^)]*,\s*true\s*[,)]/,
    'the literal-true gridWasSaved bug must stay fixed',
  );
});

test('exportGrid persists the render fire-and-forget, only for saved grids', () => {
  assert.match(
    exportGridBody,
    /if\s*\(wasGridSaved\s*&&\s*renderedBlob\)/,
    'upload must be gated on the grid having been saved before export',
  );
  assert.match(
    exportGridBody,
    /void uploadExportedCard\(/,
    'upload must be dispatched with void (fire-and-forget)',
  );
  assert.doesNotMatch(
    exportGridBody,
    /await uploadExportedCard/,
    'upload must never be awaited on the export path',
  );
});

test('exportGrid still never auto-saves the grid (Save ≠ Export)', () => {
  assert.doesNotMatch(exportGridBody, /dbSaveGrid/, 'export must not save the grid');
});

// ---------------------------------------------------------------------------
// Collection export button
// ---------------------------------------------------------------------------

test('Collection export persists via the onBlob hook without awaiting the upload', () => {
  const idx = collectionSource.indexOf('uploadExportedCard(grid.id');
  assert.notEqual(idx, -1, 'Collection export must upload the rendered blob keyed by grid id');
  const region = collectionSource.slice(idx - 400, idx + 200);
  assert.match(region, /saveShareCard\(starData,\s*'full',\s*\(blob\)/,
    'upload must be wired through the saveShareCard onBlob hook');
  assert.match(region, /void uploadExportedCard\(/, 'upload must be fire-and-forget');
  assert.doesNotMatch(region, /await uploadExportedCard/, 'upload must never be awaited');
});

// ---------------------------------------------------------------------------
// saveShareCard onBlob hook safety
// ---------------------------------------------------------------------------

test('saveShareCard swallows onBlob hook errors', () => {
  const body = extractFunctionBody(exportCanvasSource, 'export async function saveShareCard(');
  const hookIdx = body.indexOf('onBlob(blob)');
  assert.notEqual(hookIdx, -1, 'saveShareCard must invoke the onBlob hook with the rendered blob');
  const region = body.slice(hookIdx - 200, hookIdx + 200);
  assert.match(region, /try\s*\{\s*onBlob\(blob\);?\s*\}\s*catch/,
    'the onBlob hook must be wrapped in try/catch so it cannot break the export');
});

// ---------------------------------------------------------------------------
// uploadExportedCard — real behaviour with a stubbed fetch
// ---------------------------------------------------------------------------

test('uploadExportedCard resolves true on 200, false on failure, and never throws', async () => {
  const { uploadExportedCard } = await import('../src/utils/gridExportLog');
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  try {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const okResult = await uploadExportedCard('grid-1', 'exp-1', new Blob(['x']), 'full', 'standard');
    assert.equal(okResult, true);
    assert.match(calls[0], /grid-exports\?gridId=grid-1&exportId=exp-1&variant=full&tier=standard/);

    globalThis.fetch = (async () => { throw new TypeError('network down'); }) as typeof fetch;
    const failResult = await uploadExportedCard('grid-1', 'exp-2', new Blob(['x']), 'full', 'standard');
    assert.equal(failResult, false, 'network failure must resolve false, never throw');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
