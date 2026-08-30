import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const collectionSource = await readFile(
  new URL('../src/components/Collection/Collection.tsx', import.meta.url),
  'utf8',
);
const creatorDraftSource = await readFile(new URL('../src/utils/creatorDraft.ts', import.meta.url), 'utf8');
const publicAccountSource = await readFile(new URL('../src/utils/publicAccount.ts', import.meta.url), 'utf8');

test('daily and saved-grid post creation use the durable direct Creator OS source path', () => {
  assert.match(appSource, /collectionGridFromStar\(rawData\)/);
  assert.match(appSource, /await makeCreatorPostFromGrid\(grid\)/);
  assert.doesNotMatch(appSource, /dbSaveGrid|syncPublicCollection|getPublicSession/);
  assert.match(collectionSource, /const result = await onCreateFromGrid\(grid\)/);
  assert.match(collectionSource, /window\.location\.assign\(result\.receipt\.createUrl\)/);
  assert.doesNotMatch(appSource, /IdeaPacket|makeCreatorPostFromPacket/);
});

test('every Creator OS grid caller uses the centralized save, session, and single-grid sync path', () => {
  const handoff = creatorDraftSource.match(
    /export async function makeCreatorPostFromGrid[\s\S]*?\n}\n\nfunction stableHash/,
  )?.[0] || '';
  assert.match(handoff, /await dbSaveGrid\(grid\)/);
  assert.match(handoff, /const user = await getPublicSession\(\)/);
  assert.match(handoff, /await syncPublicGrid\(user, grid\.id\)/);
  assert.match(handoff, /await completeCreatorDraftHandoff\(source\)/);
  assert.match(collectionSource, /onCreateFromGrid=\{makeCreatorPostFromGrid\}|onCreateFromGrid\(grid\)/);
  assert.match(publicAccountSource, /export async function syncPublicGrid/);
  const targetedSync = publicAccountSource.match(
    /export async function syncPublicGrid[\s\S]*?\n}\n(?=\nasync function persistEmbeddedCollectionImages)/,
  )?.[0] || '';
  assert.match(targetedSync, /dbBuildGridSyncRequest\(user\.accountId, gridId\)/);
  assert.match(targetedSync, /dbApplySyncResponse\(user\.accountId, body, payload\.operations\)/);
  assert.doesNotMatch(targetedSync, /syncPublicCollection|persistEmbeddedCollectionImages/);
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