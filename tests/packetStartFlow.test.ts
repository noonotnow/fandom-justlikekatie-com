import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const collectionSource = await readFile(
  new URL('../src/components/Collection/Collection.tsx', import.meta.url),
  'utf8',
);
const adminSource = await readFile(
  new URL('../src/components/FandomAdmin/FandomAdmin.tsx', import.meta.url),
  'utf8',
);

test('saved-grid packet creation opens the exact created packet workspace', () => {
  assert.match(collectionSource, /const packet = await onCreateFromGrid\(grid\)/);
  assert.match(collectionSource, /onPacketCreated\?\.\(packet\)/);
  assert.match(appSource, /onPacketCreated={openCreatedPacket}/);
  assert.match(appSource, /setOpenPacketId\(packet\.id\)/);
  assert.match(appSource, /window\.history\.pushState\(\{\}, '', vibeAtlasPacketPath\(packet\.id\)\)/);
  assert.match(adminSource, /useState<string \| null>\(initialPacketId \?\? null\)/);
  assert.match(adminSource, /setSelectedId\(initialPacketId\)/);
});

test('packet creation cannot navigate before the durable create resolves', () => {
  const createStart = collectionSource.indexOf('const packet = await onCreateFromGrid(grid);');
  const openStart = collectionSource.indexOf('onPacketCreated?.(packet);', createStart);
  const failureStart = collectionSource.indexOf('catch (error)', createStart);
  assert.notEqual(createStart, -1);
  assert.notEqual(openStart, -1);
  assert.notEqual(failureStart, -1);
  assert.ok(openStart > createStart, 'navigation must follow the create response');
  assert.ok(openStart < failureStart, 'only the successful create branch may open a packet');
  assert.match(collectionSource, /catch \(error\) \{\s*setAccountNotice\(messageFrom\(error, 'The Idea Packet could not be started\.'\)\)/);
});