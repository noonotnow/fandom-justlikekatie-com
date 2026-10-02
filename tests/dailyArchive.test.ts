import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldFallbackToLegacyArchiveEdition } from '../src/hooks/useStarOfDay';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const hookSource = await readFile(new URL('../src/hooks/useStarOfDay.ts', import.meta.url), 'utf8');

test('daily archive selection reuses the daily payload renderer and keeps today as the default', () => {
  assert.match(hookSource, /useStarOfDay = \(editionDate: string \| null \| undefined = null\)/);
  assert.match(hookSource, /star-of-day\$\{query\}/);
  assert.match(hookSource, /public-archive-inventory\?\$\{query\.toString\(\)\}/);
  assert.match(hookSource, /shouldFallbackToLegacyArchiveEdition\(response\.status, body\)/);
  assert.match(
    appSource,
    /useStarOfDay\(\s*\(archivePage && !activeEditionDate\)\s*\|\|\s*\(view === 'collection' && \(builderSource === 'archive' \|\| builderSource === 'edition'\)\)\s*\?\s*undefined\s*:\s*activeEditionDate,\s*\)/,
  );
  assert.match(appSource, /isVibeAtlasArchiveLocation/);
  assert.match(appSource, /`\$\{PUBLIC_ROUTE_PATHS\.vibeAtlas\}\?date=\$\{encodeURIComponent\(edition\.date\)\}`/);
  assert.match(appSource, /selectedEditionDate \? `\$\{t\('Archived card drop', '典藏卡组'\)\}/);
  assert.match(appSource, /initialVibeAtlasEditionDate\(window\.location\.search\)/);
  assert.match(appSource, /params\.set\('date', date\)/);
});

test('dated edition loading only falls back for an explicit unverified-legacy 404', () => {
  const legacyFallback = { fallback: 'legacy_unverified_edition' };
  assert.equal(shouldFallbackToLegacyArchiveEdition(404, legacyFallback), true);
  assert.equal(shouldFallbackToLegacyArchiveEdition(404, { error: 'not found' }), false);
  assert.equal(shouldFallbackToLegacyArchiveEdition(503, legacyFallback), false);
  assert.equal(shouldFallbackToLegacyArchiveEdition(500, legacyFallback), false);
});

test('every return to today clears per-image edition state', () => {
  const selectEdition = appSource.slice(
    appSource.indexOf('const selectEdition ='),
    appSource.indexOf('const navigateAtlas ='),
  );
  const navigateAtlas = appSource.slice(
    appSource.indexOf('const navigateAtlas ='),
    appSource.indexOf('const handleItemClick ='),
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
  assert.match(appSource, /new URL\(path\(PUBLIC_ROUTE_PATHS\.vibeAtlas\), window\.location\.origin\)/);
  assert.match(appSource, /shareUrl\.searchParams\.set\('date', selectedEditionDate\)/);
  assert.match(appSource, /t\('Copied link for', '已复制链接：'\) \+ ` \$\{formatEditionDate\(selectedEditionDate, dateLocale\)\}\.`/);
  assert.match(appSource, /t\('Could not copy this archived edition link\./);
  assert.match(appSource, /role="status" aria-live="polite"/);
  assert.match(appSource, /selectedEditionDate && isValidVibeAtlasEditionDate\(selectedEditionDate\)/);
  assert.match(appSource, /Copy archived edition link/);
});

test('full archive renders visual board plates and preserves genuine legendary misprints', () => {
  assert.match(hookSource, /previewThumbnails\?: string\[\]/);
  assert.match(hookSource, /legendaryMisprint\?: boolean/);
  assert.match(hookSource, /legendaryMisprintTitle\?: string/);
  assert.match(appSource, /function ArchiveEditionCard/);
  assert.match(appSource, /archive-card__mosaic/);
  assert.match(appSource, /edition\.legendaryMisprint/);
  assert.match(appSource, /\(archiveTotal \?\? archive\.length\) - index/);
  assert.match(appSource, /Archive anomaly · Legendary Misprint/);
  assert.match(appSource, /The Star of the Day Archive/);
});

test('homepage delegates historical browsing to the dedicated Archive', () => {
  const dailyView = appSource.slice(
    appSource.indexOf('<header className="atlas-hero">'),
    appSource.indexOf('{gate && selectedEditionDate'),
  );
  assert.doesNotMatch(dailyView, /daily-archive__toggle/);
  assert.doesNotMatch(dailyView, /ArchiveEditionButton/);
  assert.match(appSource, /window\.history\.pushState\(\{\}, '', path\(PUBLIC_ROUTE_PATHS\.vibeAtlasArchive\)\)/);
});

test('daily and archive previews link only approved canonical public records', () => {
  assert.match(hookSource, /publicRecord\?: PublicRecordLinks/);
  assert.match(appSource, /rawData\?\.publicRecord/);
  assert.match(appSource, /href=\{path\(rawData\.publicRecord\.actorPath\)\}/);
  assert.match(appSource, /href=\{path\(rawData\.publicRecord\.editionPath\)\}/);
  assert.match(appSource, /edition\.publicRecord &&/);
  assert.match(appSource, /href=\{path\(edition\.publicRecord\.actorPath\)\}/);
  assert.match(appSource, /href=\{path\(edition\.publicRecord\.editionPath\)\}/);
  assert.match(appSource, /archive-card__records/);
});

test('historical member editions render a server-authoritative preview gate', () => {
  assert.match(hookSource, /gate: ArchiveGate \| null/);
  assert.match(hookSource, /res\.status === 401 \|\| res\.status === 403 \|\| res\.status === 503/);
  assert.match(appSource, /function ArchiveLockedEdition/);
  assert.match(appSource, /t\('This published preview stays open to everyone\. Founding Members can unlock the complete nine-card board/);
  assert.match(appSource, /createMembershipCheckout\(selectedEditionDate\)/);
  assert.match(appSource, /destination\.startsWith\('archive:'\)/);
});
