import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aesthetics,
  artifactTypes,
  memeFlavors,
} from '../src/data/middleEarthCreativeGrammar.ts';
import {
  AESTHETIC_NAMES,
  ARTIFACT_TYPE_NAMES,
  MEME_FLAVORS,
  memeFlavorPromptDetails,
} from '../netlify/functions/lib/middle-earth-creative-grammar.js';

test('the frontend and server share the same bounded Middle-earth creative grammar', () => {
  assert.equal(memeFlavors.length, 13);
  assert.deepEqual(
    memeFlavors.map((flavor) => flavor.name),
    MEME_FLAVORS.map((flavor) => flavor.name),
  );
  assert.deepEqual(
    aesthetics.map((option) => option.name),
    [...AESTHETIC_NAMES],
  );
  assert.deepEqual(artifactTypes, [...ARTIFACT_TYPE_NAMES]);
});

test('every Meme Flavor prompt enforces original-artifact guardrails', () => {
  for (const flavor of MEME_FLAVORS) {
    const details = memeFlavorPromptDetails(flavor.name);
    assert.ok(details?.includes(`Meme Flavor: ${flavor.name}`));
    assert.match(details ?? '', /not permission to reproduce/i);
  }
});