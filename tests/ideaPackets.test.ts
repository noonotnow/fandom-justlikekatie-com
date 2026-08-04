import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaFromResult } from '../src/utils/ideaPackets.ts';

test('maps a lightbox result into stable packet media provenance', () => {
  const first = mediaFromResult({
    id: 'https://images.example/original.jpg',
    title: 'Editorial still',
    thumbnail: '/.netlify/functions/image-proxy?url=original',
    url: 'https://publisher.example/story',
    publisher: 'Star · Publisher',
    batchKey: 'query-key',
    gridPosition: 4,
  });
  const second = mediaFromResult({
    id: 'https://images.example/original.jpg',
    title: 'Editorial still',
    thumbnail: '/.netlify/functions/image-proxy?url=original',
    url: 'https://publisher.example/story',
  });

  assert.equal(first.id, second.id);
  assert.equal(first.resultId, 'https://images.example/original.jpg');
  assert.equal(first.sourceUrl, 'https://publisher.example/story');
  assert.equal(first.gridPosition, 4);
});
