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
  assert.match(appSource, /<FandomAdmin initialView="release-desk" \/>/);
  assert.match(adminSource, /\(\{ initialView = 'release-desk' \}\)/);
  assert.doesNotMatch(adminSource, /from '\.\.\/Plan\/Plan'/);
  assert.doesNotMatch(adminSource, /from '\.\.\/GridBuilder\/GridBuilder'/);
  assert.doesNotMatch(adminSource, /allRecords=\{true\}/);
  assert.doesNotMatch(adminSource, /aria-selected=\{view === 'builder'\}/);
  assert.doesNotMatch(builderSource, /allRecords/);
  assert.doesNotMatch(builderSource, /dbGetAllGrids|dbGetCardsByScope/);
});

test('Release Desk is the Admin workspace for private inventory', () => {
  assert.match(adminSource, /aria-selected=\{view === 'release-desk'\}/);
  assert.match(adminSource, />Release Desk<\/button>/);
  assert.match(adminSource, />Actor Preflight Lab<\/button>/);
  assert.match(adminSource, /view === 'release-desk' \? <ReleaseDesk \/>/);
  assert.match(releaseDeskSource, /aria-label="Release Desk view"/);
  assert.match(releaseDeskSource, /aria-selected=\{view === 'inventory'\}/);
  assert.match(releaseDeskSource, />Inventory<small>Current candidates/);
  assert.match(releaseDeskSource, /aria-selected=\{view === 'production'\}/);
  assert.match(releaseDeskSource, />Production<small>Readiness blockers/);
  assert.match(releaseDeskSource, /aria-selected=\{view === 'audience'\}/);
  assert.match(releaseDeskSource, />Audience evidence<small>Actual use \+ data quality/);
  assert.match(releaseDeskSource, /engagement-export\?records=0/);
  assert.match(releaseDeskSource, /Download audit dataset/);
  assert.match(releaseDeskSource, /Event ratios, not unique-user conversion/);
  assert.match(releaseDeskSource, /<h4 id="release-production-title">Production readiness<\/h4>/);
  assert.match(releaseDeskSource, /label="Asset"/);
  assert.match(releaseDeskSource, /label="Enhancement"/);
  assert.match(releaseDeskSource, /label="Render"/);
  assert.match(releaseDeskSource, /label="Copy"/);
  assert.match(releaseDeskSource, /label="Provenance \/ rights"/);
  assert.match(releaseDeskSource, /label="Schedule eligibility"/);
  assert.match(releaseDeskSource, /PLAN remains the scheduling source of truth/);
  assert.match(releaseDeskSource, /never changes the immutable approval, evidence, or board history/);
  assert.match(releaseDeskSource, /Private editorial context/);
  assert.doesNotMatch(actorPreflightSource, /ReleaseInventory|releaseInventory/);

  const privateGate = appSource.slice(
    appSource.indexOf(': adminLoading ?'),
    appSource.indexOf('</div>', appSource.indexOf('<FandomAdmin')),
  );
  assert.match(privateGate, /!isAdmin \? \(\s*<AdminSignIn \/>/);
  assert.match(privateGate, /<FandomAdmin initialView="release-desk" \/>/);
  assert.doesNotMatch(appSource, /<span>Release Desk<\/span>/);
});

test('Actor Preflight keeps hero-only failures complete and reviewable', () => {
  assert.match(actorPreflightSource, /curator proposal cards/);
  assert.match(actorPreflightSource, /automatically publication-ready cards/);
  assert.match(actorPreflightSource, /complete board · Hero review needed/);
  assert.match(actorPreflightSource, /review\?\.board\?\.candidates \?\? retainedProposal\?\.candidates/);
  assert.match(actorPreflightSource, /Compiled complete board · Hero review needed/);
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
  assert.match(glossaryHtml, /A visual fandom discovery system/);
  assert.match(glossaryHtml, /Explore today’s Vibe Atlas Drop/);
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

test('the glossary separates shared fandom language from Fandom Vibes collecting lore', () => {
  assert.match(glossaryHtml, /aria-label="Glossary sections"/);
  assert.match(glossaryHtml, /href="#genre-terms">Genres and worlds/);
  assert.match(glossaryHtml, /href="#story-language">Story language/);
  assert.match(glossaryHtml, /href="#community-language">Community language/);
  assert.match(glossaryHtml, /href="#fandom-vibes-language">Fandom Vibes language/);
  assert.match(glossaryHtml, /These are Fandom Vibes’ own product and collecting terms/);

  assert.match(glossaryHtml, /<dt>Vibe Atlas<\/dt><dd>A visual fandom discovery system/);
  assert.match(glossaryHtml, /<dt>Daily Drop<\/dt>/);
  assert.match(glossaryHtml, /<dt>Vibe Pack<\/dt>/);
  assert.match(glossaryHtml, /<dt>Vibe spell<\/dt><dd>The search incantation used to summon evidence/);
  assert.match(glossaryHtml, /<dt>Vibe evidence<\/dt>/);
  assert.match(glossaryHtml, /<dt>Collection<\/dt>/);
  assert.match(glossaryHtml, /<dt>Legendary<\/dt><dd>An archive-worthy status/);
  assert.match(glossaryHtml, /<dt>Misprint<\/dt><dd>A result that is technically wrong/);
  assert.match(glossaryHtml, /<dt>Legendary Misprint<\/dt><dd>A Misprint so memorable/);
  assert.doesNotMatch(glossaryHtml, /intentional, event-scoped exception/);
  assert.doesNotMatch(glossaryHtml, /deliberately authored 3×3 fandom artifact/);

  assert.match(glossaryHtml, /commonly traced to “coupling\.”/);
  assert.match(glossaryHtml, /less centered on immortality and supernatural cultivation than xianxia/);
  assert.match(glossaryHtml, /when official subtitled releases exist in your region, support them/);
  assert.match(glossaryHtml, /This living glossary favors clear context over claims of one universal fandom usage/);
});
