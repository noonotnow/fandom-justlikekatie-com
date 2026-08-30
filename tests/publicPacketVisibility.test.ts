import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const lightboxSource = await readFile(new URL('../src/components/Lightbox/Lightbox.tsx', import.meta.url), 'utf8');
const middleEarthSource = await readFile(
  new URL('../src/components/MiddleEarthWorkspace/MiddleEarthWorkspace.tsx', import.meta.url),
  'utf8',
);

test('public lightbox packet controls require the private admin capability', () => {
  assert.match(appSource, /canManagePackets=\{isAdmin\}/);
  assert.match(lightboxSource, /\{canManagePackets && onAddToPacket && packets\.length > 0 && \(/);
});

test('public MemeForge does not expose the packet staging link', () => {
  assert.match(middleEarthSource, /\{isAdmin && packetSaved && <a[^>]+>Open packet staging<\/a>\}/);
});