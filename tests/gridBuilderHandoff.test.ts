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
const exportCanvasSource = readFileSync(
  path.join(__dirname, '../src/utils/exportCanvas.ts'),
  'utf8',
);
const collectionSource = readFileSync(
  path.join(__dirname, '../src/components/Collection/Collection.tsx'),
  'utf8',
);
const exportButtonSource = readFileSync(
  path.join(__dirname, '../src/components/ExportButton/ExportButton.tsx'),
  'utf8',
);
const exportHookSource = readFileSync(
  path.join(__dirname, '../src/hooks/useExportCard.ts'),
  'utf8',
);

test('prepareShareCard exists and returns objectUrl', () => {
  assert.match(
    exportCanvasSource,
    /export async function prepareShareCard/,
    'prepareShareCard must be exported from exportCanvas'
  );
  assert.match(
    exportCanvasSource,
    /objectUrl:\s*URL\.createObjectURL/,
    'prepareShareCard must return an objectUrl for the blob'
  );
});

test('expired object URLs are revoked and caught errors revoke URLs', () => {
  assert.match(
    builderSource,
    /if\s*\(\s*url\s*\)\s*URL\.revokeObjectURL\(\s*url\s*\)/,
    'GridBuilder must revoke object URLs to prevent memory leaks on unmount or change'
  );
  assert.match(
    builderSource,
    /if\s*\(\s*prepared\?\.objectUrl\s*\)\s*URL\.revokeObjectURL\(\s*prepared\.objectUrl\s*\)/,
    'GridBuilder must revoke the object URL if an error occurs after preparation'
  );
});

test('prepared handoff clears itself at the two-minute expiry', () => {
  assert.match(
    builderSource,
    /const remaining = handoffState\.expiresAt - Date\.now\(\)/,
    'expiry must be derived from the prepared handoff deadline'
  );
  assert.match(
    builderSource,
    /window\.setTimeout\(\(\) => \{[\s\S]*?setHandoffState\(null\)/,
    'the prepared handoff must clear itself when its deadline arrives'
  );
});

test('preparation cannot install a stale or post-unmount grid', () => {
  assert.match(
    builderSource,
    /const preparedProposal = proposal/,
    'preparation must capture the exact proposal it renders'
  );
  assert.match(
    builderSource,
    /!mountedRef\.current \|\| proposalRef\.current !== preparedProposal/,
    'the prepared result must be rejected after unmount or proposal replacement'
  );
  assert.match(
    builderSource,
    /proposalRef\.current !== preparedProposal\) \{[\s\S]*?URL\.revokeObjectURL\(prepared\.objectUrl\)/,
    'a rejected stale preparation must revoke its object URL'
  );
});

test('mounted preparation guard survives React Strict Mode effect replay', () => {
  assert.match(
    builderSource,
    /useEffect\(\(\) => \{\s*mountedRef\.current = true;\s*return \(\) => \{\s*mountedRef\.current = false;/,
    'effect setup must restore the mounted guard after Strict Mode simulated cleanup'
  );
});

test('GridBuilder clears handoff state when proposal changes', () => {
  assert.match(
    builderSource,
    /setHandoffState\(null\)/,
    'GridBuilder must clear handoff state when proposal changes'
  );
});

test('RedNote handoff UI provides the two required steps and download', () => {
  assert.match(
    builderSource,
    /creator\.rednote\.com\/publish\/publish/,
    'GridBuilder must provide the RedNote publish link'
  );
  assert.match(
    builderSource,
    /shareToDevice/,
    'GridBuilder must provide a native device share action'
  );
  assert.match(
    builderSource,
    /action === 'download_raw'/,
    'GridBuilder must support direct download of the raw grid'
  );
});

test('saved Collection Grids expose the publishing handoff directly', () => {
  assert.match(
    collectionSource,
    /<GridPublishingHandoff grid=\{grid\}/,
    'each saved grid must render its own publishing handoff',
  );
  assert.match(
    collectionSource,
    /Handoff raw grid for publishing/,
    'the saved-grid action must use the publishing handoff label',
  );
  assert.match(
    collectionSource,
    /prepareShareCard\(starData,\s*'raw'/,
    'the saved-grid handoff must prepare the unchanged raw grid',
  );
});

test('Star of the Day distinguishes styled-card exports from the raw publishing handoff', () => {
  assert.match(exportButtonSource, /Share styled card/);
  assert.match(exportButtonSource, /Download styled card/);
  assert.match(exportButtonSource, /Handoff raw grid for publishing/);
  assert.match(exportButtonSource, /Only the 3×3 images · no copy or styling/);
  assert.match(
    exportHookSource,
    /prepareShareCard\(data,\s*'raw'/,
    'the daily publishing handoff must use the untreated raw-grid renderer',
  );
  assert.match(
    exportHookSource,
    /const shareData: ShareData = \{ files: \[artifact\.file\] \}/,
    'the daily handoff must share the exact prepared raw-grid file',
  );
  assert.doesNotMatch(
    exportHookSource.slice(
      exportHookSource.indexOf('const handoffForPublishing'),
      exportHookSource.indexOf('return {', exportHookSource.indexOf('const handoffForPublishing')),
    ),
    /downloadShareCard/,
    'the publishing handoff must not silently fall back to a styled-card download',
  );
});

test('Cancelled native share does not fallback to download', () => {
  const shareIdx = builderSource.indexOf('async function shareToDevice');
  const shareBody = builderSource.slice(shareIdx, builderSource.indexOf('}', shareIdx + 1500));
  assert.match(
    shareBody,
    /AbortError/,
    'shareToDevice must catch AbortError when share is cancelled'
  );
  assert.doesNotMatch(
    shareBody,
    /downloadPrepared/,
    'shareToDevice must not fallback to download within the AbortError catch'
  );
});

test('shareToDevice passes the exact ShareData variable to canShare', () => {
  const shareIdx = builderSource.indexOf('async function shareToDevice');
  const shareBody = builderSource.slice(shareIdx, builderSource.indexOf('}', shareIdx + 1500));
  assert.match(
    shareBody,
    /const shareData = \{[\s\S]*?files: \[handoffState\.file\][\s\S]*?\}/,
    'shareToDevice must construct a single shareData object'
  );
  assert.match(
    shareBody,
    /navigator\.canShare\(shareData\)/,
    'shareToDevice must pass shareData exactly to canShare'
  );
  assert.match(
    shareBody,
    /await navigator\.share\(shareData\)/,
    'shareToDevice must pass shareData exactly to share'
  );
});

test('raw grid renderer strips all treated-card decorations', () => {
  const rawIdx = exportCanvasSource.indexOf('async function renderRawExportCanvas');
  assert.notEqual(rawIdx, -1, 'renderRawExportCanvas must exist');
  const rawBody = exportCanvasSource.slice(rawIdx, exportCanvasSource.indexOf('return canvas', rawIdx));
  
  assert.doesNotMatch(rawBody, /fillText/, 'Raw canvas must not render text');
  assert.doesNotMatch(rawBody, /compositeBadge/, 'Raw canvas must not render badges');
  assert.doesNotMatch(rawBody, /glow\.addColorStop/, 'Raw canvas must not have background glow');
  assert.match(
    rawBody,
    /drawCoverImageRounded\(ctx,\s*img!,\s*tx,\s*ty,\s*tileSize,\s*tileSize,\s*0,\s*0\.5\)/,
    'Raw canvas must match the visible grid center crop'
  );
});

