import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const adminSource = await readFile(
  new URL('../src/components/FandomAdmin/FandomAdmin.tsx', import.meta.url),
  'utf8',
);
const actorPreflightSource = await readFile(
  new URL('../src/components/FandomAdmin/ActorPreflightLab.tsx', import.meta.url),
  'utf8',
);
const releaseDeskSource = await readFile(
  new URL('../src/components/FandomAdmin/ReleaseDesk.tsx', import.meta.url),
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
const rootHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const [guideHtml, gettingStartedHtml, glossaryHtml, tropeDecoderHtml, fandomGamesHtml] = await Promise.all([
  readFile(new URL('../public/c-drama-fandom/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/c-drama-fandom/getting-started/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/c-drama-fandom/glossary/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/c-drama-fandom/trope-decoder/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/c-drama-fandom/fandom-games/index.html', import.meta.url), 'utf8'),
]);
const previewRoot = new URL('../public/c-drama-fandom/fandom-games/previews/', import.meta.url);
const previewDirectories = (await readdir(previewRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory());
const previewHtml = await Promise.all(
  previewDirectories.map(entry => readFile(new URL(`${entry.name}/index.html`, previewRoot), 'utf8')),
);

test('Your Collection is the public Collection and Grid Builder workspace', () => {
  assert.match(appSource, /<span>Your Collection<\/span><small>Saved Grids · Grid Builder<\/small>/);
  assert.match(collectionSource, /'Your Collection'/);
  assert.match(collectionSource, />\s*Grid Builder\s*<\/button>/);
  assert.doesNotMatch(appSource, /<span>Admin<\/span><small>Packets<\/small>/);
});

test('the private operator console does not mount a duplicate Grid Builder', () => {
  assert.match(adminSource, /<h2>Operator Console<\/h2>/);
  assert.match(appSource, /<FandomAdmin initialView="actor-preflight" \/>/);
  assert.match(adminSource, /\(\{ initialView = 'actor-preflight' \}\)/);
  assert.doesNotMatch(adminSource, /from '\.\.\/GridBuilder\/GridBuilder'/);
  assert.doesNotMatch(adminSource, /allRecords=\{true\}/);
  assert.doesNotMatch(adminSource, /aria-selected=\{view === 'builder'\}/);
  assert.doesNotMatch(builderSource, /allRecords/);
  assert.doesNotMatch(builderSource, /dbGetAllGrids|dbGetCardsByScope/);
});

test('Release Desk owns private inventory while PLAN and Actor Preflight remain separate', () => {
  assert.match(adminSource, /aria-selected=\{view === 'release-desk'\}/);
  assert.match(adminSource, />Release Desk<\/button>/);
  assert.match(adminSource, />PLAN schedule<\/button>/);
  assert.match(adminSource, />Actor preflight<\/button>/);
  assert.match(adminSource, /view === 'release-desk' \? <ReleaseDesk \/>/);
  assert.match(releaseDeskSource, /aria-label="Release Desk view"/);
  assert.match(releaseDeskSource, /role="tab" aria-selected="true">Inventory/);
  assert.match(releaseDeskSource, /Private editorial context/);
  assert.doesNotMatch(actorPreflightSource, /ReleaseInventory|releaseInventory/);

  const privateGate = appSource.slice(
    appSource.indexOf(': adminLoading ?'),
    appSource.indexOf('</div>', appSource.indexOf('<FandomAdmin')),
  );
  assert.match(privateGate, /!isAdmin \? \(\s*<AdminSignIn \/>/);
  assert.match(privateGate, /<FandomAdmin initialView="actor-preflight" \/>/);
  assert.doesNotMatch(appSource, /<span>Release Desk<\/span>/);
});

test('public launchpad copy does not expose internal admin or CREATE architecture', () => {
  assert.match(launchpadSource, /daily C-drama card drop/);
  assert.match(launchpadSource, /One star, one vibe, nine pieces of evidence/);
  assert.match(launchpadSource, /Browse today’s drop, save the cards that hit/);
  assert.doesNotMatch(launchpadSource, /\badmin\b/i);
  assert.doesNotMatch(launchpadSource, /\bCREATE\b/);
  assert.doesNotMatch(builderSource, /\bCREATE\b/);
});

test('public Vibe Atlas copy names the daily card-drop promise', () => {
  assert.match(appSource, /A daily C-drama card drop/);
  assert.match(appSource, /'Vibe Atlas \| A Daily C-Drama Card Drop'/);
  assert.match(appSource, /One star\. One vibe\. Nine pieces of evidence\./);
  assert.match(appSource, /iconic characters, looks, and moments/);
  assert.match(appSource, /Today's star/);
  assert.match(appSource, /Today's vibe/);
  assert.match(appSource, /<h2>Today’s evidence<\/h2>/);
  assert.match(appSource, /Nine cards from today’s star × Vibe Pack/);
  assert.match(rootHtml, /Vibe Atlas’s curated daily C-drama card drop/);
  assert.match(rootHtml, /browse today’s Vibe Atlas card drop/);
  assert.doesNotMatch(appSource, /worldbuilding instrument|emotional weather/i);
  assert.doesNotMatch(appSource, /Free Daily C-Drama Atmosphere Grid/);
  assert.doesNotMatch(launchpadSource, /daily atmosphere|worldbuilding instrument|emotional weather/i);
  assert.doesNotMatch(rootHtml, /daily atmosphere|worldbuilding instrument|emotional weather/i);
});

test('crawlable C-drama entry points use the Vibe Atlas daily card-drop promise', () => {
  assert.match(guideHtml, /daily C-drama card drop/);
  assert.match(guideHtml, /one featured actor with one Vibe Pack/);
  assert.match(guideHtml, /nine collectible pieces of evidence/);
  assert.match(guideHtml, /Browse today’s C-drama card drop/);
  assert.match(gettingStartedHtml, /Browse today’s C-drama card drop/);
  assert.match(gettingStartedHtml, /today’s Vibe Atlas card drop/);
  assert.match(gettingStartedHtml, /Meet today’s featured star and vibe through nine collectible pieces of evidence/);
  assert.match(glossaryHtml, /one featured actor, one Vibe Pack, and nine collectible pieces of evidence/);
  assert.match(glossaryHtml, /Browse today’s card drop/);
  assert.match(tropeDecoderHtml, /today’s Vibe Atlas card drop/);
  assert.match(tropeDecoderHtml, /nine pieces of evidence/);
  assert.match(tropeDecoderHtml, /Browse today’s card drop/);
  assert.match(fandomGamesHtml, /today’s curated C-drama card drop/);
  assert.match(fandomGamesHtml, /One star, one vibe, nine collectible pieces of evidence/);

  const retiredVibeAtlasCopy = /atmosphere grid|atmosphere studio|emotional weather|daily atmosphere|living 3×3|Explore today’s grid|Explore today’s free Vibe Atlas|Explore Vibe Atlas|today’s C-drama atmosphere|today’s free Vibe Atlas/i;
  for (const html of [guideHtml, gettingStartedHtml, glossaryHtml, tropeDecoderHtml, fandomGamesHtml, ...previewHtml]) {
    assert.doesNotMatch(html, retiredVibeAtlasCopy);
  }
  for (const html of previewHtml) {
    assert.match(html, /today’s curated C-drama card drop/);
    assert.match(html, /One star, one vibe, nine collectible pieces of evidence/);
  }
});