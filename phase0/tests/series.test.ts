import assert from 'node:assert/strict';
import test from 'node:test';
import { getSeriesLabel, SERIES_OPTIONS } from '../src/utils/series.ts';

test('renders friendly labels without changing persisted series values', () => {
  assert.deepEqual(
    SERIES_OPTIONS.map(({ value }) => value),
    ['A·Vibe', 'B·Style', 'C·Event', 'D·BTS', 'E·Fashion', 'F·Interview', 'G·Fan', 'H·Cdrama'],
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
    ],
  );
});

test('normalizes known aliases and safely preserves unknown values', () => {
  assert.equal(getSeriesLabel('A'), 'A · Vibe');
  assert.equal(getSeriesLabel('A·Vibe'), 'A · Vibe');
  assert.equal(getSeriesLabel('B·Style'), 'B · Explainer');
  assert.equal(getSeriesLabel(''), '');
  assert.equal(getSeriesLabel(undefined), '');
  assert.equal(getSeriesLabel('Special'), 'Special');
});
