import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyMiddleEarthDraft,
  emptyShareCopy,
  isEmptyMiddleEarthDraft,
  MIDDLE_EARTH_DRAFT_KEY,
  restoreMiddleEarthDraft,
  writeMiddleEarthDraft,
} from '../src/utils/middleEarthDraft.ts';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
    removeItem: (key: string) => { map.delete(key); },
  };
}

const translation = {
  translatedMoment: 'A small task becomes a quest.',
  scene: 'Sam takes the burden.',
  character: 'Samwise',
  memeFlavor: 'Samwise Loyalty',
  comicMechanism: 'Relationship-specific contradiction',
  tone: 'Deadpan',
  cardText: { format: 'Reaction Card', line1: 'ONE LITTLE TREAT', line2: 'ALSO ME: GUARD THE STASH', footer: '' },
  reactionImageBrief: {
    socialUseQuery: 'Sam carrying Frodo',
    characterEmotionQueries: ['Sam worried'],
    iconicSceneQueries: ['Sam Mount Doom'],
    broadFallbackQueries: ['Sam Frodo still'],
    performedEmotion: ['protective'],
    visualRole: 'Sam guards something small with total commitment.',
  },
};

function filledDraft() {
  return {
    ...emptyMiddleEarthDraft(),
    moment: 'Defending my little treat with my life',
    translation,
    referenceStillFamily: 'sam-carrying-frodo',
    angles: [
      { format: 'Internal Debate Card', line1: 'ME: ONE LITTLE TREAT ONLY', line2: 'ALSO ME: GUARD THE STASH WITH SWORD', footer: '' },
      { format: 'Reaction Card', line1: 'my snack drawer', line2: 'closed to the fellowship', footer: '' },
    ],
    selectedAngle: 1,
    text: 'my snack drawer',
    secondaryText: 'closed to the fellowship',
    cardFormat: 'Reaction Card',
    memeFrame: { format: 'tiktok' as const, framing: 'contain' as const, focusX: 20, focusY: 70, textPlacement: 'subtitle' as const },
    selected: { id: 'a', title: 'Sam and Frodo', thumbnail: 'https://images.example/sam.jpg', url: 'https://example.com/sam', query: 'Sam' },
    results: [{ id: 'a', title: 'Sam and Frodo', thumbnail: 'https://images.example/sam.jpg', url: 'https://example.com/sam', query: 'Sam' }],
  };
}

test('a written draft restores every field it saved', () => {
  const storage = memoryStorage();
  const draft = filledDraft();
  assert.equal(writeMiddleEarthDraft(storage, draft), 'saved');
  assert.ok(storage.map.has(MIDDLE_EARTH_DRAFT_KEY), 'the draft lives under its own localStorage key');
  const restored = restoreMiddleEarthDraft(storage);
  assert.equal(restored.moment, draft.moment);
  assert.equal(restored.selectedAngle, 1);
  assert.equal(restored.angles.length, 2);
  assert.equal(restored.text, 'my snack drawer');
  assert.deepEqual(restored.memeFrame, draft.memeFrame);
  assert.equal(restored.selected?.thumbnail, 'https://images.example/sam.jpg');
  assert.equal(restored.referenceStillFamily, 'sam-carrying-frodo');
  assert.equal((restored.translation as { scene: string }).scene, 'Sam takes the burden.');
});

test('an empty draft removes the key instead of storing blanks', () => {
  const storage = memoryStorage({ [MIDDLE_EARTH_DRAFT_KEY]: JSON.stringify(filledDraft()) });
  assert.ok(isEmptyMiddleEarthDraft(emptyMiddleEarthDraft()));
  assert.equal(writeMiddleEarthDraft(storage, emptyMiddleEarthDraft()), 'removed');
  assert.equal(storage.map.has(MIDDLE_EARTH_DRAFT_KEY), false);
});

test('corrupt, foreign or oversized storage restores an empty draft', () => {
  for (const raw of ['not json', '{"version":3,"moment":"x"}', 'null', 'x'.repeat(1_000_001)]) {
    assert.deepEqual(restoreMiddleEarthDraft(memoryStorage({ [MIDDLE_EARTH_DRAFT_KEY]: raw })), emptyMiddleEarthDraft());
  }
});

test('restore drops invalid pieces without losing the rest', () => {
  const storage = memoryStorage({
    [MIDDLE_EARTH_DRAFT_KEY]: JSON.stringify({
      ...filledDraft(),
      character: 'Sauron',
      selectedAngle: 9,
      angles: [{ format: 'Poster Card', line1: 'bad', line2: 'format', footer: '' }, filledDraft().angles[0]],
      translation: { translatedMoment: 'missing everything else' },
      selected: { id: 'up', title: 'upload', thumbnail: 'data:image/png;base64,AAAA', url: 'data:image/png;base64,AAAA', query: '' },
      memeFrame: { format: 'square', framing: 'stretch', focusX: 400, focusY: -5, textPlacement: 'diagonal' },
    }),
  });
  const restored = restoreMiddleEarthDraft(storage);
  assert.equal(restored.moment, 'Defending my little treat with my life');
  assert.equal(restored.character, 'Auto / surprise me');
  assert.equal(restored.angles.length, 1);
  assert.equal(restored.selectedAngle, 0);
  assert.equal(restored.translation, null);
  assert.equal(restored.selected, null, 'inline uploads never come back from the reaction draft');
  assert.deepEqual(restored.memeFrame, { format: 'instagram', framing: 'cover', focusX: 100, focusY: 0, textPlacement: 'top-bottom' });
});

test('a failed write removes the older copy rather than leaving it stale', () => {
  const storage = memoryStorage({ [MIDDLE_EARTH_DRAFT_KEY]: 'older' });
  const failing = { ...storage, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(writeMiddleEarthDraft(failing, filledDraft()), 'failed');
  assert.equal(storage.map.has(MIDDLE_EARTH_DRAFT_KEY), false);
});

test('every steering option the workspace offers survives a restore', async () => {
  const { characterFilters, memeTones, memeCardFormats } = await import('../src/data/middleEarthCreativeGrammar.ts');
  for (const character of characterFilters) {
    for (const tone of memeTones) {
      const storage = memoryStorage();
      writeMiddleEarthDraft(storage, { ...filledDraft(), character, tone });
      const restored = restoreMiddleEarthDraft(storage);
      assert.equal(restored.character, character);
      assert.equal(restored.tone, tone);
    }
  }
  for (const format of memeCardFormats) {
    const storage = memoryStorage();
    writeMiddleEarthDraft(storage, { ...filledDraft(), cardFormat: format, angles: [{ format, line1: 'a', line2: 'b', footer: '' }] });
    const restored = restoreMiddleEarthDraft(storage);
    assert.equal(restored.cardFormat, format);
    assert.equal(restored.angles[0].format, format);
  }
});

test('a draft holding only angles or Rednote copy still counts as a draft', () => {
  const anglesOnly = { ...emptyMiddleEarthDraft(), angles: [{ format: 'Reaction Card', line1: 'a', line2: 'b', footer: '' }] };
  const copyOnly = {
    ...emptyMiddleEarthDraft(),
    shareCopy: { ...emptyShareCopy(), tiktok: { copy: { fields: { hook: 'h', caption: 'c' }, tags: [] }, fingerprint: '' } },
  };
  assert.equal(isEmptyMiddleEarthDraft(anglesOnly), false);
  assert.equal(isEmptyMiddleEarthDraft(copyOnly), false);
});

test('a v1 draft migrates its Rednote copy into the Rednote slot', () => {
  const v1 = {
    version: 1, moment: 'Old draft', text: 'setup', secondaryText: 'punch',
    rednoteTitle: 'Old title', rednoteCaption: 'Old caption', rednoteTags: ['#lotr', '#sam', '#snacks'], rednoteGroundingFingerprint: 'fp-1',
  };
  const restored = restoreMiddleEarthDraft(memoryStorage({ [MIDDLE_EARTH_DRAFT_KEY]: JSON.stringify(v1) }));
  assert.equal(restored.version, 2);
  assert.equal(restored.moment, 'Old draft');
  assert.equal(restored.sharePlatform, 'rednote');
  assert.deepEqual(restored.shareCopy.rednote, { copy: { fields: { title: 'Old title', caption: 'Old caption' }, tags: ['#lotr', '#sam', '#snacks'] }, fingerprint: 'fp-1' });
  assert.equal(restored.shareCopy.tiktok.copy, null);
  const blank = restoreMiddleEarthDraft(memoryStorage({ [MIDDLE_EARTH_DRAFT_KEY]: JSON.stringify({ ...v1, rednoteTitle: '', rednoteCaption: '', rednoteTags: [] }) }));
  assert.equal(blank.shareCopy.rednote.copy, null, 'an empty v1 Rednote copy follows the template');
});

test('v2 share copy round-trips per platform and drops unknown fields', () => {
  const storage = memoryStorage();
  const shareCopy = {
    ...emptyShareCopy(),
    tiktok: { copy: { fields: { hook: 'Hook', caption: 'Joke' }, tags: ['#lotr'] }, fingerprint: 'fp' },
    instagram: { copy: { fields: { caption: 'Caption', title: 'not an Instagram field' }, tags: [] }, fingerprint: '' },
  };
  writeMiddleEarthDraft(storage, { ...filledDraft(), sharePlatform: 'instagram', shareCopy });
  const restored = restoreMiddleEarthDraft(storage);
  assert.equal(restored.sharePlatform, 'instagram');
  assert.deepEqual(restored.shareCopy.tiktok, shareCopy.tiktok);
  assert.deepEqual(restored.shareCopy.instagram.copy?.fields, { caption: 'Caption' });
  assert.equal(restored.shareCopy.rednote.copy, null);
  const foreign = restoreMiddleEarthDraft(memoryStorage({ [MIDDLE_EARTH_DRAFT_KEY]: JSON.stringify({ ...filledDraft(), sharePlatform: 'weibo' }) }));
  assert.equal(foreign.sharePlatform, 'rednote', 'platforms outside the share kit fall back to Rednote');
});
