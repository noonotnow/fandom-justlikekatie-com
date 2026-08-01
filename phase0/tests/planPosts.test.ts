import assert from 'node:assert/strict';
import test from 'node:test';
import {
  optimisticPost,
  replacePlanPost,
  updatePlanPost,
  type PlanPost,
} from '../src/utils/planPosts.ts';

const post: PlanPost = {
  id: 'post-id',
  version: '2026-08-01T10:00:00.000Z',
  headline: 'Tonight',
  series: 'A',
  platform: 'Rednote',
  status: 'Draft',
  scheduledDate: '',
  imageUrls: [],
  caption: '',
  needsMedia: null,
  needsCaption: null,
  packetReady: null,
  mediaAttached: false,
  captionWritten: false,
  mediaBlocked: true,
  captionBlocked: true,
  productionStage: 'Needs Media',
  nextAction: '',
  requirements: '',
  campaignNotes: '',
};

test('sends schedule edits with the current version for conflict detection', async () => {
  const updated = { ...post, scheduledDate: '2026-08-01T22:30:00.000Z' };
  const result = await updatePlanPost(post, { scheduledDate: updated.scheduledDate }, async (_url, init) => {
    assert.ok(init);
    assert.equal(init.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(init.body)), {
      id: post.id,
      expectedVersion: post.version,
      scheduledDate: updated.scheduledDate,
    });
    assert.equal((init.headers as Record<string, string>).Accept, 'application/json');
    return Response.json({ post: updated });
  });
  assert.equal(result.scheduledDate, updated.scheduledDate);
});

test('supports optimistic schedule, clear, and status updates with exact rollback snapshots', () => {
  const original = [post];
  const scheduled = optimisticPost(original, post.id, {
    scheduledDate: '2026-08-01T22:30:00.000Z',
  });
  assert.equal(scheduled[0].scheduledDate, '2026-08-01T22:30:00.000Z');
  assert.equal(optimisticPost(scheduled, post.id, { scheduledDate: null })[0].scheduledDate, '');
  assert.equal(optimisticPost(original, post.id, { status: 'Ready' })[0].status, 'Ready');
  assert.deepEqual(original, [post]);
});

test('replaces optimistic state with the server version after a successful mutation', () => {
  const updated = {
    ...post,
    version: '2026-08-01T10:01:00.000Z',
    status: 'Approved',
  };
  assert.deepEqual(replacePlanPost([post], updated), [updated]);
});

test('surfaces conflict failures so the caller can roll back only the edited post', async () => {
  await assert.rejects(
    updatePlanPost(post, { status: 'Ready' }, async () => (
      Response.json({ error: 'This post changed in Notion.' }, { status: 409 })
    )),
    error => error instanceof Error
      && Reflect.get(error, 'status') === 409
      && /changed in Notion/.test(error.message),
  );
  assert.deepEqual(replacePlanPost([{ ...post, status: 'Approved' }], post), [post]);
});
