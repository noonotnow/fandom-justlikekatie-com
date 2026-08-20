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
  FORBIDDEN_SOURCE_TEMPLATES_BY_FLAVOR,
  MEME_FLAVORS,
  memeFlavorCatalogPromptDetails,
  memeFlavorPromptDetails,
} from '../netlify/functions/lib/middle-earth-creative-grammar.js';
import { referenceStillFamilies } from '../src/data/middleEarthReferenceStills.ts';
import { forbiddenSourceTemplatesByFlavor } from '../src/data/middleEarthCreativeGrammar.ts';

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

test('every Meme Flavor has a prototype with a usable still family and compact comic turn', () => {
  const allowedStillFamilies = new Set(referenceStillFamilies.map((family) => family.id));
  assert.deepEqual(
    memeFlavors.map((flavor) => flavor.name),
    MEME_FLAVORS.map((flavor) => flavor.name),
    'client and server must expose the same flavor families',
  );

  for (const flavor of memeFlavors) {
    const { prototype } = flavor;
    assert.ok(prototype.corePattern);
    assert.ok(allowedStillFamilies.has(prototype.defaultStillFamily));
    assert.ok(prototype.comedicMechanism);
    assert.ok(prototype.avoid.length > 0);
    assert.ok(prototype.mutationRules.length > 0);
    for (const line of [prototype.exemplar.line1, prototype.exemplar.line2]) {
      assert.ok(line.length <= 36, `${flavor.name} prototype line exceeds card limit`);
      assert.ok(line.split(/\s+/).length <= 8, `${flavor.name} prototype line exceeds word limit`);
    }
  }
});

test('Samwise Loyalty is a supportive contradiction, not an inspirational poster', () => {
  const details = memeFlavorPromptDetails('Samwise Loyalty') ?? '';
  assert.match(details, /MY SAMWISE FRIEND: INCORRECT/i);
  assert.match(details, /supportive contradiction/i);
  assert.match(details, /carries the load/i);
  assert.match(details, /inspirational quote language/i);
});

test('the translation catalog gives Auto a prototype spine for every family', () => {
  const catalog = memeFlavorCatalogPromptDetails();
  for (const flavor of MEME_FLAVORS) {
    assert.match(catalog, new RegExp(`Family: ${flavor.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(catalog, new RegExp(`Default reaction-still family: ${flavor.prototype.defaultStillFamily}`));
  }
});

test('every flavor contributes a synchronized forbidden source-template guardrail', () => {
  assert.deepEqual(
    forbiddenSourceTemplatesByFlavor,
    FORBIDDEN_SOURCE_TEMPLATES_BY_FLAVOR,
  );
  assert.deepEqual(
    Object.keys(FORBIDDEN_SOURCE_TEMPLATES_BY_FLAVOR),
    MEME_FLAVORS.map((flavor) => flavor.name),
  );
  for (const phrases of Object.values(FORBIDDEN_SOURCE_TEMPLATES_BY_FLAVOR)) {
    assert.equal(phrases.length, 1);
    assert.ok(phrases[0].trim());
  }
});