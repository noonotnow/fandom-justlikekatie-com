import assert from 'node:assert/strict';
import test from 'node:test';
import {
  effectiveNextAction,
  executionLabel,
  isNeedsPlatformScheduling,
  markOperatorScheduled,
  operatorScheduleEligibility,
  operatorScheduleFingerprint,
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
  execution: { state: 'not_recorded' },
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

test('requires Rednote, Approved, an exact timezone-bearing schedule, and dispatchable execution state', () => {
  const eligible = {
    ...post,
    platform: 'Rednote',
    status: 'Approved',
    scheduledDate: '2026-08-08T18:30:00-04:00',
  };
  assert.equal(operatorScheduleEligibility(eligible).eligible, true);
  assert.match(
    operatorScheduleEligibility({ ...eligible, status: 'Ready' }).reason,
    /Approved/,
  );
  assert.match(
    operatorScheduleEligibility({ ...eligible, scheduledDate: '2026-08-08' }).reason,
    /exact time/,
  );
  assert.match(
    operatorScheduleEligibility({ ...eligible, scheduledDate: 'not-a-date' }).reason,
    /exact time/,
  );
  assert.match(
    operatorScheduleEligibility({ ...eligible, scheduledDate: '2026-08-08T18:30:00' }).reason,
    /timezone/,
  );
  assert.equal(
    operatorScheduleEligibility({ ...eligible, platform: 'Weibo' }).eligible,
    false,
  );
  assert.equal(
    operatorScheduleEligibility({
      ...eligible,
      execution: { state: 'operator_scheduled_receipt_pending' },
    }).eligible,
    false,
  );
  assert.equal(
    operatorScheduleEligibility({
      ...eligible,
      execution: { state: 'unavailable' },
    }).eligible,
    false,
  );
});

test('records the exact marker request then refreshes the post without changing status or schedule', async () => {
  const approved = {
    ...post,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'Approved',
    scheduledDate: '2026-08-08T18:30:00-04:00',
    productionStage: 'Ready for XHS Admin' as const,
  };
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const updated = await markOperatorScheduled(
    approved,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    async (url, init) => {
      calls.push({ url: String(url), init });
      if (calls.length === 1) {
        return Response.json({
          execution: {
            id: 'execution-id',
            notionPageId: approved.id,
            state: 'operator_scheduled_receipt_pending',
            scheduledAt: approved.scheduledDate,
            notionVersion: approved.version,
            recordedBy: 'operator',
            recordedAt: '2026-08-06T19:00:00.000Z',
          },
        }, { status: 201 });
      }
      return Response.json({
        post: {
          ...approved,
          version: '2026-08-06T19:00:01.000Z',
        },
      });
    },
  );

  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    notionPageId: approved.id,
    expectedNotionVersion: approved.version,
    expectedScheduledAt: approved.scheduledDate,
  });
  assert.ok(calls[0].init);
  assert.equal(
    (calls[0].init.headers as Record<string, string>)['Idempotency-Key'],
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  );
  assert.equal(calls[1].url, `/api/plan-posts?id=${encodeURIComponent(approved.id)}`);
  assert.equal(updated.version, '2026-08-06T19:00:01.000Z');
  assert.equal(updated.status, 'Approved');
  assert.equal(updated.scheduledDate, approved.scheduledDate);
  assert.equal(updated.execution.state, 'operator_scheduled_receipt_pending');
  assert.equal(updated.productionStage, 'Receipt Pending');
  assert.equal(effectiveNextAction(updated), 'Backfill URL/metrics');
  assert.equal(executionLabel(updated), 'Operator scheduled · receipt pending');
  assert.equal(isNeedsPlatformScheduling(updated), false);
});

test('preserves named upstream conflicts from the operator marker', async () => {
  await assert.rejects(
    markOperatorScheduled(
      {
        ...post,
        status: 'Approved',
        scheduledDate: '2026-08-08T18:30:00-04:00',
      },
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      async () => Response.json({
        code: 'PLAN_EXECUTION_SCHEDULE_MISMATCH',
        message: 'ScheduledDate changed.',
      }, { status: 409 }),
    ),
    error => error instanceof Error
      && Reflect.get(error, 'status') === 409
      && Reflect.get(error, 'code') === 'PLAN_EXECUTION_SCHEDULE_MISMATCH'
      && error.message === 'ScheduledDate changed.',
  );
});

test('binds retry identity to the exact page version and schedule', () => {
  const scheduled = {
    ...post,
    status: 'Approved',
    scheduledDate: '2026-08-08T18:30:00-04:00',
  };
  assert.equal(
    operatorScheduleFingerprint(scheduled),
    operatorScheduleFingerprint({ ...scheduled }),
  );
  assert.notEqual(
    operatorScheduleFingerprint(scheduled),
    operatorScheduleFingerprint({ ...scheduled, version: '2026-08-01T10:01:00.000Z' }),
  );
  assert.notEqual(
    operatorScheduleFingerprint(scheduled),
    operatorScheduleFingerprint({ ...scheduled, scheduledDate: '2026-08-08T20:30:00-04:00' }),
  );
});

test('does not regress a reconciled exact refresh to the earlier pending response', async () => {
  const approved = {
    ...post,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'Approved',
    scheduledDate: '2026-08-08T18:30:00-04:00',
    productionStage: 'Ready for XHS Admin' as const,
  };
  let call = 0;
  const updated = await markOperatorScheduled(
    approved,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    async () => {
      call += 1;
      if (call === 1) {
        return Response.json({
          execution: {
            id: 'execution-id',
            notionPageId: approved.id,
            state: 'operator_scheduled_receipt_pending',
            scheduledAt: approved.scheduledDate,
            notionVersion: approved.version,
            recordedBy: 'operator',
            recordedAt: '2026-08-06T19:00:00.000Z',
          },
        }, { status: 201 });
      }
      return Response.json({
        post: {
          ...approved,
          version: '2026-08-06T19:00:01.000Z',
          status: 'Published',
          execution: {
            id: 'execution-id',
            notionPageId: approved.id,
            state: 'reconciled',
            scheduledAt: approved.scheduledDate,
            notionVersion: approved.version,
            recordedBy: 'operator',
            recordedAt: '2026-08-06T19:00:00.000Z',
            reconciledAt: '2026-08-06T19:00:01.000Z',
          },
          productionStage: 'Published',
        },
      });
    },
  );
  assert.equal(updated.execution.state, 'reconciled');
  assert.equal(updated.status, 'Published');
  assert.equal(updated.productionStage, 'Published');
});
