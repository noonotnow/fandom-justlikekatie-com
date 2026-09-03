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
const workstationClientSource = await readFile(
  new URL('../src/utils/workstationHandoffClient.ts', import.meta.url),
  'utf8',
);
const releaseDeskSource = await readFile(
  new URL('../src/components/FandomAdmin/ReleaseDesk.tsx', import.meta.url),
  'utf8',
);

test('only the private Operator Console exposes the Workstation handoff', () => {
  assert.doesNotMatch(appSource, /CreatorPostAction|makeCreatorPostFromGrid|collectionGridFromStar/);
  assert.doesNotMatch(collectionSource, /CreatorPostAction|onCreateFromGrid|Workstation/);
  assert.doesNotMatch(builderSource, /CreatorPostAction|onCreateFromGrid|Workstation/);
  assert.match(releaseDeskSource, /Workstation handoff/);
  assert.match(releaseDeskSource, /dbGetVisibleGrids\(user\.accountId\)/);
  assert.match(releaseDeskSource, /entryPoint="operator_console"/);
  assert.match(releaseDeskSource, /makeCreatorPostFromGrid\(selectedGrid, platforms, onProgress\)/);
  assert.match(actionSource, /Rednote/);
  assert.match(actionSource, /Weibo/);
  assert.match(actionSource, /Instagram/);
  assert.match(actionSource, /selected\.length === 0/);
  assert.doesNotMatch(appSource, /IdeaPacket|makeCreatorPostFromPacket/);
});

test('every Workstation grid caller uses the centralized save, session, and single-grid sync path', () => {
  const handoff = creatorDraftSource.match(
    /export async function makeCreatorPostFromGrid[\s\S]*?\n}\n\nexport function normalizeCreatorPlatforms/,
  )?.[0] || '';
  assert.match(handoff, /await dbSaveGrid\(grid\)/);
  assert.match(handoff, /const user = await getPublicSession\(\)/);
  const mediaStart = handoff.indexOf('await persistGridImagesToMedia(grid)');
  const syncStart = handoff.indexOf('await syncPublicGrid(user, persistence.record.id)');
  const workstationStart = handoff.indexOf('await completeWorkstationHandoff(source)');
  assert.ok(mediaStart > -1 && syncStart > mediaStart && workstationStart > syncStart);
  assert.match(handoff, /throw new CreatorMediaReadinessError\(persistence\.failures\)/);
  assert.match(releaseDeskSource, /makeCreatorPostFromGrid\(selectedGrid, platforms, onProgress\)/);
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
  const openStart = actionSource.indexOf('window.location.assign(result.receipt.deepLink);', createStart);
  const failureStart = actionSource.indexOf('catch (caught)', createStart);
  assert.notEqual(createStart, -1);
  assert.notEqual(openStart, -1);
  assert.notEqual(failureStart, -1);
  assert.ok(openStart > createStart, 'navigation must follow the handoff response');
  assert.ok(openStart < failureStart, 'only the successful handoff branch may open Workstation');
  assert.match(actionSource, /Open Your Collection/);
  assert.match(actionSource, /https:\/\/workstation\.justlikekatie\.com/);
  assert.match(actionSource, /Preparing durable MEDIA assets/);
  assert.match(actionSource, /Position \{failure\.gridPosition \+ 1\}/);
  assert.match(actionSource, /Retry preparation/);
  assert.match(actionSource, /operator-diverged/);
  assert.match(workstationClientSource, /WORKSTATION_HANDOFF_URL = '\/api\/workstation-handoff'/);
  assert.doesNotMatch(workstationClientSource, /create\.justlikekatie\.com/);
});