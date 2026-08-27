import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aesthetics,
  artifactTypes,
  comicMechanisms,
  defaultComicMechanismsByFlavor,
  memeFlavors,
} from '../src/data/middleEarthCreativeGrammar.ts';
import {
  AESTHETIC_NAMES,
  ARTIFACT_TYPE_NAMES,
  COMIC_MECHANISM_EXAMPLE_BANK,
  COMIC_MECHANISM_NAMES,
  COMIC_MECHANISMS,
  DEFAULT_COMIC_MECHANISMS_BY_FLAVOR,
  FORBIDDEN_SOURCE_TEMPLATES_BY_FLAVOR,
  MEME_FLAVORS,
  comicMechanismCatalogPromptDetails,
  comicMechanismExampleBank,
  defaultComicMechanismsForFlavor,
  memeFlavorCatalogPromptDetails,
  memeFlavorPromptDetails,
  resolvedComicMechanismPromptDetails,
  sampledComicMechanismExamples,
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
  assert.deepEqual(
    comicMechanisms.map((mechanism) => mechanism.name),
    COMIC_MECHANISMS.map((mechanism) => mechanism.name),
  );
  assert.deepEqual(
    comicMechanisms.map((mechanism) => mechanism.name),
    [...COMIC_MECHANISM_NAMES],
  );
});

test('comic mechanisms are reusable original-safe joke turns, not copied templates', () => {
  assert.equal(comicMechanisms.length, 7);
  const catalog = comicMechanismCatalogPromptDetails();
  for (const mechanism of comicMechanisms) {
    assert.ok(mechanism.description);
    assert.ok(mechanism.selectionCues.length > 0);
    assert.ok(mechanism.avoid.length > 0);
    assert.ok(mechanism.exemplarShape);
    assert.match(catalog, new RegExp(`Comic Mechanism: ${mechanism.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
});

test('every flavor has synchronized default comic mechanisms', () => {
  assert.deepEqual(defaultComicMechanismsByFlavor, DEFAULT_COMIC_MECHANISMS_BY_FLAVOR);
  for (const flavor of memeFlavors) {
    const defaults = defaultComicMechanismsByFlavor[flavor.name];
    assert.ok(defaults.length > 0, `${flavor.name} needs a default mechanism`);
    assert.deepEqual(defaults, defaultComicMechanismsForFlavor(flavor.name));
    for (const mechanism of defaults) {
      assert.ok(COMIC_MECHANISM_NAMES.has(mechanism));
    }
  }
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

test('every comic mechanism has a bank of concrete, card-safe calibration jokes', () => {
  assert.deepEqual(Object.keys(COMIC_MECHANISM_EXAMPLE_BANK), COMIC_MECHANISMS.map((m) => m.name));
  for (const mechanism of COMIC_MECHANISMS) {
    const bank = comicMechanismExampleBank(mechanism.name);
    assert.ok(bank.length >= 3, `${mechanism.name} needs at least 3 calibration jokes`);
    for (const example of bank) {
      for (const line of [example.line1, example.line2]) {
        assert.ok(line.length <= 36, `${mechanism.name} calibration line exceeds card limit: "${line}"`);
        assert.ok(line.split(/\s+/).length <= 8, `${mechanism.name} calibration line exceeds word limit: "${line}"`);
      }
    }
  }
});

test('calibration jokes are sampled without replacement and rotate across requests', () => {
  const name = 'Intent reversal';
  const bank = comicMechanismExampleBank(name);
  const sequence = [0.9, 0.1, 0.5, 0.5];
  let i = 0;
  const deterministicRandom = () => sequence[i++ % sequence.length];
  const picked = sampledComicMechanismExamples(name, 2, deterministicRandom);
  assert.equal(picked.length, 2);
  assert.notDeepEqual(picked[0], picked[1]);
  for (const example of picked) {
    assert.ok(bank.some((candidate) => candidate.line1 === example.line1 && candidate.line2 === example.line2));
  }

  const otherRandom = () => 0;
  const alwaysFirstTwo = sampledComicMechanismExamples(name, 2, otherRandom);
  assert.deepEqual(alwaysFirstTwo, [bank[0], bank[1]]);
});

test('the resolved Comic Mechanism prompt injects calibration jokes labeled as craft reference only', () => {
  const details = resolvedComicMechanismPromptDetails('Severity inversion', { random: () => 0 }) ?? '';
  assert.match(details, /Concrete calibration jokes/i);
  assert.match(details, /never reuse these lines verbatim/i);
  assert.match(details, /REPLYING TO ONE TEXT/);
});

test('the comic mechanism catalog includes calibration jokes for every mechanism', () => {
  const catalog = comicMechanismCatalogPromptDetails({ random: () => 0 });
  for (const mechanism of COMIC_MECHANISMS) {
    const bank = comicMechanismExampleBank(mechanism.name);
    assert.match(catalog, new RegExp(bank[0].line1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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