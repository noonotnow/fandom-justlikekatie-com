import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_KEY, emptyDraft, frameFor, renderCdramaCard, restoreDraft, suggestedCopy,
  type ForgeDraft,
} from '../src/utils/cdramaForge';
import { resolveFandomProductRoute } from '../src/utils/fandomRoutes';

const joke = { setup: 'One episode before bed', punchline: 'The sun: good morning', visualDirection: 'Stunned viewer', searchQuery: 'C-drama stunned still' };
const draft: ForgeDraft = {
  ...emptyDraft(), moment: 'One episode', ideas: [joke], selected: 0,
  still: { kind: 'upload', title: 'Local photo', thumbnail: 'data:image/jpeg;base64,abc', link: '', source: 'Your device', query: '' },
  copy: { hook: 'custom hook', tiktok: 'my TikTok edit', instagram: 'my Instagram edit', hashtags: '#CDrama' },
};
test('C-drama routing is distinct from the legacy MemeForge and Vibe Atlas', () => {
  assert.equal(resolveFandomProductRoute('/memeforge/c-drama'), 'c-drama-forge');
  assert.equal(resolveFandomProductRoute('/memeforge/middle-earth'), 'middle-earth');
  assert.equal(resolveFandomProductRoute('/vibe-atlas'), 'vibe-atlas');
});
test('local draft restores valid edits without touching the other Collections', () => {
  assert.deepEqual(restoreDraft({ getItem: key => key === DRAFT_KEY ? JSON.stringify(draft) : null }), draft);
  assert.deepEqual(restoreDraft({ getItem: () => '{broken' }), emptyDraft());
  assert.deepEqual(restoreDraft({ getItem: () => JSON.stringify({ ...draft, still: { ...draft.still, thumbnail: 'x'.repeat(2_000_001) } }) }), emptyDraft());
  assert.equal(suggestedCopy(joke).hook, 'One episode before bed');
  assert.equal(suggestedCopy(joke).tiktok, 'The sun: good morning');
  assert.doesNotMatch(JSON.stringify(suggestedCopy(joke)), /rednote|lotr|shop|buy/i);
});
test('both card frames render the selected joke in distinct text bands with a clean image', () => {
  for (const format of ['instagram', 'tiktok'] as const) {
    const log: Array<[string, ...unknown[]]> = [];
    const ctx = {
      canvas: { width: 0, height: 0 }, fillStyle: '', font: '', textAlign: '',
      fillRect: (...args: unknown[]) => log.push(['fillRect', ...args]),
      fillText: (...args: unknown[]) => log.push(['fillText', ...args]),
      drawImage: (...args: unknown[]) => log.push(['drawImage', ...args]),
      measureText: (value: string) => ({ width: value.length * 20 }),
      beginPath() {}, rect() {}, clip() {}, save() {}, restore() {},
    } as unknown as CanvasRenderingContext2D;
    renderCdramaCard(ctx, { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement, joke, format);
    assert.equal(ctx.canvas.width, 1080);
    assert.equal(ctx.canvas.height, format === 'instagram' ? 1350 : 1920);
    assert.equal(log.filter(entry => entry[0] === 'drawImage').length, 1);
    const top = log.find(entry => entry[0] === 'fillText' && entry[1] === joke.setup);
    const bottom = log.find(entry => entry[0] === 'fillText' && entry[1] === joke.punchline);
    assert.ok(top && bottom);
    assert.ok(Number(top[3]) > frameFor(format).topBand[0] && Number(top[3]) < frameFor(format).imageTop);
    assert.ok(Number(bottom[3]) > frameFor(format).imageBottom && Number(bottom[3]) < frameFor(format).bottomBand[1]);
  }
});
