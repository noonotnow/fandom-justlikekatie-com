import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mediaFromResult,
  packetFromMiddleEarthDraft,
} from '../src/utils/ideaPackets.ts';

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

test('builds a Middle-earth packet with structured text and persistent source provenance', () => {
  const packet = packetFromMiddleEarthDraft({
    kind: 'meme',
    title: 'Second breakfast operations',
    text: 'The deployment was small, but there was another deployment.',
    secondaryText: '— Hobbit release management',
    tone: 'Deadpan',
    layout: 'Editorial caption',
    createdAt: '2026-08-19T14:00:00.000Z',
    asset: {
      id: 'result-1',
      title: 'A Shire landscape',
      thumbnail: '/.netlify/functions/image-proxy?url=https%3A%2F%2Fimages.example%2Fshire.jpg',
      url: 'https://publisher.example/shire',
      publisher: 'Example Archive',
      query: 'cozy Shire',
      provider: 'brave',
    },
  });

  const output = packet.outputs[0];
  assert.equal(packet.workspace, 'middle-earth');
  assert.equal(packet.content, 'meme');
  assert.equal(packet.provenance.sourceRoute, '/memeforge/middle-earth');
  assert.equal(output.kind, 'meme');
  assert.equal(output.sourceId, packet.sourceCards[0].id);
  assert.equal(packet.sourceCards[0].imageUrl.startsWith('/.netlify/functions/image-proxy?url='), true);
  assert.match(packet.sourceCards[0].provenance, /"rightsStatus":"unknown"/);
  assert.equal(packet.middleEarthContent?.[output.id].text, 'The deployment was small, but there was another deployment.');
  assert.ok(output.textFingerprint);
});

test('builds typography-only spellbook packets without inventing an external image', () => {
  const packet = packetFromMiddleEarthDraft({
    kind: 'spellbook',
    title: 'Road notes',
    text: 'Not all those who wander are lost.',
    tone: 'Field note',
    layout: 'Type specimen',
    createdAt: '2026-08-19T14:00:00.000Z',
  });

  assert.deepEqual(packet.anchor.imageUrls, []);
  assert.equal(packet.sourceCards[0].imageUrl, '');
  assert.equal(packet.sourceCards[0].sourceUrl, 'https://fandom.justlikekatie.com/memeforge/middle-earth');
  assert.equal(packet.outputs[0].kind, 'spellbook');
});
