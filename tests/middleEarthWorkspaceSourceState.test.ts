import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
    /source: sourceContext,\s*\n\s*\}\);\s*\n\s*setTitle\(generated\.title\)/,
    'the reforge path must send the selected source as grounding context',
  );
});
