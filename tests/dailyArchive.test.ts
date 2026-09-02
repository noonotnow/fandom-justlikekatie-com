import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const hookSource = await readFile(new URL('../src/hooks/useStarOfDay.ts', import.meta.url), 'utf8');

test('daily archive selection reuses the daily payload renderer and keeps today as the default', () => {
  assert.match(hookSource, /useStarOfDay = \(editionDate: string \| null \| undefined = null\)/);
  assert.match(hookSource, /star-of-day\$\{query\}/);
  assert.match(appSource, /useStarOfDay\(archivePage && !selectedEditionDate \? undefined : selectedEditionDate\)/);
  assert.match(appSource, /isVibeAtlasArchiveLocation/);
  assert.match(appSource, /href=\{`\/vibe-atlas\?date=\$\{encodeURIComponent\(edition\.date\)\}`\}/);
  assert.match(appSource, /selectedEditionDate \? `Archived card drop/);
  assert.match(appSource, /initialVibeAtlasEditionDate\(window\.location\.search\)/);
  assert.match(appSource, /params\.set\('date', date\)/);
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
  assert.match(appSource, /params\.delete\('date'\)/);
  assert.match(appSource, /openArchivePicker\(\)/);
});

test('archived editions expose an accessible date-aware copy link, but today does not', () => {
  assert.match(appSource, /const copyArchivedEditionLink = async \(\) =>/);
  assert.match(appSource, /navigator\.clipboard\?\.writeText/);
  assert.match(appSource, /new URL\('\/vibe-atlas', window\.location\.origin\)/);
  assert.match(appSource, /shareUrl\.searchParams\.set\('date', selectedEditionDate\)/);
  assert.match(appSource, /Copied link for \$\{formatEditionDate\(selectedEditionDate\)\}/);
  assert.match(appSource, /Could not copy this archived edition link/);
  assert.match(appSource, /role="status" aria-live="polite"/);
  assert.match(appSource, /selectedEditionDate && isValidVibeAtlasEditionDate\(selectedEditionDate\)/);
  assert.match(appSource, /Copy archived edition link/);
});