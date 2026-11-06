import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  SHARE_COPY_CONTRACTS, SHARE_KIT_PLATFORMS, formatSharePost, normalizeShareTag, parseShareTags,
  shareCopyProblem, templateShareCopy,
} from '../shared/meme-share-copy.js';
import { SOCIAL_PLATFORM_IDS, platformAllowlist } from '../shared/social-platforms.js';
import { CREATOR_PLATFORMS } from '../src/utils/creatorDraft.ts';
import { MEME_LENSES } from '../src/data/memeLenses.ts';

test('the vocabulary names platforms; each surface keeps its own accepted set', async () => {
  assert.deepEqual([...SOCIAL_PLATFORM_IDS], ['rednote', 'weibo', 'instagram', 'tiktok']);
  assert.deepEqual([...CREATOR_PLATFORMS], ['rednote', 'weibo', 'instagram'], 'CREATE grid handoffs do not gain TikTok');
  assert.deepEqual([...SHARE_KIT_PLATFORMS], ['rednote', 'tiktok', 'instagram']);
  const { CREATOR_PLATFORMS: serverGrid } = await import('../netlify/functions/lib/workstation-grid-handoff.js');
  const { MEME_SEND_PLATFORMS } = await import('../netlify/functions/lib/workstation-meme-handoff.js');
  assert.deepEqual([...serverGrid], ['rednote', 'weibo', 'instagram']);
  assert.deepEqual([...MEME_SEND_PLATFORMS], ['tiktok', 'instagram']);
  const daily = await readFile(new URL('../netlify/functions/lib/daily-drop-operations.js', import.meta.url), 'utf8');
  assert.match(daily, /const CHANNELS = platformAllowlist\(\["rednote", "weibo", "instagram"\]\);/, 'daily-drop channels are unchanged');
  assert.throws(() => platformAllowlist(['rednote', 'myspace' as never]), /Unknown social platform "myspace"/);
  assert.throws(() => platformAllowlist(['rednote', 'rednote']), /cannot repeat/);
});

test('the Rednote contract keeps the limits the Rednote writer has always used', () => {
  const rednote = SHARE_COPY_CONTRACTS.rednote;
  assert.deepEqual(rednote.fields.map(field => [field.key, field.maxLength, field.required]), [['title', 120, true], ['caption', 2200, true]]);
  assert.deepEqual(rednote.tags, { min: 3, max: 8 });
  assert.deepEqual([...rednote.guidance], []);
  assert.deepEqual(SHARE_COPY_CONTRACTS.tiktok.fields.map(field => field.key), ['hook', 'caption']);
  assert.deepEqual(SHARE_COPY_CONTRACTS.instagram.fields.map(field => field.key), ['caption']);
});

test('every lens supplies enough valid topic tags for every platform template', () => {
  for (const lens of Object.values(MEME_LENSES)) {
    assert.ok(lens.topicTags.length >= SHARE_COPY_CONTRACTS.rednote.tags.min, `${lens.id} meets Rednote's minimum`);
    for (const tag of lens.topicTags) assert.ok(normalizeShareTag(tag), `${tag} is a valid tag`);
    for (const platform of SHARE_KIT_PLATFORMS) {
      const copy = templateShareCopy(platform, { setup: 'ME: ONE LITTLE TREAT ONLY', punchline: 'ALSO ME: GUARD THE STASH' }, lens.topicTags);
      assert.equal(shareCopyProblem(platform, copy), null, `${lens.id} template is valid on ${platform}`);
    }
  }
});

test('templates follow each platform\'s fields', () => {
  const joke = { setup: 'Setup line', punchline: 'Punchline' };
  const tags = ['#a', '#b', '#c', '#d', '#e', '#f'];
  assert.deepEqual(templateShareCopy('rednote', joke, tags), { fields: { title: 'Setup line', caption: 'Setup line\nPunchline' }, tags });
  assert.deepEqual(templateShareCopy('tiktok', joke, tags), { fields: { hook: 'Setup line', caption: 'Punchline' }, tags: tags.slice(0, 5) });
  assert.deepEqual(templateShareCopy('instagram', joke, tags), { fields: { caption: 'Setup line\nPunchline' }, tags });
  assert.equal(templateShareCopy('rednote', { setup: '', punchline: 'Only punch' }, tags).fields.title, 'Only punch');
});

test('contract checks, tag parsing and post formatting', () => {
  assert.equal(shareCopyProblem('rednote', { fields: { title: 'T', caption: 'C' }, tags: ['#a', '#b'] }), 'Rednote posts need at least 3 hashtags.');
  assert.equal(shareCopyProblem('tiktok', { fields: { hook: '', caption: 'C' }, tags: [] }), 'TikTok hook is empty.');
  assert.equal(shareCopyProblem('instagram', { fields: { caption: 'x'.repeat(2201) }, tags: [] }), 'Instagram caption is over 2200 characters.');
  assert.deepEqual(parseShareTags('#LOTR, MiddleEarth  #Sam'), ['#LOTR', '#MiddleEarth', '#Sam']);
  assert.equal(normalizeShareTag(' Middle Earth '), '#middleearth');
  assert.equal(normalizeShareTag('#'), null);
  assert.equal(formatSharePost('tiktok', { fields: { hook: 'Hook', caption: 'Joke' }, tags: ['#a', '#b'] }), 'Hook\n\nJoke\n\n#a #b');
  assert.equal(formatSharePost('instagram', { fields: { caption: 'Joke' }, tags: [] }), 'Joke');
});
