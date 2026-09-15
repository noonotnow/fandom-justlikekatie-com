import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleQueryRepairDiagnostic } from '../src/utils/queryRepairDiagnostic';

const manifest = {
  diagnosticOnly: true,
  actorId: 'liu-xueyi',
  vibeKey: 'liu-xueyi:0',
  baselineQueries: ['q0', 'q1', 'q2'],
  alternatives: [
    { rungIndex: 1, query: 'a0', replaces: 'q1' },
    { rungIndex: 2, query: 'a1', replaces: 'q2' },
  ],
};

const search = (identities: string[], truncated = false) => ({
  resultIdentityCapture: { truncated },
  resultIdentities: identities.map(identity => ({ identity })),
});

test('query-repair assembly is stable under out-of-order responses', () => {
  const fetched = [
    { fetchIndex: 4, kind: 'alternative', alternativeIndex: 1, rungIndex: 2, query: 'a1', search: search(['z']) },
    { fetchIndex: 2, kind: 'baseline', rungIndex: 2, query: 'q2', search: search(['c']) },
    { fetchIndex: 0, kind: 'baseline', rungIndex: 0, query: 'q0', search: search(['a']) },
    { fetchIndex: 3, kind: 'alternative', alternativeIndex: 0, rungIndex: 1, query: 'a0', search: search(['x', 'y']) },
    { fetchIndex: 1, kind: 'baseline', rungIndex: 1, query: 'q1', search: search(['a']) },
  ];
  const result = assembleQueryRepairDiagnostic(manifest, fetched, 'now');

  assert.equal(result.baseline.uniqueImageIdentityCount, 2);
  assert.equal(result.experiments[0].replacementIncrementalUniqueCount, 2);
  assert.equal(result.experiments[0].uniqueYieldDelta, 2);
  assert.equal(result.experiments[0].qualifies, true);
  assert.equal(result.experiments[1].replacementIncrementalUniqueCount, 1);
  assert.equal(result.experiments[1].qualifies, false);
});

test('one failed alternative cannot contaminate the other experiment', () => {
  const fetched = [
    { fetchIndex: 0, kind: 'baseline', rungIndex: 0, query: 'q0', search: search(['a']) },
    { fetchIndex: 1, kind: 'baseline', rungIndex: 1, query: 'q1', search: search(['a']) },
    { fetchIndex: 2, kind: 'baseline', rungIndex: 2, query: 'q2', search: search(['c']) },
    { fetchIndex: 3, error: 'a0 failed' },
    { fetchIndex: 4, kind: 'alternative', alternativeIndex: 1, rungIndex: 2, query: 'a1', search: search(['z', 'y']) },
  ];
  const result = assembleQueryRepairDiagnostic(manifest, fetched, 'now');

  assert.equal(result.experiments[0].qualifies, null);
  assert.equal(result.experiments[0].error, 'a0 failed');
  assert.equal(result.experiments[1].qualifies, true);
  assert.deepEqual(result.experiments[1].search.resultIdentities.map((item: any) => item.identity), ['z', 'y']);
});

test('failed or truncated baseline makes every experiment explicitly incomplete', () => {
  for (const incomplete of [
    { fetchIndex: 1, error: 'baseline failed' },
    { fetchIndex: 1, kind: 'baseline', rungIndex: 1, search: search(['b'], true) },
  ]) {
    const fetched = [
      { fetchIndex: 0, kind: 'baseline', rungIndex: 0, search: search(['a']) },
      incomplete,
      { fetchIndex: 2, kind: 'baseline', rungIndex: 2, search: search(['c']) },
      { fetchIndex: 3, kind: 'alternative', alternativeIndex: 0, rungIndex: 1, search: search(['x']) },
      { fetchIndex: 4, kind: 'alternative', alternativeIndex: 1, rungIndex: 2, search: search(['z']) },
    ];
    const result = assembleQueryRepairDiagnostic(manifest, fetched, 'now');
    assert.equal(result.baseline.complete, false);
    assert.deepEqual(result.experiments.map(item => item.qualifies), [null, null]);
    assert.deepEqual(result.experiments.map(item => item.uniqueYieldDelta), [null, null]);
  }
});

test('a response for a different query cannot enter the frozen baseline', () => {
  const fetched = [
    { fetchIndex: 0, kind: 'baseline', rungIndex: 0, query: 'changed-q0', search: search(['a']) },
    { fetchIndex: 1, kind: 'baseline', rungIndex: 1, query: 'q1', search: search(['b']) },
    { fetchIndex: 2, kind: 'baseline', rungIndex: 2, query: 'q2', search: search(['c']) },
    { fetchIndex: 3, kind: 'alternative', alternativeIndex: 0, rungIndex: 1, query: 'a0', search: search(['x']) },
    { fetchIndex: 4, kind: 'alternative', alternativeIndex: 1, rungIndex: 2, query: 'a1', search: search(['z']) },
  ];
  const result = assembleQueryRepairDiagnostic(manifest, fetched, 'now');
  assert.equal(result.baseline.complete, false);
  assert.deepEqual(result.experiments.map(item => item.qualifies), [null, null]);
});