import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createArchiveSearchRequestGate } from '../src/components/MiddleEarthWorkspace/archiveSearchRequestGate.ts';
import {
  loadableReactionAssets,
  rankReactionCandidates,
  reactionQueryLadder,
} from '../src/utils/reactionImageAssets.ts';

test('starting a new archive search invalidates the generated visual before clearing its source', async () => {
  const source = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    source,
    /setSelected\(undefined\);\s*setVisualGeneration\(undefined\);/,
  );
  assert.match(
    source,
    /disabled=\{busy \|\| !visualGeneration \|\| !text\.trim\(\)\}/,
  );
});

test('changing the moment clears the old source and archive inspiration', async () => {
  const source = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const updateMoment = source.slice(
    source.indexOf('const updateMoment ='),
    source.indexOf('const search =', source.indexOf('const updateMoment =')),
  );

  assert.match(
    updateMoment,
    /setTranslation\(undefined\);\s*setSelected\(undefined\);\s*setResults\(\[\]\);\s*setSearchedQuery\(""\);/,
    'changing the moment must clear the translated source and prior search records',
  );
  assert.match(
    source,
    /\{selected && <div className=\{styles\.provenance\}>/,
    'source provenance must remain conditional on an active source',
  );
});

test('an old archive response cannot restore inspiration after the moment changes', async () => {
  const requestGate = createArchiveSearchRequestGate();
  let resolveOldSearch!: (value: { query: string; results: string[] }) => void;
  const oldSearch = new Promise<{ query: string; results: string[] }>((resolve) => {
    resolveOldSearch = resolve;
  });
  let results = ['old record'];
  let searchedQuery = 'old query';
  let selected = 'old source';
  const requestId = requestGate.begin();
  const applyOldSearch = oldSearch.then((response) => {
    if (!requestGate.isCurrent(requestId)) return;
    results = response.results;
    searchedQuery = response.query;
    selected = undefined;
  });

  requestGate.invalidate();
  results = [];
  searchedQuery = '';
  selected = undefined;
  resolveOldSearch({ query: 'old query', results: ['old record'] });
  await applyOldSearch;

  assert.deepEqual(results, []);
  assert.equal(searchedQuery, '');
  assert.equal(selected, undefined);
});

test('keeps searching past failed thumbnails and never offers a broken reaction still', async () => {
  const candidates = Array.from({ length: 8 }, (_, index) => ({
    id: `candidate-${index + 1}`,
    thumbnail: `https://images.example/${index + 1}.jpg`,
  }));
  const attempted: string[] = [];
  const usable = await loadableReactionAssets(candidates, async (thumbnail) => {
    attempted.push(thumbnail);
    return thumbnail.endsWith('/7.jpg') || thumbnail.endsWith('/8.jpg');
  });

  assert.equal(attempted.length, 8, 'all provider candidates must be checked before applying the display limit');
  assert.deepEqual(
    usable.map((candidate) => candidate.id),
    ['candidate-7', 'candidate-8'],
    'failed thumbnails are removed before the gallery can render or select them',
  );
});

test('searches the visual joke brief in human-native priority order and retains real result provenance', () => {
  const ladder = reactionQueryLadder({
    socialUseQuery: 'friend refuses to let you suffer alone reaction',
    characterEmotionQueries: ['Samwise worried Frodo still'],
    iconicSceneQueries: ['Sam carrying Frodo Mount Doom still'],
    broadFallbackQueries: ['Lord of the Rings supportive friend reaction'],
  });
  assert.deepEqual(ladder.map((entry) => entry.tier), [
    'Social use',
    'Character + emotion',
    'Iconic scene',
    'Broad fallback',
  ]);

  const ranked = rankReactionCandidates([
    {
      candidate: { id: 'broad', url: 'https://source.example/broad', thumbnail: 'https://image.example/broad.jpg', query: ladder[3].query },
      queryTier: ladder[3].tier,
      rank: 300,
    },
    {
      candidate: { id: 'social', url: 'https://source.example/social', thumbnail: 'https://image.example/social.jpg', query: ladder[0].query },
      queryTier: ladder[0].tier,
      rank: 0,
    },
    {
      candidate: { id: 'duplicate-social', url: 'https://source.example/social', thumbnail: 'https://image.example/duplicate.jpg', query: ladder[1].query },
      queryTier: ladder[1].tier,
      rank: 101,
    },
  ]);

  assert.deepEqual(ranked.map((candidate) => candidate.id), ['social', 'broad']);
  assert.equal(ranked[0].reactionQueryTier, 'Social use');
  assert.equal(ranked[0].query, 'friend refuses to let you suffer alone reaction');
});

test('reaction images stay behind translation and source selection requires a reforge', async () => {
  const source = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /\{translation \? <>[\s\S]*?<form className=\{styles\.searchForm\} onSubmit=\{search\}>[\s\S]*?Search reaction images[\s\S]*?<\/form>[\s\S]*?<\/> : <div className=\{styles\.sourceNote\}>Translate the moment first to find its reaction-image candidates\.<\/div>\}/,
    'reaction image search must be rendered only after a moment has been translated',
  );

  const translationResult = source.slice(
    source.indexOf('{translation && <div className={styles.translationResult}>'),
    source.indexOf('</section>', source.indexOf('{translation && <div className={styles.translationResult}>')),
  );
  assert.match(translationResult, /<span>Scene<\/span><p>\{translation\.scene\}<\/p>/);
  assert.match(translationResult, /<span>Archetype<\/span><p>\{translation\.memeFlavor\} · \{translation\.character\}<\/p>/);
  assert.match(translationResult, /<span>Comic mechanism<\/span><p>\{translation\.comicMechanism\}<\/p>/);
  assert.match(translationResult, /<span>Vibe<\/span><p>\{translation\.tone\} · \{translation\.aesthetic\}<\/p>/);

  const sourceSelection = source.slice(
    source.indexOf('{results.map((asset) =>'),
    source.indexOf('</div>}</section>', source.indexOf('{results.map((asset) =>')),
  );
  assert.match(
    sourceSelection,
    /setSelected\(asset\);\s*setVisualGeneration\(undefined\);/,
    'selecting a source must invalidate the previously generated visual',
  );
  assert.doesNotMatch(
    sourceSelection,
    /setTranslation\(undefined\)/,
    'selecting a source must preserve the translated scene, archetype, and vibe explanation',
  );
  assert.match(
    source,
    /visualGeneration \? "Reforge card" : "Forge card"/,
    'a source selection must leave the forge action visibly requiring a reforge',
  );
  assert.match(
    source,
    /source: sourceContext,\s*\n\s*reactionImageBrief: translation\.reactionImageBrief,\s*\n\s*cardText: translation\.cardText,\s*\n\s*\}\);\s*\n\s*setTitle\(generated\.cardText\.footer\)/,
    'the reforge path must send the selected source, paired image brief, and exact text contract as grounding context',
  );
  assert.match(
    source,
    /setSelected\(undefined\); setPreviewImageFailed\(false\); setVisualGeneration\(undefined\); setPacketSaved\(false\);/,
    'a new reaction search or translation must invalidate any prior source before async results return',
  );
  assert.match(
    source,
    /The paired setup or punchline was edited\. Translate the moment again/,
    'editing paired text must require a fresh visual brief instead of forging it against a stale reaction contract',
  );
  assert.match(
    source,
    /await searchReactionLadder\(generated\.reactionImageBrief\);/,
    'a translated angle must automatically search its paired visual joke brief',
  );
  assert.match(
    source,
    /const ranked = rankReactionCandidates\(/,
    'the visual query ladder must merge candidates by reaction-fit rank before display',
  );
  assert.match(
    source,
    /const candidates = await loadableReactionAssets\(ranked, canLoadReactionImage\);/,
    'every ladder search must verify candidates before limiting the selectable gallery',
  );
  assert.match(
    source,
    /Use typography-only fallback/,
    'typography-only must remain an explicit fallback, not the default card treatment',
  );
  const search = source.slice(
    source.indexOf('const search ='),
    source.indexOf('const selectStep =', source.indexOf('const search =')),
  );
  assert.doesNotMatch(
    search,
    /setText\(|setSecondaryText\(|setTitle\(/,
    'choosing or auto-selecting a reaction still must never rewrite the generated joke',
  );
});

test('resolved comic mechanism survives visual grounding and packet staging', async () => {
  const source = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /comicMechanism: resolvedComicMechanism,/);
  assert.match(source, /Comic mechanism: \$\{translation\.comicMechanism\}/);
  assert.match(source, /\.\.\.\(resolvedComicMechanism \? \{ comicMechanism: resolvedComicMechanism \} : \{\}\)/);
  assert.match(source, /<span>Comic mechanism<\/span><p>\{translation\.comicMechanism\}<\/p>/);
  assert.match(source, /reactionImageBrief: translation\?\.reactionImageBrief,/);
  assert.match(source, /Visual joke role<\/span><p>\{translation\.reactionImageBrief\.visualRole\}<\/p>/);
  assert.match(source, /Performed reaction<\/span><p>\{translation\.reactionImageBrief\.performedEmotion\.join\(" · "\)\}<\/p>/);
});

test('the forge editor keeps reaction cards to a setup line, punchline line, and optional tiny footer', async () => {
  const source = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /<label>Tiny footer[\s\S]*?maxLength=\{45\}/);
  assert.match(source, /<label>Setup line[\s\S]*?maxLength=\{36\}/);
  assert.match(source, /<label>Punchline \/ reaction line[\s\S]*?maxLength=\{36\}/);
  assert.match(source, /const isStructuredReaction = draft\.kind === "meme" && Boolean\(draft\.cardFormat\);/);
  assert.match(
    source,
    /const isClassicReactionFrame = isStructuredReaction && draft\.layout === "Classic top \/ bottom";[\s\S]*?drawClassicReactionFrame\(context, draft, image\);/,
    'export must route default reaction cards through the dedicated meme-frame renderer',
  );
  assert.match(
    source,
    /const reactionStillFrame = \{ x: 54, y: 364, width: 972, height: 548 \};[\s\S]*?drawTextBand\(draft\.text \|\| "YOUR SETUP BELONGS HERE\.", 26, 338\);[\s\S]*?drawTextBand\(draft\.secondaryText \|\| "YOUR REACTION BELONGS HERE\.", 912, 412\);/,
    'export must reserve separate top, still, and bottom regions for reaction cards',
  );
  assert.match(source, /MEMEFORGE \/\/ \{\(cardFormat \|\| resolvedArtifactType \|\| "Reaction"\)\.toUpperCase\(\)\}/);
  assert.match(
    source,
    /The reaction card needs both its setup and punchline before it can be saved\./,
  );
  assert.match(
    source,
    /Two lines only: setup, then punchline\. Keep longer interpretation in “Translated as\.”/,
  );
});

test('every reaction-card layout keeps setup and punchline at one shared type scale', async () => {
  const css = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.module.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.previewCopy strong,\.previewCopy em \{[\s\S]*?font:700 clamp\(18px,7\.5cqi,29px\)/);
  assert.doesNotMatch(css, /--card-copy-length/);
  assert.doesNotMatch(css, /Tiny confession"\] \.previewCopy (?:strong|em)[\s\S]*?font-size/);
  assert.match(
    css,
    /\.preview\[data-layout="Classic top \/ bottom"\] \.previewStillFrame \{[\s\S]*?inset:28% 7% 29%[\s\S]*?\.preview\[data-layout="Classic top \/ bottom"\] \.previewLines \{[\s\S]*?grid-template-rows:28% 43% 29%/,
    'the default preview must reserve top/bottom text bands around a dedicated reaction-still frame',
  );
});
