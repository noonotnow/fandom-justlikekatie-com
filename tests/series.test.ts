import assert from 'node:assert/strict';
import test from 'node:test';
import { SERIES as PLAN_HANDOFF_SERIES } from '../netlify/functions/lib/plan-handoff.js';
import { getSeriesLabel, SERIES_OPTIONS } from '../src/utils/series.ts';

test('renders friendly labels without changing persisted series values', () => {
  assert.deepEqual(
    SERIES_OPTIONS.map(({ value }) => value),
    ['A·Vibe', 'B·Style', 'C·Event', 'D·BTS', 'E·Fashion', 'F·Interview', 'G·Fan', 'H·Cdrama', 'I'],
  );
  assert.deepEqual(
    SERIES_OPTIONS.map(({ label }) => label),
    [
      'A · Vibe',
      'B · Explainer',
      'C · BTS',
      'D · 念无双',
      'E · Dog',
      'F · Proverb',
      'G · Aerial',
      'H · Cdrama',
      'I · Meme',
    ],
  );
});

test('normalizes known aliases and safely preserves unknown values', () => {
  assert.equal(getSeriesLabel('A'), 'A · Vibe');
  assert.equal(getSeriesLabel('A·Vibe'), 'A · Vibe');
  assert.equal(getSeriesLabel('B·Style'), 'B · Explainer');
  assert.equal(getSeriesLabel('I'), 'I · Meme');
  assert.equal(getSeriesLabel(''), '');
  assert.equal(getSeriesLabel(undefined), '');
  assert.equal(getSeriesLabel('Special'), 'Special');
});

test('every Series the Send to Plan picker offers is accepted by the plan-handoff server', () => {
  for (const { value } of SERIES_OPTIONS) {
    assert.ok(PLAN_HANDOFF_SERIES.has(value), `${value} is offered by the picker but rejected by /api/plan-handoff`);
  }
});
