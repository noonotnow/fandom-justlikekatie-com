import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyMiddleEarthDraft,
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
  for (const raw of ['not json', '{"version":2,"moment":"x"}', 'null', 'x'.repeat(1_000_001)]) {
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
