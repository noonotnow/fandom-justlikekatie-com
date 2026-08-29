import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const adminSource = await readFile(
  new URL('../src/components/FandomAdmin/FandomAdmin.tsx', import.meta.url),
  'utf8',
);
const collectionSource = await readFile(
  new URL('../src/components/Collection/Collection.tsx', import.meta.url),
  'utf8',
);
const builderSource = await readFile(
  new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
  'utf8',
);
const launchpadSource = await readFile(
  new URL('../src/components/FandomLaunchpad/FandomLaunchpad.tsx', import.meta.url),
  'utf8',
);

test('Studio Operations is the public Collection and Grid Builder workspace', () => {
  assert.match(appSource, /<span>Studio Operations<\/span><small>Collection · Grid Builder<\/small>/);
  assert.match(collectionSource, /'Studio Operations'/);
  assert.match(collectionSource, />\s*Grid Builder\s*<\/button>/);
  assert.doesNotMatch(appSource, /<span>Admin<\/span><small>Packets<\/small>/);
});

test('the private operator console does not mount a duplicate Grid Builder', () => {
  assert.match(adminSource, /<h2>Operator Console<\/h2>/);
  assert.doesNotMatch(adminSource, /from '\.\.\/GridBuilder\/GridBuilder'/);
  assert.doesNotMatch(adminSource, /allRecords=\{true\}/);
  assert.doesNotMatch(adminSource, /aria-selected=\{view === 'builder'\}/);
  assert.doesNotMatch(builderSource, /allRecords/);
  assert.doesNotMatch(builderSource, /dbGetAllGrids|dbGetCardsByScope/);
});

test('public launchpad copy does not expose internal admin or CREATE architecture', () => {
  assert.match(launchpadSource, /compose a finished 3×3 in Studio Operations/);
  assert.doesNotMatch(launchpadSource, /\badmin\b/i);
  assert.doesNotMatch(launchpadSource, /\bCREATE\b/);
  assert.doesNotMatch(builderSource, /\bCREATE\b/);
});