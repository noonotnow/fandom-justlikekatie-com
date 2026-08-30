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

test('saved-grid post creation opens the exact Creator OS draft without packet navigation', () => {
  assert.match(collectionSource, /const result = await onCreateFromGrid\(grid\)/);
  assert.match(collectionSource, /window\.location\.assign\(result\.receipt\.createUrl\)/);
  assert.doesNotMatch(appSource, /onPacketCreated={openCreatedPacket}/);
  assert.match(appSource, /makeCreatorPostFromGrid\(grid\)/);
  assert.match(adminSource, /useState<string \| null>\(initialPacketId \?\? null\)/);
  assert.match(adminSource, /setSelectedId\(initialPacketId\)/);
});

test('Creator OS navigation cannot occur before the durable handoff resolves', () => {
  const createStart = collectionSource.indexOf('const result = await onCreateFromGrid(grid);');
  const openStart = collectionSource.indexOf('window.location.assign(result.receipt.createUrl);', createStart);
  const failureStart = collectionSource.indexOf('catch (error)', createStart);
  assert.notEqual(createStart, -1);
  assert.notEqual(openStart, -1);
  assert.notEqual(failureStart, -1);
  assert.ok(openStart > createStart, 'navigation must follow the handoff response');
  assert.ok(openStart < failureStart, 'only the successful handoff branch may open Creator OS');
  assert.match(collectionSource, /catch \(error\) \{\s*setAccountNotice\(messageFrom\(error, 'The Creator OS draft could not be created\.'\)\)/);
});