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
const builderSource = await readFile(
  new URL('../src/components/GridBuilder/GridBuilder.tsx', import.meta.url),
  'utf8',
);
const actionSource = await readFile(
  new URL('../src/components/CreatorPostAction/CreatorPostAction.tsx', import.meta.url),
  'utf8',
);

test('Daily, saved grids, and Builder share one platform chooser and direct source path', () => {
  assert.match(appSource, /collectionGridFromStar\(rawData\)/);
  assert.match(appSource, /CreatorPostAction/);
  assert.match(collectionSource, /CreatorPostAction/);
  assert.match(builderSource, /CreatorPostAction/);
  assert.match(appSource, /makeCreatorPostFromGrid\(collectionGridFromStar\(rawData\), platforms\)/);
  assert.doesNotMatch(appSource, /dbSaveGrid|syncPublicCollection|getPublicSession/);
  assert.match(collectionSource, /onCreateFromGrid\(grid, platforms\)/);
  assert.match(builderSource, /onCreateFromGrid\(grid, platforms\)/);
  assert.match(actionSource, /Rednote/);
  assert.match(actionSource, /Weibo/);
  assert.match(actionSource, /Instagram/);
  assert.match(actionSource, /selected\.length === 0/);
  assert.doesNotMatch(appSource, /IdeaPacket|makeCreatorPostFromPacket/);
});

test('every Workstation grid caller uses the centralized save, session, and single-grid sync path', () => {
  const handoff = creatorDraftSource.match(
    /export async function makeCreatorPostFromGrid[\s\S]*?\n}\n\nfunction stableHash/,
  )?.[0] || '';
  assert.match(handoff, /await dbSaveGrid\(grid\)/);
  assert.match(handoff, /const user = await getPublicSession\(\)/);
  assert.match(handoff, /await syncPublicGrid\(user, grid\.id\)/);
  assert.match(handoff, /await completeCreatorDraftHandoff\(source\)/);
  assert.match(collectionSource, /onCreateFromGrid\(grid, platforms\)/);
  assert.match(builderSource, /onCreateFromGrid\(grid, platforms\)/);
  assert.match(publicAccountSource, /export async function syncPublicGrid/);
  const targetedSync = publicAccountSource.match(
    /export async function syncPublicGrid[\s\S]*?\n}\n(?=\nasync function persistEmbeddedCollectionImages)/,
  )?.[0] || '';
  assert.match(targetedSync, /dbBuildGridSyncRequest\(user\.accountId, gridId\)/);
  assert.match(targetedSync, /dbApplySyncResponse\(user\.accountId, body, payload\.operations\)/);
  assert.doesNotMatch(targetedSync, /syncPublicCollection|persistEmbeddedCollectionImages/);
});

test('Workstation navigation happens only after a validated result and failures expose recovery links', () => {
  const createStart = actionSource.indexOf('const result = await onSubmit');
  const openStart = actionSource.indexOf('window.location.assign(result.receipt.createUrl);', createStart);
  const failureStart = actionSource.indexOf('catch (caught)', createStart);
  assert.notEqual(createStart, -1);
  assert.notEqual(openStart, -1);
  assert.notEqual(failureStart, -1);
  assert.ok(openStart > createStart, 'navigation must follow the handoff response');
  assert.ok(openStart < failureStart, 'only the successful handoff branch may open Workstation');
  assert.match(actionSource, /Open Studio Operations/);
  assert.match(actionSource, /https:\/\/workstation\.justlikekatie\.com/);
});