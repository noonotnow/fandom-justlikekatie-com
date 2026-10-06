import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDailyDropWithPolling } from '../src/utils/dailyDropRefresh';

test('today automatically checks again while preparing and returns the finished grid', async () => {
  let requests = 0;
  const result = await fetchDailyDropWithPolling('/.netlify/functions/star-of-day', new AbortController().signal, {
    intervalMs: 0,
    fetchImpl: async (_url, options) => {
      assert.equal(options?.cache, 'no-store');
      requests++;
      return requests < 3
        ? Response.json({ building: true }, { status: 202 })
        : Response.json({ rankedBatches: [{}] });
    },
  });
  assert.equal(requests, 3);
  assert.equal(result.status, 200);
});

test('polling is bounded and does not retry errors, access gates, or malformed preparing responses', async () => {
  for (const status of [401, 403, 500, 503, 202]) {
    let requests = 0;
    const result = await fetchDailyDropWithPolling('/test', new AbortController().signal, {
      intervalMs: 0, maxAttempts: 3,
      fetchImpl: async () => {
        requests++;
        return Response.json({ error: 'not preparing' }, { status });
      },
    });
    assert.equal(requests, 1);
    assert.equal(result.status, status);
  }
  let requests = 0;
  await fetchDailyDropWithPolling('/test', new AbortController().signal, {
    intervalMs: 0, maxAttempts: 3,
    fetchImpl: async () => { requests++; return Response.json({ building: true }, { status: 202 }); },
  });
  assert.equal(requests, 3);
});

test('leaving the page cancels the polling wait and prevents another request', async () => {
  const controller = new AbortController();
  let requests = 0;
  const pending = fetchDailyDropWithPolling('/test', controller.signal, {
    intervalMs: 30_000,
    fetchImpl: async () => {
      requests++;
      setTimeout(() => controller.abort(), 0);
      return Response.json({ building: true }, { status: 202 });
    },
  });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(requests, 1);
});
