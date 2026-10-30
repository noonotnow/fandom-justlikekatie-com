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
test('both formats render full-bleed memes with outlined text directly over the still', () => {
  for (const format of ['instagram', 'tiktok'] as const) {
    const log: Array<[string, ...unknown[]]> = [];
    const ctx = {
      canvas: { width: 0, height: 0 }, fillStyle: '', strokeStyle: '', lineWidth: 0,
      lineJoin: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, font: '', textAlign: '',
      fillRect: (...args: unknown[]) => log.push(['fillRect', ...args]),
      fillText: (...args: unknown[]) => log.push(['fillText', ...args]),
      strokeText: (...args: unknown[]) => log.push(['strokeText', ...args]),
      drawImage: (...args: unknown[]) => log.push(['drawImage', ...args]),
      measureText: (value: string) => ({ width: value.length * 20 }),
      beginPath() {}, rect: (...args: unknown[]) => log.push(['clipRect', ...args]),
      clip() {}, save() {}, restore() {},
    } as unknown as CanvasRenderingContext2D;
    renderCdramaCard(ctx, { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement, joke, format);
    const frame = frameFor(format);
    assert.equal(ctx.canvas.width, 1080);
    assert.equal(ctx.canvas.height, format === 'instagram' ? 1350 : 1920);
    assert.equal(log.filter(entry => entry[0] === 'drawImage').length, 1);
    assert.equal(log.filter(entry => entry[0] === 'fillText').length, 2);
    assert.equal(log.filter(entry => entry[0] === 'strokeText').length, 2);
    const imageRect = log.find(entry => entry[0] === 'clipRect');
    assert.deepEqual(imageRect?.slice(1), [0, 0, frame.width, frame.height]);
    const top = log.find(entry => entry[0] === 'fillText' && entry[1] === joke.setup);
    const bottom = log.find(entry => entry[0] === 'fillText' && entry[1] === joke.punchline);
    assert.ok(top && bottom);
    assert.ok(Number(top[3]) < frame.height * .3);
    assert.ok(Number(bottom[3]) > frame.height * .7);
    assert.equal(ctx.fillStyle, '#fffdf8');
    assert.equal(ctx.strokeStyle, 'rgba(25, 19, 24, .88)');
  }
});

test('cover crop responds independently to horizontal and vertical focus; one-line captions render', () => {
  const log: Array<[string, ...unknown[]]> = [];
  const ctx = {
    canvas: { width: 0, height: 0 }, fillStyle: '', strokeStyle: '', lineWidth: 0,
    lineJoin: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, font: '', textAlign: '',
    fillRect: (...args: unknown[]) => log.push(['fillRect', ...args]),
    fillText: (...args: unknown[]) => log.push(['fillText', ...args]),
    strokeText: (...args: unknown[]) => log.push(['strokeText', ...args]),
    drawImage: (...args: unknown[]) => log.push(['drawImage', ...args]),
    measureText: (value: string) => ({ width: value.length * 20 }),
    beginPath() {}, rect: (...args: unknown[]) => log.push(['clipRect', ...args]),
    clip() {}, save() {}, restore() {},
  } as unknown as CanvasRenderingContext2D;
  const oneLine = { ...joke, setup: 'the fire starter when they discover there’s a fire', punchline: '' };
  renderCdramaCard(ctx, { naturalWidth: 600, naturalHeight: 1200 } as HTMLImageElement, oneLine, 'instagram', {
    framing: 'cover', focusX: 0, focusY: 100, textPlacement: 'subtitle',
  });
  const draw = log.find(entry => entry[0] === 'drawImage');
  assert.ok(draw);
  assert.equal(Number(draw[2]), 0, 'left crop focus anchors the image at its left edge');
  assert.ok(Number(draw[3]) < 0, 'bottom focus shifts a tall image upward');
  const renderedCaption = log.filter(entry => entry[0] === 'fillText').map(entry => String(entry[1])).join(' ');
  assert.equal(renderedCaption, oneLine.setup);
  assert.equal(emptyDraft().framing, 'cover');
  assert.equal(emptyDraft().focusY, 0, 'new portrait crops preserve the top of the image rather than centering away the head');
  const migrated = restoreDraft({ getItem: () => JSON.stringify({ ...draft, framing: 'contain', focusY: 150 }) });
  assert.equal(migrated.framing, 'contain');
  assert.equal(migrated.focusX, 50);
  assert.equal(migrated.focusY, 100);
  assert.equal(migrated.textPlacement, 'top-bottom');
  assert.deepEqual(restoreDraft({ getItem: () => JSON.stringify({ ...draft, ideas: [{ ...joke, setup: '', punchline: '' }] }) }), emptyDraft());
});
