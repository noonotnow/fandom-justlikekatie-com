import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMiddleEarthMeme } from '../src/utils/middleEarthMemeCanvas.ts';

function drawing() {
  const text: string[] = [];
  const images: unknown[][] = [];
  const rects: unknown[][] = [];
  const context = {
    canvas: { width: 0, height: 0 }, font: '',
    measureText(copy: string) {
      return { width: copy.length * (Number(this.font.match(/([\d.]+)px/)?.[1]) || 50) * .6 };
    },
    fillRect(...args: unknown[]) { rects.push(args); },
    drawImage(...args: unknown[]) { images.push(args); },
    fillText(copy: string) { text.push(copy); },
    strokeText() {},
  } as unknown as CanvasRenderingContext2D;
  return { context, text, images, rects };
}

test('reworks keep every source pixel and export only the joke, not a decorated card', () => {
  for (const mode of ['cover-and-replace', 'add-overlay']) {
    const { context, text, images, rects } = drawing();
    const image = { naturalWidth: 1600, naturalHeight: 900 } as HTMLImageElement;
    renderMiddleEarthMeme(context, image, {
      text: 'My last brain cell', secondaryText: 'Taking the hobbits to Isengard',
      creationPath: 'meme-rework', layout: 'Classic top / bottom', memeRework: { edit: { mode } },
    });
    assert.deepEqual([context.canvas.width, context.canvas.height], [1080, 608]);
    assert.deepEqual(images, [[image, 0, 0, 1080, 608]]);
    assert.equal(text.join(' '), 'MY LAST BRAIN CELL TAKING THE HOBBITS TO ISENGARD');
    assert.doesNotMatch(text.join(' '), /MEMEFORGE|DERIVATIVE|SOURCE|fandom\./);
    assert.equal(rects.length, mode === 'cover-and-replace' ? 3 : 1);
  }
});

test('long rework captions wrap without silently dropping words', () => {
  const { context, text } = drawing();
  const copy = 'A wizard is never late '.repeat(12).trim();
  renderMiddleEarthMeme(context, null, { text: copy, layout: 'Classic top / bottom' });
  assert.equal(text.join(' '), copy.toUpperCase());
});
