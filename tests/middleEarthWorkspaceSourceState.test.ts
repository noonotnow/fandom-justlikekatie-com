import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createArchiveSearchRequestGate } from '../src/components/MiddleEarthWorkspace/archiveSearchRequestGate.ts';

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

test('visual inspiration stays behind translation and source selection requires a reforge', async () => {
  const source = await readFile(
    new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /\{translation \? <>\s*<form className=\{styles\.searchForm\} onSubmit=\{search\}>[\s\S]*?Search visual inspiration[\s\S]*?<\/form>[\s\S]*?<\/> : <div className=\{styles\.sourceNote\}>Translate the moment first to unlock optional visual inspiration\.<\/div>\}/,
    'archive search must be rendered only after a moment has been translated',
  );

  const translationResult = source.slice(
    source.indexOf('{translation && <div className={styles.translationResult}>'),
    source.indexOf('</section>', source.indexOf('{translation && <div className={styles.translationResult}>')),
  );
  assert.match(translationResult, /<span>Scene<\/span><p>\{translation\.scene\}<\/p>/);
  assert.match(translationResult, /<span>Archetype<\/span><p>\{translation\.memeFlavor\} · \{translation\.character\}<\/p>/);
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
    /source: sourceContext,\s*\n\s*\}\);\s*\n\s*setTitle\(generated\.cardText\.footer\)/,
    'the reforge path must send the selected source as grounding context',
  );
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
  assert.match(source, /reactionLines\.forEach\(\(line, index\) => \{\s*context\.fillText\(line,/);
  assert.match(
    source,
    /The reaction card needs both its setup and punchline before it can be saved\./,
  );
  assert.match(
    source,
    /Two lines only: setup, then punchline\. Keep longer interpretation in “Translated as\.”/,
  );
});
