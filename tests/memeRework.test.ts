import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemeReworkMetadata,
  versionMemeDerivativeDataUrl,
} from '../src/utils/memeRework.ts';

test('builds a reversible rework recipe without copying an uploaded data URL into provenance', () => {
  const metadata = createMemeReworkMetadata({
    id: 'upload-1',
    title: 'My untouched source',
    url: 'data:image/png;base64,private-local-data',
    publisher: 'Uploaded by creator',
    provider: 'local-upload',
  }, {
    mode: 'cover-and-replace',
    line1: 'Old caption, but make it deployment day',
    line2: 'The rollback button is watching',
    footer: 'Friday fellowship',
    layout: 'Classic top / bottom',
    tone: 'Dry',
  }, new Date('2026-08-28T12:00:00.000Z'));

  assert.equal(metadata.kind, 'meme-rework');
  assert.equal(metadata.original.resultId, 'upload-1');
  assert.equal(metadata.original.sourceType, 'upload');
  assert.equal(metadata.original.sourceUrl, undefined);
  assert.equal(metadata.edit.mode, 'cover-and-replace');
  assert.equal(metadata.edit.line1, 'Old caption, but make it deployment day');
  assert.equal(metadata.createdAt, '2026-08-28T12:00:00.000Z');
});

test('requires at least one visible text edit before creating a rework derivative', () => {
  assert.throws(() => createMemeReworkMetadata({
    id: 'archive-1',
    title: 'Archive meme',
    url: 'https://publisher.example/meme',
    provider: 'brave',
  }, {
    mode: 'add-overlay',
    line1: ' ',
    line2: '',
    layout: 'Classic top / bottom',
    tone: 'Dry',
  }), /at least one replacement or overlay line/);
});

test('gives identical rendered reworks distinct valid image identities', async () => {
  const rendered = 'data:image/png;base64,aGVsbG8=';
  const first = versionMemeDerivativeDataUrl(rendered, 'derivative-one');
  const second = versionMemeDerivativeDataUrl(rendered, 'derivative-two');

  assert.notEqual(first, second);
  assert.equal((await fetch(first)).headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await (await fetch(first)).arrayBuffer()).toString(), 'hello');
});