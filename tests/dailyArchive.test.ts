import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const hookSource = await readFile(new URL('../src/hooks/useStarOfDay.ts', import.meta.url), 'utf8');

test('daily archive selection reuses the daily payload renderer and keeps today as the default', () => {
  assert.match(hookSource, /useStarOfDay = \(editionDate: string \| null = null\)/);
  assert.match(hookSource, /star-of-day\$\{query\}/);
  assert.match(appSource, /useStarOfDay\(selectedEditionDate\)/);
  assert.match(appSource, /selectedEditionDate \? `Archived card drop/);
});

test('every return to today clears per-image edition state', () => {
  const selectEdition = appSource.slice(
    appSource.indexOf('const selectEdition ='),
    appSource.indexOf('const navigateAtlas ='),
  );
  const navigateAtlas = appSource.slice(
    appSource.indexOf('const navigateAtlas ='),
    appSource.indexOf('const toggleArchive ='),
  );

  assert.match(selectEdition, /setImageTiers\(\{\}\)/);
  assert.match(selectEdition, /setSelectedEditionDate\(date\)/);
  assert.match(navigateAtlas, /if \(destination === 'daily'\) selectEdition\(null\)/);
});